#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# build_release.sh — Build OmniDB for the CURRENT platform, create a
#                    versioned archive, and write/update checksums.txt.
#
# Called by:
#   - scripts/release.sh --local  (builds current platform)
#   - GitHub Actions release workflow (runs natively on each runner)
#
# Environment variables:
#   MAKE_TARGET   Override detected make target
# =============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

VERSION="$(cat VERSION | tr -d '\r\n')"
DIST="build/dist"

# ── Detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin*)
    ARCH="$(uname -m)"
    if [[ -n "${MAKE_TARGET:-}" ]]; then
      TARGET="$MAKE_TARGET"
    elif [[ "$ARCH" == "arm64" ]]; then
      TARGET="build-mac-arm64"
    else
      TARGET="build-mac-intel"
    fi
    [[ "$TARGET" == *arm64* ]] \
      && ARCHIVE_NAME="OmniDB-${VERSION}-macOS-osx-arm64.zip" \
      || ARCHIVE_NAME="OmniDB-${VERSION}-macOS-osx-x64.zip"
    sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
    ;;
  Linux*)
    TARGET="${MAKE_TARGET:-build-linux}"
    ARCHIVE_NAME="OmniDB-${VERSION}-linux-x64.tar.gz"
    sha256() { sha256sum "$1" | awk '{print $1}'; }
    ;;
  MINGW*|CYGWIN*|MSYS*)
    TARGET="${MAKE_TARGET:-build-win}"
    ARCHIVE_NAME="OmniDB-${VERSION}-win-x64.zip"
    sha256() { sha256sum "$1" | awk '{print $1}'; }
    ;;
  *)
    echo "Error: unsupported OS: $OS"; exit 1 ;;
esac

echo "==> Building OmniDB v${VERSION} (${TARGET})..."
make "$TARGET"

ARCHIVE="${DIST}/${ARCHIVE_NAME}"
[[ -f "$ARCHIVE" ]] || { echo "Error: archive not found: $ARCHIVE"; exit 1; }

SHA=$(sha256 "$ARCHIVE")
echo "    Archive : $ARCHIVE"
echo "    SHA256  : $SHA"

# Append to checksums.txt (idempotent — replaces existing entry if present)
CHECKSUM_FILE="${DIST}/checksums.txt"
touch "$CHECKSUM_FILE"
grep -v "  ${ARCHIVE_NAME}$" "$CHECKSUM_FILE" > "${CHECKSUM_FILE}.tmp" || true
echo "${SHA}  ${ARCHIVE_NAME}" >> "${CHECKSUM_FILE}.tmp"
sort -k2 "${CHECKSUM_FILE}.tmp" -o "$CHECKSUM_FILE"
rm "${CHECKSUM_FILE}.tmp"

echo "    checksums.txt updated."
