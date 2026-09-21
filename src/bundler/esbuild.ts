import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { Bundler, BundleOptions, BundleResult, BundlerAsset } from "./types.js";

export class EsbuildBundler implements Bundler {
  public name = "esbuild";

  public async bundle(options: BundleOptions): Promise<BundleResult> {
    const warnings: string[] = [];
    const entryFiles: string[] = [options.entry];

    // Node builtins to ensure they are externalized from bundle
    const nodeBuiltins = [
      "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
      "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
      "events", "fs", "fs/promises", "http", "http2", "https", "inspector",
      "module", "net", "os", "path", "perf_hooks", "process", "punycode",
      "querystring", "readline", "repl", "stream", "stream/promises",
      "stream/consumers", "stream/web", "string_decoder", "timers",
      "timers/promises", "tls", "trace_events", "tty", "url", "util",
      "util/types", "v8", "vm", "wasi", "worker_threads", "zlib",
      "node:assert", "node:async_hooks", "node:buffer", "node:child_process",
      "node:cluster", "node:console", "node:constants", "node:crypto",
      "node:dgram", "node:diagnostics_channel", "node:dns", "node:domain",
      "node:events", "node:fs", "node:fs/promises", "node:http", "node:http2",
      "node:https", "node:inspector", "node:module", "node:net", "node:os",
      "node:path", "node:perf_hooks", "node:process", "node:punycode",
      "node:querystring", "node:readline", "node:repl", "node:sea",
      "node:stream", "node:stream/promises", "node:stream/consumers",
      "node:stream/web", "node:string_decoder", "node:timers",
      "node:timers/promises", "node:tls", "node:trace_events", "node:tty",
      "node:url", "node:util", "node:util/types", "node:v8", "node:vm",
      "node:wasi", "node:worker_threads", "node:zlib",
    ];

    const external = Array.from(new Set([...nodeBuiltins, ...(options.external || [])]));

    // Plugin to rewrite .node native addon imports to use asset.requireAddon
    const nativeAddonPlugin: esbuild.Plugin = {
      name: "yekpare-native-addon-plugin",
      setup(build) {
        build.onResolve({ filter: /\.node$/ }, (args) => {
          return {
            path: path.isAbsolute(args.path)
              ? args.path
              : path.resolve(args.resolveDir, args.path),
            namespace: "yekpare-native-node",
          };
        });

        build.onLoad({ filter: /.*/, namespace: "yekpare-native-node" }, (args) => {
          const relativeKey = path.relative(options.projectRoot, args.path).replace(/\\/g, "/");
          return {
            contents: `
              const { asset } = require('yekpare/runtime');
              module.exports = asset.requireAddon(${JSON.stringify(relativeKey)}, ${JSON.stringify(options.appName || "yekpare-app")});
            `,
            loader: "js",
          };
        });
      },
    };

    const yekpareRuntimePlugin: esbuild.Plugin = {
      name: "yekpare-runtime-plugin",
      setup(build) {
        build.onResolve({ filter: /^yekpare\/runtime$/ }, () => {
          let dir = process.cwd();
          try {
            if (typeof __dirname !== "undefined") {
              dir = __dirname;
            } else if (typeof import.meta !== "undefined" && import.meta.url) {
              dir = path.dirname(fileURLToPath(import.meta.url));
            }
          } catch {}

          const runtimeJs = path.resolve(dir, "../runtime.js");
          const runtimeTs = path.resolve(dir, "../runtime.ts");
          const distRuntimeJs = path.resolve(dir, "./runtime.js");
          const target = fs.existsSync(runtimeJs)
            ? runtimeJs
            : fs.existsSync(runtimeTs)
            ? runtimeTs
            : fs.existsSync(distRuntimeJs)
            ? distRuntimeJs
            : runtimeJs;
          return { path: target };
        });
      },
    };

    const defaultBanner = `
// --- Yekpare SEA Bootstrap Shim ---
if (typeof __filename === 'undefined') {
  global.__filename = process.execPath;
}
if (typeof __dirname === 'undefined') {
  global.__dirname = require('node:path').dirname(process.execPath);
}
var __import_meta_url = typeof document === 'undefined'
  ? require('node:url').pathToFileURL(typeof __filename !== 'undefined' ? __filename : process.execPath).href
  : '';
${options.banner || ""}
`.trim();

    const buildResult = await esbuild.build({
      entryPoints: [options.entry],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "cjs",
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ? "inline" : false,
      external,
      define: {
        "import.meta.url": "__import_meta_url",
        ...(options.define || {}),
      },
      banner: {
        js: defaultBanner,
      },
      footer: options.footer ? { js: options.footer } : undefined,
      write: false,
      plugins: [nativeAddonPlugin, yekpareRuntimePlugin],
      metafile: true,
    });

    for (const w of buildResult.warnings) {
      warnings.push(`${w.text} (${w.location?.file || "unknown"}:${w.location?.line || 0})`);
    }

    if (buildResult.metafile) {
      entryFiles.push(...Object.keys(buildResult.metafile.inputs));
    }

    const outputFile = buildResult.outputFiles[0];
    const code = outputFile.text;
    const size = outputFile.contents.byteLength;

    return {
      code,
      size,
      entryFiles: Array.from(new Set(entryFiles)),
      bundledAssets: options.assets || [],
      warnings,
    };
  }
}
