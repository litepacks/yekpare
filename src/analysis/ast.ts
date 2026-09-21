import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { DiagnosticFinding, AnalysisSummary } from "./rules.js";

// Handle default export interop for babel traverse in ESM & CJS
const traverse: any = (typeof _traverse === "function" ? _traverse : (_traverse as any).default || _traverse);

export interface AnalyzeFileResult {
  filePath: string;
  findings: DiagnosticFinding[];
  staticImportsCount: number;
  assetCandidates: string[];
  nativeAddonCandidates: string[];
}


export function analyzeSourceCode(code: string, filePath: string): AnalyzeFileResult {
  const findings: DiagnosticFinding[] = [];
  let staticImportsCount = 0;
  const assetCandidates: string[] = [];
  const nativeAddonCandidates: string[] = [];

  let linesCache: string[] | null = null;
  function getSnippet(line: number): string {
    if (linesCache === null) {
      linesCache = code.split("\n");
    }
    if (line <= 0 || line > linesCache.length) return "";
    return linesCache[line - 1].trim();
  }

  let ast: any;
  try {
    ast = parse(code, {
      sourceType: "unambiguous",
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "classProperties",
        "dynamicImport",
        "exportDefaultFrom",
        "topLevelAwait",
      ],
    });
  } catch (err: any) {
    // If syntax parse fails, record an informational finding
    findings.push({
      file: filePath,
      line: err.loc?.line || 1,
      column: err.loc?.column || 1,
      category: "otherFindings" as any,
      severity: "warning",
      title: "Parser syntax warning",
      codeSnippet: getSnippet(err.loc?.line || 1),
      reason: `Could not fully parse file AST: ${err.message}`,
      suggestions: ["Ensure the file contains valid TypeScript / ECMAScript syntax."],
    });
    return {
      filePath,
      findings,
      staticImportsCount: 0,
      assetCandidates,
      nativeAddonCandidates,
    };
  }

  traverse(ast, {
    // Static imports: import x from 'y'
    ImportDeclaration(pathNode: any) {
      staticImportsCount++;
      const sourceVal = pathNode.node.source.value;
      if (sourceVal.endsWith(".node")) {
        nativeAddonCandidates.push(sourceVal);
        const loc = pathNode.node.loc?.start || { line: 1, column: 1 };
        findings.push({
          file: filePath,
          line: loc.line,
          column: loc.column,
          category: "native-addon",
          severity: "warning",
          title: "Native addon import detected",
          codeSnippet: getSnippet( loc.line),
          reason: `Importing native binary "${sourceVal}". Native addons must be extracted to cache at runtime.`,
          suggestions: [
            "Use Yekpare runtime native addon helper or ensure cross-platform prebuilds exist.",
          ],
        });
      }
    },

    // Export named / all from
    ExportNamedDeclaration(pathNode: any) {
      if (pathNode.node.source) {
        staticImportsCount++;
      }
    },
    ExportAllDeclaration() {
      staticImportsCount++;
    },

    // Dynamic import: import(...)
    CallExpression(pathNode: any) {
      const callee = pathNode.node.callee;
      const loc = pathNode.node.loc?.start || { line: 1, column: 1 };

      // Dynamic import: import(arg)
      if (t.isImport(callee)) {
        const arg = pathNode.node.arguments[0];
        if (!t.isStringLiteral(arg)) {
          findings.push({
            file: filePath,
            line: loc.line,
            column: loc.column,
            category: "dynamic-import",
            severity: "warning",
            title: "Dynamic import with variable expression",
            codeSnippet: getSnippet( loc.line),
            reason: "Yekpare bundler cannot statically determine dynamic import target.",
            suggestions: [
              "Declare the dependency explicitly in yekpare.config.ts.",
              "Include target files as runtime assets.",
              "Use static import if the target set is known.",
            ],
          });
        }
        return;
      }

      // require(...) calls
      if (t.isIdentifier(callee, { name: "require" })) {
        const arg = pathNode.node.arguments[0];
        if (!arg) return;

        if (t.isStringLiteral(arg)) {
          if (arg.value.endsWith(".node")) {
            nativeAddonCandidates.push(arg.value);
            findings.push({
              file: filePath,
              line: loc.line,
              column: loc.column,
              category: "native-addon",
              severity: "warning",
              title: "Native addon required",
              codeSnippet: getSnippet( loc.line),
              reason: `Direct require of native addon "${arg.value}".`,
              suggestions: [
                "Ensure native prebuilds are packaged with Yekpare.",
                "Verify compatibility across target platforms with 'yekpare doctor'.",
              ],
            });
          }
        } else {
          // require(variable)
          findings.push({
            file: filePath,
            line: loc.line,
            column: loc.column,
            category: "dynamic-require",
            severity: "warning",
            title: "Dynamic require() detected",
            codeSnippet: getSnippet( loc.line),
            reason: "Yekpare cannot statically determine which package will be loaded.",
            suggestions: [
              "Declare the dependency explicitly in yekpare.config.ts.",
              "Include it as an external runtime asset.",
              "Replace dynamic require with static imports.",
            ],
          });
        }
        return;
      }

      // require.resolve(var)
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: "require" }) &&
        t.isIdentifier(callee.property, { name: "resolve" })
      ) {
        const arg = pathNode.node.arguments[0];
        if (arg && !t.isStringLiteral(arg)) {
          findings.push({
            file: filePath,
            line: loc.line,
            column: loc.column,
            category: "dynamic-resolve",
            severity: "info",
            title: "Dynamic require.resolve() detected",
            codeSnippet: getSnippet( loc.line),
            reason: "Dynamic path resolution might fail if targets are not bundled or extracted.",
            suggestions: [
              "Ensure referenced paths are declared in assets config.",
            ],
          });
        }
      }

      // createRequire(...)
      if (
        t.isIdentifier(callee, { name: "createRequire" }) ||
        (t.isMemberExpression(callee) &&
          t.isIdentifier(callee.property, { name: "createRequire" }))
      ) {
        findings.push({
          file: filePath,
          line: loc.line,
          column: loc.column,
          category: "create-require",
          severity: "info",
          title: "createRequire() detected",
          codeSnippet: getSnippet( loc.line),
          reason: "CJS require bridge created dynamically inside ESM module.",
          suggestions: [
            "Ensure packages required through createRequire are bundled or externalized.",
          ],
        });
      }

      // process.dlopen(...)
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: "process" }) &&
        t.isIdentifier(callee.property, { name: "dlopen" })
      ) {
        findings.push({
          file: filePath,
          line: loc.line,
          column: loc.column,
          category: "native-addon",
          severity: "warning",
          title: "process.dlopen invocation detected",
          codeSnippet: getSnippet( loc.line),
          reason: "Direct invocation of process.dlopen to load native C/C++ addons.",
          suggestions: [
            "Use Yekpare's asset.requireAddon() or ensure binary is extracted to cache before dlopen.",
          ],
        });
      }

      // child_process.spawn("node", ...) / child_process.fork(...) / spawn("node", ...) / fork(...)
      let isNodeSpawnCall = false;
      let spawnLoc = loc;

      if (t.isIdentifier(callee) && ["spawn", "spawnSync", "fork", "exec", "execSync"].includes(callee.name)) {
        const firstArg = pathNode.node.arguments[0];
        if (callee.name === "fork") {
          isNodeSpawnCall = true;
        } else if (t.isStringLiteral(firstArg)) {
          if (firstArg.value === "node" || firstArg.value.includes("node ") || firstArg.value.startsWith("node")) {
            isNodeSpawnCall = true;
          }
        }
      } else if (t.isMemberExpression(callee)) {
        const propName = t.isIdentifier(callee.property) ? callee.property.name : "";
        if (["spawn", "spawnSync", "fork", "exec", "execSync"].includes(propName)) {
          const firstArg = pathNode.node.arguments[0];
          if (propName === "fork") {
            isNodeSpawnCall = true;
          } else if (t.isStringLiteral(firstArg)) {
            if (firstArg.value === "node" || firstArg.value.includes("node ") || firstArg.value.startsWith("node")) {
              isNodeSpawnCall = true;
            }
          }
        }
      }

      if (isNodeSpawnCall) {
        findings.push({
          file: filePath,
          line: spawnLoc.line,
          column: spawnLoc.column,
          category: "spawn-node",
          severity: "warning",
          title: "Child Node process spawned",
          codeSnippet: getSnippet( spawnLoc.line),
          reason: "Spawning 'node' assumes Node.js is installed on the user machine.",
          suggestions: [
            "Standalone executables may run on machines without Node.js.",
            "Use worker threads or bundle child CLI logic directly inside the main executable.",
          ],
        });
      }

      // fs.readFileSync / fs.readFile / fs.promises.readFile
      if (t.isMemberExpression(callee)) {
        const obj = callee.object;
        const prop = callee.property;
        const isFs =
          (t.isIdentifier(obj) && (obj.name === "fs" || obj.name === "fsp")) ||
          (t.isMemberExpression(obj) &&
            t.isIdentifier(obj.object, { name: "fs" }) &&
            t.isIdentifier(obj.property, { name: "promises" }));

        const isReadMethod =
          t.isIdentifier(prop) &&
          ["readFileSync", "readFile", "createReadStream", "openSync"].includes(prop.name);

        if (isFs && isReadMethod) {
          const firstArg = pathNode.node.arguments[0];
          let discoveredCandidate: string | null = null;

          if (t.isStringLiteral(firstArg)) {
            discoveredCandidate = firstArg.value;
          } else if (
            t.isCallExpression(firstArg) &&
            t.isMemberExpression(firstArg.callee) &&
            t.isIdentifier(firstArg.callee.property, { name: "join" })
          ) {
            // path.join(__dirname, "foo")
            const stringArgs = firstArg.arguments
              .filter(t.isStringLiteral)
              .map((a) => (a as t.StringLiteral).value);
            if (stringArgs.length > 0) {
              discoveredCandidate = stringArgs.join("/");
            }
          }

          if (discoveredCandidate) {
            assetCandidates.push(discoveredCandidate);
          }

          findings.push({
            file: filePath,
            line: loc.line,
            column: loc.column,
            category: "runtime-fs-access",
            severity: "info",
            title: "Runtime filesystem read detected",
            codeSnippet: getSnippet( loc.line),
            reason: `Direct filesystem access via ${prop.name}(). Files might not exist on target system unless embedded.`,
            suggestions: [
              "Use 'import { asset } from \"yekpare/runtime\"' (e.g. asset.text() / asset.buffer()).",
              "Declare asset pattern in yekpare.config.ts.",
            ],
          });
        }
      }
    },

    // new Worker(...) or new URL(..., import.meta.url)
    NewExpression(pathNode: any) {
      const callee = pathNode.node.callee;
      const loc = pathNode.node.loc?.start || { line: 1, column: 1 };

      // new Worker(...)
      if (t.isIdentifier(callee, { name: "Worker" })) {
        findings.push({
          file: filePath,
          line: loc.line,
          column: loc.column,
          category: "worker",
          severity: "info",
          title: "Worker thread instantiated",
          codeSnippet: getSnippet( loc.line),
          reason: "Worker threads load script files that must be available in bundle or SEA asset table.",
          suggestions: [
            "Use workerData with asset.path() or bundle worker script as an embedded asset.",
          ],
        });
      }

      // new URL("./template.html", import.meta.url)
      if (t.isIdentifier(callee, { name: "URL" })) {
        const [arg0, arg1] = pathNode.node.arguments;
        if (
          t.isStringLiteral(arg0) &&
          t.isMemberExpression(arg1) &&
          t.isMetaProperty(arg1.object) &&
          t.isIdentifier(arg1.property, { name: "url" })
        ) {
          assetCandidates.push(arg0.value);
          findings.push({
            file: filePath,
            line: loc.line,
            column: loc.column,
            category: "new-url-import-meta",
            severity: "info",
            title: "Relative URL with import.meta.url",
            codeSnippet: getSnippet( loc.line),
            reason: `Asset path reference: "${arg0.value}". In SEA executables, import.meta.url points to the binary.`,
            suggestions: [
              "Replace with 'asset.path()' or 'asset.text()' from 'yekpare/runtime'.",
              "Include file in assets config in yekpare.config.ts.",
            ],
          });
        }
      }
    },
  });

  return {
    filePath,
    findings,
    staticImportsCount,
    assetCandidates: Array.from(new Set(assetCandidates)),
    nativeAddonCandidates: Array.from(new Set(nativeAddonCandidates)),
  };
}

