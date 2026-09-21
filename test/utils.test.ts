import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ensureDir,
  ensureDirSync,
  writeFileAtomic,
  writeFileAtomicSync,
  fileExists,
  fileExistsSync,
} from "../src/utils/fs.js";
import { hashContent, hashContentFull, hashFile } from "../src/utils/hash.js";
import { formatBytes, formatKeyValueSection, formatHeader, symbols } from "../src/utils/format.js";
import { getPlatformCacheBaseDir, getYekpareCacheDir } from "../src/utils/cache.js";

describe("Utility Modules Test Suite", () => {
  const tmpRoot = path.join(os.tmpdir(), `yekpare-utils-test-${Date.now()}`);

  test("fs: ensureDir and ensureDirSync create nested directories idempotently", async () => {
    const asyncDir = path.join(tmpRoot, "nested", "async", "dir");
    const syncDir = path.join(tmpRoot, "nested", "sync", "dir");

    await ensureDir(asyncDir);
    assert.ok(fs.existsSync(asyncDir));
    // Idempotency: calling again should not throw
    await ensureDir(asyncDir);

    ensureDirSync(syncDir);
    assert.ok(fs.existsSync(syncDir));
    ensureDirSync(syncDir);
  });

  test("fs: writeFileAtomic writes data and replaces files safely", async () => {
    const targetFile = path.join(tmpRoot, "atomic-test", "file.txt");

    await writeFileAtomic(targetFile, "initial content");
    assert.equal(fs.readFileSync(targetFile, "utf8"), "initial content");

    // Overwrite atomically
    await writeFileAtomic(targetFile, Buffer.from("updated buffer content"));
    assert.equal(fs.readFileSync(targetFile, "utf8"), "updated buffer content");

    // Sync version
    const syncFile = path.join(tmpRoot, "atomic-test", "sync-file.txt");
    writeFileAtomicSync(syncFile, "sync initial");
    assert.equal(fs.readFileSync(syncFile, "utf8"), "sync initial");

    writeFileAtomicSync(syncFile, "sync updated");
    assert.equal(fs.readFileSync(syncFile, "utf8"), "sync updated");
  });

  test("fs: fileExists and fileExistsSync report accurate existence", async () => {
    const existingFile = path.join(tmpRoot, "exists.txt");
    fs.writeFileSync(existingFile, "hello");

    const nonExistent = path.join(tmpRoot, "not-here.txt");

    assert.equal(fileExistsSync(existingFile), true);
    assert.equal(fileExistsSync(nonExistent), false);

    assert.equal(await fileExists(existingFile), true);
    assert.equal(await fileExists(nonExistent), false);
  });

  test("hash: computes short and full sha256 hashes accurately", async () => {
    const data = "Yekpare Standalone Executable Application";
    const shortHash = hashContent(data);
    const fullHash = hashContentFull(data);

    assert.equal(typeof shortHash, "string");
    assert.equal(shortHash.length, 16);

    assert.equal(typeof fullHash, "string");
    assert.equal(fullHash.length, 64);
    assert.ok(fullHash.startsWith(shortHash));

    // File hashing
    const testFile = path.join(tmpRoot, "hash-test.txt");
    fs.writeFileSync(testFile, data);
    const fileHash = await hashFile(testFile);
    assert.equal(fileHash, shortHash);
  });

  test("format: formatBytes handles zero, boundary, and scale transitions", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1), "1 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(1024 * 1024), "1.0 MB");
    assert.equal(formatBytes(1024 * 1024 * 25), "25 MB");
    assert.equal(formatBytes(1024 * 1024 * 1024 * 2), "2.0 GB");
  });

  test("format: formatKeyValueSection and formatHeader render clean CLI sections", () => {
    const header = formatHeader("doctor", "System health diagnosis");
    assert.match(header, /Yekpare doctor/);
    assert.match(header, /System health diagnosis/);

    const section = formatKeyValueSection("Summary", [
      { key: "Status", value: "Ready", status: "success" },
      { key: "Warning", value: "Check node", status: "warning" },
      { key: "Error", value: "Failed", status: "error" },
      { key: "Info", value: "v20.0", status: "info" },
      { key: "Details", value: "normal", status: "dim" },
    ]);

    assert.match(section, /Summary/);
    assert.match(section, /Status/);
    assert.match(section, /Ready/);
    assert.match(section, /Warning/);
  });

  test("cache: provides platform cache directory and sanitized yekpare cache path", () => {
    const baseDir = getPlatformCacheBaseDir();
    assert.ok(typeof baseDir === "string" && baseDir.length > 0);

    const cacheDir = getYekpareCacheDir("my-cool-app@1.0");
    assert.ok(cacheDir.includes("my-cool-app_1_0"));

    const hashedCacheDir = getYekpareCacheDir("my-app", "hash1234");
    assert.ok(hashedCacheDir.endsWith(path.join("my-app", "hash1234")));
  });

  // Cleanup tmpRoot after all tests
  test("teardown temporary directory", () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
    assert.ok(true);
  });
});
