import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSpinner, withSpinner } from "../src/utils/progress.js";

describe("Progress & Spinner Utilities", () => {
  test("createSpinner initializes and handles lifecycle without error", () => {
    const spinner = createSpinner({ enabled: false });
    spinner.start("Test operation");
    spinner.update("Updated text");
    spinner.succeed("Done", "(10ms)");
    spinner.warn("Warning");
    spinner.fail("Failed");
    spinner.info("Info");
    spinner.stop();
    assert.ok(true);
  });

  test("withSpinner wraps async operations cleanly", async () => {
    const result = await withSpinner(
      "Async test operation",
      async () => {
        return 42;
      },
      { enabled: false }
    );
    assert.equal(result, 42);
  });

  test("withSpinner fails spinner and rethrows when task throws", async () => {
    let failed = false;
    try {
      await withSpinner(
        "Failing task",
        async () => {
          throw new Error("Simulated task failure");
        },
        { enabled: false }
      );
    } catch (err: any) {
      failed = true;
      assert.equal(err.message, "Simulated task failure");
    }
    assert.equal(failed, true);
  });

  test("Spinner respects custom indent and disabled options", () => {
    const spinner = createSpinner({ enabled: false, indent: 4 });
    assert.equal(spinner.start("Indented").stop(), spinner);
  });
});
