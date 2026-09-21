import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatBytes, formatHeader, formatKeyValueSection, KeyValueRow } from "../utils/format.js";
import { YekpareManifest } from "../sea/types.js";
import { fileExistsSync } from "../utils/fs.js";

export interface InspectCliOptions {
  binaryPath: string;
  json?: boolean;
}

export function extractManifestFromBinaryBuffer(buf: Buffer): YekpareManifest | null {
  // Search for "yekpareVersion" in binary buffer
  const marker = Buffer.from('"yekpareVersion"');
  let index = buf.indexOf(marker);

  while (index !== -1) {
    // Find the opening brace '{' preceding the marker
    let start = index;
    while (start >= 0 && start > index - 50) {
      if (buf[start] === 0x7b) {
        // '{'
        break;
      }
      start--;
    }

    if (start >= 0 && buf[start] === 0x7b) {
      // Find matching closing brace using byte-level depth tracking to avoid throwing exceptions
      let depth = 0;
      let inString = false;
      let escape = false;
      const maxEnd = Math.min(buf.length, start + 65536);

      for (let i = start; i < maxEnd; i++) {
        const byte = buf[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (byte === 0x5c) {
          // '\' escape
          escape = true;
          continue;
        }
        if (byte === 0x22) {
          // '"' string boundary
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (byte === 0x7b) {
            depth++;
          } else if (byte === 0x7d) {
            depth--;
            if (depth === 0) {
              try {
                const candidateStr = buf.subarray(start, i + 1).toString("utf8");
                const parsed = JSON.parse(candidateStr);
                if (parsed.yekpareVersion && parsed.application && parsed.target) {
                  return parsed as YekpareManifest;
                }
              } catch {
                // Not a valid JSON structure
              }
              break;
            }
          }
        }
      }
    }

    index = buf.indexOf(marker, index + 1);
  }

  return null;
}

export async function runInspect(options: InspectCliOptions): Promise<any> {
  const fullPath = path.resolve(process.cwd(), options.binaryPath);

  if (!fileExistsSync(fullPath)) {
    throw new Error(`Executable file not found at: ${options.binaryPath}`);
  }

  const stat = fs.statSync(fullPath);
  const binaryBuffer = fs.readFileSync(fullPath);

  const manifest = extractManifestFromBinaryBuffer(binaryBuffer);

  const name = manifest?.application.name || path.basename(fullPath);
  const platform = manifest?.target.platform || "unknown";
  const arch = manifest?.target.arch || "unknown";
  const nodeRuntime = manifest?.runtime.node || "embedded";
  const bundleSize = manifest?.build.bundleSize || 0;
  const assetsEmbeddedSize = manifest?.build.totalAssetsEmbeddedSize || 0;
  const assetsCount = manifest?.build.assetsCount || 0;

  if (options.json) {
    const jsonOutput = {
      executable: {
        path: fullPath,
        name,
        platform,
        arch,
        size: stat.size,
      },
      runtime: {
        node: nodeRuntime,
      },
      contents: {
        bundleSize,
        assetsCount,
        assetsEmbeddedSize,
      },
      manifest,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return jsonOutput;
  }

  console.log(formatHeader("Inspect", `Binary inspection for ${pc.cyan(path.basename(fullPath))}`));

  // 1. Executable section
  const exeRows: KeyValueRow[] = [
    { key: "Name", value: name },
    { key: "Platform", value: platform },
    { key: "Architecture", value: arch },
    { key: "Size", value: formatBytes(stat.size) },
  ];
  console.log(formatKeyValueSection("Executable", exeRows));

  // 2. Runtime section
  const runtimeRows: KeyValueRow[] = [
    { key: "Node", value: nodeRuntime },
  ];
  console.log(formatKeyValueSection("Runtime", runtimeRows));

  // 3. Contents section
  const contentRows: KeyValueRow[] = [
    { key: "Application JS", value: bundleSize > 0 ? formatBytes(bundleSize) : "embedded" },
    { key: "Assets", value: assetsCount > 0 ? `${formatBytes(assetsEmbeddedSize)} (${assetsCount} file${assetsCount > 1 ? "s" : ""})` : "0" },
    { key: "Native addons", value: "0" },
  ];
  console.log(formatKeyValueSection("Contents", contentRows));

  if (manifest?.assets && manifest.assets.length > 0) {
    console.log(pc.bold("Embedded Assets Table"));
    console.log("");
    for (const a of manifest.assets) {
      if (a.key.startsWith("__yekpare")) continue;
      console.log(`  ${pc.dim("•")} ${pc.cyan(a.key)} ${pc.dim(`(${formatBytes(a.size)})`)}`);
    }
    console.log("");
  }

  return { name, platform, arch, size: stat.size, manifest };
}
