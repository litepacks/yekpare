import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createBuildManifest, serializeManifest } from "../src/sea/manifest.js";
import { extractManifestFromBinaryBuffer } from "../src/commands/inspect.js";

describe("Build Manifest & Inspection", () => {
  test("creates sanitized manifest without secret leakages", () => {
    const manifest = createBuildManifest({
      appName: "rowpipe",
      appVersion: "1.2.0",
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v24.19.0",
      bundleSize: 10240,
      assets: [
        {
          key: "templates/index.html",
          sourcePath: "/Users/secret/path/templates/index.html",
          content: Buffer.from("<h1>Hello</h1>"),
          compression: "none",
          size: 14,
          compressedSize: 14,
        },
      ],
    });

    assert.equal(manifest.application.name, "rowpipe");
    assert.equal(manifest.application.version, "1.2.0");
    assert.equal(manifest.target.platform, "darwin");
    assert.equal(manifest.target.arch, "arm64");
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].key, "templates/index.html");
    assert.ok(manifest.assets[0].hash);

    const json = serializeManifest(manifest);
    assert.ok(!json.includes("/Users/secret/path"));
  });

  test("extracts manifest embedded inside mock binary buffer", () => {
    const manifest = createBuildManifest({
      appName: "test-app",
      appVersion: "3.0.0",
      platform: "linux",
      arch: "x64",
      nodeVersion: "v22.0.0",
      bundleSize: 5000,
      assets: [],
    });

    const manifestJson = serializeManifest(manifest);
    const mockBinary = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00]), // mock ELF header
      Buffer.from("SOME_INTERMEDIATE_BINARY_DATA..."),
      Buffer.from(manifestJson, "utf8"),
      Buffer.from("TRAILING_BINARY_BYTES..."),
    ]);

    const extracted = extractManifestFromBinaryBuffer(mockBinary);
    assert.ok(extracted);
    assert.equal(extracted?.application.name, "test-app");
    assert.equal(extracted?.application.version, "3.0.0");
    assert.equal(extracted?.target.platform, "linux");
  });

  test("returns null when no manifest exists in binary buffer", () => {
    const randomBuffer = Buffer.from("Random binary data without any manifest markers inside it.");
    const result = extractManifestFromBinaryBuffer(randomBuffer);
    assert.equal(result, null);
  });

  test("handles noisy buffers with false markers and invalid JSON gracefully", () => {
    const validManifest = createBuildManifest({
      appName: "resilient-app",
      appVersion: "1.0.0",
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v20.19.0",
      bundleSize: 2048,
      assets: [],
    });

    const validJson = serializeManifest(validManifest);

    // Buffer with false marker followed by corrupt JSON, followed by actual valid manifest
    const bufferWithNoise = Buffer.concat([
      Buffer.from('corrupt prefix {"yekpareVersion": "broken-not-valid-json...'),
      Buffer.from("some binary junk in between"),
      Buffer.from(validJson, "utf8"),
      Buffer.from("trailing junk"),
    ]);

    const extracted = extractManifestFromBinaryBuffer(bufferWithNoise);
    assert.ok(extracted);
    assert.equal(extracted?.application.name, "resilient-app");
  });
});
