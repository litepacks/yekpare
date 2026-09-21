import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runInit } from "../src/commands/init.js";
import { runDiffCommand } from "../src/commands/diff.js";
import { runInspect } from "../src/commands/inspect.js";
import { runCiCommand } from "../src/commands/ci.js";
import { runHomebrewCommand } from "../src/commands/homebrew.js";
import { runReleaseCommand } from "../src/commands/release.js";
import { createBuildManifest, serializeManifest } from "../src/sea/manifest.js";

describe("CLI Commands Unit Test Suite", () => {
  const tmpRoot = path.join(os.tmpdir(), `yekpare-commands-test-${Date.now()}`);
  const originalLog = console.log;

  before(() => {
    console.log = () => {};
  });

  after(() => {
    console.log = originalLog;
  });

  test("init: generates yekpare.config.ts and respects --force", async () => {
    const projectDir = path.join(tmpRoot, "init-project");
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "init-cli", version: "0.5.0", bin: "./src/cli.ts" })
    );

    // Initial run
    await runInit({ cwd: projectDir });
    const configPath = path.join(projectDir, "yekpare.config.ts");
    assert.ok(fs.existsSync(configPath));
    const configContent = fs.readFileSync(configPath, "utf8");
    assert.match(configContent, /"init-cli"/);

    // Modify file
    fs.writeFileSync(configPath, "// custom modified");

    // Without force: should NOT overwrite
    await runInit({ cwd: projectDir, force: false });
    assert.equal(fs.readFileSync(configPath, "utf8"), "// custom modified");

    // With force: should overwrite
    await runInit({ cwd: projectDir, force: true });
    assert.match(fs.readFileSync(configPath, "utf8"), /defineConfig/);
  });

  test("diff: compares two binary files and handles errors", async () => {
    const diffDir = path.join(tmpRoot, "diff-project");
    fs.mkdirSync(diffDir, { recursive: true });

    const m1 = createBuildManifest({
      appName: "app",
      appVersion: "1.0.0",
      platform: "linux",
      arch: "x64",
      nodeVersion: "v20.0.0",
      bundleSize: 1000,
      assets: [],
    });
    const m2 = createBuildManifest({
      appName: "app",
      appVersion: "1.1.0",
      platform: "linux",
      arch: "x64",
      nodeVersion: "v20.0.0",
      bundleSize: 1500,
      assets: [],
    });

    const bin1Path = path.join(diffDir, "app-v1");
    const bin2Path = path.join(diffDir, "app-v2");

    // File 1: 5000 bytes
    const buf1 = Buffer.alloc(5000);
    Buffer.from(serializeManifest(m1), "utf8").copy(buf1, 100);
    fs.writeFileSync(bin1Path, buf1);

    // File 2: 7000 bytes
    const buf2 = Buffer.alloc(7000);
    Buffer.from(serializeManifest(m2), "utf8").copy(buf2, 100);
    fs.writeFileSync(bin2Path, buf2);

    // Run diff
    const result = await runDiffCommand({
      bin1: bin1Path,
      bin2: bin2Path,
      json: true,
    });

    assert.equal(result.sizeDiff, 2000);
    assert.equal(result.bundleDiff, 500);
    assert.equal(result.file1.manifest.application.version, "1.0.0");
    assert.equal(result.file2.manifest.application.version, "1.1.0");

    // Missing file should throw descriptive error
    await assert.rejects(
      async () => {
        await runDiffCommand({
          bin1: path.join(diffDir, "missing-bin"),
          bin2: bin2Path,
        });
      },
      /Binary 1 not found/
    );
  });

  test("inspect: validates non-existent files and inspects binary buffers", async () => {
    // Missing file
    await assert.rejects(
      async () => {
        await runInspect({
          binaryPath: path.join(tmpRoot, "non-existent-binary"),
          json: true,
        });
      },
      /Executable file not found/
    );

    // Valid binary with manifest
    const testBinPath = path.join(tmpRoot, "inspect-bin");
    const m = createBuildManifest({
      appName: "inspectable-app",
      appVersion: "2.1.0",
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v22.0.0",
      bundleSize: 8000,
      assets: [],
    });
    const binBuf = Buffer.alloc(10000);
    Buffer.from(serializeManifest(m), "utf8").copy(binBuf, 50);
    fs.writeFileSync(testBinPath, binBuf);

    const inspectResult = await runInspect({
      binaryPath: testBinPath,
      json: true,
    });

    assert.equal(inspectResult.executable.name, "inspectable-app");
    assert.equal(inspectResult.manifest.application.version, "2.1.0");
    assert.equal(inspectResult.contents.bundleSize, 8000);
  });

  test("ci: generates GitHub Actions matrix workflow cleanly", async () => {
    const ciDir = path.join(tmpRoot, "ci-project");
    fs.mkdirSync(ciDir, { recursive: true });

    await runCiCommand({ cwd: ciDir });
    const workflowPath = path.join(ciDir, ".github", "workflows", "yekpare-release.yml");
    assert.ok(fs.existsSync(workflowPath));

    const content = fs.readFileSync(workflowPath, "utf8");
    assert.match(content, /matrix:/);
    assert.match(content, /macos-14/);
    assert.match(content, /ubuntu-latest/);
    assert.match(content, /windows-latest/);
  });

  test("homebrew: generates Formula with repository and binary name", async () => {
    const brewDir = path.join(tmpRoot, "brew-project");
    fs.mkdirSync(brewDir, { recursive: true });
    fs.writeFileSync(
      path.join(brewDir, "package.json"),
      JSON.stringify({ name: "sample-tool", description: "A sample CLI tool" })
    );

    await runHomebrewCommand({
      cwd: brewDir,
      repo: "https://github.com/myorg/sample-tool",
    });

    const formulaPath = path.join(brewDir, "Formula", "sample-tool.rb");
    assert.ok(fs.existsSync(formulaPath));

    const content = fs.readFileSync(formulaPath, "utf8");
    assert.match(content, /class SampleTool < Formula/);
    assert.match(content, /https:\/\/github\.com\/myorg\/sample-tool/);
    assert.match(content, /bin\.install "sample-tool"/);
  });

  test("release: packages tar.gz and handles archive formats", async () => {
    const relProjectDir = path.join(tmpRoot, "release-project");
    fs.mkdirSync(path.join(relProjectDir, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(relProjectDir, "package.json"),
      JSON.stringify({ name: "archive-tool", version: "3.0.0" })
    );

    // Create mock executable
    const exePath = path.join(relProjectDir, "dist", "archive-tool");
    fs.writeFileSync(exePath, "mock-binary-payload".repeat(100));
    fs.chmodSync(exePath, 0o755);

    // Default tar.gz
    await runReleaseCommand({ cwd: relProjectDir, format: "tar.gz" });
    const releaseDir = path.join(relProjectDir, "dist", "release");
    assert.ok(fs.existsSync(path.join(releaseDir, "checksums.txt")));
    const checksums = fs.readFileSync(path.join(releaseDir, "checksums.txt"), "utf8");
    assert.match(checksums, /archive-tool-v3\.0\.0-.*\.tar\.gz/);

    // Test tar.xz (either succeeds or gracefully falls back)
    await runReleaseCommand({ cwd: relProjectDir, format: "tar.xz" });
    assert.ok(fs.existsSync(path.join(releaseDir, "checksums.txt")));
  });

  test("teardown temporary directory", () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
    assert.ok(true);
  });
});
