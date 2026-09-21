import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { TargetPlatform } from "../config/types.js";
import { fileExistsSync } from "../utils/fs.js";

export interface NativeAddonPackage {
  name: string;
  version?: string;
  binaries: string[];
  targetSupport: Record<TargetPlatform, boolean>;
}

export interface CompatibilityReport {
  addons: NativeAddonPackage[];
  allCompatible: boolean;
}

const KNOWN_NATIVE_PACKAGES = [
  "better-sqlite3",
  "sharp",
  "canvas",
  "bcrypt",
  "fsevents",
  "leveldown",
  "node-sass",
  "re2",
  "sqlite3",
  "tree-sitter",
  "microtime",
  "snappy",
];

export async function detectNativeAddons(
  projectRoot: string,
  targets: TargetPlatform[] = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win32-x64"]
): Promise<CompatibilityReport> {
  const nodeModulesDir = path.join(projectRoot, "node_modules");
  const pkgPath = path.join(projectRoot, "package.json");

  const detectedPackages = new Set<string>();

  if (fileExistsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
      for (const dep of Object.keys(deps)) {
        if (KNOWN_NATIVE_PACKAGES.includes(dep) || dep.includes("sqlite") || dep.includes("native")) {
          detectedPackages.add(dep);
        }
      }
    } catch {
      // ignore
    }
  }

  // Also search node_modules for .node files
  if (fileExistsSync(nodeModulesDir)) {
    const nodeFiles = await fg(["**/*.node"], {
      cwd: nodeModulesDir,
      ignore: ["**/test/**", "**/tests/**"],
      deep: 4,
    });

    for (const nf of nodeFiles) {
      const parts = nf.split("/");
      const pkgName = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
      detectedPackages.add(pkgName);
    }
  }

  const addons: NativeAddonPackage[] = [];
  let allCompatible = true;

  for (const pkgName of detectedPackages) {
    const pkgDir = path.join(nodeModulesDir, pkgName);
    let version = "unknown";
    const binaries: string[] = [];

    if (fileExistsSync(pkgDir)) {
      const subPkgPath = path.join(pkgDir, "package.json");
      if (fileExistsSync(subPkgPath)) {
        try {
          const subPkg = JSON.parse(fs.readFileSync(subPkgPath, "utf8"));
          version = subPkg.version || version;
        } catch {
          // ignore
        }
      }

      const files = await fg(["**/*.node", "prebuilds/**/*.node"], {
        cwd: pkgDir,
      });
      binaries.push(...files);
    }

    // Check target support based on discovered prebuilds or current platform
    const targetSupport: Record<TargetPlatform, boolean> = {
      "darwin-arm64": false,
      "darwin-x64": false,
      "linux-x64": false,
      "linux-arm64": false,
      "win32-x64": false,
      current: true,
    };

    const currentPlatform = process.platform;
    const currentArch = process.arch;
    const currentKey = `${currentPlatform}-${currentArch}` as TargetPlatform;

    // If local binary exists, current platform is supported
    if (binaries.length > 0) {
      if (targetSupport[currentKey] !== undefined) {
        targetSupport[currentKey] = true;
      }
      targetSupport["current"] = true;
    }

    // Check prebuild directories for cross-target binaries
    for (const b of binaries) {
      const lower = b.toLowerCase();
      if (lower.includes("darwin-arm64") || lower.includes("darwin_arm64")) targetSupport["darwin-arm64"] = true;
      if (lower.includes("darwin-x64") || lower.includes("darwin_x64")) targetSupport["darwin-x64"] = true;
      if (lower.includes("linux-x64") || lower.includes("linux_x64")) targetSupport["linux-x64"] = true;
      if (lower.includes("linux-arm64") || lower.includes("linux_arm64")) targetSupport["linux-arm64"] = true;
      if (lower.includes("win32-x64") || lower.includes("win32_x64")) targetSupport["win32-x64"] = true;
    }

    for (const t of targets) {
      if (!targetSupport[t]) {
        allCompatible = false;
      }
    }

    addons.push({
      name: pkgName,
      version,
      binaries,
      targetSupport,
    });
  }

  return {
    addons,
    allCompatible,
  };
}
