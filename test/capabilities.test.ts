import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkSeaCapabilities } from "../src/sea/capabilities.js";

describe("SEA Capabilities Test Suite", () => {
  test("checkSeaCapabilities reports runtime environment correctly", () => {
    const caps = checkSeaCapabilities();

    assert.equal(typeof caps.supported, "boolean");
    assert.equal(typeof caps.nodeVersion, "string");
    assert.equal(typeof caps.majorVersion, "number");
    assert.ok(caps.majorVersion >= 20, "Current environment must be Node >= 20");
    assert.equal(caps.supported, true);
    assert.equal(caps.hasPostject, true);
    assert.ok(Array.isArray(caps.notes));
    assert.ok(typeof caps.recommendedVersion === "string");
  });
});
