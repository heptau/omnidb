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
#   WINGET_PKGS_FORK    Your fork of microsoft/winget-pkgs (default: heptau/winget-pkgs).
#                       Set to "skip" to skip the winget PR step (the manifest is still
#                       generated). The fork is verified up front, before any build.
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

# Guard: winget PR prerequisites, checked now so a misconfiguration stops the
# release before the (long) builds rather than after the GitHub release exists.
WINGET_PKGS_FORK="${WINGET_PKGS_FORK:-heptau/winget-pkgs}"
if [[ "$WINGET_PKGS_FORK" != "skip" ]]; then
  echo "==> Checking winget prerequisites (fork ${WINGET_PKGS_FORK})..."
  WINGET_FORK_INFO=$(gh api "repos/${WINGET_PKGS_FORK}" \
    --jq '[.fork, .parent.full_name, .permissions.push] | @tsv' 2>/dev/null) || {
    echo "Error: cannot access ${WINGET_PKGS_FORK} with the current gh login." >&2
    echo "  Fork it (gh repo fork microsoft/winget-pkgs --clone=false), fix WINGET_PKGS_FORK," >&2
    echo "  or set WINGET_PKGS_FORK=skip to release without a winget PR." >&2
    exit 1
  }
  if [[ "$WINGET_FORK_INFO" != $'true\tmicrosoft/winget-pkgs\ttrue' ]]; then
    echo "Error: ${WINGET_PKGS_FORK} must be a fork of microsoft/winget-pkgs with push access (got: ${WINGET_FORK_INFO})." >&2
    exit 1
  fi
  # The package must already exist upstream, otherwise this would open a
  # brand-new-package PR (different review process) instead of a version bump.
  if ! gh api "repos/microsoft/winget-pkgs/contents/manifests/h/heptau/OmniDB" >/dev/null 2>&1; then
    echo "Error: heptau.OmniDB not found in microsoft/winget-pkgs — refusing to auto-submit a new package." >&2
    exit 1
  fi
fi

echo "==> Building macOS (arm64)..."
make build-mac-arm64

echo "==> Building macOS (Intel)..."
make build-mac-intel

echo "==> Building Windows (x64)..."
make build-win

echo "==> Building Windows installer (x64, via Docker)..."
make build-win-installer

echo "==> Building Linux (x64, via Docker)..."
make build-linux-docker

echo "==> Verifying artifacts..."
ARCHIVES=(
  "$DIST/OmniDB-macOS-osx-arm64.zip"
  "$DIST/OmniDB-macOS-osx-x64.zip"
  "$DIST/OmniDB-win-x64.zip"
  "$DIST/OmniDB-win-x64-setup.exe"
  "$DIST/OmniDB-linux-x64.tar.gz"
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

echo "==> Generating winget manifest..."
scripts/gen_winget_manifest.sh

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

WINGET_STATUS="skipped (WINGET_PKGS_FORK=skip)"
if [[ "$WINGET_PKGS_FORK" != "skip" ]]; then
  echo "==> Submitting winget-pkgs PR..."
  # winget-pkgs' commit history has tens of thousands of package manifests
  # in it — a plain clone (even --filter=blob:none, which only skips file
  # *content*) still has to build a full working-tree index across that
  # whole history and runs to several hundred MB / minutes. --depth 1 keeps
  # it to ~40MB / ~20s by only ever looking at the current tip — confirmed
  # by hand, both numbers measured directly. sparse-checkout has to be set
  # up BEFORE the checkout below (not after) for the "only this package's
  # manifests" part to actually avoid materializing everything else — doing
  # it the other way around still fetches every blob once, just to throw
  # most of them away a moment later.
  #
  # Cloning upstream directly (not the fork) and pushing the result to the
  # fork's URL at the end, rather than cloning the fork and adding upstream
  # as a second remote, sidesteps combining two independently-shallow
  # histories — simpler, and this is the one shape actually tested by hand.
  WINGET_BRANCH="omnidb-v${VERSION}"
  WINGET_MANIFEST_SRC="$(pwd)/${DIST}/winget/manifests/h/heptau/OmniDB/${VERSION}"
  WINGET_DIR="$(mktemp -d)"
  git clone --quiet --filter=blob:none --no-checkout --depth 1 \
    https://github.com/microsoft/winget-pkgs.git "$WINGET_DIR"
  (
    cd "$WINGET_DIR"
    git sparse-checkout set --no-cone "manifests/h/heptau/OmniDB"
    git checkout -B "$WINGET_BRANCH" origin/master
    mkdir -p "manifests/h/heptau/OmniDB"
    cp -r "${WINGET_MANIFEST_SRC}" "manifests/h/heptau/OmniDB/"
    git add "manifests/h/heptau/OmniDB/${VERSION}"
    git -c user.name="omnidb-release" -c user.email="noreply@omnidb.net" \
      commit --quiet -m "New version: heptau.OmniDB version ${VERSION}"
    git -c credential.helper= -c credential.helper='!gh auth git-credential' \
      push --quiet --force "https://github.com/${WINGET_PKGS_FORK}.git" "$WINGET_BRANCH"
  )
  rm -rf "$WINGET_DIR"

  gh pr create \
    --repo microsoft/winget-pkgs \
    --head "${WINGET_PKGS_FORK%%/*}:${WINGET_BRANCH}" \
    --base master \
    --title "New version: heptau.OmniDB version ${VERSION}" \
    --body "Automated submission from heptau/omnidb's release process (scripts/release.sh)." \
    && WINGET_STATUS="PR opened against microsoft/winget-pkgs"
fi

echo ""
echo "======================================================================"
echo "  Released: v${VERSION}"
echo "  GitHub release: https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}"
echo "  Homebrew:       brew upgrade heptau/tap/omnidb"
echo "  winget:         ${WINGET_STATUS}"
echo "======================================================================"
