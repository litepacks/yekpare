import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatHeader, symbols } from "../utils/format.js";
import { ensureDir } from "../utils/fs.js";
import { resolveConfig } from "../config/index.js";
import { TargetPlatform, YekpareConfig } from "../config/types.js";

export interface CiCliOptions {
  provider?: "github";
  node?: string;
  deb?: boolean;
  homebrew?: boolean;
  npm?: boolean;
  strip?: boolean;
  upx?: boolean;
  output?: string;
  config?: string;
  cwd?: string;
}

export interface GenerateGitHubWorkflowOptions {
  appName: string;
  nodeVersion?: string;
  deb?: boolean;
  homebrew?: boolean;
  npm?: boolean;
  strip?: boolean;
  upx?: boolean;
  description?: string;
  maintainer?: string;
  targets?: TargetPlatform[];
}

interface TargetMatrixEntry {
  os: string;
  arch: string;
  runner: string;
  target_name: string;
  bin_suffix: string;
}

const DEFAULT_TARGET_MATRIX: TargetMatrixEntry[] = [
  {
    os: "darwin",
    arch: "arm64",
    runner: "macos-14",
    target_name: "darwin-arm64",
    bin_suffix: "",
  },
  {
    os: "linux",
    arch: "x64",
    runner: "ubuntu-latest",
    target_name: "linux-x64",
    bin_suffix: "",
  },
  {
    os: "win32",
    arch: "x64",
    runner: "windows-latest",
    target_name: "win32-x64",
    bin_suffix: ".exe",
  },
];

