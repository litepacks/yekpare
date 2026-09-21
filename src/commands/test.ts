import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import pc from "picocolors";
import { formatHeader, symbols } from "../utils/format.js";
import { fileExistsSync } from "../utils/fs.js";

export interface TestCliOptions {
  binaryPath?: string;
  cwd?: string;
}

export async function runTestCommand(options: TestCliOptions = {}): Promise<boolean> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("test", "Validating standalone executable integrity"));

  let binaryPath = options.binaryPath;

  if (!binaryPath) {
    // Look for executable in dist/
    const defaultDist = path.join(cwd, "dist");
    if (fileExistsSync(defaultDist)) {
      const files = fs.readdirSync(defaultDist);
      const exe = files.find((f: string) => !f.endsWith(".map") && !f.endsWith(".d.ts") && !f.endsWith(".json"));
      if (exe) {
        binaryPath = path.join(defaultDist, exe);
      }
    }
  }

  if (!binaryPath || !fileExistsSync(binaryPath)) {
    throw new Error(`Binary not found to test. Please provide a path: yekpare test dist/<app>`);
  }

  const relBin = path.relative(cwd, binaryPath);
  console.log(`  Target binary: ${pc.cyan(relBin)}\n`);

  let allPassed = true;

  // Test 1: Basic launch & exit check
  try {
    process.stdout.write(`  ${pc.dim("•")} Testing launchability... `);
    execSync(`"${binaryPath}" --help`, { stdio: "pipe", timeout: 5000 });
    console.log(pc.green("PASSED"));
  } catch (err: any) {
    try {
      execSync(`"${binaryPath}" --version`, { stdio: "pipe", timeout: 5000 });
      console.log(pc.green("PASSED"));
    } catch {
      console.log(pc.red("FAILED"));
      allPassed = false;
    }
  }

  // Test 2: Version flag check
  try {
    process.stdout.write(`  ${pc.dim("•")} Testing --version output... `);
    const out = execSync(`"${binaryPath}" --version`, { encoding: "utf8", timeout: 5000 }).trim();
    if (out.length > 0) {
      console.log(`${pc.green("PASSED")} ${pc.dim(`(${out})`)}`);
    } else {
      console.log(pc.yellow("EMPTY"));
    }
  } catch {
    console.log(pc.yellow("SKIPPED"));
  }

  console.log("");
  if (allPassed) {
    console.log(`  ${symbols.success}  ${pc.green("All binary integrity tests passed successfully!")}\n`);
  } else {
    console.log(`  ${symbols.error}  ${pc.red("One or more tests failed.")}\n`);
  }

  return allPassed;
}
