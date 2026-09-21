# Yekpare

> **Build once, ship as one executable.**  
> Developer toolchain for turning Node.js CLI applications into standalone executables.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![CI Matrix](https://img.shields.io/badge/CI-Linux%20%7C%20macOS%20%7C%20Windows-brightgreen.svg)](.github/workflows/ci.yml)

---

## What is Yekpare?

**Yekpare** sits on top of modern Node.js Single Executable Application (SEA) capabilities and streamlines everything around SEA:

- 📦 **TypeScript & ESM Bundling** via pluggable `esbuild` abstraction
- 🔍 **Compatibility Analysis (`doctor`)** with AST-based hazard detection
- 📁 **Asset Discovery & Embedding** with optional Brotli/Gzip compression
- ⚡ **Unified Runtime Asset API (`yekpare/runtime`)** with automatic local/SEA switching and atomic cache extraction
- 🧩 **Native Addon Handling** (`.node` binaries extracted to cache and loaded via `process.dlopen`)
- 🎯 **Target Compatibility Matrix** across macOS (Apple Silicon / Intel), Linux (x64 / arm64), and Windows
- 🔬 **Binary Inspection & Manifest Embedding** with sanitized metadata
- 🚀 **CI Matrix Generation** (`.github/workflows/yekpare-release.yml`)
- 🍺 **Homebrew Formula Generation**
- 🐧 **Linux / APT (`.deb`) Distribution** packaging and repository workflows
- 📦 **Release Packaging** with automated SHA256 checksums

---

## Quick Start

### 1. Installation

```bash
npm install -D yekpare
# or run directly with npx
npx yekpare --help
```

### 2. Initialize Configuration

```bash
npx yekpare init
```

Generates `yekpare.config.ts`:

```ts
import { defineConfig } from "yekpare";

export default defineConfig({
  entry: "./src/cli.ts",
  name: "rowpipe",

  targets: [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
    "win32-x64",
  ],

  assets: [
    "./templates/**/*",
    "./schemas/**/*",
  ],

  bundle: {
    minify: false,
    sourcemap: true,
  },
});
```

### 3. Check SEA Compatibility

```bash
npx yekpare doctor
```

```text
  Yekpare Doctor
  Compatibility analysis for Node.js SEA distribution

Project

  Entry                    src/cli.ts
  Module format            ESM
  Node target              v24.x

Compatibility

  Static imports           ✓ 82 detected
  Dynamic require          ✓ None
  Dynamic import           ✓ None
  Runtime fs access        ℹ 4 detected
  Native addons            ✓ None
  Workers                  ✓ None
  Child Node processes     ✓ None

Assets

  Detected                 2
  Explicit                 2

Result

  ✓  SEA compatible
```

### 4. Build Standalone Executable

```bash
# Zero-config mode (auto-infers entry from package.json or src/cli.ts)
npx yekpare build

# Or explicit entry
npx yekpare build src/cli.ts
```

Output:

```text
  Yekpare build
  Compiling Node.js CLI into standalone executable

  Analyzing project
    entry:          src/cli.ts
    assets:         2
    native addons:  0

  Bundling
    bundle size:    1.9 MB (42ms)

  Building SEA
    runtime:        Node v24.19.0
    target:         darwin-arm64

  Output
    dist/rowpipe
    executable size: 61.4 MB

  Validation
    launch          ✓
    --version       ✓

  ✓  Successfully built standalone executable!
```

---

## Runtime Asset API

Instead of branching on `if (isSea())` across your codebase, use `yekpare/runtime`:

```ts
import { asset } from "yekpare/runtime";

// 1. Read asset text
const template = asset.text("templates/index.html");

// 2. Read asset JSON
const schema = asset.json("schemas/config.json");

// 3. Read raw buffer
const weights = asset.buffer("models/weights.bin");

// 4. Check existence
if (asset.exists("templates/custom.html")) {
  // ...
}

// 5. Get deterministic filesystem path
// (Extracts embedded asset to ~/.cache/yekpare/<app>/<hash>/... if in SEA)
const binaryTool = asset.path("bin/helper-tool");
```

---

## Commands

| Command | Description |
|---|---|
| `yekpare init` | Scans project and generates `yekpare.config.ts` |
| `yekpare build [entry]` | Bundles and compiles project into standalone executable (`--strip`, `--upx`) |
| `yekpare doctor [entry]` | Analyzes compatibility, AST hazards, and native dependencies |
| `yekpare inspect <binary>` | Extracts and displays embedded metadata, sizes, and asset tables |
| `yekpare trace -- <cmd>` | Observes runtime module loads, native addons, and fs reads |
| `yekpare ci [provider]` | Generates multi-platform GitHub Actions release workflow |
| `yekpare homebrew` | Generates Homebrew tap formula for distributing your binary |
| `yekpare test [binary]` | Runs automated health and assertion checks on the binary |
| `yekpare diff <b1> <b2>` | Compares two binaries (sizes, manifests, embedded assets) |
| `yekpare release` | Packages binaries into `.tar.gz`, `.tar.xz`, or `.zip` with `checksums.txt` |

---

## Binary Size Optimization

Reduce your standalone executable size from ~88 MB down to **~25-30 MB** (with UPX) or **~70 MB** (with symbol stripping):

### CLI Flags

```bash
# 1. Strip debug symbols (-10 to -20 MB reduction)
npx yekpare build --strip

# 2. Maximum compression with UPX (~25-30 MB on Linux and Windows)
npx yekpare build --strip --upx

# 3. Custom UPX arguments
npx yekpare build --upx --upx-args "--best --lzma"

# 4. Ultra-compressed release packaging
npx yekpare release --format tar.xz
```

### In `yekpare.config.ts`

```ts
import { defineConfig } from "yekpare";

export default defineConfig({
  entry: "./src/cli.ts",
  name: "my-cli",
  binary: {
    strip: true, // Strips unneeded debug symbols
    upx: true,   // In-place UPX compression (when available in PATH)
  },
  assets: {
    patterns: ["./templates/**/*"],
    compression: "brotli", // Compresses embedded assets
  },
  bundle: {
    minify: true,
  },
  release: {
    format: "tar.xz", // "tar.gz" | "tar.xz" | "zip"
  },
});
```

---

## CI/CD Multi-Platform Matrix

Generate a complete GitHub Actions matrix build workflow:

```bash
npx yekpare ci github
```

Creates `.github/workflows/yekpare-release.yml` supporting:
- macOS Apple Silicon (`macos-14`, `darwin-arm64`)
- macOS Intel (`macos-13`, `darwin-x64`)
- Linux x64 (`ubuntu-latest`, `linux-x64`)
- Windows x64 (`windows-latest`, `win32-x64`)

---

## Homebrew Distribution

Generate a Homebrew formula:

```bash
npx yekpare homebrew --repo https://github.com/my-org/my-cli
```

Outputs `Formula/my-cli.rb` configured with architecture detection and test assertions.

---

## Linux / APT (Debian & Ubuntu) Distribution

Package your standalone Linux binary into a `.deb` package for distribution through APT repositories or direct installation.

### 1. Build the Linux Standalone Executable

```bash
npx yekpare build --target linux-x64
# Generated binary: dist/my-cli
```

### 2. Prepare the `.deb` Directory Structure

```bash
PKG_NAME="my-cli"
PKG_VERSION="1.0.0"
ARCH="amd64" # use "arm64" for linux-arm64
STAGE_DIR="${PKG_NAME}_${PKG_VERSION}_${ARCH}"

# Create directory hierarchy
mkdir -p "${STAGE_DIR}/DEBIAN"
mkdir -p "${STAGE_DIR}/usr/local/bin"

# Copy Yekpare standalone binary
cp "dist/${PKG_NAME}" "${STAGE_DIR}/usr/local/bin/${PKG_NAME}"
chmod 755 "${STAGE_DIR}/usr/local/bin/${PKG_NAME}"
```

### 3. Define Debian Package Control File

Create `${STAGE_DIR}/DEBIAN/control`:

```ini
Package: my-cli
Version: 1.0.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: litepacks <hello@litepacks.dev>
Description: Standalone CLI application built with Yekpare.
 No Node.js runtime or external dependencies required.
```

### 4. Build the `.deb` Package

```bash
dpkg-deb --build --root-owner-group "${STAGE_DIR}"
# Output: my-cli_1.0.0_amd64.deb
```

### 5. Install via APT

Users can install the resulting package directly using `apt`:

```bash
sudo apt update
sudo apt install ./my-cli_1.0.0_amd64.deb
```

### 6. Hosting via an APT Repository

To distribute your `.deb` packages via an APT repository (e.g. GitHub Pages, Launchpad PPA, or Cloudsmith):

```bash
# 1. Add repository GPG key
curl -fsSL https://repo.example.com/KEY.gpg | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/my-cli.gpg

# 2. Add repository source entry
echo "deb [signed-by=/etc/apt/trusted.gpg.d/my-cli.gpg] https://repo.example.com/ stable main" | sudo tee /etc/apt/sources.list.d/my-cli.list

# 3. Update and install
sudo apt update
sudo apt install my-cli
```

### 7. Automate in GitHub Actions

Add a step to `.github/workflows/yekpare-release.yml` to package and attach `.deb` files to every release:

```yaml
- name: Build Debian Package (.deb)
  if: matrix.target == 'linux-x64'
  run: |
    PKG="my-cli_${{ github.ref_name }}_amd64"
    mkdir -p "$PKG/DEBIAN" "$PKG/usr/local/bin"
    cp dist/my-cli "$PKG/usr/local/bin/"
    chmod 755 "$PKG/usr/local/bin/my-cli"
    cat <<EOF > "$PKG/DEBIAN/control"
    Package: my-cli
    Version: ${{ github.ref_name }}
    Section: utils
    Priority: optional
    Architecture: amd64
    Maintainer: litepacks <hello@litepacks.dev>
    Description: Standalone CLI application built with Yekpare
    EOF
    dpkg-deb --build --root-owner-group "$PKG"
```

---

## Architecture

```text
entry (TS / ESM)
      ↓
Project Analysis & Doctor (AST & Dependency Scanning)
      ↓
Bundler Abstraction (esbuild + SEA & Native Addon Plugins)
      ↓
Asset Collector & Compressor (Raw / Brotli / Gzip)
      ↓
Node SEA Builder (sea-config.json + postject + codesign)
      ↓
Post-Build Validation (Launch & Version Verification)
      ↓
dist/my-cli (Standalone Executable)
```

---

## License

MIT © [litepacks](LICENSE)
