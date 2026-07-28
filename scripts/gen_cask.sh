#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# gen_cask.sh — Generate Homebrew Cask from build/dist/checksums.txt
#
# Requires both macOS archives to be present in build/dist/ and checksums.txt
# to contain entries for both platforms. Called from GitHub Actions after
# all builds complete.
# =============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

VERSION="$(cat VERSION | tr -d '\r\n')"
DIST="build/dist"
CHECKSUM_FILE="${DIST}/checksums.txt"
CASK_PATH="${DIST}/omnidb.rb"
GITHUB="https://github.com/heptau/omnidb"

[[ -f "$CHECKSUM_FILE" ]] || { echo "Error: ${CHECKSUM_FILE} not found"; exit 1; }

sha_for() {
  grep "  OmniDB-${VERSION}-macOS-${1}.zip$" "$CHECKSUM_FILE" | awk '{print $1}'
}

SHA_ARM64=$(sha_for "osx-arm64")
SHA_X64=$(sha_for "osx-x64")

[[ -n "${SHA_ARM64}" ]] || { echo "Error: missing checksum for arm64 in ${CHECKSUM_FILE}"; exit 1; }
[[ -n "${SHA_X64}" ]] || { echo "Error: missing checksum for x64 in ${CHECKSUM_FILE}"; exit 1; }

cat > "$CASK_PATH" <<EOF
cask "omnidb" do
  version "${VERSION}"

  on_arm do
    sha256 "${SHA_ARM64}"
    url "${GITHUB}/releases/download/v#{version}/OmniDB-#{version}-macOS-osx-arm64.zip"
  end

  on_intel do
    sha256 "${SHA_X64}"
    url "${GITHUB}/releases/download/v#{version}/OmniDB-#{version}-macOS-osx-x64.zip"
  end

  name "OmniDB"
  desc "Revived open-source database management tool (PostgreSQL-focused)"
  homepage "${GITHUB}"

  depends_on macos: :ventura

  app "OmniDB.app"

  postflight do
    set_permissions "#{appdir}/OmniDB.app", '755'

    system_command "/usr/bin/xattr",
                   args:  ["-r", "-d", "com.apple.quarantine", "#{appdir}/OmniDB.app"],
                   sudo:  false
  end

  # Bundle ID is "net.omnidb" (wails-app/build/darwin/Info.plist,
  # AGENTS.md) — these paths used to say "com.omnidb.*", which never
  # matched anything real, so \`brew uninstall --zap\` silently left the
  # actual prefs/saved-state files behind.
  zap trash: [
    "~/Library/Application Support/OmniDB",
    "~/Library/Preferences/net.omnidb.plist",
    "~/Library/Caches/OmniDB",
    "~/Library/Saved Application State/net.omnidb.savedState",
    "~/Library/Logs/OmniDB",
  ]

  caveats do
    <<~EOS
      OmniDB starts a local web server on first launch and opens its
      interface in the app window (usually at http://localhost:some-port).

      If the window does not open automatically, check the console output
      or try opening the reported address in your default browser.
    EOS
  end
end
EOF

echo "==> Homebrew Cask generated: ${CASK_PATH}"
