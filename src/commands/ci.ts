import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatHeader, symbols } from "../utils/format.js";
import { ensureDir } from "../utils/fs.js";
import { resolveConfig } from "../config/index.js";

export interface CiCliOptions {
  provider?: "github";
  cwd?: string;
}

export function generateGitHubWorkflow(appName: string): string {
  return `name: Yekpare Release Matrix

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-release:
    name: Build (\${{ matrix.target.os }}-\${{ matrix.target.arch }})
    runs-on: \${{ matrix.target.runner }}
    strategy:
      fail-fast: false
      matrix:
        target:
          - os: darwin
            arch: arm64
            runner: macos-14
            target_name: darwin-arm64
            bin_suffix: ''
          - os: darwin
            arch: x64
            runner: macos-13
            target_name: darwin-x64
            bin_suffix: ''
          - os: linux
            arch: x64
            runner: ubuntu-latest
            target_name: linux-x64
            bin_suffix: ''
          - os: win32
            arch: x64
            runner: windows-latest
            target_name: win32-x64
            bin_suffix: '.exe'

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js (24.x)
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build standalone executable with Yekpare
        run: npx yekpare build --target \${{ matrix.target.target_name }}

      - name: Validate built executable
        shell: bash
        run: |
          ./dist/${appName}\${{ matrix.target.bin_suffix }} --help || true

      - name: Package release artifact
        shell: bash
        run: |
          mkdir -p release-pkg
          cp ./dist/${appName}\${{ matrix.target.bin_suffix }} release-pkg/
          cd release-pkg
          if [ "\${{ matrix.target.os }}" = "win32" ]; then
            7z a ../${appName}-\${{ matrix.target.target_name }}.zip ./*
          else
            tar -czvf ../${appName}-\${{ matrix.target.target_name }}.tar.gz ./*
          fi

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${appName}-\${{ matrix.target.target_name }}
          path: ${appName}-*.*

  publish-github-release:
    name: Publish GitHub Release
    needs: build-release
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Generate Checksums & Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            */*
          draft: false
          prerelease: false
          generate_release_notes: true
`;
}

export async function runCiCommand(options: CiCliOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("ci", "Generating multi-platform CI release workflow"));

  const config = await resolveConfig(cwd);
  const workflowDir = path.join(cwd, ".github", "workflows");
  await ensureDir(workflowDir);

  const workflowPath = path.join(workflowDir, "yekpare-release.yml");
  const content = generateGitHubWorkflow(config.name);

  fs.writeFileSync(workflowPath, content, "utf8");

  console.log(`  ${symbols.success}  Generated ${pc.green(".github/workflows/yekpare-release.yml")}`);
  console.log(`\n  CI Matrix Platforms:`);
  console.log(`    ${symbols.bullet} macOS Apple Silicon (darwin-arm64 on macos-14)`);
  console.log(`    ${symbols.bullet} macOS Intel (darwin-x64 on macos-13)`);
  console.log(`    ${symbols.bullet} Linux x64 (linux-x64 on ubuntu-latest)`);
  console.log(`    ${symbols.bullet} Windows x64 (win32-x64 on windows-latest)\n`);
}
