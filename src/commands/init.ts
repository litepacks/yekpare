import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { inspectProject } from "../config/defaults.js";
import { fileExistsSync } from "../utils/fs.js";
import { formatHeader, symbols } from "../utils/format.js";

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("init", "Initialize Yekpare configuration for your project"));

  const targetConfigFile = path.join(cwd, "yekpare.config.ts");

  if (fileExistsSync(targetConfigFile) && !options.force) {
    console.log(`  ${symbols.warning}  ${pc.yellow("yekpare.config.ts already exists.")} Use --force to overwrite.\n`);
    return;
  }

  const inspection = inspectProject(cwd);

  const entry = inspection.detectedEntry || (inspection.hasTsConfig ? "./src/cli.ts" : "./src/cli.js");
  const appName = inspection.binEntry?.name || inspection.packageName || "app";

  const configTemplate = `import { defineConfig } from "yekpare";

export default defineConfig({
  // CLI Entry point
  entry: ${JSON.stringify(entry)},

  // Executable binary name
  name: ${JSON.stringify(appName)},

  // Target platforms for distribution
  targets: [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
    "win32-x64",
  ],

  // Assets to embed inside the standalone executable
  assets: [
    // "./templates/**/*",
    // "./schemas/**/*",
  ],

  // Bundler configuration
  bundle: {
    minify: false,
    sourcemap: true,
  },

  // SEA configuration
  sea: {
    useCodeCache: true,
    disableExperimentalSEAWarning: true,
  },
});
`;

  fs.writeFileSync(targetConfigFile, configTemplate, "utf8");

  console.log(`  ${symbols.success}  Created ${pc.green("yekpare.config.ts")}`);
  console.log(`\n  Detected Project Configuration:`);
  console.log(`    ${pc.dim("Name:")}           ${appName}`);
  console.log(`    ${pc.dim("Entry:")}          ${entry}`);
  console.log(`    ${pc.dim("Module Type:")}    ${inspection.isModule ? "ESM" : "CommonJS"}`);
  console.log(`    ${pc.dim("TypeScript:")}     ${inspection.hasTsConfig ? "Yes" : "No"}`);
  if (inspection.lockfile) {
    console.log(`    ${pc.dim("Lockfile:")}       ${inspection.lockfile}`);
  }

  console.log(`\n  Next steps:`);
  console.log(`    ${pc.cyan("yekpare doctor")}    Analyze SEA compatibility`);
  console.log(`    ${pc.cyan("yekpare build")}     Build standalone executable\n`);
}
