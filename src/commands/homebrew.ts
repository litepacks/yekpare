import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { formatHeader, symbols } from "../utils/format.js";
import { ensureDir } from "../utils/fs.js";
import { resolveConfig } from "../config/index.js";

export interface HomebrewCliOptions {
  repo?: string;
  cwd?: string;
}

export function generateHomebrewFormula(options: {
  appName: string;
  version: string;
  repo?: string;
  description?: string;
}): string {
  const rubyClassName = options.appName
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  const repoUrl = options.repo || `https://github.com/username/${options.appName}`;

  return `class ${rubyClassName} < Formula
  desc "${options.description || `${options.appName} standalone CLI executable`}"
  homepage "${repoUrl}"
  version "${options.version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "#{homepage}/releases/download/v#{version}/${options.appName}-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_ARM64_SHA256"

      def install
        bin.install "${options.appName}"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "#{homepage}/releases/download/v#{version}/${options.appName}-linux-x64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_X64_SHA256"

      def install
        bin.install "${options.appName}"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/${options.appName} --version")
  end
end
`;
}

export async function runHomebrewCommand(options: HomebrewCliOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  console.log(formatHeader("homebrew", "Generating Homebrew tap formula"));

  const config = await resolveConfig(cwd);
  const formulaDir = path.join(cwd, "Formula");
  await ensureDir(formulaDir);

  const formulaPath = path.join(formulaDir, `${config.name}.rb`);
  const content = generateHomebrewFormula({
    appName: config.name,
    version: config.version,
    repo: options.repo,
  });

  fs.writeFileSync(formulaPath, content, "utf8");

  console.log(`  ${symbols.success}  Generated ${pc.green(`Formula/${config.name}.rb`)}`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Push your tag and release tarballs to GitHub.`);
  console.log(`    2. Update the sha256 checksums in the Formula.`);
  console.log(`    3. Publish to your homebrew-tap repository.\n`);
}