export async function analyzeProjectFiles(filePaths: string[]): Promise<AnalysisSummary> {
  let staticImports = 0;
  const dynamicRequires: DiagnosticFinding[] = [];
  const dynamicImports: DiagnosticFinding[] = [];
  const runtimeFsAccess: DiagnosticFinding[] = [];
  const nativeAddons: DiagnosticFinding[] = [];
  const spawnNodeCalls: DiagnosticFinding[] = [];
  const workerInstantiations: DiagnosticFinding[] = [];
  const otherFindings: DiagnosticFinding[] = [];
  const detectedAssetCandidates: string[] = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const code = fs.readFileSync(filePath, "utf8");
    const result = analyzeSourceCode(code, filePath);

    staticImports += result.staticImportsCount;
    detectedAssetCandidates.push(...result.assetCandidates);

    for (const f of result.findings) {
      switch (f.category) {
        case "dynamic-require":
          dynamicRequires.push(f);
          break;
        case "dynamic-import":
          dynamicImports.push(f);
          break;
        case "runtime-fs-access":
        case "new-url-import-meta":
          runtimeFsAccess.push(f);
          break;
        case "native-addon":
          nativeAddons.push(f);
          break;
        case "spawn-node":
          spawnNodeCalls.push(f);
          break;
        case "worker":
          workerInstantiations.push(f);
          break;
        default:
          otherFindings.push(f);
          break;
      }
    }
  }

  let totalWarnings = 0;
  let totalErrors = 0;

  const allFindings = [
    ...dynamicRequires,
    ...dynamicImports,
    ...runtimeFsAccess,
    ...nativeAddons,
    ...spawnNodeCalls,
    ...workerInstantiations,
    ...otherFindings,
  ];

  for (const item of allFindings) {
    if (item.severity === "warning") totalWarnings++;
    if (item.severity === "error") totalErrors++;
  }

  return {
    staticImports,
    dynamicRequires,
    dynamicImports,
    runtimeFsAccess,
    nativeAddons,
    spawnNodeCalls,
    workerInstantiations,
    otherFindings,
    detectedAssetCandidates: Array.from(new Set(detectedAssetCandidates)),
    totalWarnings,
    totalErrors,
  };
}
