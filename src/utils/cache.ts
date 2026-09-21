import os from "node:os";
import path from "node:path";

export function getPlatformCacheBaseDir(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === "win32") {
    return process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Caches");
  }

  return process.env.XDG_CACHE_HOME || path.join(home, ".cache");
}

export function getYekpareCacheDir(appName = "yekpare-app", contentHash?: string): string {
  const base = getPlatformCacheBaseDir();
  const safeName = appName.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (contentHash) {
    return path.join(base, "yekpare", safeName, contentHash);
  }
  return path.join(base, "yekpare", safeName);
}
