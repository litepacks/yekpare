import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatBytes, formatHeader, symbols } from "../utils/format.js";
import { extractManifestFromBinaryBuffer } from "./inspect.js";
import { fileExistsSync } from "../utils/fs.js";

export interface DiffCliOptions {
  bin1: string;
  bin2: string;
  json?: boolean;
}

export async function runDiffCommand(options: DiffCliOptions): Promise<any> {
  const p1 = path.resolve(process.cwd(), options.bin1);
  const p2 = path.resolve(process.cwd(), options.bin2);

  if (!fileExistsSync(p1)) throw new Error(`Binary 1 not found: ${options.bin1}`);
  if (!fileExistsSync(p2)) throw new Error(`Binary 2 not found: ${options.bin2}`);

  const stat1 = fs.statSync(p1);
  const stat2 = fs.statSync(p2);

  const buf1 = fs.readFileSync(p1);
  const buf2 = fs.readFileSync(p2);

  const m1 = extractManifestFromBinaryBuffer(buf1);
  const m2 = extractManifestFromBinaryBuffer(buf2);

  const sizeDiff = stat2.size - stat1.size;
  const bundleDiff = (m2?.build.bundleSize || 0) - (m1?.build.bundleSize || 0);

  const diffSummary = {
    file1: { path: options.bin1, size: stat1.size, manifest: m1 },
    file2: { path: options.bin2, size: stat2.size, manifest: m2 },
    sizeDiff,
    bundleDiff,
  };

  if (options.json) {
    console.log(JSON.stringify(diffSummary, null, 2));
    return diffSummary;
  }

  console.log(formatHeader("diff", `Comparing ${pc.cyan(options.bin1)} and ${pc.cyan(options.bin2)}`));

  console.log(pc.bold("Executable Size:"));
  console.log(`  ${options.bin1}: ${formatBytes(stat1.size)}`);
  console.log(`  ${options.bin2}: ${formatBytes(stat2.size)}`);
  const sizeDiffStr = sizeDiff >= 0 ? `+${formatBytes(sizeDiff)}` : `-${formatBytes(Math.abs(sizeDiff))}`;
  console.log(`  Difference: ${sizeDiff >= 0 ? pc.yellow(sizeDiffStr) : pc.green(sizeDiffStr)}\n`);

  if (m1 && m2) {
    console.log(pc.bold("Build Manifest Comparison:"));
    console.log(`  Application: ${m1.application.name}@${m1.application.version} ${symbols.arrow} ${m2.application.name}@${m2.application.version}`);
    console.log(`  Node Runtime: ${m1.runtime.node} ${symbols.arrow} ${m2.runtime.node}`);
    console.log(`  Bundle Size:  ${formatBytes(m1.build.bundleSize)} ${symbols.arrow} ${formatBytes(m2.build.bundleSize)} (${bundleDiff >= 0 ? `+${formatBytes(bundleDiff)}` : `-${formatBytes(Math.abs(bundleDiff))}`})`);
    console.log(`  Assets:       ${m1.build.assetsCount} ${symbols.arrow} ${m2.build.assetsCount}`);
    console.log("");
  }

  return diffSummary;
}
