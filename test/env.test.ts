import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseDotenv,
  loadDotenvFile,
  parseKeyValuePairs,
  formatEnvForDefine,
} from "../src/utils/env.js";
import { resolveConfig } from "../src/config/index.js";
import { EsbuildBundler } from "../src/bundler/esbuild.js";

describe("Environment & Define Injection Test Suite", () => {
  const tmpRoot = path.join(os.tmpdir(), `yekpare-env-test-${Date.now()}`);

  test("parseDotenv parses unquoted, single-quoted and double-quoted values", () => {
    const dotenvContent = `
# Comment line
APP_NAME=my-cli
VERSION=1.2.3
API_URL="https://api.example.com/v1"
SECRET_KEY='super-secret-value'
export EXPORTED_VAR=true
INLINE_COMMENT=hello # this is comment
ESCAPED_NEWLINE="line1\\nline2"
`;
    const parsed = parseDotenv(dotenvContent);

    assert.equal(parsed.APP_NAME, "my-cli");
    assert.equal(parsed.VERSION, "1.2.3");
    assert.equal(parsed.API_URL, "https://api.example.com/v1");
    assert.equal(parsed.SECRET_KEY, "super-secret-value");
    assert.equal(parsed.EXPORTED_VAR, "true");
    assert.equal(parsed.INLINE_COMMENT, "hello");
    assert.equal(parsed.ESCAPED_NEWLINE, "line1\nline2");
  });

  test("parseKeyValuePairs parses CLI arguments correctly", () => {
    const single = parseKeyValuePairs("PORT=3000");
    assert.deepEqual(single, { PORT: "3000" });

    const multiple = parseKeyValuePairs([
      "API_KEY=xyz",
      'FEATURE_FLAG="enabled"',
      "TIMEOUT='5000'",
    ]);
    assert.deepEqual(multiple, {
      API_KEY: "xyz",
      FEATURE_FLAG: "enabled",
      TIMEOUT: "5000",
    });
  });

  test("formatEnvForDefine transforms env object to esbuild define expressions", () => {
    const defines = formatEnvForDefine({
      APP_ENV: "production",
      PORT: 8080,
      DEBUG: false,
    });

    assert.equal(defines["process.env.APP_ENV"], JSON.stringify("production"));
    assert.equal(defines["process.env.PORT"], JSON.stringify("8080"));
    assert.equal(defines["process.env.DEBUG"], JSON.stringify("false"));
  });

  test("resolveConfig resolves env, envFile and bundle.define", async () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    const envFilePath = path.join(tmpRoot, ".env.production");
    fs.writeFileSync(envFilePath, "FROM_FILE=loaded_value\nOVERRIDDEN=file_val");

    const resolved = await resolveConfig(tmpRoot, {
      envFile: ".env.production",
      env: {
        OVERRIDDEN: "config_val",
        FROM_CONFIG: "config_value",
      },
      bundle: {
        define: {
          __CUSTOM_GLOBAL__: JSON.stringify("custom"),
        },
      },
    });

    assert.equal(resolved.env.FROM_FILE, "loaded_value");
    assert.equal(resolved.env.OVERRIDDEN, "config_val");
    assert.equal(resolved.env.FROM_CONFIG, "config_value");
    assert.equal(resolved.env.NODE_ENV, "production");

    assert.equal(
      resolved.bundle.define["process.env.FROM_FILE"],
      JSON.stringify("loaded_value")
    );
    assert.equal(
      resolved.bundle.define["process.env.OVERRIDDEN"],
      JSON.stringify("config_val")
    );
    assert.equal(
      resolved.bundle.define["process.env.NODE_ENV"],
      JSON.stringify("production")
    );
    assert.equal(
      resolved.bundle.define["__CUSTOM_GLOBAL__"],
      JSON.stringify("custom")
    );
  });

  test("EsbuildBundler inlines injected environment variables and tree-shakes dead code", async () => {
    const entryFile = path.join(tmpRoot, "env-app.ts");
    fs.writeFileSync(
      entryFile,
      `
      export const apiUrl = process.env.API_ENDPOINT;
      export const isDev = process.env.NODE_ENV === "development";

      if (process.env.NODE_ENV === "development") {
        console.log("THIS_SHOULD_BE_TREE_SHAKEN");
      }
      `
    );

    const bundler = new EsbuildBundler();
    const result = await bundler.bundle({
      entry: entryFile,
      projectRoot: tmpRoot,
      minify: true,
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        "process.env.API_ENDPOINT": JSON.stringify("https://api.yekpare.dev"),
      },
    });

    // Verify inlining
    assert.match(result.code, /https:\/\/api\.yekpare\.dev/);
    // Verify dead-code elimination in minified output
    assert.doesNotMatch(result.code, /THIS_SHOULD_BE_TREE_SHAKEN/);
  });

  test("teardown temporary directory", () => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
    assert.ok(true);
  });
});
