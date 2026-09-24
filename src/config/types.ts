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
   * Environment variables to inject at build time (e.g. { API_URL: "https://api.example.com" }).
   * Inlined into `process.env.<KEY>` expressions.
   */
  env?: Record<string, string | number | boolean>;

  /**
   * Path(s) to `.env` files to load and inject at build time (e.g. ".env" or [".env", ".env.local"]).
   */
  envFile?: string | string[] | boolean;

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
    define?: Record<string, string>;
    env?: Record<string, string | number | boolean>;
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

  /**
   * Continuous integration and release pipeline generation options.
   */
  ci?: CiOptions;
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

export interface CiOptions {
  provider?: "github";
  nodeVersion?: string;
  deb?: boolean;
  homebrew?: boolean;
  npm?: boolean;
  strip?: boolean;
  upx?: boolean;
  output?: string;
}

export interface ResolvedConfig {
  entry: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  targets: TargetPlatform[];
  assets: {
    patterns: string[];
    compression: AssetCompression;
    rootDir: string;
  };
  outDir: string;
  env: Record<string, string>;
  envFiles: string[];
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
    define: Record<string, string>;
  };
  binary: {
    strip: boolean;
    upx: boolean;
    upxArgs: string[];
  };
  release: {
    format: ReleaseArchiveFormat;
  };
  ci: {
    provider: "github";
    nodeVersion: string;
    deb: boolean;
    homebrew: boolean;
    npm: boolean;
    strip: boolean;
    upx: boolean;
    output?: string;
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
