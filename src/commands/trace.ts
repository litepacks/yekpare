import pc from "picocolors";
import { runRuntimeTrace } from "../analysis/tracer.js";
import { formatHeader, formatKeyValueSection, KeyValueRow } from "../utils/format.js";

export interface TraceCliOptions {
  commandArgs: string[];
  cwd?: string;
  json?: boolean;
}

export async function runTraceCommand(options: TraceCliOptions): Promise<any> {
  const cwd = options.cwd || process.cwd();
  if (options.commandArgs.length === 0) {
    throw new Error("No command provided to trace. Example: yekpare trace -- npm test");
  }

  if (!options.json) {
    console.log(formatHeader("Trace", `Tracing: ${options.commandArgs.join(" ")}`));
  }

  const result = await runRuntimeTrace(options.commandArgs, cwd);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log("");
  const rows: KeyValueRow[] = [
    { key: "Command", value: result.command },
    { key: "Exit code", value: `${result.exitCode ?? 0}`, status: result.exitCode === 0 ? "success" : "warning" },
    { key: "Loaded modules", value: `${result.loadedModules.length}` },
    { key: "Dynamic imports", value: `${result.dynamicImports.length}` },
    { key: "Native addons", value: `${result.nativeAddons.length}` },
    { key: "Assets read", value: `${result.assetsRead.length}` },
  ];

  console.log(formatKeyValueSection("Runtime Trace Report", rows));

  if (result.nativeAddons.length > 0) {
    console.log(pc.bold("Observed Native Addons:"));
    for (const addon of result.nativeAddons) {
      console.log(`  • ${pc.yellow(addon)}`);
    }
    console.log("");
  }

  if (result.assetsRead.length > 0) {
    console.log(pc.bold("Observed File Reads:"));
    for (const file of result.assetsRead.slice(0, 10)) {
      console.log(`  • ${pc.dim(file)}`);
    }
    if (result.assetsRead.length > 10) {
      console.log(`  ${pc.dim(`... and ${result.assetsRead.length - 10} more`)}`);
    }
    console.log("");
  }

  return result;
}
