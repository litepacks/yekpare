import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveConfig, defineConfig, inspectProject } from "../src/config/index.js";

describe("Config Resolution & Inference", () => {
  test("defineConfig passes through config object with types", () => {
    const cfg = defineConfig({
      entry: "./src/cli.ts",
      name: "my-cli",
      targets: ["darwin-arm64", "linux-x64"],
    });
    assert.equal(cfg.name, "my-cli");
    assert.equal(cfg.entry, "./src/cli.ts");
  });

  test("infers configuration from package.json bin entry", async () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-cfg-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const pkg = {
        name: "test-tool",
        version: "2.3.4",
        type: "module",
        bin: {
          "test-tool": "./bin/run.js",
        },
      };
      fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(pkg, null, 2));
      fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "bin", "run.js"), "console.log('hi');");

      const resolved = await resolveConfig(tmpDir);
      assert.equal(resolved.name, "test-tool");
      assert.equal(resolved.version, "2.3.4");
      assert.equal(resolved.entry, path.join(tmpDir, "bin/run.js"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("CLI argument overrides config file entry and name", async () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-override-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const resolved = await resolveConfig(tmpDir, {
        entry: "custom-entry.ts",
        name: "custom-app",
      });
      assert.equal(resolved.name, "custom-app");
      assert.equal(resolved.entry, path.join(tmpDir, "custom-entry.ts"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("inspectProject detects typescript and source structure", () => {
    const tmpDir = path.join(os.tmpdir(), `yekpare-test-inspect-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });

    try {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      fs.writeFileSync(path.join(tmpDir, "src", "cli.ts"), "console.log(1);");

      const inspection = inspectProject(tmpDir);
      assert.equal(inspection.hasTsConfig, true);
      assert.equal(inspection.detectedEntry, "src/cli.ts");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
