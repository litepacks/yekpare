import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateInstallScript,
  runInstallerCommand,
} from "../src/commands/installer.js";

describe("Installer Script Generator Test Suite", () => {
  const tmpRoot = path.join(os.tmpdir(), `yekpare-installer-test-${Date.now()}`);

  test("generateInstallScript generates valid POSIX/bash installer with target mappings", () => {
    const script = generateInstallScript({
      appName: "my-tool",
      repo: "my-org/my-tool",
      defaultDir: "/usr/local/bin",
    });

    assert.ok(script.startsWith("#!/usr/bin/env bash"));
    assert.match(script, /APP_NAME="my-tool"/);
    assert.match(script, /DEFAULT_REPO="my-org\/my-tool"/);
    assert.match(script, /DEFAULT_INSTALL_DIR="\/usr\/local\/bin"/);
    // Verify OS & Architecture detection
    assert.match(script, /Darwin\)/);
    assert.match(script, /Linux\)/);
    assert.match(script, /arm64\|aarch64/);
    assert.match(script, /x86_64\|amd64/);
    // Verify curl & wget support
    assert.match(script, /curl/);
    assert.match(script, /wget/);
    // Verify trap cleanup
    assert.match(script, /trap 'rm -rf "\$TMP_DIR"' EXIT INT TERM/);
    // Verify PATH validation
    assert.match(script, /is not in your \\\$PATH/);
  });

  test("generateInstallScript sanitizes full GitHub repository URLs", () => {
    const script = generateInstallScript({
      appName: "rowpipe",
      repo: "https://github.com/litepacks/rowpipe.git",
    });

    assert.match(script, /DEFAULT_REPO="litepacks\/rowpipe"/);
  });

  test("runInstallerCommand creates install.sh file on disk with 0755 mode", async () => {
    fs.mkdirSync(tmpRoot, { recursive: true });

    // Mock minimal package.json
    fs.writeFileSync(
      path.join(tmpRoot, "package.json"),
      JSON.stringify({ name: "my-test-cli", version: "1.0.0" })
    );

    const outputPath = path.join(tmpRoot, "install.sh");

    await runInstallerCommand({
      cwd: tmpRoot,
      output: "install.sh",
      repo: "user/my-test-cli",
    });

    assert.ok(fs.existsSync(outputPath));
    const content = fs.readFileSync(outputPath, "utf8");
    assert.match(content, /APP_NAME="my-test-cli"/);

    // Verify mode is executable on POSIX platforms (Windows NTFS doesn't set Unix executable mode bits)
    if (process.platform !== "win32") {
      const stat = fs.statSync(outputPath);
      const isExecutable = (stat.mode & 0o111) !== 0;
      assert.ok(isExecutable, "install.sh must be executable");
    }
  });

  test("teardown temporary directory", () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
    assert.ok(true);
  });
});
