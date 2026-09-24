import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { fileExistsSync } from "../utils/fs.js";
import { loadDotenvFile, formatEnvForDefine } from "../utils/env.js";
import { ResolvedConfig, YekpareConfig, AssetOptions } from "./types.js";
import { getCurrentTarget, inspectProject } from "./defaults.js";

export * from "./types.js";
export * from "./defaults.js";

const CONFIG_FILENAMES = [
  "yekpare.config.ts",
  "yekpare.config.js",
  "yekpare.config.mjs",
  "yekpare.config.cjs",
  "yekpare.config.json",
];

async function loadConfigFile(configPath: string): Promise<YekpareConfig> {
  const ext = path.extname(configPath);

  if (ext === ".json") {
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  }

  if (ext === ".ts" || ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    const yekparePlugin: esbuild.Plugin = {
      name: "yekpare-config-resolver",
      setup(build) {
        build.onResolve({ filter: /^yekpare$/ }, () => {
          return { path: "yekpare", namespace: "yekpare-virtual" };
        });
        build.onLoad({ filter: /.*/, namespace: "yekpare-virtual" }, () => {
          return {
            contents: `export function defineConfig(config) { return config; }`,
            loader: "js",
          };
        });
      },
    };

    // Bundle TS/JS config to temporary JS in-memory or temp file
    const nodeBuiltins = [
      "assert", "buffer", "child_process", "cluster", "crypto", "dgram", "dns",
      "domain", "events", "fs", "fs/promises", "http", "https", "module", "net",
      "os", "path", "perf_hooks", "process", "querystring", "readline", "stream",
      "string_decoder", "timers", "tls", "tty", "url", "util", "v8", "vm", "wasi",
      "worker_threads", "zlib",
    ];

    const result = await esbuild.build({
      entryPoints: [configPath],
      format: "esm",
      platform: "node",
      target: "node20",
      write: false,
      bundle: true,
      external: [
        ...nodeBuiltins,
        ...nodeBuiltins.map((b) => `node:${b}`),
        "esbuild",
        "postject",
        "cac",
        "picocolors",
        "fast-glob",
      ],
      plugins: [yekparePlugin],
    });

    const code = result.outputFiles[0].text;
    const tempFile = path.join(
      path.dirname(configPath),
      `.yekpare.config.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}.mjs`
    );

    try {
      fs.writeFileSync(tempFile, code, "utf8");
      const imported = await import(pathToFileURL(tempFile).href);
      return imported.default || imported;
    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // ignore
      }
    }
  }

  const imported = await import(pathToFileURL(configPath).href);
  return imported.default || imported;
}

