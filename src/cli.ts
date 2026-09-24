#!/usr/bin/env node
import { cac } from "cac";
import pc from "picocolors";
import { runInit } from "./commands/init.js";
import { runBuild } from "./commands/build.js";
import { runDoctor } from "./commands/doctor.js";
import { runInspect } from "./commands/inspect.js";
import { runTraceCommand } from "./commands/trace.js";
import { runCiCommand } from "./commands/ci.js";
import { runHomebrewCommand } from "./commands/homebrew.js";
import { runInstallerCommand } from "./commands/installer.js";
import { runTestCommand } from "./commands/test.js";
import { runDiffCommand } from "./commands/diff.js";
import { runReleaseCommand } from "./commands/release.js";

const cli = cac("yekpare");

cli
  .command("init", "Initialize Yekpare configuration for your project")
  .option("-f, --force", "Overwrite existing yekpare.config.ts")
  .action(async (options) => {
    try {
      await runInit({ force: options.force });
    } catch (err: any) {
      console.error(pc.red(`\nError during init: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("build [entry]", "Compile Node.js application into a standalone executable")
  .option("-c, --config <file>", "Path to Yekpare config file")
  .option("-t, --target <target>", "Target platform (e.g. darwin-arm64, linux-x64, win32-x64)")
  .option("-o, --out-dir <dir>", "Output directory for built binary (default: dist)")
  .option("-m, --minify", "Minify bundled JavaScript code")
  .option("-s, --strip", "Strip debug symbols from the standalone binary")
  .option("--upx", "Compress the standalone binary with UPX")
  .option("--upx-args <args>", "Custom arguments to pass to UPX")
  .option("-e, --env <item>", "Inject environment variable at build-time (KEY=VALUE)")
  .option("--env-file <file>", "Load build-time environment variables from .env file")
  .option("--define <item>", "Define identifier replacement for bundler (KEY=VALUE)")
  .option("-q, --quiet", "Suppress non-error logs")
  .option("--json", "Output build result as JSON")
  .option("--no-validate", "Skip post-build executable validation check")
  .action(async (entry, options) => {
    try {
      const upxArgs = options.upxArgs ? options.upxArgs.split(" ") : undefined;
      await runBuild({
        entry,
        config: options.config,
        target: options.target,
        outDir: options.outDir,
        minify: options.minify,
        strip: options.strip,
        upx: options.upx,
        upxArgs,
        env: options.env,
        envFile: options.envFile,
        define: options.define,
        quiet: options.quiet,
        json: options.json,
        validate: options.validate !== false,
      });
    } catch (err: any) {
      console.error(pc.red(`\nBuild error: ${err.message}\n`));
      if (process.env.DEBUG) console.error(err);
      process.exit(1);
    }
  });

cli
  .command("doctor [entry]", "Analyze project for SEA compatibility and actionable findings")
  .option("-c, --config <file>", "Path to Yekpare config file")
  .option("--trace [command]", "Run runtime trace observer on command or entry")
  .option("--json", "Output diagnostics report as JSON")
  .action(async (entry, options) => {
    try {
      await runDoctor({
        entry,
        config: options.config,
        trace: options.trace,
        json: options.json,
      });
    } catch (err: any) {
      console.error(pc.red(`\nDoctor error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("inspect <binary>", "Inspect standalone executable metadata, runtime, and embedded assets")
  .option("--json", "Output inspection report as JSON")
  .action(async (binary, options) => {
    try {
      await runInspect({
        binaryPath: binary,
        json: options.json,
      });
    } catch (err: any) {
      console.error(pc.red(`\nInspect error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("trace [...cmd]", "Observe runtime modules, filesystem reads, and native addons")
  .option("--json", "Output trace report as JSON")
  .action(async (cmd, options) => {
    try {
      // Find arguments after '--' if present in raw argv
      let argsToRun = cmd;
      const rawArgs = process.argv.slice(2);
      const dashDashIdx = rawArgs.indexOf("--");
      if (dashDashIdx !== -1) {
        argsToRun = rawArgs.slice(dashDashIdx + 1);
      }

      await runTraceCommand({
        commandArgs: argsToRun,
        json: options.json,
      });
    } catch (err: any) {
      console.error(pc.red(`\nTrace error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("ci [provider]", "Generate multi-platform CI release workflow (e.g. github)")
  .option("-c, --config <file>", "Path to Yekpare config file")
  .option("--deb", "Include Debian (.deb) package build step in Linux matrix")
  .option("--homebrew", "Include automated Homebrew Formula checksum updating step")
  .option("--npm", "Include automated NPM publish job")
  .option("--strip", "Enable binary symbol stripping in CI (default: true)")
  .option("--no-strip", "Disable binary symbol stripping in CI")
  .option("--upx", "Enable UPX compression in CI build step")
  .option("--node <version>", "Node.js version for CI (default: 22)")
  .option("-o, --output <path>", "Workflow output file (default: .github/workflows/yekpare-release.yml)")
  .action(async (provider, options) => {
    try {
      await runCiCommand({
        provider: provider || "github",
        config: options.config,
        deb: options.deb,
        homebrew: options.homebrew,
        npm: options.npm,
        strip: options.strip !== undefined ? options.strip : undefined,
        upx: options.upx,
        node: options.node,
        output: options.output,
      });
    } catch (err: any) {
      console.error(pc.red(`\nCI generator error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("homebrew", "Generate Homebrew tap formula for distribution")
  .option("--repo <url>", "GitHub repository URL")
  .action(async (options) => {
    try {
      await runHomebrewCommand({ repo: options.repo });
    } catch (err: any) {
      console.error(pc.red(`\nHomebrew generator error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("installer", "Generate standalone one-line bash installer script (install.sh)")
  .option("--repo <repo>", "GitHub repository (owner/repo or full URL)")
  .option("-o, --output <file>", "Output file path (default: install.sh)")
  .option("--dir <dir>", "Default installation directory (default: /usr/local/bin)")
  .action(async (options) => {
    try {
      await runInstallerCommand({
        repo: options.repo,
        output: options.output,
        defaultDir: options.dir,
      });
    } catch (err: any) {
      console.error(pc.red(`\nInstaller generator error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("test [binary]", "Validate standalone executable functionality")
  .action(async (binary) => {
    try {
      const passed = await runTestCommand({ binaryPath: binary });
      if (!passed) process.exit(1);
    } catch (err: any) {
      console.error(pc.red(`\nTest validation error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("diff <bin1> <bin2>", "Compare two standalone executables or build manifests")
  .option("--json", "Output diff as JSON")
  .action(async (bin1, bin2, options) => {
    try {
      await runDiffCommand({ bin1, bin2, json: options.json });
    } catch (err: any) {
      console.error(pc.red(`\nDiff error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("release", "Package compiled executables and create checksums")
  .option("-o, --out-dir <dir>", "Output directory")
  .option("-f, --format <format>", "Archive format: tar.gz, tar.xz, or zip (default: tar.gz)")
  .action(async (options) => {
    try {
      await runReleaseCommand({ outDir: options.outDir, format: options.format });
    } catch (err: any) {
      console.error(pc.red(`\nRelease error: ${err.message}\n`));
      process.exit(1);
    }
  });

cli
  .command("help [command]", "Display help for a specific command or general usage")
  .action((cmd) => {
    if (cmd) {
      const match = cli.commands.find(
        (c) => c.name === cmd || c.name.startsWith(`${cmd} `)
      );
      if (match) {
        match.outputHelp();
        return;
      }
    }
    cli.outputHelp();
  });

cli.help((sections) => {
  sections.unshift({
    title: "",
    body: `${pc.bold(pc.cyan("  Yekpare"))} ${pc.dim("v0.1.0")} - Build once, ship as one executable.\n  Developer toolchain for turning Node.js CLI applications into standalone executables.`,
  });

  sections.push({
    title: "Quick Start",
    body: [
      `  $ ${pc.cyan("yekpare init")}          ${pc.dim("Create configuration")}`,
      `  $ ${pc.cyan("yekpare doctor")}        ${pc.dim("Analyze SEA compatibility")}`,
      `  $ ${pc.cyan("yekpare build")}         ${pc.dim("Compile standalone executable")}`,
      `  $ ${pc.cyan("yekpare inspect <bin>")}  ${pc.dim("Inspect compiled executable")}`,
    ].join("\n"),
  });
});

cli.version("0.1.0");

if (process.argv.slice(2).length === 0) {
  cli.outputHelp();
} else {
  cli.parse();
}

