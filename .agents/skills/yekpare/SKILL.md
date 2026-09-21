---
name: yekpare
description: >-
  Build, analyze, optimize, and distribute Node.js CLI applications as standalone Single Executable Applications (SEA).
  Use when the user asks to compile a Node.js CLI into a standalone executable, optimize binary size with stripping or UPX,
  troubleshoot Node SEA compatibility issues, embed runtime assets, generate Homebrew tap formulas, build Debian packages,
  configure GitHub Actions release matrices, or inspect and diff SEA binaries.
---

# Yekpare: Standalone Node.js CLI Toolchain

Yekpare is a complete developer toolchain for compiling Node.js CLI applications into standalone executables (Single Executable Applications / SEA) that run anywhere without requiring Node.js to be installed on the target machine.

---

## 1. Quick Reference & CLI Commands

| Command | Purpose | Common Options |
| :--- | :--- | :--- |
| `yekpare init` | Scaffolds `yekpare.config.ts` or updates `package.json` | `--force`, `--json` |
| `yekpare doctor [entry]` | Static analysis for SEA compatibility risks | `--strict`, `--json` |
| `yekpare trace [...cmd]` | Runtime observation of file reads & dynamic requires | `--output <file>`, `--json` |
| `yekpare build [entry]` | Bundles and injects code/assets into standalone binary | `--strip`, `--upx`, `--minify`, `--target <os-arch>` |
| `yekpare inspect <bin>` | Displays binary size breakdown, Node version & assets | `--json` |
| `yekpare test [binary]` | Validates binary execution and flag responses | `--args <list>`, `--json` |
| `yekpare diff <b1> <b2>` | Compares two binaries or build manifests | `--json` |
| `yekpare release` | Packages binaries into archives with `SHA256SUMS` | `--format <tar.gz\|tar.xz\|zip>`, `--dry-run` |
| `yekpare homebrew` | Generates Homebrew Formula for tap distribution | `--repo <user/repo>`, `--name <tool>` |
| `yekpare ci [provider]` | Generates multi-platform CI matrix workflow (GitHub) | `--output <path>` |

---

## 2. Configuration (`yekpare.config.ts`)

A configuration file can be generated with `yekpare init` or created manually:

```ts
import { defineConfig } from "yekpare";

export default defineConfig({
  name: "my-cli",
  entry: "src/cli.ts",
  targets: ["darwin-arm64", "linux-x64", "win32-x64"],
  bundle: {
    minify: true,
    sourcemap: false,
    external: [],
  },
  binary: {
    strip: true, // Strips debug symbols (reduces size by ~15-30%)
    upx: false,  // Compresses with UPX if installed
    upxArgs: ["-9", "--force-macos"],
  },
  assets: {
    include: ["templates/**", "assets/**"],
    compression: "brotli", // "none" | "gzip" | "brotli"
  },
  release: {
    format: "tar.gz",      // "tar.gz" | "tar.xz" | "zip"
    checksum: "sha256",
  },
  validation: {
    runVersionCheck: true,
  },
});
```

---

## 3. Recommended Workflow

### Step 1: Compatibility Check (`yekpare doctor`)
Run static analysis against the CLI entry point before building:
```bash
yekpare doctor src/cli.ts
```
Findings analyzed:
- Dynamic `require(variable)` or `import(variable)`
- `fs.readFileSync` calls with relative paths (candidate for embedded assets)
- Native C/C++ addons (`.node` files or `process.dlopen`)
- Worker threads and child processes spawning `node`
- Recommendations for `import.meta.url` or path resolutions

### Step 2: Runtime Tracing (Optional, for complex CLIs)
If the CLI uses dynamic plugins or dynamic imports:
```bash
yekpare trace node ./dist/cli.js --help
```
Captures accessed files, native bindings, and unbundled dependencies into a trace inventory.

### Step 3: Compiling Standalone Executable
Compile the standalone executable:
```bash
# Standard optimized build with symbol stripping
yekpare build --strip

# High compression build (with UPX)
yekpare build --strip --upx

# Specific target and entry point
yekpare build src/cli.ts --target darwin-arm64 --strip
```

Output is placed in `dist/<name>` (or `dist/<name>.exe` on Windows).

### Step 4: Verification & Inspection
```bash
# Inspect metadata, embedded assets, and Node runtime
yekpare inspect dist/my-cli

# Test launchability, --version, and --help
yekpare test dist/my-cli

# Compare sizes against an earlier build
yekpare diff dist/my-cli dist/my-cli-old
```

---

## 4. Runtime Asset API (`yekpare/runtime`)

Yekpare provides a dual-mode asset API that works identically in both local development (Node.js) and compiled SEA binaries:

```ts
import { asset, isSea } from "yekpare/runtime";

// Check if running inside compiled executable
console.log("Is SEA:", isSea());

// Read text asset (auto decompressed if stored as brotli/gzip)
const template = asset.text("templates/config.yaml");

// Read parsed JSON
const config = asset.json("data/schema.json");

// Read raw Buffer
const iconBuffer = asset.buffer("assets/icon.png");

// List all embedded asset keys
const keys = asset.keys();

// Native addon loading (automatically extracts to cached temp dir in SEA mode)
const nativeBinding = asset.requireAddon("addons/binding.node");
```

---

## 5. Distribution & Packaging

### Multi-Format Release Archives
```bash
# Generates tar.gz + SHA256SUMS
yekpare release

# Generates tar.xz for maximum compression
yekpare release --format tar.xz

# Generates zip archives
yekpare release --format zip
```

### Homebrew Tap Formula
```bash
yekpare homebrew --repo username/homebrew-tap --name my-cli
```
Generates `Formula/my-cli.rb` with multi-platform binary URLs and SHA-256 placeholders.

### Debian (.deb) Package Structure
Yekpare supports Debian packaging for Linux distributions (`apt`):
- Binary installed to `/usr/bin/<appName>`
- Permissions set to `0755`
- Control file generated under `DEBIAN/control`

### GitHub Actions CI Matrix
```bash
yekpare ci github
```
Generates `.github/workflows/release.yml` with a cross-compilation matrix building on:
- `ubuntu-latest` (Linux x64)
- `macos-latest` (macOS arm64)
- `windows-latest` (Windows x64)

---

## 6. Technical Architecture & Gotchas

1. **Node.js SEA Bootstrap**:
   - Node SEA runs the bundle using `embedderRunCjs` (CommonJS environment).
   - Yekpare bundles with esbuild (`format: "cjs"`) and automatically injects:
     - `__filename` and `__dirname` pointing to `process.execPath`
     - `__import_meta_url` shim (`file://` URL pointing to executable)
     - `define: { "import.meta.url": "__import_meta_url" }` so ESM modules calling `createRequire(import.meta.url)` execute smoothly without throwing.
2. **Sentinel Fuse & Injection**:
   - SEA injection requires a sentinel fuse (`NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`).
   - Yekpare uses the `postject` library / CLI.
3. **macOS Ad-Hoc Signing**:
   - Modifying a binary on macOS breaks its code signature. Yekpare automatically runs `codesign --sign - <outputPath>` after blob injection.
4. **Binary Stripping (`--strip`)**:
   - Uses system `strip` command to remove non-essential symbols and debug information.
   - Typically reduces Node 20/22/25 binary sizes by 15 MB to 35 MB.
5. **UPX Compression (`--upx`)**:
   - Requires `upx` utility (`brew install upx` on macOS, `apt install upx-ucl` on Linux).
   - If not found on PATH, Yekpare warns and proceeds without failing the build.
