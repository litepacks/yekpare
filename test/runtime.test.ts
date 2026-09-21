import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { asset, isSea } from "../src/runtime.js";

describe("Runtime Asset API (Dev Mode & Helpers)", () => {
  test("isSea returns false during normal Node development", () => {
    assert.equal(isSea(), false);
  });

  test("asset.text reads local files in dev mode", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-asset-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const templatePath = path.join(tmpDir, "sample.txt");
      fs.writeFileSync(templatePath, "Hello from local file!", "utf8");

      assert.equal(asset.exists(templatePath), true);
      const text = asset.text(templatePath);
      assert.equal(text, "Hello from local file!");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("asset.json reads and parses JSON files", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-json-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const jsonPath = path.join(tmpDir, "schema.json");
      const sampleObj = { version: "1.0", count: 42, enabled: true };
      fs.writeFileSync(jsonPath, JSON.stringify(sampleObj), "utf8");

      const parsed = asset.json<{ version: string; count: number }>(jsonPath);
      assert.equal(parsed.version, "1.0");
      assert.equal(parsed.count, 42);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("asset.buffer returns Buffer", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-buf-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const binPath = path.join(tmpDir, "data.bin");
      fs.writeFileSync(binPath, Buffer.from([1, 2, 3, 4]));

      const buf = asset.buffer(binPath);
      assert.ok(Buffer.isBuffer(buf));
      assert.equal(buf.length, 4);
      assert.equal(buf[0], 1);
      assert.equal(buf[3], 4);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("asset.path returns resolved path", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-path-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const filePath = path.join(tmpDir, "tool.sh");
      fs.writeFileSync(filePath, "#!/bin/sh\necho ok\n");

      const resolved = asset.path(filePath);
      assert.equal(resolved, path.resolve(filePath));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("throws descriptive error when asset does not exist in dev mode", () => {
    const missing = "completely-non-existent-asset-12345.dat";
    assert.equal(asset.exists(missing), false);

    assert.throws(
      () => {
        asset.buffer(missing);
      },
      /Asset not found/
    );

    assert.throws(
      () => {
        asset.text(missing);
      },
      /Asset not found/
    );
  });

  test("asset.json throws descriptive error on invalid JSON", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-corrupt-json-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const corruptFile = path.join(tmpDir, "bad.json");
      fs.writeFileSync(corruptFile, "{ invalid json content");

      assert.throws(
        () => {
          asset.json(corruptFile);
        },
        /Failed to parse JSON asset/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
