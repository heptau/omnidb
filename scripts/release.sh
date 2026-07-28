#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# release.sh — Build every platform locally (Linux via Docker, since Wails'
# GTK/webkit2gtk webview can't cross-compile from macOS), then create and
# publish the GitHub release and update the Homebrew tap.
#
# Called by: make release VERSION=X.Y.Z
# (make prepare-release has already bumped VERSION/CHANGELOG and pushed that
# commit by the time this runs.)
#
# Environment variables:
#   GITHUB_REPO         GitHub repo (default: heptau/omnidb)
#   HOMEBREW_TAP_REPO   GitHub repo of the Homebrew tap (default: heptau/homebrew-tap)
#   HOMEBREW_TAP_CASK   Path to cask inside the tap (default: Casks/omnidb.rb)
#
# Prerequisites: Docker running locally, `gh auth login` with push access to
# both GITHUB_REPO and HOMEBREW_TAP_REPO, a clean tree up to date with origin.
# =============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

VERSION="${VERSION:-$(cat VERSION | tr -d '\r\n')}"
GITHUB_REPO="${GITHUB_REPO:-heptau/omnidb}"
DIST="build/dist"

echo "OmniDB release — v${VERSION}"
echo ""

# Guard: uncommitted changes (prepare-release should have already committed)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes present. Run 'make prepare-release VERSION=${VERSION}'" >&2
  echo "first, or commit/stash manually." >&2
  exit 1
fi

# Guard: tag must not already exist on remote
if git ls-remote --tags origin "refs/tags/v${VERSION}" | grep -q .; then
  echo "Error: tag v${VERSION} already exists on remote." >&2
  exit 1
fi

echo "==> Building macOS (arm64)..."
make build-mac-arm64

echo "==> Building macOS (Intel)..."
make build-mac-intel

echo "==> Building Windows (x64)..."
make build-win

echo "==> Building Linux (x64, via Docker)..."
make build-linux-docker

echo "==> Verifying artifacts..."
ARCHIVES=(
  "$DIST/OmniDB-${VERSION}-macOS-osx-arm64.zip"
  "$DIST/OmniDB-${VERSION}-macOS-osx-x64.zip"
  "$DIST/OmniDB-${VERSION}-win-x64.zip"
  "$DIST/OmniDB-${VERSION}-linux-x64.tar.gz"
)
for f in "${ARCHIVES[@]}"; do
  [[ -f "$f" ]] || { echo "Error: expected artifact missing: $f" >&2; exit 1; }
  echo "    OK: $f"
done

echo "==> Computing checksums..."
(
  cd "$DIST"
  rm -f checksums.txt
  for f in OmniDB-*; do
    [[ -f "$f" ]] || continue
    shasum -a 256 "$f" >> checksums.txt
  done
  sort -k2 -o checksums.txt checksums.txt
)

echo "==> Generating Homebrew Cask..."
scripts/gen_cask.sh

echo "==> Tagging v${VERSION}..."
if git tag -l "v${VERSION}" | grep -q .; then
  echo "    Local tag v${VERSION} already exists — reusing."
else
  git tag -a "v${VERSION}" -m "OmniDB v${VERSION}"
fi

echo "==> Pushing tag v${VERSION}..."
git push origin "v${VERSION}"

echo "==> Creating GitHub release..."
NOTES_FILE="build/release-notes.md"
[[ -s "$NOTES_FILE" ]] || echo "Release v${VERSION}" > "$NOTES_FILE"
gh release create "v${VERSION}" \
  --repo "$GITHUB_REPO" \
  --title "OmniDB v${VERSION}" \
  --notes-file "$NOTES_FILE" \
  "${ARCHIVES[@]}" \
  "$DIST/checksums.txt"

echo "==> Updating Homebrew tap..."
TAP_REPO="${HOMEBREW_TAP_REPO:-heptau/homebrew-tap}"
TAP_CASK="${HOMEBREW_TAP_CASK:-Casks/omnidb.rb}"

CURRENT_SHA=$(gh api "repos/${TAP_REPO}/contents/${TAP_CASK}" --jq '.sha' 2>/dev/null || true)
CONTENT=$(base64 < "$DIST/omnidb.rb" | tr -d '\n')

if [[ -n "$CURRENT_SHA" ]]; then
  gh api "repos/${TAP_REPO}/contents/${TAP_CASK}" \
    --method PUT \
    -f message="omnidb v${VERSION}" \
    -f content="${CONTENT}" \
    -f sha="${CURRENT_SHA}"
else
  gh api "repos/${TAP_REPO}/contents/${TAP_CASK}" \
    --method PUT \
    -f message="omnidb v${VERSION}" \
    -f content="${CONTENT}"
fi

echo ""
echo "======================================================================"
echo "  Released: v${VERSION}"
echo "  GitHub release: https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}"
echo "  Homebrew:       brew upgrade heptau/tap/omnidb"
echo "======================================================================"
