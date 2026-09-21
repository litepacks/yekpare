import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";

export interface TraceResult {
  command: string;
  exitCode: number | null;
  loadedModules: string[];
  nativeAddons: string[];
  assetsRead: string[];
  dynamicImports: string[];
}

export function generateTracerHookScript(reportPath: string): string {
  return `
const fs = require('fs');
const path = require('path');
const Module = require('module');

const traceData = {
  loadedModules: [],
  nativeAddons: [],
  assetsRead: [],
  dynamicImports: []
};

// Hook Module._load
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (typeof request === 'string' && !traceData.loadedModules.includes(request)) {
    traceData.loadedModules.push(request);
  }
  return origLoad.apply(this, arguments);
};

// Hook process.dlopen
const origDlopen = process.dlopen;
process.dlopen = function(module, filename, flags) {
  if (typeof filename === 'string' && !traceData.nativeAddons.includes(filename)) {
    traceData.nativeAddons.push(filename);
  }
  return origDlopen.apply(this, arguments);
};

// Hook fs.readFileSync
const origReadFileSync = fs.readFileSync;
fs.readFileSync = function(pathArg) {
  if (typeof pathArg === 'string' && !traceData.assetsRead.includes(pathArg)) {
    traceData.assetsRead.push(pathArg);
  }
  return origReadFileSync.apply(this, arguments);
};

// Save trace data on exit
function dumpReport() {
  try {
    fs.mkdirSync(path.dirname(${JSON.stringify(reportPath)}), { recursive: true });
    fs.writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(traceData, null, 2), 'utf8');
  } catch (err) {}
}

process.on('exit', dumpReport);
process.on('SIGINT', () => { dumpReport(); process.exit(); });
process.on('SIGTERM', () => { dumpReport(); process.exit(); });
`;
}

export async function runRuntimeTrace(
  commandArgs: string[],
  cwd: string = process.cwd()
): Promise<TraceResult> {
  const tmpDir = os.tmpdir();
  const reportPath = path.join(tmpDir, `yekpare-trace-${Date.now()}.json`);
  const hookScriptPath = path.join(tmpDir, `yekpare-hook-${Date.now()}.cjs`);

  const hookCode = generateTracerHookScript(reportPath);
  fs.writeFileSync(hookScriptPath, hookCode, "utf8");

  const [cmd, ...args] = commandArgs;

  const nodeOptions = process.env.NODE_OPTIONS || "";
  const extraNodeOptions = `--require ${hookScriptPath} ${nodeOptions}`.trim();

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: extraNodeOptions,
      },
    });

    child.on("error", (err) => {
      try {
        fs.unlinkSync(hookScriptPath);
      } catch {}
      reject(err);
    });

    child.on("close", (exitCode) => {
      try {
        fs.unlinkSync(hookScriptPath);
      } catch {}

      let traceData: any = {
        loadedModules: [],
        nativeAddons: [],
        assetsRead: [],
        dynamicImports: [],
      };

      if (fs.existsSync(reportPath)) {
        try {
          traceData = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          fs.unlinkSync(reportPath);
        } catch {}
      }

      resolve({
        command: commandArgs.join(" "),
        exitCode,
        loadedModules: traceData.loadedModules || [],
        nativeAddons: traceData.nativeAddons || [],
        assetsRead: traceData.assetsRead || [],
        dynamicImports: traceData.dynamicImports || [],
      });
    });
  });
}
