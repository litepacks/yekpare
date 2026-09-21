export interface BundlerAsset {
  key: string;
  sourcePath: string;
  content: Buffer;
  compressedContent?: Buffer;
  compression: "none" | "gzip" | "brotli";
  size: number;
  compressedSize: number;
}

export interface BundleOptions {
  entry: string;
  projectRoot: string;
  minify?: boolean;
  sourcemap?: boolean | "inline";
  external?: string[];
  banner?: string;
  footer?: string;
  assets?: BundlerAsset[];
  appName?: string;
  define?: Record<string, string>;
}

export interface BundleResult {
  code: string;
  map?: string;
  size: number;
  entryFiles: string[];
  bundledAssets: BundlerAsset[];
  warnings: string[];
}

export interface Bundler {
  name: string;
  bundle(options: BundleOptions): Promise<BundleResult>;
}
