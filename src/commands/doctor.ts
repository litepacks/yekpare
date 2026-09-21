import path from "node:path";
import pc from "picocolors";
import fg from "fast-glob";
import { resolveConfig } from "../config/index.js";
import { inspectProject } from "../config/defaults.js";
import { analyzeProjectFiles } from "../analysis/ast.js";
import { detectNativeAddons } from "../analysis/compatibility.js";
import { runRuntimeTrace } from "../analysis/tracer.js";
import { formatHeader, formatKeyValueSection, symbols, KeyValueRow } from "../utils/format.js";

export interface DoctorCliOptions {
  entry?: string;
  config?: string;
  trace?: boolean | string;
  json?: boolean;
  cwd?: string;
}

export async function runDoctor(options: DoctorCliOptions = {}): Promise<any> {
  const cwd = options.cwd || process.cwd();
  const config = await resolveConfig(cwd, options.entry ? { entry: options.entry } : {}, options.config);
  const inspection = inspectProject(cwd);

  if (!options.json) {
    console.log(formatHeader("Doctor", "Compatibility analysis for Node.js SEA distribution"));
  }

  // Find source files to analyze
  let sourceFiles: string[] = [];
  if (config.entry) {
    sourceFiles.push(config.entry);
  }

  // Also include files in src directory if present
  const additionalFiles = await fg(["src/**/*.{ts,js,mjs,cjs}"], {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**", "**/*.d.ts", "**/*.test.*", "**/__tests__/**"],
  });
  sourceFiles = Array.from(new Set([...sourceFiles, ...additionalFiles]));

  const analysis = await analyzeProjectFiles(sourceFiles);
  const compat = await detectNativeAddons(config.projectRoot, config.targets);

  // Optional runtime trace
  let traceResult: any = null;
  if (options.trace) {
    const traceCmd = typeof options.trace === "string" ? options.trace.split(" ") : ["node", config.entry, "--help"];
    if (!options.json) {
      console.log(`  ${pc.cyan("Running runtime trace:")} ${traceCmd.join(" ")}...\n`);
    }
    try {
      traceResult = await runRuntimeTrace(traceCmd, cwd);
    } catch (err: any) {
      if (!options.json) {
        console.log(`  ${symbols.warning}  ${pc.yellow("Trace execution warning:")} ${err.message}\n`);
      }
    }
  }

  // Compute explicit vs detected assets
  const explicitAssetsCount = config.assets.patterns.length;
  const detectedAssetsCount = analysis.detectedAssetCandidates.length;

  // Determine overall status
  let overallStatus = "SEA compatible";
  let statusBadge = symbols.success;
  if (analysis.totalErrors > 0) {
    overallStatus = "Action required";
    statusBadge = symbols.error;
  } else if (analysis.totalWarnings > 0 || compat.addons.length > 0) {
    overallStatus = "SEA compatible with warnings";
    statusBadge = symbols.warning;
  }

  if (options.json) {
    const jsonOutput = {
      project: {
        entry: path.relative(cwd, config.entry) || config.entry,
        format: inspection.isModule ? "ESM" : "CommonJS",
        nodeTarget: process.version,
      },
      compatibility: {
        staticImports: analysis.staticImports,
        dynamicRequireWarnings: analysis.dynamicRequires.length,
        dynamicImportWarnings: analysis.dynamicImports.length,
        runtimeFsAccessDetected: analysis.runtimeFsAccess.length,
        nativeAddonsDetected: compat.addons.length,
        workerThreadsDetected: analysis.workerInstantiations.length,
        childNodeProcesses: analysis.spawnNodeCalls.length,
      },
      assets: {
        detected: detectedAssetsCount,
        explicit: explicitAssetsCount,
        candidates: analysis.detectedAssetCandidates,
      },
      nativeAddons: compat.addons,
      findings: [
        ...analysis.dynamicRequires,
        ...analysis.dynamicImports,
        ...analysis.runtimeFsAccess,
        ...analysis.nativeAddons,
        ...analysis.spawnNodeCalls,
        ...analysis.workerInstantiations,
        ...analysis.otherFindings,
      ],
      trace: traceResult,
      result: overallStatus,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return jsonOutput;
  }

  // 1. Project section
  const projectRows: KeyValueRow[] = [
    { key: "Entry", value: path.relative(cwd, config.entry) || config.entry },
    { key: "Module format", value: inspection.isModule ? "ESM" : "CommonJS" },
    { key: "Node target", value: process.version },
  ];
  console.log(formatKeyValueSection("Project", projectRows));

  // 2. Compatibility section
  const compRows: KeyValueRow[] = [
    {
      key: "Static imports",
      value: `${analysis.staticImports} detected`,
      status: "success",
    },
    {
      key: "Dynamic require",
      value: analysis.dynamicRequires.length === 0 ? "None" : `${analysis.dynamicRequires.length} warning${analysis.dynamicRequires.length > 1 ? "s" : ""}`,
      status: analysis.dynamicRequires.length === 0 ? "success" : "warning",
    },
    {
      key: "Dynamic import",
      value: analysis.dynamicImports.length === 0 ? "None" : `${analysis.dynamicImports.length} warning${analysis.dynamicImports.length > 1 ? "s" : ""}`,
      status: analysis.dynamicImports.length === 0 ? "success" : "warning",
    },
    {
      key: "Runtime fs access",
      value: `${analysis.runtimeFsAccess.length} detected`,
      status: analysis.runtimeFsAccess.length === 0 ? "success" : "info",
    },
    {
      key: "Native addons",
      value: compat.addons.length === 0 ? "None" : `${compat.addons.length} detected`,
      status: compat.addons.length === 0 ? "success" : "warning",
    },
    {
      key: "Workers",
      value: analysis.workerInstantiations.length === 0 ? "None" : `${analysis.workerInstantiations.length} detected`,
      status: "success",
    },
    {
      key: "Child Node processes",
      value: analysis.spawnNodeCalls.length === 0 ? "None" : `${analysis.spawnNodeCalls.length} warning`,
      status: analysis.spawnNodeCalls.length === 0 ? "success" : "warning",
    },
  ];
  console.log(formatKeyValueSection("Compatibility", compRows));

  // 3. Assets section
  const assetRows: KeyValueRow[] = [
    { key: "Detected", value: `${detectedAssetsCount}` },
    { key: "Explicit", value: `${explicitAssetsCount}` },
  ];
  console.log(formatKeyValueSection("Assets", assetRows));

  // 4. Native addons section
  if (compat.addons.length > 0) {
    const addonRows: KeyValueRow[] = compat.addons.map((a) => ({
      key: a.name,
      value: "attention required",
      status: "warning",
    }));
    console.log(formatKeyValueSection("Native addons", addonRows));
  }

  // 5. Trace section
  if (traceResult) {
    const traceRows: KeyValueRow[] = [
      { key: "Loaded modules", value: `${traceResult.loadedModules.length}` },
      { key: "Dynamic imports", value: `${traceResult.dynamicImports.length}` },
      { key: "Native addons", value: `${traceResult.nativeAddons.length}` },
      { key: "Assets read", value: `${traceResult.assetsRead.length}` },
    ];
    console.log(formatKeyValueSection("Runtime trace", traceRows));
  }

  // 6. Actionable Findings (if any)
  const allFindings = [
    ...analysis.dynamicRequires,
    ...analysis.dynamicImports,
    ...analysis.runtimeFsAccess.filter((f) => f.category !== "runtime-fs-access"),
    ...analysis.spawnNodeCalls,
    ...analysis.nativeAddons,
  ];

  if (allFindings.length > 0) {
    console.log(pc.bold("Actionable Findings"));
    console.log("");

    for (const f of allFindings.slice(0, 10)) {
      const relFile = path.relative(cwd, f.file);
      console.log(`  ${pc.yellow(f.title)}`);
      console.log(`  ${pc.dim(`${relFile}:${f.line}:${f.column}`)}`);
      if (f.codeSnippet) {
        console.log(`    ${pc.dim("│")}  ${pc.cyan(f.codeSnippet)}`);
      }
      console.log(`  ${pc.dim(f.reason)}`);
      if (f.suggestions.length > 0) {
        console.log(`  ${pc.dim("Suggestions:")}`);
        for (const s of f.suggestions) {
          console.log(`    ${symbols.bullet} ${s}`);
        }
      }
      console.log("");
    }
  }

  // 7. Result section
  console.log(pc.bold("Result"));
  console.log("");
  console.log(`  ${statusBadge}  ${overallStatus}\n`);

  return { overallStatus, analysis, compat, traceResult };
}
