import { YekpareManifest } from "./types.js";
import { BundlerAsset } from "../bundler/types.js";
import { hashContent } from "../utils/hash.js";

export const MANIFEST_ASSET_KEY = "__yekpare_manifest.json";

export function createBuildManifest(options: {
  appName: string;
  appVersion: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  bundleSize: number;
  assets: BundlerAsset[];
  compression?: string;
  yekpareVersion?: string;
}): YekpareManifest {
  let totalRaw = 0;
  let totalEmbedded = 0;

  const sanitizedAssets = options.assets.map((a) => {
    totalRaw += a.size;
    totalEmbedded += a.compressedSize || a.size;
    return {
      key: a.key,
      size: a.size,
      compressedSize: a.compressedSize || a.size,
      hash: hashContent(a.content),
    };
  });

  return {
    yekpareVersion: options.yekpareVersion || "0.1.0",
    application: {
      name: options.appName,
      version: options.appVersion,
    },
    target: {
      platform: options.platform,
      arch: options.arch,
    },
    runtime: {
      node: options.nodeVersion,
    },
    build: {
      timestamp: new Date().toISOString(),
      bundleSize: options.bundleSize,
      assetsCount: options.assets.length,
      totalAssetsRawSize: totalRaw,
      totalAssetsEmbeddedSize: totalEmbedded,
      compression: options.compression || "none",
    },
    assets: sanitizedAssets,
  };
}

export function serializeManifest(manifest: YekpareManifest): string {
  return JSON.stringify(manifest, null, 2);
}
