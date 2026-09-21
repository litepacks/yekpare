export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "dynamic-require"
  | "dynamic-import"
  | "runtime-fs-access"
  | "new-url-import-meta"
  | "native-addon"
  | "spawn-node"
  | "worker"
  | "dynamic-resolve"
  | "create-require";

export interface DiagnosticFinding {
  file: string;
  line: number;
  column: number;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  codeSnippet: string;
  reason: string;
  suggestions: string[];
}

export interface AnalysisSummary {
  staticImports: number;
  dynamicRequires: DiagnosticFinding[];
  dynamicImports: DiagnosticFinding[];
  runtimeFsAccess: DiagnosticFinding[];
  nativeAddons: DiagnosticFinding[];
  spawnNodeCalls: DiagnosticFinding[];
  workerInstantiations: DiagnosticFinding[];
  otherFindings: DiagnosticFinding[];
  detectedAssetCandidates: string[];
  totalWarnings: number;
  totalErrors: number;
}
