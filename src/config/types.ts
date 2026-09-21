export type TargetPlatform =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "linux-arm64"
  | "win32-x64"
  | "current";

export type AssetCompression = "none" | "gzip" | "brotli";

export interface AssetOptions {
  patterns?: string[];
  compression?: AssetCompression;
  rootDir?: string;
}

export interface YekpareConfig {
  /**
   * Entry point file for the CLI application (e.g. "./src/cli.ts", "./dist/index.js").
   */
  entry?: string;

  /**
   * Name of the resulting executable (e.g. "rowpipe").
   * Defaults to package.json name or entry file basename.
   */
  name?: string;

  /**
   * Version of the application.
   * Defaults to package.json version.
   */
  version?: string;

  /**
   * Target platforms for build / distribution.
   */
  targets?: TargetPlatform[];

  /**
   * Assets to discover and embed in the executable.
   * Can be an array of glob patterns or an AssetOptions configuration object.
   */
  assets?: string[] | AssetOptions;

  /**
   * Output directory for compiled binaries. Defaults to "./dist".
   */
  outDir?: string;

  /**
   * Node SEA configuration options.
   */
  sea?: {
    useSnapshot?: boolean;
    useCodeCache?: boolean;
    disableExperimentalSEAWarning?: boolean;
    nodeBinary?: string;
  };

  /**
   * Bundler configuration options.
   */
  bundle?: {
    minify?: boolean;
    sourcemap?: boolean | "inline";
    external?: string[];
    banner?: string;
    footer?: string;
  };

  /**
   * Pre-build or post-build validation hooks.
   */
  validation?: {
    runVersionCheck?: boolean;
    runHelpCheck?: boolean;
    customCommand?: string;
  };

  /**
   * Post-build binary size optimizations (strip debug symbols, UPX compression).
   */
  binary?: BinaryOptimizationOptions;

  /**
   * Release packaging options.
   */
  release?: ReleaseOptions;
}

export interface BinaryOptimizationOptions {
  strip?: boolean;
  upx?: boolean;
  upxArgs?: string[];
}

export type ReleaseArchiveFormat = "tar.gz" | "tar.xz" | "zip";

export interface ReleaseOptions {
  format?: ReleaseArchiveFormat;
}

export interface ResolvedConfig {
  entry: string;
  name: string;
  version: string;
  targets: TargetPlatform[];
  assets: {
    patterns: string[];
    compression: AssetCompression;
    rootDir: string;
  };
  outDir: string;
  sea: {
    useSnapshot: boolean;
    useCodeCache: boolean;
    disableExperimentalSEAWarning: boolean;
    nodeBinary?: string;
  };
  bundle: {
    minify: boolean;
    sourcemap: boolean | "inline";
    external: string[];
    banner?: string;
    footer?: string;
  };
  binary: {
    strip: boolean;
    upx: boolean;
    upxArgs: string[];
  };
  release: {
    format: ReleaseArchiveFormat;
  };
  validation: {
    runVersionCheck: boolean;
    runHelpCheck: boolean;
    customCommand?: string;
  };
  configFile?: string;
  projectRoot: string;
}

/**
 * Type-safe configuration helper for yekpare.config.ts
 */
export function defineConfig(config: YekpareConfig): YekpareConfig {
  return config;
}
