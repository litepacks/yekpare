// Config & Types
export { defineConfig, resolveConfig, inspectProject } from "./config/index.js";
export * from "./config/types.js";

// Bundler
export { EsbuildBundler } from "./bundler/esbuild.js";
export * from "./bundler/types.js";

// SEA Builder
export { NodeSeaBuilder } from "./sea/builder.js";
export { checkSeaCapabilities } from "./sea/capabilities.js";
export { createBuildManifest, serializeManifest } from "./sea/manifest.js";
export * from "./sea/types.js";

// Analysis
export { analyzeSourceCode, analyzeProjectFiles } from "./analysis/ast.js";
export { detectNativeAddons } from "./analysis/compatibility.js";
export { runRuntimeTrace } from "./analysis/tracer.js";
export * from "./analysis/rules.js";

// Commands
export { runInit } from "./commands/init.js";
export { runBuild } from "./commands/build.js";
export { runDoctor } from "./commands/doctor.js";
export { runInspect } from "./commands/inspect.js";
export { runTraceCommand } from "./commands/trace.js";
export { runCiCommand } from "./commands/ci.js";
export { runHomebrewCommand, generateHomebrewFormula } from "./commands/homebrew.js";
export { runInstallerCommand, generateInstallScript } from "./commands/installer.js";
export { runTestCommand } from "./commands/test.js";
export { runDiffCommand } from "./commands/diff.js";
export { runReleaseCommand } from "./commands/release.js";

// Utilities
export { formatBytes, formatKeyValueSection, formatHeader, symbols } from "./utils/format.js";
export { createSpinner, withSpinner, Spinner } from "./utils/progress.js";
export { hashContent, hashContentFull, hashFile } from "./utils/hash.js";
export { getYekpareCacheDir, getPlatformCacheBaseDir } from "./utils/cache.js";
export { writeFileAtomic, ensureDir, fileExists } from "./utils/fs.js";
export { parseDotenv, loadDotenvFile, parseKeyValuePairs, formatEnvForDefine } from "./utils/env.js";
