import fs from "node:fs";
import path from "node:path";
import { fileExistsSync } from "../utils/fs.js";
import { TargetPlatform } from "./types.js";

export interface ProjectInspection {
  hasPackageJson: boolean;
  packageName?: string;
  packageVersion?: string;
  binEntry?: { name: string; path: string };
  mainEntry?: string;
  isModule: boolean;
  hasTsConfig: boolean;
  detectedEntry?: string;
  nodeVersion?: string;
  lockfile?: string;
  description?: string;
  author?: string;
}

export function getCurrentTarget(): TargetPlatform {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    return `darwin-${arch}` as TargetPlatform;
  }
  if (platform === "linux" && (arch === "arm64" || arch === "x64")) {
    return `linux-${arch}` as TargetPlatform;
  }
  if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
    return `win32-${arch}` as TargetPlatform;
  }
  return "current";
}

export function inspectProject(projectRoot: string): ProjectInspection {
  const pkgPath = path.join(projectRoot, "package.json");
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");

  let hasPackageJson = false;
  let packageName: string | undefined;
  let packageVersion: string | undefined;
  let binEntry: { name: string; path: string } | undefined;
  let mainEntry: string | undefined;
  let isModule = false;
  let nodeVersion: string | undefined = process.version;
  let lockfile: string | undefined;
  let description: string | undefined;
  let author: string | undefined;

  if (fileExistsSync(pkgPath)) {
    hasPackageJson = true;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      packageName = pkg.name;
      packageVersion = pkg.version;
      isModule = pkg.type === "module";
      description = pkg.description;

      if (pkg.author) {
        if (typeof pkg.author === "string") {
          author = pkg.author;
        } else if (typeof pkg.author === "object") {
          const parts = [pkg.author.name];
          if (pkg.author.email) parts.push(`<${pkg.author.email}>`);
          author = parts.filter(Boolean).join(" ");
        }
      }

      if (pkg.bin) {
        if (typeof pkg.bin === "string") {
          binEntry = { name: pkg.name || "app", path: pkg.bin };
        } else if (typeof pkg.bin === "object") {
          const keys = Object.keys(pkg.bin);
          if (keys.length > 0) {
            binEntry = { name: keys[0], path: pkg.bin[keys[0]] };
          }
        }
      }

      if (pkg.main) {
        mainEntry = pkg.main;
      }

      if (pkg.engines?.node) {
        nodeVersion = pkg.engines.node;
      }
    } catch {
      // ignore
    }
  }

  const hasTsConfig = fileExistsSync(tsconfigPath);

  // Detect lockfile
  const lockfiles = [
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "bun.lockb",
  ];
  for (const lf of lockfiles) {
    if (fileExistsSync(path.join(projectRoot, lf))) {
      lockfile = lf;
      break;
    }
  }

  // Infer entry candidate
  const candidateEntries = [
    binEntry?.path,
    // TypeScript sources if tsconfig exists
    hasTsConfig ? "src/cli.ts" : null,
    hasTsConfig ? "src/index.ts" : null,
    hasTsConfig ? "src/main.ts" : null,
    // JS sources
    "src/cli.js",
    "src/index.js",
    "bin/cli.js",
    "bin/index.js",
    mainEntry,
    "index.js",
    "cli.js",
  ].filter(Boolean) as string[];

  // Monorepo / workspaces entry discovery (e.g. packages/*/package.json)
  const packagesDir = path.join(projectRoot, "packages");
  if (fs.existsSync(packagesDir)) {
    try {
      if (fs.statSync(packagesDir).isDirectory()) {
        const subdirs = fs.readdirSync(packagesDir);
        for (const sub of subdirs) {
          const subPkgPath = path.join(packagesDir, sub, "package.json");
          if (fileExistsSync(subPkgPath)) {
            try {
              const subPkg = JSON.parse(fs.readFileSync(subPkgPath, "utf8"));
              if (subPkg.bin) {
                if (typeof subPkg.bin === "string") {
                  candidateEntries.push(path.join("packages", sub, subPkg.bin));
                } else if (typeof subPkg.bin === "object") {
                  for (const bKey of Object.keys(subPkg.bin)) {
                    candidateEntries.push(path.join("packages", sub, subPkg.bin[bKey]));
                  }
                }
              }
              candidateEntries.push(path.join("packages", sub, "src", "main.ts"));
              candidateEntries.push(path.join("packages", sub, "src", "cli.ts"));
              candidateEntries.push(path.join("packages", sub, "src", "index.ts"));
            } catch {}
          }
        }
      }
    } catch {}
  }

  let detectedEntry: string | undefined;
  for (const candidate of candidateEntries) {
    // If candidate is a dist file (e.g. ./dist/cli.js), look for corresponding source file first
    if (candidate.startsWith("dist/") || candidate.startsWith("./dist/") || candidate.includes("/dist/") || candidate.includes("\\dist\\")) {
      const srcTs = candidate.replace(/([/\\])dist([/\\])/, "$1src$2").replace(/\.js$/, ".ts");
      if (fileExistsSync(path.join(projectRoot, srcTs))) {
        detectedEntry = srcTs;
        break;
      }
      const srcJs = candidate.replace(/([/\\])dist([/\\])/, "$1src$2").replace(/\.js$/, ".js");
      if (fileExistsSync(path.join(projectRoot, srcJs))) {
        detectedEntry = srcJs;
        break;
      }
    }

    // If candidate is in a bin/ dir, check for companion src/main.ts or src/cli.ts
    if (candidate.includes("bin/") || candidate.includes("bin\\")) {
      const srcMain = candidate.replace(/([/\\])bin([/\\])[^/\\]+$/, "$1src$2main.ts");
      if (fileExistsSync(path.join(projectRoot, srcMain))) {
        detectedEntry = srcMain;
        break;
      }
      const srcCli = candidate.replace(/([/\\])bin([/\\])[^/\\]+$/, "$1src$2cli.ts");
      if (fileExistsSync(path.join(projectRoot, srcCli))) {
        detectedEntry = srcCli;
        break;
      }
    }

    if (fileExistsSync(path.join(projectRoot, candidate))) {
      detectedEntry = candidate;
      break;
    }
  }

  return {
    hasPackageJson,
    packageName,
    packageVersion,
    binEntry,
    mainEntry,
    isModule,
    hasTsConfig,
    detectedEntry,
    nodeVersion,
    lockfile,
  };
}
