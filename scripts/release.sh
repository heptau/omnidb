#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# release.sh — Release OmniDB locally (current platform) or to GitHub
#
# Usage:
#   scripts/release.sh --local    Build current platform, verify artifacts
#   scripts/release.sh --github   Verify clean state, tag, push → CI does the rest
#
# After --github the GitHub Actions release workflow (release.yml) runs on
# native macOS runners, builds arm64 + x64, creates the GitHub release,
# and updates the Homebrew Cask automatically.
#
# Environment variables:
#   GITHUB_REPO           GitHub repo (default: heptau/omnidb)
#   HOMEBREW_TAP_REPO     GitHub repo of the Homebrew tap (default: heptau/homebrew-tap)
#   HOMEBREW_TAP_CASK     Path to cask inside the tap (default: Casks/omnidb.rb)
# =============================================================================

MODE="${1:-}"
if [[ "$MODE" != "--local" && "$MODE" != "--github" ]]; then
  echo "Usage: $0 [--local|--github]"
  echo ""
  echo "  --local   Build current platform only, verify artifacts"
  echo "  --github  Tag and push — GitHub Actions will build all platforms,"
  echo "            create the GitHub release, and update the Homebrew Cask"
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

VERSION="$(cat VERSION | tr -d '\n')"
GITHUB_REPO="${GITHUB_REPO:-heptau/omnidb}"

echo "OmniDB release — v${VERSION} (${MODE})"
echo ""

# ── Local mode ────────────────────────────────────────────────────────────────
if [[ "$MODE" == "--local" ]]; then
  echo "==> Building for current platform..."
  scripts/build_release.sh
  echo ""

  ARCH="$(uname -m)"
  if [[ "$ARCH" == "arm64" ]]; then
    ARCHIVE="build/dist/OmniDB-${VERSION}-macOS-osx-arm64.zip"
  else
    ARCHIVE="build/dist/OmniDB-${VERSION}-macOS-osx-x64.zip"
  fi

  [[ -f "$ARCHIVE" ]] || { echo "Error: archive not found: $ARCHIVE"; exit 1; }
  echo "==> OK: $ARCHIVE"
  echo ""
  echo "Local build ready. Inspect build/dist/ before running:"
  echo "  scripts/release.sh --github"
  exit 0
fi

# ── GitHub mode ───────────────────────────────────────────────────────────────

# Guard: uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes present. Commit or stash before releasing."
  exit 1
fi

# Guard: tag must not already exist on remote
if git ls-remote --tags origin "refs/tags/v${VERSION}" | grep -q .; then
  echo "Error: tag v${VERSION} already exists on remote. Bump VERSION and try again."
  exit 1
fi

echo "==> Tagging v${VERSION}..."
if git tag -l "v${VERSION}" | grep -q .; then
  echo "    Local tag v${VERSION} already exists — reusing."
else
  git tag -a "v${VERSION}" -m "OmniDB v${VERSION}"
fi

echo "==> Pushing tag v${VERSION}..."
git push origin "v${VERSION}"
echo ""

echo "======================================================================"
echo "  Tag pushed: v${VERSION}"
echo "  GitHub Actions release workflow is now running."
echo "  Monitor: https://github.com/${GITHUB_REPO}/actions"
echo ""
echo "  When complete:"
echo "    GitHub release: https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}"
echo "    Homebrew:       brew upgrade heptau/tap/omnidb"
echo "======================================================================"
