import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { analyzeSourceCode, analyzeProjectFiles } from "../dist/analysis/ast.js";
import { inspectProject, getCurrentTarget } from "../dist/config/defaults.js";
import { resolveConfig } from "../dist/config/index.js";
import { createBuildManifest, serializeManifest } from "../dist/sea/manifest.js";
import { extractManifestFromBinaryBuffer } from "../dist/commands/inspect.js";
import { asset, isSea } from "../dist/runtime.js";
import { detectNativeAddons } from "../dist/analysis/compatibility.js";

async function main() {
  console.log("=== Yekpare Performance Benchmark Suite ===");

  // 1. AST Analysis Benchmark
  console.log("\n[1] AST Analysis Benchmark...");
  const sampleCliCode = `
    import { asset, isSea } from "yekpare/runtime";
    import path from "node:path";
    import fs from "node:fs";
    const helper = require("./helper.node");
    const dynamicMod = import(someVariable);
    const worker = new Worker("./worker.js");
    const fileUrl = new URL("./templates/index.html", import.meta.url);
    const text = fs.readFileSync("./config.json", "utf8");
    process.dlopen(module, "./addon.node");
    export function run() { return 42; }
  `;

  for (let i = 0; i < 50; i++) {
    analyzeSourceCode(sampleCliCode, `test-file-${i}.ts`);
  }

  // 2. Project Files AST Analysis
  console.log("[2] Project Files AST Analysis...");
  const srcFiles = fs.readdirSync("src")
    .filter(f => f.endsWith(".ts"))
    .map(f => path.join("src", f));
  await analyzeProjectFiles(srcFiles);

  // 3. Project Inspection & Config Resolution
  console.log("[3] Config Resolution & Inspection...");
  for (let i = 0; i < 30; i++) {
    inspectProject(process.cwd());
    getCurrentTarget();
  }
  await resolveConfig(process.cwd());

  // 4. Manifest Serialization & Extraction from Binary
  console.log("[4] Manifest Generation & Binary Extraction...");
  const mockAssets = [];
  for (let i = 0; i < 100; i++) {
    const content = Buffer.from(`Asset data content for file number ${i}`);
    mockAssets.push({
      key: `assets/file_${i}.txt`,
      sourcePath: `/dummy/path/file_${i}.txt`,
      content,
      compressedContent: content,
      compression: "none",
      size: content.length,
      compressedSize: content.length,
    });
  }

  const manifest = createBuildManifest({
    appName: "benchmark-app",
    appVersion: "1.0.0",
    platform: "darwin",
    arch: "arm64",
    nodeVersion: "v20.19.5",
    bundleSize: 1024 * 500,
    assets: mockAssets,
  });

  const serialized = serializeManifest(manifest);

  // Simulate a 10MB binary with binary noise, other JSON strings, and the embedded manifest
  const noiseSize = 10 * 1024 * 1024;
  const binaryNoise = Buffer.alloc(noiseSize);
  for (let i = 0; i < 500; i++) {
    const dummyJson = Buffer.from(`{"randomObj": ${i}, "nested": {"key": "val-${i}"}}`);
    dummyJson.copy(binaryNoise, i * 20000);
  }

  const manifestOffset = Math.floor(noiseSize / 2);
  Buffer.from(serialized, "utf8").copy(binaryNoise, manifestOffset);

  for (let i = 0; i < 10; i++) {
    const extracted = extractManifestFromBinaryBuffer(binaryNoise);
    if (!extracted) {
      throw new Error("Failed to extract manifest in benchmark!");
    }
  }

  // 5. Runtime Assets API
  console.log("[5] Runtime Asset Operations...");
  for (let i = 0; i < 100; i++) {
    isSea();
    asset.exists("package.json");
    asset.text("package.json");
    asset.buffer("package.json");
    asset.json("package.json");
  }

  // 6. Native Addon Detection
  console.log("[6] Native Addon Detection...");
  await detectNativeAddons(process.cwd());

  console.log("\n=== Benchmark Completed Successfully ===");
}

main().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
