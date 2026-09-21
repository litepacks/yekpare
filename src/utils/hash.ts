import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function hashContent(content: string | Uint8Array | Buffer): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex").slice(0, 16);
}

export function hashContentFull(content: string | Uint8Array | Buffer): string {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return hashContent(buf);
}
