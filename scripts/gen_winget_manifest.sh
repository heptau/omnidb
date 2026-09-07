#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# gen_winget_manifest.sh — Generate the three winget-pkgs manifest YAML files
# from build/dist/checksums.txt, for the NSIS installer scripts/release.sh
# builds via `make build-win-installer`.
#
# Requires OmniDB-win-x64-setup.exe to be present in build/dist/ and
# checksums.txt to contain an entry for it.
#
# Package identifier: heptau.OmniDB (Publisher.PackageName, winget's own
# convention — matches the GitHub org/Homebrew tap already used elsewhere).
# =============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."

VERSION="$(cat VERSION | tr -d '\r\n')"
DIST="build/dist"
CHECKSUM_FILE="${DIST}/checksums.txt"
OUT_DIR="${DIST}/winget/manifests/h/heptau/OmniDB/${VERSION}"
GITHUB="https://github.com/heptau/omnidb"
PACKAGE_ID="heptau.OmniDB"
SCHEMA_VERSION="1.6.0"

[[ -f "$CHECKSUM_FILE" ]] || { echo "Error: ${CHECKSUM_FILE} not found"; exit 1; }

SHA_SETUP=$(grep "  OmniDB-win-x64-setup.exe$" "$CHECKSUM_FILE" | awk '{print $1}')
[[ -n "$SHA_SETUP" ]] || { echo "Error: missing checksum for OmniDB-win-x64-setup.exe in ${CHECKSUM_FILE}"; exit 1; }

mkdir -p "$OUT_DIR"

cat > "${OUT_DIR}/${PACKAGE_ID}.yaml" <<EOF
# Created with gen_winget_manifest.sh
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${VERSION}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: ${SCHEMA_VERSION}
EOF

cat > "${OUT_DIR}/${PACKAGE_ID}.installer.yaml" <<EOF
# Created with gen_winget_manifest.sh
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${VERSION}
InstallerLocale: en-US
Platform:
  - Windows.Desktop
MinimumOSVersion: 10.0.0.0
InstallerType: nullsoft
Scope: machine
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: ${GITHUB}/releases/download/v${VERSION}/OmniDB-win-x64-setup.exe
    InstallerSha256: ${SHA_SETUP}
ManifestType: installer
ManifestVersion: ${SCHEMA_VERSION}
EOF

cat > "${OUT_DIR}/${PACKAGE_ID}.locale.en-US.yaml" <<EOF
# Created with gen_winget_manifest.sh
PackageIdentifier: ${PACKAGE_ID}
PackageVersion: ${VERSION}
PackageLocale: en-US
Publisher: heptau
PublisherUrl: https://github.com/heptau
PublisherSupportUrl: ${GITHUB}/issues
PackageName: OmniDB
PackageUrl: https://www.omnidb.net/
License: MIT
LicenseUrl: ${GITHUB}/blob/master/LICENSE
ShortDescription: Revived open-source database management tool (PostgreSQL-focused)
Tags:
  - database
  - postgresql
  - sql
  - database-management
ManifestType: defaultLocale
ManifestVersion: ${SCHEMA_VERSION}
EOF

echo "==> winget manifests generated: ${OUT_DIR}"
