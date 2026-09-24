class Yekpare < Formula
  desc "yekpare standalone CLI executable"
  homepage "https://github.com/litepacks/yekpare"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "#{homepage}/releases/download/v#{version}/yekpare-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_DARWIN_ARM64_SHA256"

      def install
        bin.install "yekpare"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "#{homepage}/releases/download/v#{version}/yekpare-linux-x64.tar.gz"
      sha256 "REPLACE_WITH_LINUX_X64_SHA256"

      def install
        bin.install "yekpare"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/yekpare --version")
  end
end