export function generateGitHubWorkflow(
  appNameOrOptions: string | GenerateGitHubWorkflowOptions
): string {
  const options: GenerateGitHubWorkflowOptions =
    typeof appNameOrOptions === "string"
      ? { appName: appNameOrOptions }
      : appNameOrOptions;

  const appName = options.appName;
  const nodeVersion = options.nodeVersion || "22";
  const deb = options.deb ?? false;
  const homebrew = options.homebrew ?? false;
  const npm = options.npm ?? false;
  const strip = options.strip ?? true;
  const upx = options.upx ?? false;
  const description = options.description || `${appName} standalone CLI executable`;
  const maintainer = options.maintainer || `${appName} maintainers`;

  // Build flags for yekpare build
  const buildFlags = [
    "--target ${{ matrix.target.target_name }}",
    strip ? "--strip" : null,
    upx ? "--upx" : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Filter matrix targets if specific multiple targets requested
  let matrixEntries = DEFAULT_TARGET_MATRIX;
  if (options.targets && options.targets.length > 1) {
    const targetSet = new Set(options.targets.map(String));
    const filtered = DEFAULT_TARGET_MATRIX.filter((m) =>
      targetSet.has(m.target_name)
    );
    if (filtered.length > 0) {
      matrixEntries = filtered;
    }
  }

  const matrixYaml = matrixEntries
    .map(
      (m) => `          - os: ${m.os}
            arch: ${m.arch}
            runner: ${m.runner}
            target_name: ${m.target_name}
            bin_suffix: '${m.bin_suffix}'`
    )
    .join("\n");

  // Debian packaging step on Linux
  const debBuildStep = deb
    ? `
          # Build Debian (.deb) package on Linux
          if [ "\${{ matrix.target.os }}" = "linux" ]; then
            VERSION=$(node -p "require('./package.json').version")
            mkdir -p deb-pkg/DEBIAN deb-pkg/usr/bin
            cp ./dist/${appName} deb-pkg/usr/bin/${appName}
            chmod 0755 deb-pkg/usr/bin/${appName}
            {
              echo "Package: ${appName}"
              echo "Version: \${VERSION}"
              echo "Section: utils"
              echo "Priority: optional"
              echo "Architecture: amd64"
              echo "Maintainer: ${maintainer}"
              echo "Description: ${description}"
            } > deb-pkg/DEBIAN/control
            dpkg-deb --build deb-pkg ${appName}_\${VERSION}_amd64.deb
          fi`
    : "";

  const debUploadEntry = deb ? `\n            ${appName}_*.deb` : "";

  // Homebrew formula checksum update step
  const homebrewChecksumStep = homebrew
    ? `
      - name: Update Homebrew Formula Checksums
        shell: bash
        working-directory: release-artifacts
        run: |
          DARWIN_ARM64_SHA=$(sha256sum ${appName}-darwin-arm64.tar.gz 2>/dev/null | awk '{print $1}' || echo "")
          LINUX_X64_SHA=$(sha256sum ${appName}-linux-x64.tar.gz 2>/dev/null | awk '{print $1}' || echo "")

          if [ -f ../Formula/${appName}.rb ]; then
            [ -n "$DARWIN_ARM64_SHA" ] && sed -i "s/REPLACE_WITH_DARWIN_ARM64_SHA256/$DARWIN_ARM64_SHA/g" ../Formula/${appName}.rb || true
            [ -n "$LINUX_X64_SHA" ] && sed -i "s/REPLACE_WITH_LINUX_X64_SHA256/$LINUX_X64_SHA/g" ../Formula/${appName}.rb || true
            cp ../Formula/${appName}.rb ./${appName}.rb
          fi`
    : "";

  const homebrewReleaseFile = homebrew ? `\n            release-artifacts/${appName}.rb` : "";
  const debReleaseFile = deb ? `\n            release-artifacts/${appName}_*.deb` : "";

  // NPM publish job
  const npmPublishJob = npm
    ? `
  publish-npm:
    name: Publish to NPM
    needs: build-release
    if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js (${nodeVersion}.x)
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Compile TypeScript
        run: npm run build --if-present

      - name: Publish to NPM
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`
    : "";

  return `name: Yekpare Multi-Platform Release Matrix

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-release:
    name: Build (\${{ matrix.target.target_name }})
    runs-on: \${{ matrix.target.runner }}
    strategy:
      fail-fast: false
      matrix:
        target:
${matrixYaml}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js (${nodeVersion}.x)
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compile TypeScript
        run: npm run build --if-present

      - name: Build standalone executable with Yekpare
        run: npx yekpare build ${buildFlags}

      - name: Validate built executable
        shell: bash
        run: |
          ./dist/${appName}\${{ matrix.target.bin_suffix }} --version || true
          ./dist/${appName}\${{ matrix.target.bin_suffix }} --help || true

      - name: Package release archive
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
          cd ..${debBuildStep}

      - name: Upload Platform Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${appName}-\${{ matrix.target.target_name }}
          path: |
            ${appName}-*.*${debUploadEntry}

  publish-github-release:
    name: Publish GitHub Release
    needs: build-release
    if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download all release artifacts
        uses: actions/download-artifact@v4
        with:
          path: release-artifacts
          merge-multiple: true

      - name: Generate SHA-256 Checksums
        shell: bash
        working-directory: release-artifacts
        run: |
          sha256sum ${appName}-* > SHA256SUMS.txt || true
          cat SHA256SUMS.txt${homebrewChecksumStep}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            release-artifacts/${appName}-*.tar.gz
            release-artifacts/${appName}-*.zip${debReleaseFile}${homebrewReleaseFile}
            release-artifacts/SHA256SUMS.txt
          draft: false
          prerelease: false
          generate_release_notes: true
${npmPublishJob}`.trimEnd() + "\n";
}

export async function runCiCommand(options: CiCliOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("ci", "Generating multi-platform CI release workflow"));

  const overrides: Partial<YekpareConfig> = {};
  if (
    options.deb !== undefined ||
    options.homebrew !== undefined ||
    options.npm !== undefined ||
    options.strip !== undefined ||
    options.upx !== undefined ||
    options.node !== undefined
  ) {
    overrides.ci = {
      deb: options.deb,
      homebrew: options.homebrew,
      npm: options.npm,
      strip: options.strip,
      upx: options.upx,
      nodeVersion: options.node,
    };
  }

  const config = await resolveConfig(cwd, overrides, options.config);
  const workflowDir = path.join(cwd, ".github", "workflows");
  await ensureDir(workflowDir);

  const workflowFileName = options.output || config.ci.output || "yekpare-release.yml";
  const workflowPath = path.isAbsolute(workflowFileName)
    ? workflowFileName
    : path.join(workflowDir, path.basename(workflowFileName));

  const content = generateGitHubWorkflow({
    appName: config.name,
    nodeVersion: config.ci.nodeVersion,
    deb: config.ci.deb,
    homebrew: config.ci.homebrew,
    npm: config.ci.npm,
    strip: config.ci.strip,
    upx: config.ci.upx,
    description: config.description,
    maintainer: config.author,
    targets: config.targets,
  });

  fs.writeFileSync(workflowPath, content, "utf8");

  const relWorkflowPath = path.relative(cwd, workflowPath) || workflowPath;
  console.log(`  ${symbols.success}  Generated ${pc.green(relWorkflowPath)}`);
  console.log(`\n  Pipeline Features:`);
  console.log(`    ${symbols.bullet} Node.js Runtime: ${pc.cyan(`${config.ci.nodeVersion}.x`)}`);
  console.log(`    ${symbols.bullet} Binary Symbol Stripping: ${config.ci.strip ? pc.green("Enabled (--strip)") : pc.dim("Disabled")}`);
  console.log(`    ${symbols.bullet} UPX Compression: ${config.ci.upx ? pc.green("Enabled (--upx)") : pc.dim("Disabled")}`);
  console.log(`    ${symbols.bullet} Debian (.deb) Packaging: ${config.ci.deb ? pc.green("Enabled (Linux amd64)") : pc.dim("Disabled")}`);
  console.log(`    ${symbols.bullet} Homebrew Checksum Injection: ${config.ci.homebrew ? pc.green("Enabled (Formula auto-update)") : pc.dim("Disabled")}`);
  console.log(`    ${symbols.bullet} NPM Publish: ${config.ci.npm ? pc.green("Enabled (via NPM_TOKEN)") : pc.dim("Disabled")}`);
  console.log(`\n  Triggers:`);
  console.log(`    ${symbols.bullet} Tag push (${pc.cyan("refs/tags/v*")})`);
  console.log(`    ${symbols.bullet} Manual run (${pc.cyan("workflow_dispatch")})\n`);
}
