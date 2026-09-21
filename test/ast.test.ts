import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analyzeSourceCode, analyzeProjectFiles } from "../src/analysis/ast.js";

describe("AST Static Analysis", () => {
  test("detects dynamic require() with variable", () => {
    const code = `
      const plugin = "my-plugin";
      const mod = require(plugin);
    `;
    const result = analyzeSourceCode(code, "src/plugins.ts");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].category, "dynamic-require");
    assert.equal(result.findings[0].severity, "warning");
    assert.equal(result.findings[0].line, 3);
    assert.match(result.findings[0].reason, /statically determine/);
  });

  test("detects dynamic import() with expression", () => {
    const code = `
      async function load(name) {
        return await import(\`./commands/\${name}.js\`);
      }
    `;
    const result = analyzeSourceCode(code, "src/loader.ts");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].category, "dynamic-import");
    assert.equal(result.findings[0].severity, "warning");
  });

  test("detects fs.readFileSync and discovers asset candidates", () => {
    const code = `
      import fs from "node:fs";
      import path from "node:path";
      const schema = fs.readFileSync(path.join(__dirname, "schema.json"), "utf8");
    `;
    const result = analyzeSourceCode(code, "src/db.ts");
    assert.ok(result.findings.some((f) => f.category === "runtime-fs-access"));
    assert.ok(result.assetCandidates.includes("schema.json"));
  });

  test("detects new URL with import.meta.url", () => {
    const code = `
      const template = new URL("./templates/index.html", import.meta.url);
    `;
    const result = analyzeSourceCode(code, "src/render.ts");
    assert.ok(result.findings.some((f) => f.category === "new-url-import-meta"));
    assert.ok(result.assetCandidates.includes("./templates/index.html"));
  });

  test("detects native addon import and dlopen", () => {
    const code = `
      import sqlite from "./build/Release/better_sqlite3.node";
      process.dlopen(module, "/path/to/addon.node");
    `;
    const result = analyzeSourceCode(code, "src/native.ts");
    assert.ok(result.findings.some((f) => f.category === "native-addon"));
    assert.ok(result.nativeAddonCandidates.includes("./build/Release/better_sqlite3.node"));
  });

  test("detects child_process spawning node", () => {
    const code = `
      import { spawn, fork } from "child_process";
      spawn("node", ["child.js"]);
      fork("./worker.js");
    `;
    const result = analyzeSourceCode(code, "src/cluster.ts");
    const nodeSpawns = result.findings.filter((f) => f.category === "spawn-node");
    assert.equal(nodeSpawns.length, 2);
  });

  test("detects Worker thread instantiation", () => {
    const code = `
      import { Worker } from "worker_threads";
      const worker = new Worker("./worker.js");
    `;
    const result = analyzeSourceCode(code, "src/worker-runner.ts");
    assert.ok(result.findings.some((f) => f.category === "worker"));
  });

  test("counts clean static imports without false warnings", () => {
    const code = `
      import path from "path";
      import { readFile } from "fs/promises";
      import { defineConfig } from "yekpare";
      export * from "./other.js";
      export { name } from "./name.js";
      export const version = "1.0.0";
    `;
    const result = analyzeSourceCode(code, "src/clean.ts");
    assert.equal(result.staticImportsCount, 5);
    assert.equal(result.findings.length, 0);
  });

  test("handles parser syntax errors gracefully without throwing", () => {
    const invalidCode = "const broken = {{{;;;";
    const result = analyzeSourceCode(invalidCode, "src/broken.ts");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].category, "otherFindings");
    assert.equal(result.findings[0].severity, "warning");
    assert.match(result.findings[0].reason, /Could not fully parse file AST/);
  });

  test("detects createRequire and dynamic require.resolve", () => {
    const code = `
      import { createRequire } from "module";
      const customReq = createRequire(import.meta.url);
      const resolved = require.resolve(dynamicPkg);
    `;
    const result = analyzeSourceCode(code, "src/bridge.ts");
    assert.ok(result.findings.some((f) => f.category === "create-require"));
    assert.ok(result.findings.some((f) => f.category === "dynamic-resolve"));
  });

  test("handles empty files and comment-only files", () => {
    const emptyResult = analyzeSourceCode("", "src/empty.ts");
    assert.equal(emptyResult.findings.length, 0);
    assert.equal(emptyResult.staticImportsCount, 0);

    const commentResult = analyzeSourceCode("// Just a single comment\n/* block */", "src/comment.ts");
    assert.equal(commentResult.findings.length, 0);
    assert.equal(commentResult.staticImportsCount, 0);
  });
});
