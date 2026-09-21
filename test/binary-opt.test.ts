import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isToolAvailable, stripExecutable, compressWithUpx } from "../src/utils/binary-opt.js";
import { resolveConfig } from "../src/config/index.js";

describe("Binary Optimization Utilities", () => {
  const tmpDir = path.join(os.tmpdir(), `yekpare-binopt-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("isToolAvailable detects common system tools and missing tools", () => {
    // node must always be available
    assert.equal(isToolAvailable("node"), true);

    // Non-existent tool must return false without throwing
    assert.equal(isToolAvailable("__yekpare_random_nonexistent_tool_xyz__"), false);
  });

  test("stripExecutable throws descriptive error when binary does not exist", async () => {
    await assert.rejects(
      async () => {
        await stripExecutable(path.join(tmpDir, "missing-file"));
      },
      /Executable file not found/
    );
  });

  test("stripExecutable handles existing files safely", async () => {
    const dummyFile = path.join(tmpDir, "dummy-file");
    fs.writeFileSync(dummyFile, "Hello World".repeat(500));
    fs.chmodSync(dummyFile, 0o755);

    const result = await stripExecutable(dummyFile);
    assert.equal(typeof result.beforeSize, "number");
    assert.equal(typeof result.afterSize, "number");
    assert.equal(typeof result.savedBytes, "number");
  });

  test("compressWithUpx throws descriptive error when binary does not exist", async () => {
    await assert.rejects(
      async () => {
        await compressWithUpx(path.join(tmpDir, "missing-file"));
      },
      /Executable file not found/
    );
  });

  test("compressWithUpx skips gracefully if UPX is not installed", async () => {
    const dummyFile = path.join(tmpDir, "dummy-upx-file");
    fs.writeFileSync(dummyFile, "Some binary data".repeat(200));

    const result = await compressWithUpx(dummyFile);
    if (!isToolAvailable("upx")) {
      assert.equal(result.skipped, true);
      assert.match(result.error || "", /UPX/);
    }
  });

  test("resolveConfig parses binary and release options correctly", async () => {
    const customConfig = await resolveConfig(tmpDir, {
      binary: {
        strip: true,
        upx: true,
        upxArgs: ["--ultra-brute"],
      },
      release: {
        format: "tar.xz",
      },
    });

    assert.equal(customConfig.binary.strip, true);
    assert.equal(customConfig.binary.upx, true);
    assert.deepEqual(customConfig.binary.upxArgs, ["--ultra-brute"]);
    assert.equal(customConfig.release.format, "tar.xz");
  });

  test("resolveConfig provides default binary and release settings", async () => {
    const defaultConfig = await resolveConfig(tmpDir);
    assert.equal(defaultConfig.binary.strip, false);
    assert.equal(defaultConfig.binary.upx, false);
    assert.deepEqual(defaultConfig.binary.upxArgs, []);
    assert.equal(defaultConfig.release.format, "tar.gz");
  });
});
