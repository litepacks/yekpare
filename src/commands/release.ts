import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execSync } from "node:child_process";
import pc from "picocolors";
import { formatBytes, formatHeader, symbols } from "../utils/format.js";
import { resolveConfig } from "../config/index.js";
import { ensureDir, fileExistsSync } from "../utils/fs.js";
import { hashContentFull } from "../utils/hash.js";
import { isToolAvailable } from "../utils/binary-opt.js";
import { ReleaseArchiveFormat } from "../config/types.js";
import { runBuild } from "./build.js";

export interface ReleaseCliOptions {
  cwd?: string;
  outDir?: string;
  format?: ReleaseArchiveFormat;
}

export async function runReleaseCommand(options: ReleaseCliOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("release", "Packaging standalone executables and generating release archives"));

  const overrides = options.format ? { release: { format: options.format } } : {};
  const config = await resolveConfig(cwd, overrides);

  // Check if executable exists in dist/ or build it
  const defaultExePath = path.join(config.outDir, config.name);
  if (!fileExistsSync(defaultExePath) && !fileExistsSync(`${defaultExePath}.exe`)) {
    console.log(`  ${pc.dim("Building executable first...")}\n`);
    await runBuild({ cwd, quiet: false });
  }

  const releaseDir = path.join(config.outDir, "release");
  await ensureDir(releaseDir);

  const targetPlatform = config.targets[0] || "darwin-arm64";
  let format = options.format || config.release?.format || "tar.gz";

  let archiveExt = ".tar.gz";
  if (format === "tar.xz") archiveExt = ".tar.xz";
  if (format === "zip") archiveExt = ".zip";

  const archiveName = `${config.name}-v${config.version}-${targetPlatform}${archiveExt}`;
  const archivePath = path.join(releaseDir, archiveName);

  const exeName = fileExistsSync(`${defaultExePath}.exe`) ? `${config.name}.exe` : config.name;

  // Create archive according to selected format
  if (format === "tar.xz") {
    try {
      execSync(`tar -cJf "release/${archiveName}" "${exeName}"`, {
        cwd: config.outDir,
        stdio: "pipe",
      });
    } catch {
      // Fallback to tar.gz if xz compression is not supported by system tar
      console.log(`  ${pc.yellow("Warning:")} tar.xz not supported by system tar, falling back to tar.gz\n`);
      format = "tar.gz";
      const fallbackName = `${config.name}-v${config.version}-${targetPlatform}.tar.gz`;
      execSync(`tar -czf "release/${fallbackName}" "${exeName}"`, {
        cwd: config.outDir,
        stdio: "pipe",
      });
    }
  } else if (format === "zip") {
    if (process.platform === "win32") {
      execSync(`powershell -Command "Compress-Archive -Path '${exeName}' -DestinationPath 'release/${archiveName}' -Force"`, {
        cwd: config.outDir,
        stdio: "pipe",
      });
    } else if (isToolAvailable("zip")) {
      execSync(`zip -9 "release/${archiveName}" "${exeName}"`, {
        cwd: config.outDir,
        stdio: "pipe",
      });
    } else {
      // Fallback to tar.gz if zip tool is not available
      console.log(`  ${pc.yellow("Warning:")} 'zip' tool not found, falling back to tar.gz\n`);
      execSync(`tar -czf "release/${archiveName.replace(/\.zip$/, ".tar.gz")}" "${exeName}"`, {
        cwd: config.outDir,
        stdio: "pipe",
      });
    }
  } else {
    // Default: tar.gz
    execSync(`tar -czf "release/${archiveName}" "${exeName}"`, {
      cwd: config.outDir,
      stdio: "pipe",
    });
  }

  const archiveBuf = await fsp.readFile(archivePath);
  const sha256 = hashContentFull(archiveBuf);
  const archiveStat = await fsp.stat(archivePath);

  // Write checksums.txt
  const checksumsPath = path.join(releaseDir, "checksums.txt");
  const checksumLine = `${sha256}  ${archiveName}\n`;
  await fsp.writeFile(checksumsPath, checksumLine, "utf8");

  console.log(`  ${pc.bold("Created Release Package:")}`);
  console.log(`    ${symbols.bullet} ${pc.cyan(archiveName)} (${formatBytes(archiveStat.size)})`);
  console.log(`    ${symbols.bullet} ${pc.dim("SHA256:")} ${sha256}`);
  console.log(`    ${symbols.bullet} ${pc.green("checksums.txt")}`);
  console.log("");
  console.log(`  ${symbols.success}  ${pc.green("Release package ready in dist/release/")}\n`);
}
