import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EsbuildBundler } from "../src/bundler/esbuild.js";

describe("Esbuild Bundler Test Suite", () => {
  const tmpRoot = path.join(os.tmpdir(), `yekpare-bundler-test-${Date.now()}`);

  test("bundles TypeScript code into standalone CJS with shim banner", async () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    const entryFile = path.join(tmpRoot, "app.ts");
    fs.writeFileSync(
      entryFile,
      `
      import path from "node:path";
      import fs from "fs";

      export function getDirectory(): string {
        return path.dirname(__filename);
      }
      `
    );

    const bundler = new EsbuildBundler();
    const result = await bundler.bundle({
      entry: entryFile,
      projectRoot: tmpRoot,
      minify: false,
      appName: "test-bundle-app",
    });

    assert.ok(result.code);
    assert.ok(result.size > 0);
    assert.ok(result.entryFiles.includes(entryFile));
    // Verify SEA Bootstrap shim banner is present
    assert.match(result.code, /Yekpare SEA Bootstrap Shim/);
    assert.match(result.code, /global\.__filename = process\.execPath/);
  });

  test("externalizes node builtins without inlining them", async () => {
    const entryFile = path.join(tmpRoot, "builtins.ts");
    fs.writeFileSync(
      entryFile,
      `
      import { createHash } from "node:crypto";
      import { spawn } from "child_process";

      export const h = createHash("sha256").update("test").digest("hex");
      export const hasSpawn = typeof spawn === "function";
      `
    );

    const bundler = new EsbuildBundler();
    const result = await bundler.bundle({
      entry: entryFile,
      projectRoot: tmpRoot,
      minify: false,
    });

    // Should contain require calls to builtins instead of inlined polyfills
    assert.match(result.code, /require\("node:crypto"\)|require\("crypto"\)/);
    assert.match(result.code, /require\("child_process"\)/);
  });

  test("teardown temporary directory", () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
    assert.ok(true);
  });
});
