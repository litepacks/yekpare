import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileExistsSync } from "./fs.js";

export interface StripResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  beforeSize: number;
  afterSize: number;
  savedBytes: number;
}

export interface UpxResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  beforeSize: number;
  afterSize: number;
  savedBytes: number;
  savedRatio: number;
}

/**
 * Check if a CLI utility exists in the system's PATH.
 */
export function isToolAvailable(toolName: string): boolean {
  try {
    const cmd = process.platform === "win32" ? `where ${toolName}` : `which ${toolName}`;
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips debug symbols and unneeded symbol tables from an executable.
 * Automatically re-applies ad-hoc code signature on macOS if codesign is available.
 */
export async function stripExecutable(binaryPath: string): Promise<StripResult> {
  if (!fileExistsSync(binaryPath)) {
    throw new Error(`Executable file not found to strip: ${binaryPath}`);
  }

  const beforeSize = fs.statSync(binaryPath).size;

  if (!isToolAvailable("strip")) {
    return {
      success: false,
      skipped: true,
      error: "'strip' command not found in system PATH",
      beforeSize,
      afterSize: beforeSize,
      savedBytes: 0,
    };
  }

  try {
    if (process.platform === "darwin") {
      // macOS Mach-O symbol stripping
      try {
        execSync(`strip -u -r "${binaryPath}"`, { stdio: "pipe" });
      } catch {
        // Fallback for macOS strip flags
        execSync(`strip -S "${binaryPath}"`, { stdio: "pipe" });
      }

      // Re-sign with ad-hoc signature so macOS gatekeeper/kernel doesn't reject modified Mach-O
      if (isToolAvailable("codesign")) {
        try {
          execSync(`codesign --sign - --force "${binaryPath}"`, { stdio: "ignore" });
        } catch {}
      }

      const afterSize = fs.statSync(binaryPath).size;
      const savedBytes = Math.max(0, beforeSize - afterSize);

      return {
        success: true,
        beforeSize,
        afterSize,
        savedBytes,
      };
    } else {
      // Linux ELF & Windows PE:
      // Node.js release binaries are already pre-stripped by upstream build pipelines.
      // Running strip on postjected ELF/PE binaries corrupts/removes the injected NODE_SEA_BLOB section.
      return {
        success: true,
        skipped: true,
        error:
          process.platform === "win32"
            ? "Stripping is not supported on Windows PE binaries"
            : "Upstream Linux binary is pre-stripped; skipped to protect ELF SEA blob",
        beforeSize,
        afterSize: beforeSize,
        savedBytes: 0,
      };
    }
  } catch (err: any) {
    const afterSize = fs.statSync(binaryPath).size;
    return {
      success: false,
      error: err.stderr?.toString() || err.message,
      beforeSize,
      afterSize,
      savedBytes: 0,
    };
  }
}

/**
 * Compresses an executable in-place using UPX (Ultimate Packer for eXecutables).
 */
export async function compressWithUpx(
  binaryPath: string,
  options: { upxArgs?: string[] } = {}
): Promise<UpxResult> {
  if (!fileExistsSync(binaryPath)) {
    throw new Error(`Executable file not found to compress: ${binaryPath}`);
  }

  const beforeSize = fs.statSync(binaryPath).size;

  if (!isToolAvailable("upx")) {
    return {
      success: false,
      skipped: true,
      error: "UPX is not installed in system PATH. Install via: brew install upx (macOS) or apt install upx-ucl (Linux)",
      beforeSize,
      afterSize: beforeSize,
      savedBytes: 0,
      savedRatio: 0,
    };
  }

  const extraArgs =
    options.upxArgs && options.upxArgs.length > 0
      ? options.upxArgs.join(" ")
      : "--best --lzma";

  try {
    execSync(`upx ${extraArgs} "${binaryPath}"`, { stdio: "pipe" });

    // On macOS, re-sign ad-hoc after UPX compression
    if (process.platform === "darwin" && isToolAvailable("codesign")) {
      try {
        execSync(`codesign --sign - --force "${binaryPath}"`, { stdio: "ignore" });
      } catch {}
    }

    const afterSize = fs.statSync(binaryPath).size;
    const savedBytes = Math.max(0, beforeSize - afterSize);
    const savedRatio = beforeSize > 0 ? (savedBytes / beforeSize) * 100 : 0;

    return {
      success: true,
      beforeSize,
      afterSize,
      savedBytes,
      savedRatio,
    };
  } catch (err: any) {
    const afterSize = fs.statSync(binaryPath).size;
    return {
      success: false,
      error: err.stderr?.toString() || err.message,
      beforeSize,
      afterSize,
      savedBytes: 0,
      savedRatio: 0,
    };
  }
}
