import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getPlatformCacheBaseDir, getYekpareCacheDir } from "./utils/cache.js";
import { writeFileAtomicSync, ensureDirSync, fileExistsSync } from "./utils/fs.js";
import { hashContent } from "./utils/hash.js";

const BROTLI_HEADER = Buffer.from("YEKPARE_BR:");
let _isSeaCached: boolean | null = null;
let _seaModule: any = undefined;

function getSeaModule(): any {
  if (_seaModule !== undefined) return _seaModule;
  try {
    _seaModule = require("node:sea");
  } catch {
    _seaModule = null;
  }
  return _seaModule;
}

/**
 * Check if the application is currently running inside a Node.js SEA binary.
 */
export function isSea(): boolean {
  if (_isSeaCached !== null) return _isSeaCached;
  const sea = getSeaModule();
  const result = typeof sea?.isSea === "function" ? Boolean(sea.isSea()) : false;
  _isSeaCached = result;
  return result;
}

/**
 * Internal helper to retrieve raw SEA assets safely.
 */
function getSeaRawAsset(key: string): ArrayBuffer | null {
  try {
    const sea = getSeaModule();
    if (!sea) return null;
    const candidates = [key, `./${key}`, `.\\${key}`];
    for (const k of candidates) {
      if (typeof sea.getRawAsset === "function") {
        try {
          const raw = sea.getRawAsset(k);
          if (raw) return raw;
        } catch {}
      }
      if (typeof sea.getAsset === "function") {
        try {
          const assetStr = sea.getAsset(k);
          if (typeof assetStr === "string") {
            return Buffer.from(assetStr).buffer;
          }
          if (assetStr) return assetStr;
        } catch {}
      }
    }
  } catch {
    // ignore
  }
  return null;
}

let cachedSeaAssetKeys: string[] | null = null;

function getSeaAssetKeys(): string[] {
  if (cachedSeaAssetKeys !== null) {
    return cachedSeaAssetKeys;
  }
  try {
    const sea = getSeaModule();
    if (sea && typeof sea.getAssetKeys === "function") {
      const keys = sea.getAssetKeys();
      if (Array.isArray(keys)) {
        cachedSeaAssetKeys = keys;
        return keys;
      }
    }
    // Read embedded Yekpare build manifest to retrieve all embedded asset keys
    const manifestBuf = getSeaRawAsset("__yekpare_manifest.json");
    if (manifestBuf) {
      const manifestStr = Buffer.from(manifestBuf).toString("utf8");
      const manifest = JSON.parse(manifestStr);
      if (manifest && Array.isArray(manifest.assets)) {
        const keys: string[] = manifest.assets.map((a: any) => a.key);
        cachedSeaAssetKeys = keys;
        return keys;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Decompresses asset buffer if compression flag is set.
 */
function decompressIfNeeded(buffer: Buffer): Buffer {
  // Check magic bytes for gzip (0x1f, 0x8b) or custom brotli header
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buffer);
    } catch {
      return buffer;
    }
  }
  // Check if buffer starts with YEKPARE_BR: header (without allocating string)
  if (buffer.length >= 11 && buffer.subarray(0, 11).equals(BROTLI_HEADER)) {
    try {
      return zlib.brotliDecompressSync(buffer.subarray(11));
    } catch {
      return buffer;
    }
  }
  return buffer;
}

/**
 * Normalize an asset path key for lookups.
 */
function normalizeKey(assetPath: string): string {
  if (!assetPath.includes("\\") && !assetPath.startsWith("./")) {
    return assetPath;
  }
  return assetPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Runtime Asset API for accessing embedded and development assets.
 */
export const asset = {
  /**
   * Check whether an asset exists (either in embedded SEA or filesystem in dev).
   */
  exists(assetPath: string): boolean {
    const key = normalizeKey(assetPath);
    if (isSea()) {
      if (getSeaRawAsset(key) !== null) return true;
      const keys = getSeaAssetKeys();
      return keys.includes(key) || keys.includes(`./${key}`);
    }
    // Development mode: check local filesystem
    const candidates = [
      path.resolve(process.cwd(), assetPath),
      path.resolve(assetPath),
    ];
    return candidates.some((c) => fileExistsSync(c));
  },

  /**
   * Returns a list of all embedded asset keys (in SEA) or empty in dev.
   */
  keys(): string[] {
    if (isSea()) {
      return getSeaAssetKeys();
    }
    return [];
  },

  /**
   * Read an asset as a Buffer.
   */
  buffer(assetPath: string): Buffer {
    const key = normalizeKey(assetPath);
    if (isSea()) {
      const raw = getSeaRawAsset(key);
      if (!raw) {
        throw new Error(`[Yekpare] Asset not found in SEA executable: "${key}"`);
      }
      return decompressIfNeeded(Buffer.from(raw));
    }

    // Development mode: read from filesystem
    const candidates = [
      path.resolve(process.cwd(), assetPath),
      path.resolve(assetPath),
    ];
    for (const c of candidates) {
      if (fileExistsSync(c)) {
        return fs.readFileSync(c);
      }
    }
    throw new Error(`[Yekpare] Asset not found on filesystem in dev mode: "${assetPath}"`);
  },

  /**
   * Read an asset as a UTF-8 string.
   */
  text(assetPath: string, encoding: BufferEncoding = "utf8"): string {
    const buf = this.buffer(assetPath);
    return buf.toString(encoding);
  },

  /**
   * Read and parse an asset as JSON.
   */
  json<T = any>(assetPath: string): T {
    const txt = this.text(assetPath);
    try {
      return JSON.parse(txt) as T;
    } catch (err: any) {
      throw new Error(`[Yekpare] Failed to parse JSON asset "${assetPath}": ${err.message}`);
    }
  },

  /**
   * Returns a real filesystem path for the asset.
   * If running in SEA, the asset is atomically extracted to a persistent
   * deterministic platform cache (~/.cache/yekpare/<app>/<hash>/...) and cached.
   */
  path(assetPath: string, options: { mode?: number; appName?: string } = {}): string {
    if (!isSea()) {
      const candidates = [
        path.resolve(process.cwd(), assetPath),
        path.resolve(assetPath),
      ];
      for (const c of candidates) {
        if (fileExistsSync(c)) {
          return c;
        }
      }
      // Return absolute path even if missing in dev for consistent error handling
      return path.resolve(process.cwd(), assetPath);
    }

    // In SEA mode: extract to deterministic cache directory
    const buf = this.buffer(assetPath);
    const contentHash = hashContent(buf);
    const appName = options.appName || process.title || "yekpare-app";
    const cacheDir = getYekpareCacheDir(appName, contentHash);
    const baseName = path.basename(assetPath);
    const targetPath = path.join(cacheDir, baseName);

    // Reuse if already extracted
    if (fileExistsSync(targetPath)) {
      return targetPath;
    }

    // Atomically write extracted file with permissions
    ensureDirSync(cacheDir);
    writeFileAtomicSync(targetPath, buf, { mode: options.mode || 0o755 });
    return targetPath;
  },

  /**
   * Dynamically loads a native .node addon embedded in the SEA executable.
   */
  requireAddon<T = any>(addonPath: string, appName?: string): T {
    const extractedPath = this.path(addonPath, { mode: 0o755, appName });
    const mod = { exports: {} as T };
    process.dlopen(mod, extractedPath);
    return mod.exports;
  },
};

export default asset;
