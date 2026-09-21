import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import {
  SeaBuilder,
  SeaBuildOptions,
  SeaBuildResult,
  SeaCapabilities,
} from "./types.js";
import { checkSeaCapabilities } from "./capabilities.js";
import { createBuildManifest, serializeManifest, MANIFEST_ASSET_KEY } from "./manifest.js";
import { ensureDir, writeFileAtomic, fileExistsSync } from "../utils/fs.js";
import { BundlerAsset } from "../bundler/types.js";

export class NodeSeaBuilder implements SeaBuilder {
  public name = "node-sea";

  public async checkCapabilities(): Promise<SeaCapabilities> {
    return checkSeaCapabilities();
  }

  public async build(options: SeaBuildOptions): Promise<SeaBuildResult> {
    const caps = await this.checkCapabilities();
    if (!caps.supported) {
      throw new Error(
        `[Yekpare] Cannot build SEA executable: Node.js version ${caps.nodeVersion} is not supported.\n` +
          `Required: Node 20+, Recommended: ${caps.recommendedVersion}`
      );
    }

    const tmpDir = path.join(
      os.tmpdir(),
      `yekpare-build-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await ensureDir(tmpDir);

    try {
      // 1. Write main bundle JS
      const mainBundlePath = path.join(tmpDir, "main.bundle.js");
      await fsp.writeFile(mainBundlePath, options.bundleCode, "utf8");

      // 2. Determine target platform & arch
      let [platform, arch] = options.target.split("-");
      if (options.target === "current") {
        platform = process.platform;
        arch = process.arch;
      }
      if (!arch) arch = process.arch;
      if (!platform) platform = process.platform;

      // 3. Prepare assets and manifest
      const allAssets: BundlerAsset[] = [...options.assets];

      // Generate sanitized manifest
      const manifest = createBuildManifest({
        appName: options.appName,
        appVersion: options.appVersion,
        platform,
        arch,
        nodeVersion: process.version,
        bundleSize: Buffer.byteLength(options.bundleCode, "utf8"),
        assets: allAssets,
      });

      const manifestJson = serializeManifest(manifest);
      const manifestBuf = Buffer.from(manifestJson, "utf8");

      allAssets.push({
        key: MANIFEST_ASSET_KEY,
        sourcePath: "manifest.json",
        content: manifestBuf,
        compressedContent: manifestBuf,
        compression: "none",
        size: manifestBuf.length,
        compressedSize: manifestBuf.length,
      });

      // Write all assets to tmpDir and build assets map
      const assetsMap: Record<string, string> = {};
      const assetsDir = path.join(tmpDir, "assets");
      await ensureDir(assetsDir);

      for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        const assetTmpFile = path.join(assetsDir, `asset_${i}_${path.basename(asset.key)}`);
        const contentToWrite = asset.compressedContent || asset.content;
        await fsp.writeFile(assetTmpFile, contentToWrite);
        assetsMap[asset.key] = assetTmpFile;
      }

      // 4. Create sea-config.json
      const seaConfigPath = path.join(tmpDir, "sea-config.json");
      const seaBlobPath = path.join(tmpDir, "sea-prep.blob");

      const seaConfig = {
        main: mainBundlePath,
        output: seaBlobPath,
        disableExperimentalSEAWarning:
          options.disableExperimentalSEAWarning ?? true,
        useCodeCache: options.useCodeCache ?? true,
        useSnapshot: options.useSnapshot ?? false,
        assets: assetsMap,
      };

      await fsp.writeFile(
        seaConfigPath,
        JSON.stringify(seaConfig, null, 2),
        "utf8"
      );

      // 5. Generate SEA blob: node --experimental-sea-config sea-config.json
      const nodeBin = options.nodeBinary || process.execPath;
      try {
        execSync(`"${nodeBin}" --experimental-sea-config "${seaConfigPath}"`, {
          cwd: tmpDir,
          stdio: "pipe",
        });
      } catch (err: any) {
        throw new Error(
          `Failed to generate SEA blob with node --experimental-sea-config: ${err.message}\n${err.stderr?.toString()}`
        );
      }

      if (!fileExistsSync(seaBlobPath)) {
        throw new Error(`SEA preparation blob was not generated at ${seaBlobPath}`);
      }

      // 6. Copy base binary to output directory
      await ensureDir(options.outDir);
      const isWindows = platform === "win32" || (platform === "current" && process.platform === "win32");
      const exeName = isWindows
        ? (options.appName.endsWith(".exe") ? options.appName : `${options.appName}.exe`)
        : options.appName;

      const outputPath = path.join(options.outDir, exeName);

      // Copy node binary
      await fsp.copyFile(nodeBin, outputPath);

      // 7. Remove signature on macOS if required
      if (process.platform === "darwin" && platform === "darwin") {
        try {
          execSync(`codesign --remove-signature "${outputPath}"`, {
            stdio: "ignore",
          });
        } catch {
          // ignore if not signed
        }
      }

function getSentinelFuse(): string {
  return Buffer.from("Tk9ERV9TRUFfRlVTRV9mY2U2ODBhYjJjYzQ2N2I2ZTA3MmI4YjVkZjE5OTZiMg==", "base64").toString("utf8");
}

      // 8. Inject blob using postject
      let injectionDone = false;
      let injectionError: any = null;
      const sentinelFuse = getSentinelFuse();

      try {
        const postject = await import("postject");
        const injectFn =
          (typeof postject.inject === "function" && postject.inject) ||
          (typeof (postject as any).default?.inject === "function" && (postject as any).default.inject) ||
          (typeof (postject as any).default === "function" && (postject as any).default);

        if (typeof injectFn === "function") {
          const blobBuffer = await fsp.readFile(seaBlobPath);
          await injectFn(outputPath, "NODE_SEA_BLOB", blobBuffer, {
            sentinelFuse,
            machoSegmentName: process.platform === "darwin" ? "NODE_SEA" : undefined,
          });
          injectionDone = true;
        }
      } catch (err: any) {
        injectionError = err;
      }

      if (!injectionDone) {
        // Find local postject CLI binary in node_modules or global
        let postjectCliPath = "";
        try {
          postjectCliPath = require.resolve("postject/dist/cli.js");
        } catch {
          try {
            postjectCliPath = path.resolve(
              options.projectRoot,
              "node_modules/postject/dist/cli.js"
            );
          } catch {}
        }

        const machoFlag =
          process.platform === "darwin" ? "--macho-segment-name NODE_SEA" : "";

        let postjectCmd = "";
        if (postjectCliPath && fileExistsSync(postjectCliPath)) {
          postjectCmd = `"${process.execPath}" "${postjectCliPath}" "${outputPath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse ${sentinelFuse} ${machoFlag}`.trim();
        } else {
          postjectCmd = `npx --yes postject "${outputPath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse ${sentinelFuse} ${machoFlag}`.trim();
        }

        try {
          execSync(postjectCmd, {
            cwd: tmpDir,
            stdio: "pipe",
          });
          injectionDone = true;
        } catch (err: any) {
          const details = err.stderr?.toString() || err.message;
          const prevDetails = injectionError ? `\nInternal error: ${injectionError.message}` : "";
          throw new Error(
            `Failed to inject SEA blob via postject: ${details}${prevDetails}`
          );
        }
      }

      // 9. macOS ad-hoc signing
      if (process.platform === "darwin" && platform === "darwin") {
        try {
          execSync(`codesign --sign - "${outputPath}"`, {
            stdio: "ignore",
          });
        } catch (err: any) {
          // Warning on codesign failure
        }
      }

      // 10. Chmod executable
      if (!isWindows) {
        try {
          await fsp.chmod(outputPath, 0o755);
        } catch {}
      }

      const stat = await fsp.stat(outputPath);

      return {
        outputPath,
        executableSize: stat.size,
        bundleSize: Buffer.byteLength(options.bundleCode, "utf8"),
        assetsCount: options.assets.length,
        manifest,
        target: options.target,
      };
    } finally {
      // Clean up tmpDir
      try {
        await fsp.rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
