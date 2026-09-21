import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import os from "node:os";

export async function ensureDir(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

export function ensureDirSync(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function writeFileAtomic(
  filePath: string,
  data: string | Buffer | Uint8Array,
  options: { mode?: number } = {}
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tmpPath = path.join(
    dir,
    `.tmp.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  );

  try {
    await fsp.writeFile(tmpPath, data, { mode: options.mode });
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fsp.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

export function writeFileAtomicSync(
  filePath: string,
  data: string | Buffer | Uint8Array,
  options: { mode?: number } = {}
): void {
  const dir = path.dirname(filePath);
  ensureDirSync(dir);

  const tmpPath = path.join(
    dir,
    `.tmp.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  );

  try {
    fs.writeFileSync(tmpPath, data, { mode: options.mode });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

export function fileExistsSync(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
