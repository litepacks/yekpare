import { TargetPlatform } from "../config/types.js";
import { BundlerAsset } from "../bundler/types.js";

export interface SeaCapabilities {
  supported: boolean;
  nodeVersion: string;
  majorVersion: number;
  hasExperimentalSeaConfig: boolean;
  hasPostject: boolean;
  hasCodesign: boolean;
  recommendedVersion: string;
  notes: string[];
}

export interface YekpareManifest {
  yekpareVersion: string;
  application: {
    name: string;
    version: string;
  };
  target: {
    platform: string;
    arch: string;
  };
  runtime: {
    node: string;
  };
  build: {
    timestamp: string;
    bundleSize: number;
    assetsCount: number;
    totalAssetsRawSize: number;
    totalAssetsEmbeddedSize: number;
    compression: string;
  };
  assets: Array<{
    key: string;
    size: number;
    compressedSize: number;
    hash: string;
  }>;
}

export interface SeaBuildOptions {
  appName: string;
  appVersion: string;
  bundleCode: string;
  assets: BundlerAsset[];
  target: TargetPlatform;
  outDir: string;
  projectRoot: string;
  useCodeCache?: boolean;
  useSnapshot?: boolean;
  disableExperimentalSEAWarning?: boolean;
  nodeBinary?: string;
}

export interface SeaBuildResult {
  outputPath: string;
  executableSize: number;
  bundleSize: number;
  assetsCount: number;
  manifest: YekpareManifest;
  target: TargetPlatform;
}

export interface SeaBuilder {
  name: string;
  checkCapabilities(): Promise<SeaCapabilities>;
  build(options: SeaBuildOptions): Promise<SeaBuildResult>;
}