export async function resolveConfig(
  projectRoot: string = process.cwd(),
  overrides: Partial<YekpareConfig> = {},
  explicitConfigPath?: string
): Promise<ResolvedConfig> {
  const inspection = inspectProject(projectRoot);

  let configFile: string | undefined;
  let rawConfig: YekpareConfig = {};

  if (explicitConfigPath) {
    const fullPath = path.resolve(projectRoot, explicitConfigPath);
    if (fileExistsSync(fullPath)) {
      configFile = fullPath;
      rawConfig = await loadConfigFile(fullPath);
    } else {
      throw new Error(`Config file not found: ${explicitConfigPath}`);
    }
  } else {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.join(projectRoot, name);
      if (fileExistsSync(candidate)) {
        configFile = candidate;
        rawConfig = await loadConfigFile(candidate);
        break;
      }
    }
  }

  // Merge CLI overrides on top of config file
  const merged: YekpareConfig = {
    ...rawConfig,
    ...overrides,
    env: { ...rawConfig.env, ...overrides.env },
    bundle: {
      ...rawConfig.bundle,
      ...overrides.bundle,
      define: { ...rawConfig.bundle?.define, ...overrides.bundle?.define },
      env: { ...rawConfig.bundle?.env, ...overrides.bundle?.env },
    },
    sea: { ...rawConfig.sea, ...overrides.sea },
    binary: { ...rawConfig.binary, ...overrides.binary },
    release: { ...rawConfig.release, ...overrides.release },
    ci: { ...rawConfig.ci, ...overrides.ci },
    validation: { ...rawConfig.validation, ...overrides.validation },
  };

  // Resolve entry with inference priority:
  // 1. Explicit override (CLI arg)
  // 2. Config entry
  // 3. Detected entry from package.json (bin/main/workspaces/sources)
  // 4. Default fallback ("src/cli.ts")
  let entry = merged.entry || inspection.detectedEntry || "src/cli.ts";

  if (!path.isAbsolute(entry)) {
    entry = path.resolve(projectRoot, entry);
  }

  // Resolve application name
  const name =
    merged.name ||
    inspection.binEntry?.name ||
    inspection.packageName ||
    path.basename(entry, path.extname(entry)) ||
    "yekpare-app";

  // Resolve version
  const version = merged.version || inspection.packageVersion || "0.1.0";
  const description = inspection.description;
  const author = inspection.author;

  // Resolve targets
  const targets =
    merged.targets && merged.targets.length > 0
      ? merged.targets
      : [getCurrentTarget()];

  // Resolve assets
  let assetPatterns: string[] = [];
  let assetCompression: "none" | "gzip" | "brotli" = "none";
  let assetRootDir = projectRoot;

  if (Array.isArray(merged.assets)) {
    assetPatterns = merged.assets;
  } else if (merged.assets && typeof merged.assets === "object") {
    const assetOpts = merged.assets as AssetOptions;
    assetPatterns = assetOpts.patterns || [];
    assetCompression = assetOpts.compression || "none";
    if (assetOpts.rootDir) {
      assetRootDir = path.resolve(projectRoot, assetOpts.rootDir);
    }
  }

  const outDir = path.resolve(projectRoot, merged.outDir || "dist");

  // Resolve env files & env variables
  const envFiles: string[] = [];
  if (merged.envFile) {
    if (typeof merged.envFile === "boolean" && merged.envFile) {
      envFiles.push(path.resolve(projectRoot, ".env"));
    } else if (typeof merged.envFile === "string") {
      envFiles.push(path.resolve(projectRoot, merged.envFile));
    } else if (Array.isArray(merged.envFile)) {
      for (const ef of merged.envFile) {
        if (typeof ef === "string") {
          envFiles.push(path.resolve(projectRoot, ef));
        }
      }
    }
  }

  // Load key-values from env files
  const loadedEnv: Record<string, string> = {};
  for (const envFilePath of envFiles) {
    const fileVars = loadDotenvFile(envFilePath);
    Object.assign(loadedEnv, fileVars);
  }

  // Merge explicitly provided envs (from top-level env or bundle.env)
  const combinedEnvConfig = {
    ...loadedEnv,
    ...(merged.bundle?.env || {}),
    ...(merged.env || {}),
  };

  const stringifiedEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(combinedEnvConfig)) {
    if (v !== undefined) {
      stringifiedEnv[k] = String(v);
    }
  }

  // Format defines: process.env.KEY -> JSON.stringify(val)
  const envDefines = formatEnvForDefine(stringifiedEnv);

  const rawDefines = {
    ...(merged.bundle?.define || {}),
  };

  // Provide default NODE_ENV: "production" if not explicitly specified
  if (!rawDefines["process.env.NODE_ENV"] && !envDefines["process.env.NODE_ENV"]) {
    envDefines["process.env.NODE_ENV"] = JSON.stringify("production");
    stringifiedEnv["NODE_ENV"] = "production";
  }

  const finalDefines: Record<string, string> = {
    ...envDefines,
    ...rawDefines,
  };

  const detectedNodeMajor = inspection.nodeVersion
    ? inspection.nodeVersion.replace(/[^0-9.]/g, "").split(".")[0]
    : "22";

  return {
    entry,
    name,
    version,
    description,
    author,
    targets,
    assets: {
      patterns: assetPatterns,
      compression: assetCompression,
      rootDir: assetRootDir,
    },
    outDir,
    env: stringifiedEnv,
    envFiles,
    sea: {
      useSnapshot: merged.sea?.useSnapshot ?? false,
      useCodeCache: merged.sea?.useCodeCache ?? true,
      disableExperimentalSEAWarning:
        merged.sea?.disableExperimentalSEAWarning ?? true,
      nodeBinary: merged.sea?.nodeBinary,
    },
    bundle: {
      minify: merged.bundle?.minify ?? false,
      sourcemap: merged.bundle?.sourcemap ?? true,
      external: merged.bundle?.external ?? [],
      banner: merged.bundle?.banner,
      footer: merged.bundle?.footer,
      define: finalDefines,
    },
    validation: {
      runVersionCheck: merged.validation?.runVersionCheck ?? true,
      runHelpCheck: merged.validation?.runHelpCheck ?? true,
      customCommand: merged.validation?.customCommand,
    },
    binary: {
      strip: merged.binary?.strip ?? false,
      upx: merged.binary?.upx ?? false,
      upxArgs: merged.binary?.upxArgs ?? [],
    },
    release: {
      format: merged.release?.format ?? "tar.gz",
    },
    ci: {
      provider: merged.ci?.provider ?? "github",
      nodeVersion: merged.ci?.nodeVersion || detectedNodeMajor || "22",
      deb: merged.ci?.deb ?? false,
      homebrew: merged.ci?.homebrew ?? false,
      npm: merged.ci?.npm ?? false,
      strip: merged.ci?.strip ?? (merged.binary?.strip ?? true),
      upx: merged.ci?.upx ?? (merged.binary?.upx ?? false),
      output: merged.ci?.output,
    },
    configFile,
    projectRoot,
  };
}
