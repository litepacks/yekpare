import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execSync } from "node:child_process";
import fg from "fast-glob";
import pc from "picocolors";
import { resolveConfig } from "../config/index.js";
import { TargetPlatform, YekpareConfig } from "../config/types.js";
import { EsbuildBundler } from "../bundler/esbuild.js";
import { BundlerAsset } from "../bundler/types.js";
import { NodeSeaBuilder } from "../sea/builder.js";
import { detectNativeAddons } from "../analysis/compatibility.js";
import { formatBytes, formatHeader, symbols } from "../utils/format.js";
import { createSpinner } from "../utils/progress.js";
import { stripExecutable, compressWithUpx } from "../utils/binary-opt.js";
import { parseKeyValuePairs } from "../utils/env.js";

export interface BuildCliOptions {
  entry?: string;
  config?: string;
  target?: string;
  outDir?: string;
  minify?: boolean;
  strip?: boolean;
  upx?: boolean;
  upxArgs?: string[];
  env?: string | string[];
  envFile?: string | string[];
  define?: string | string[];
  quiet?: boolean;
  json?: boolean;
  validate?: boolean;
  cwd?: string;
}

export async function runBuild(options: BuildCliOptions = {}): Promise<any> {
  const cwd = options.cwd || process.cwd();
  const overrides: Partial<YekpareConfig> = {};

  if (options.entry) overrides.entry = options.entry;
  if (options.target) overrides.targets = [options.target as TargetPlatform];
  if (options.outDir) overrides.outDir = options.outDir;
  if (options.minify !== undefined) {
    overrides.bundle = { ...(overrides.bundle || {}), minify: options.minify };
  }
  if (options.env) {
    overrides.env = parseKeyValuePairs(options.env);
  }
  if (options.envFile) {
    overrides.envFile = options.envFile;
  }
  if (options.define) {
    const parsedDefine = parseKeyValuePairs(options.define);
    overrides.bundle = {
      ...(overrides.bundle || {}),
      define: parsedDefine,
    };
  }
  if (options.strip !== undefined || options.upx !== undefined || options.upxArgs !== undefined) {
    overrides.binary = {
      strip: options.strip,
      upx: options.upx,
      upxArgs: options.upxArgs,
    };
  }
  if (options.validate !== undefined) {
    overrides.validation = { runVersionCheck: options.validate, runHelpCheck: options.validate };
  }

  const config = await resolveConfig(cwd, overrides, options.config);

  if (!fs.existsSync(config.entry)) {
    throw new Error(
      `Could not find CLI entry point: ${config.entry}\n\n` +
      `Please specify your CLI entry file explicitly:\n` +
      `  $ yekpare build <path/to/entry.ts>\n\n` +
      `Or configure it in yekpare.config.ts:\n` +
      `  export default defineConfig({ entry: "path/to/entry.ts" });`
    );
  }

  if (!options.quiet && !options.json) {
    console.log(formatHeader("build", "Compiling Node.js CLI into standalone executable"));
  }

  // 1. Asset Collection
  const spinner = createSpinner({ enabled: !options.quiet && !options.json });
  const bundlerAssets: BundlerAsset[] = [];
  let totalRawAssetBytes = 0;
  let totalEmbeddedAssetBytes = 0;

  if (config.assets.patterns && config.assets.patterns.length > 0) {
    spinner.start("Collecting and preparing assets...");
    const assetFiles = await fg(config.assets.patterns, {
      cwd: config.assets.rootDir,
      dot: true,
      onlyFiles: true,
    });

    for (const relFile of assetFiles) {
      const fullPath = path.resolve(config.assets.rootDir, relFile);
      const rawBuf = await fsp.readFile(fullPath);
      let compBuf: Buffer = rawBuf;

      if (config.assets.compression === "gzip") {
        compBuf = zlib.gzipSync(rawBuf);
      } else if (config.assets.compression === "brotli") {
        const compressed = zlib.brotliCompressSync(rawBuf);
        compBuf = Buffer.concat([Buffer.from("YEKPARE_BR:"), compressed]);
      }

      const rawSize = rawBuf.length;
      const compSize = compBuf.length;
      totalRawAssetBytes += rawSize;
      totalEmbeddedAssetBytes += compSize;

      const normalizedKey = relFile.replace(/\\/g, "/").replace(/^\.\//, "");
      bundlerAssets.push({
        key: normalizedKey,
        sourcePath: fullPath,
        content: rawBuf,
        compressedContent: compBuf,
        compression: config.assets.compression,
        size: rawSize,
        compressedSize: compSize,
      });
    }
    spinner.succeed(
      `Assets collected`,
      `(${bundlerAssets.length} file${bundlerAssets.length > 1 ? "s" : ""}, ${formatBytes(totalEmbeddedAssetBytes)})`
    );
  }

  // 2. Project Compatibility
  spinner.start("Analyzing compatibility and native addons...");
  const compat = await detectNativeAddons(config.projectRoot, config.targets);
  const relEntry = path.relative(cwd, config.entry) || config.entry;

  const envCount = Object.keys(config.env).length;
  const analysisDetail = [
    `${pc.dim("entry:")} ${relEntry}`,
    compat.addons.length > 0 ? `${pc.yellow(`${compat.addons.length} native addon(s)`)}` : null,
    envCount > 0 ? `${pc.cyan(`${envCount} env var(s)`)}` : null,
  ].filter(Boolean).join(", ");

  spinner.succeed("Project analyzed", analysisDetail ? `(${analysisDetail})` : undefined);

  // 3. Bundling
  spinner.start("Bundling TypeScript and ESM...");
  const bundler = new EsbuildBundler();

  const bundleResult = await bundler.bundle({
    entry: config.entry,
    projectRoot: config.projectRoot,
    minify: config.bundle.minify,
    sourcemap: config.bundle.sourcemap,
    external: config.bundle.external,
    banner: config.bundle.banner,
    footer: config.bundle.footer,
    assets: bundlerAssets,
    appName: config.name,
    define: config.bundle.define,
  });

  spinner.succeed("Bundled application", `(${formatBytes(bundleResult.size)})`);

  // 4. SEA Generation
  const target = config.targets[0] || "current";
  const seaBuilder = new NodeSeaBuilder();

  spinner.start(`Building SEA executable (${target}, Node ${process.version})...`);

  const seaResult = await seaBuilder.build({
    appName: config.name,
    appVersion: config.version,
    bundleCode: bundleResult.code,
    assets: bundlerAssets,
    target,
    outDir: config.outDir,
    projectRoot: config.projectRoot,
    useCodeCache: config.sea.useCodeCache,
    useSnapshot: config.sea.useSnapshot,
    disableExperimentalSEAWarning: config.sea.disableExperimentalSEAWarning,
    nodeBinary: config.sea.nodeBinary,
  });

  spinner.succeed("Compiled standalone SEA executable", `(${formatBytes(seaResult.executableSize)})`);

  // 4.5 Binary Size Optimization (strip & upx)
  let currentExeSize = seaResult.executableSize;

  if (config.binary.strip) {
    spinner.start("Stripping debug symbols from binary...");
    const stripRes = await stripExecutable(seaResult.outputPath);
    if (stripRes.success && !stripRes.skipped) {
      currentExeSize = stripRes.afterSize;
      spinner.succeed("Stripped debug symbols", `(-${formatBytes(stripRes.savedBytes)}, now ${formatBytes(currentExeSize)})`);
    } else if (stripRes.skipped) {
      spinner.succeed("Symbol stripping skipped", `(${stripRes.error})`);
    } else {
      spinner.warn(`Symbol strip warning: ${stripRes.error}`);
    }
  }

  if (config.binary.upx) {
    spinner.start("Compressing binary with UPX...");
    const upxRes = await compressWithUpx(seaResult.outputPath, { upxArgs: config.binary.upxArgs });
    if (upxRes.success) {
      currentExeSize = upxRes.afterSize;
      spinner.succeed("UPX compressed executable", `(-${formatBytes(upxRes.savedBytes)}, ${upxRes.savedRatio.toFixed(1)}% saved, now ${formatBytes(currentExeSize)})`);
    } else if (upxRes.skipped) {
      spinner.warn(`UPX skipped: ${upxRes.error}`);
    } else {
      spinner.warn(`UPX warning: ${upxRes.error}`);
    }
  }

  if (!options.quiet && !options.json) {
    console.log("");
    console.log(`  ${pc.bold("Output Binary")}`);
    console.log(`    ${pc.green(path.relative(cwd, seaResult.outputPath))} (${formatBytes(currentExeSize)})`);
    console.log("");
  }

  // 5. Post-build Validation
  let launchSuccess = false;
  let versionSuccess = false;

  if (config.validation.runVersionCheck) {
    spinner.start("Validating executable launch and flags...");

    try {
      execSync(`"${seaResult.outputPath}" --version`, {
        stdio: "pipe",
        timeout: 5000,
      });
      versionSuccess = true;
      spinner.succeed("Executable validation passed", `(--version ${symbols.success})`);
    } catch {
      try {
        // Fallback: test dry run launch or --help
        execSync(`"${seaResult.outputPath}" --help`, {
          stdio: "pipe",
          timeout: 5000,
        });
        launchSuccess = true;
        spinner.succeed("Executable validation passed", `(--help ${symbols.success})`);
      } catch (err: any) {
        spinner.warn("Validation completed with non-zero exit code");
      }
    }
    if (!options.quiet && !options.json) {
      console.log("");
    }
  }

  const buildOutputSummary = {
    name: config.name,
    version: config.version,
    target,
    outputPath: seaResult.outputPath,
    executableSize: currentExeSize,
    bundleSize: seaResult.bundleSize,
    assetsCount: bundlerAssets.length,
    manifest: seaResult.manifest,
  };

  if (options.json) {
    console.log(JSON.stringify(buildOutputSummary, null, 2));
  } else if (!options.quiet) {
    console.log(`  ${symbols.success}  ${pc.green("Successfully built standalone executable!")}\n`);
  }

  return buildOutputSummary;
}
