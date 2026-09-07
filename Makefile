# --- Global Config ---
BUILD_DIR = build
WORK_DIR = build_work
APP_NAME = OmniDB
VERSION := $(shell cat VERSION | tr -d '\r\n')
DOCKER_IMAGE = omnidb-linux-builder

# --- Platform Defaults (can be overridden by targets) ---
MAC_ARCH = osx-arm64

# --- Self-bootstrapping toolchain ---
# `make build-*` should work with nothing pre-installed beyond Go and
# platform build tools. It installs the Wails CLI itself rather than
# requiring it on PATH ahead of time.
GOBIN := $(shell go env GOPATH 2>/dev/null)/bin
WAILS := $(shell command -v wails 2>/dev/null)
ifeq ($(strip $(WAILS)),)
	WAILS := $(GOBIN)/wails
endif

# --- Docs typography (TypoLima) ---
# Language codes for which translated docs exist under docs/<code>/ — keep in
# sync with lang-switcher.js's language list if a new translation is added.
DOCS_LANGS = cs de en es fr it pt

PYUSERBASE := $(shell python3 -m site --user-base 2>/dev/null)
TYPOLIMA := $(shell command -v typolima 2>/dev/null)
ifeq ($(strip $(TYPOLIMA)),)
	TYPOLIMA := $(PYUSERBASE)/bin/typolima
endif

# --- Commands Detection ---
# Detect OS for sed (Mac requires empty string '' after -i, Linux does not)
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	SED_CMD = sed -i ''
	ZIP_CMD = zip -r
else ifneq (,$(findstring MINGW,$(UNAME_S)))
	SED_CMD = sed -i
	ZIP_CMD = 7z a
else
	SED_CMD = sed -i
	ZIP_CMD = zip -r
endif

# --- Phony Targets ---
.PHONY: help all clean _sync_version \
        build-mac-arm64 build-mac-intel build-linux build-linux-docker build-win build-win-installer \
        prepare-release release \
        _prepare_dirs _ensure_wails _ensure_local_signing_cert _ensure_nsis_docker_image \
        _build_frontend_release _restore_frontend \
        _build_mac _build_linux _build_win _build_win_installer \
        docs-typo docs-typo-dry _ensure_typolima

# --- Default Target: Help ---
help:
	@echo "==========================================================="
	@echo "OmniDB Build System"
	@echo "==========================================================="
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo "  make help             - Show this help message"
	@echo "  make clean            - Remove build directories"
	@echo ""
	@echo "Build targets (Wails desktop shell, see wails-app/, backed by the Go"
	@echo "server in go-server/). Each one installs the Wails CLI automatically"
	@echo "if missing — the only prerequisite is Go itself:"
	@echo "  make build-mac-arm64  - Build for Apple Silicon (M1/M2/M3...) — sandboxed,"
	@echo "                          signed with an auto-generated local certificate by"
	@echo "                          default (a real ad-hoc signature can't enforce the"
	@echo "                          sandbox at all — see MAC_SIGN_IDENTITY's comment)."
	@echo "                          Pass your own MAC_SIGN_IDENTITY to reuse a personal"
	@echo "                          signing certificate across projects, or (later) a"
	@echo "                          real Apple Distribution/Developer ID identity"
	@echo "  make build-mac-intel  - Build for Intel Mac (x86_64), same as above"
	@echo "  make build-linux      - Build for Linux (x64) — must run ON Linux, Wails'"
	@echo "                          own Linux webview (GTK/CGO) cannot cross-compile"
	@echo "  make build-linux-docker - Build for Linux (x64) from macOS/Windows, via Docker"
	@echo "  make build-win        - Build for Windows (x64) — fully cross-compiles from"
	@echo "                          macOS/Linux (Wails' pure-Go WebView2 loader), plain"
	@echo "                          .exe + .zip, no installer"
	@echo "  make build-win-installer - Same, plus a real NSIS .exe installer (needs"
	@echo "                          Docker — see _ensure_nsis_docker_image's comment"
	@echo "                          for why the compile step can't run natively on"
	@echo "                          Apple Silicon)"
	@echo ""
	@echo "Release targets:"
	@echo "  make release VERSION=X.Y.Z - Bump VERSION+CHANGELOG, build every platform"
	@echo "                          locally (Linux via Docker), commit, tag, push,"
	@echo "                          publish the GitHub release and update the Homebrew tap"
	@echo "  make prepare-release VERSION=X.Y.Z - Just the VERSION/CHANGELOG bump + commit"
	@echo ""
	@echo "Docs targets:"
	@echo "  make docs-typo-dry    - Preview TypoLima typography fixes for docs/<lang> ($(DOCS_LANGS))"
	@echo "  make docs-typo        - Apply TypoLima typography fixes in-place, same languages"
	@echo "==========================================================="

all: help

clean:
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf wails-app/build/bin

# --- Platform Specific Targets ---

build-mac-arm64:
	$(MAKE) _build_mac \
		MAC_ARCH=osx-arm64 \
		WAILS_GOARCH=arm64

build-mac-intel:
	$(MAKE) _build_mac \
		MAC_ARCH=osx-x64 \
		WAILS_GOARCH=amd64

build-linux:
	$(MAKE) _build_linux \
		WAILS_GOARCH=amd64

# Build the Linux binary from macOS/Windows via Docker, since Wails' GTK/
# webkit2gtk webview can't cross-compile. Both node_modules trees (the Wails
# shell's loading screen and the workspace UI bundle) and the Go module/build
# cache are each given their own named Docker volume, mounted OVER the
# bind-mounted repo path — mounting a plain bind-mount subdirectory would mean
# the container's `rm -rf`/npm install operate on the HOST's actual
# node_modules (breaking it for the next native macOS/Windows build, since
# esbuild ships platform-specific binaries). The named volumes also cache
# across releases, so repeat runs don't redownload every Go module.
build-linux-docker:
	docker build -q --platform linux/amd64 -t $(DOCKER_IMAGE) -f scripts/docker/linux-build.Dockerfile .
	docker volume create omnidb-linux-frontend-node-modules >/dev/null
	docker volume create omnidb-linux-workspace-node-modules >/dev/null
	docker volume create omnidb-linux-gomod-cache >/dev/null
	@# Fresh named volumes are root-owned; chown once (as root, idempotent) so
	@# the non-root --user build below can write into them.
	docker run --rm --platform linux/amd64 \
		-v omnidb-linux-frontend-node-modules:/vol-node-modules \
		-v omnidb-linux-workspace-node-modules:/vol-workspace-node-modules \
		-v omnidb-linux-gomod-cache:/vol-gomod-cache \
		$(DOCKER_IMAGE) \
		chown -R "$$(id -u):$$(id -g)" /vol-node-modules /vol-workspace-node-modules /vol-gomod-cache
	docker run --rm --platform linux/amd64 \
		-v "$(CURDIR)":/src \
		-v omnidb-linux-frontend-node-modules:/src/wails-app/frontend/node_modules \
		-v omnidb-linux-workspace-node-modules:/src/go-server/frontend/node_modules \
		-v omnidb-linux-gomod-cache:/tmp/go \
		-e HOME=/tmp \
		-e GOPATH=/tmp/go \
		--user "$$(id -u):$$(id -g)" \
		$(DOCKER_IMAGE) \
		sh -c "rm -rf wails-app/build/bin wails-app/frontend/package.json.md5 && make build-linux"

build-win:
	$(MAKE) _build_win \
		WAILS_GOARCH=amd64

prepare-release:
	@VERSION=$(VERSION) scripts/prepare_release.sh

release: clean prepare-release
	@VERSION=$(VERSION) scripts/release.sh

# --- Internal Build Steps ---

# 0. Sync version from VERSION file
_sync_version:
	@echo "Syncing version $(VERSION) to all files..."
	$(SED_CMD) "s/omnidbShortVersion = \".*\"/omnidbShortVersion = \"$(VERSION)\"/g" go-server/version.go
	$(SED_CMD) "s|<small>v[0-9.]*</small>|<small>v$(VERSION)</small>|g" wails-app/frontend/index.html

# 1. Common preparation
# NOTE: deliberately does NOT wipe $(BUILD_DIR) — `make release` builds every
# platform back-to-back in one run, and each earlier platform's dist/ archive
# must survive later platforms' builds. Per-platform targets below already
# rm -rf their own $(APP_NAME).app / $(APP_NAME)-linux / $(APP_NAME)-win
# output dir before rebuilding it.
_prepare_dirs: _sync_version
	@mkdir -p $(BUILD_DIR)/dist

# Install the Wails CLI (into `go env GOPATH`/bin) if it isn't already
# available, so builds don't require it pre-installed on PATH.
_ensure_wails:
	@if [ ! -x "$(WAILS)" ]; then \
		echo "Installing Wails CLI..."; \
		go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0; \
	fi

# A literal ad-hoc identity (`codesign --sign -`) does NOT actually enable
# App Sandbox at runtime — verified by hand: an ad-hoc-signed build never
# gets an APP_SANDBOX_CONTAINER_ID, never gets a ~/Library/Containers
# entry, and can see the real (unsandboxed) home directory just fine.
# `codesign -dvvv` on such a build shows `TeamIdentifier=not set`, and the
# kernel only enforces sandbox entitlements for a signature that actually
# has some real identity behind it — it does not have to be Apple-issued,
# just not literally absent. So: a self-signed, entirely local certificate.
# It changes nothing about how Gatekeeper treats the .app for anyone who
# downloads it (a self-signed identity fails the exact same "unidentified
# developer" check an ad-hoc signature does — neither is Apple-notarized,
# so the same one-time right-click-Open workaround applies either way); it
# only makes the sandbox entitlements this Makefile signs with actually
# take effect.
#
# LOCAL_SIGN_CERT_NAME below is only ever used as a fallback identity this
# repo bootstraps for itself — it is deliberately NOT the place for a
# personal signing identity you want to reuse across other projects too
# (this Makefile is shared/public; baking a real name/email default into it
# would hand every other contributor a certificate labeled with yours the
# first time they build). To use one identity everywhere instead: create
# your own certificate once (same openssl/security recipe as below, but
# with your own -subj, e.g. "/CN=Your Name/emailAddress=you@example.com"),
# then export MAC_SIGN_IDENTITY="Your Name" in your shell profile — every
# project's Makefile/build script that respects a MAC_SIGN_IDENTITY
# environment variable (this one included, via the `?=` below) will pick
# it up automatically, with nothing project-specific to configure.
#
# Swap MAC_SIGN_IDENTITY for a real Apple Distribution/Developer ID
# identity later (for an actual App Store submission, or a notarized
# direct download) — nothing else about this pipeline needs to change.
#
# Two macOS Keychain PKCS12-import quirks the recipe below works around,
# both learned the hard way:
#  - OpenSSL 3.x's default PKCS12 export (AES-256/SHA-256) fails Keychain
#    import outright — `openssl pkcs12 -export` needs `-legacy` to fall
#    back to the older RC2/3DES+SHA1 encoding Keychain actually reads.
#  - Even with -legacy, an EMPTY p12 password ("-passout pass:") still
#    fails Keychain import with "MAC verification failed ... (wrong
#    password?)" — a real, if random and never stored, password sidesteps
#    that too (see P12PASS below).
# The resulting identity also won't show up in `security find-identity -v
# -p codesigning` (that -v filters to *trusted* identities, and a
# self-signed cert has no trust chain) — codesign doesn't need a trusted
# identity to sign with, only a private key, so this checks with plain
# `security find-identity -p codesigning` (no -v) instead.
LOCAL_SIGN_CERT_NAME = OmniDB Local Signing
_ensure_local_signing_cert:
	@if [ "$(MAC_SIGN_IDENTITY)" = "$(LOCAL_SIGN_CERT_NAME)" ] && \
	   ! security find-identity -p codesigning 2>/dev/null | grep -q "$(LOCAL_SIGN_CERT_NAME)"; then \
		echo "No local code-signing certificate found — generating one (self-signed, stays on this Mac only, in your login keychain)..."; \
		TMPCERT=$$(mktemp -d); \
		P12PASS=$$(openssl rand -base64 24); \
		openssl req -x509 -newkey rsa:2048 -keyout "$$TMPCERT/key.pem" -out "$$TMPCERT/cert.pem" \
			-days 3650 -nodes -subj "/CN=$(LOCAL_SIGN_CERT_NAME)" \
			-addext "keyUsage=critical,digitalSignature" \
			-addext "extendedKeyUsage=critical,codeSigning" 2>/dev/null; \
		openssl pkcs12 -export -legacy -out "$$TMPCERT/cert.p12" -inkey "$$TMPCERT/key.pem" -in "$$TMPCERT/cert.pem" -passout pass:"$$P12PASS"; \
		security import "$$TMPCERT/cert.p12" -k ~/Library/Keychains/login.keychain-db -P "$$P12PASS" -T /usr/bin/codesign; \
		rm -rf "$$TMPCERT"; \
		echo "Created '$(LOCAL_SIGN_CERT_NAME)' in your login keychain (Keychain Access > login > My Certificates)."; \
	fi

# Rebuild the workspace UI (go-server/frontend/ -> the dist/ and css/
# directories static_assets.go embeds) MINIFIED, for embedding into the shipped
# binary. `npm run build:release` covers both: the JS bundles (Vite) and the
# stylesheets (dart-sass, compiling scss/*.scss -> ../static_assets/OmniDB_app/
# css/*.min.css) — see go-server/frontend/README.md for each.
#
# The copies committed to git are deliberately unminified so those diffs stay
# readable. That is the wrong tradeoff for the binary, so a release build
# overwrites both with minified output, lets `go build` embed that, and then
# restores the readable copies via _restore_frontend below. Nothing commits
# dist/ or css/ along the way: scripts/prepare_release.sh stages an explicit
# file list.
_build_frontend_release:
	@echo "Building workspace frontend bundle (minified, for embedding)..."
	cd go-server/frontend && npm ci && npm run build:release

# Puts dist/ and css/ back the way git has it, so a release build leaves no
# diff behind.
_restore_frontend:
	@echo "Restoring unminified workspace frontend bundle..."
	cd go-server/frontend && npm run build

# --- MAC OS BUILD LOGIC (Wails) ---
# One single build for every distribution channel: sandboxed, entitled, and
# carrying the Privacy Manifest/Info.plist keys the Mac App Store requires —
# whether this run's output ends up going through Homebrew/GitHub Releases
# (today) or App Store Connect (once MAC_SIGN_IDENTITY below points at a real
# Apple Distribution certificate). Same app, same sandbox, same entitlements
# either way; only the signing identity (and, for an actual App Store
# submission, a productbuild .pkg step not part of this Makefile yet)
# changes later.
#
# MAC_SIGN_IDENTITY defaults to the auto-bootstrapped local certificate
# above (see _ensure_local_signing_cert's comment for why a literal ad-hoc
# "-" identity won't do) so `make build-mac-arm64` keeps working with zero
# manual setup. Override it with your own personal certificate, or later a
# real Apple Distribution/Developer ID identity, the same way either time:
#   make build-mac-arm64 MAC_SIGN_IDENTITY="Apple Distribution: Your Name (TEAMID)"
# (find installed identities with `security find-identity -v -p codesigning`).
MAC_SIGN_IDENTITY ?= $(LOCAL_SIGN_CERT_NAME)

_build_mac: _prepare_dirs _ensure_wails _ensure_local_signing_cert _build_frontend_release
	@echo "Building Wails desktop shell (darwin/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform darwin/$(WAILS_GOARCH)

	@echo "Setting up .app structure..."
	rm -rf $(BUILD_DIR)/$(APP_NAME).app
	mv "wails-app/build/bin/$(APP_NAME).app" "$(BUILD_DIR)/$(APP_NAME).app"

	$(eval APP_CONTENT := $(BUILD_DIR)/$(APP_NAME).app/Contents)

	@echo "Updating macOS metadata..."
	plutil -replace CFBundleShortVersionString -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	plutil -replace CFBundleVersion -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	@# The next two only matter for an actual App Store submission, but are
	@# harmless (ignored) for direct/Homebrew distribution, so there's no
	@# reason to keep them out of the one shared build.
	plutil -replace LSApplicationCategoryType -string "public.app-category.developer-tools" "$(APP_CONTENT)/Info.plist"
	@# OmniDB's only cryptography is TLS (database connections) and SSH
	@# (tunnels/terminal) for authentication/confidentiality of the user's own
	@# traffic — both qualify for the standard export-compliance exemption
	@# Apple's question is asking about. Recorded here so it's answered
	@# consistently instead of by hand at each App Store Connect upload;
	@# revisit if that stops being true.
	plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$(APP_CONTENT)/Info.plist"
	cp wails-app/build/darwin/PrivacyInfo.xcprivacy "$(APP_CONTENT)/Resources/PrivacyInfo.xcprivacy"

	@echo "Building Go server..."
	cd go-server && GOOS=darwin GOARCH=$(WAILS_GOARCH) go build -o "../$(APP_CONTENT)/MacOS/omnidb-server" .
	$(MAKE) _restore_frontend

	@echo "Signing (sandboxed, $(MAC_SIGN_IDENTITY))..."
	xattr -cr $(BUILD_DIR)/$(APP_NAME).app
	@# Sign the bundled helper binary before the outer bundle — NOT via
	@# codesign --deep on the .app, which applies entitlements/the hardened
	@# runtime inconsistently to nested executables. omnidb-server gets a
	@# DIFFERENT, minimal entitlements file (entitlements-helper.plist, just
	@# com.apple.security.inherit) than the main executable/.app — signing it
	@# with the full app-sandbox entitlement instead crashes it instantly
	@# (SIGTRAP inside libsecinit_appsandbox, confirmed via a diagnostic
	@# report) because it isn't the bundle's declared CFBundleExecutable; see
	@# entitlements-helper.plist's comment for the full explanation.
	@# --options runtime (hardened runtime) is required for the entitlements
	@# to actually take effect, ad-hoc identity or not.
	codesign --force --options runtime --entitlements wails-app/build/darwin/entitlements-helper.plist \
		--sign "$(MAC_SIGN_IDENTITY)" "$(APP_CONTENT)/MacOS/omnidb-server"
	codesign --force --options runtime --entitlements wails-app/build/darwin/entitlements.plist \
		--sign "$(MAC_SIGN_IDENTITY)" $(BUILD_DIR)/$(APP_NAME).app
	codesign --verify --deep --strict $(BUILD_DIR)/$(APP_NAME).app

	@echo "Packaging Mac Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-macOS-$(MAC_ARCH).zip $(APP_NAME).app
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-macOS-$(MAC_ARCH).zip"

# --- LINUX BUILD LOGIC (Wails) ---
# Wails refuses to cross-compile for Linux from another OS, so this target
# must run ON Linux. Needs libgtk-3-dev and libwebkit2gtk-4.1-dev installed —
# Wails' Linux webview is a real CGO/GTK binding, unlike the pure-Go one it
# uses for Windows. The webkit2_41 build tag is required on distros that only
# ship webkit2gtk-4.1 (Debian bookworm+, Ubuntu 24.04+) — without it Wails'
# pkg-config lookup hardcodes the older webkit2gtk-4.0 and fails (verified
# against github.com/wailsapp/wails/v2@v2.15.0's
# pkg/assetserver/webview/*_linux.go `#cgo !webkit2_41 pkg-config: ...` tags).
_build_linux: _prepare_dirs _ensure_wails _build_frontend_release
	@echo "Building Wails desktop shell (linux/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform linux/$(WAILS_GOARCH) -tags webkit2_41

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-linux"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-linux"
	mv "wails-app/build/bin/$(APP_NAME)" "$(BUILD_DIR)/$(APP_NAME)-linux/$(APP_NAME)"

	@echo "Building Go server..."
	cd go-server && GOOS=linux GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-linux/omnidb-server" .
	$(MAKE) _restore_frontend

	@echo "Packaging Linux Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && tar -czf dist/OmniDB-linux-x64.tar.gz $(APP_NAME)-linux
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-linux-x64.tar.gz"

# --- WINDOWS BUILD LOGIC (Wails) ---
# Fully cross-compiles from macOS/Linux (verified: produces a real PE32+
# .exe using Wails' pure-Go WebView2 loader, no mingw/CGO needed) — but on
# CI this runs natively on windows-latest anyway.
_build_win: _prepare_dirs _ensure_wails _build_frontend_release
	@echo "Building Wails desktop shell (windows/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform windows/$(WAILS_GOARCH) -webview2 embed

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-win"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-win"
	mv "wails-app/build/bin/$(APP_NAME).exe" "$(BUILD_DIR)/$(APP_NAME)-win/$(APP_NAME).exe"

	@echo "Building Go server..."
	cd go-server && GOOS=windows GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-win/omnidb-server.exe" .
	$(MAKE) _restore_frontend

	@echo "Packaging Windows Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && $(ZIP_CMD) dist/OmniDB-win-x64.zip $(APP_NAME)-win
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-win-x64.zip"

# --- WINDOWS NSIS INSTALLER (winget/Chocolatey want a real installer, not ---
# --- just the bare .zip above, which stays around unchanged as a fallback) -
# wails-app/build/windows/installer/project.nsi already existed (Wails
# scaffolds it for every project) but was never wired into any build target
# until now. The compile step specifically needs Linux: Homebrew's makensis
# 3.12 arm64 bottle crashes (std::bad_alloc, while writing output) on ANY
# Unicode-mode installer, confirmed by hand with a trivial two-line repro —
# nothing to do with this project's own .nsi script, a real bug in that one
# binary. Debian's `nsis` apt package doesn't share it, so a tiny Docker
# image (scripts/docker/nsis-build.Dockerfile) runs just the `makensis`
# step; everything else (the Go/Wails binaries, wails_tools.nsh's own
# version-string templating, done by wails build's own `-nsis` flag) still
# happens natively, same as the plain _build_win above.
_ensure_nsis_docker_image:
	docker build -q -t omnidb-nsis-builder -f scripts/docker/nsis-build.Dockerfile scripts/docker >/dev/null

build-win-installer:
	$(MAKE) _build_win_installer WAILS_GOARCH=amd64

_build_win_installer: _prepare_dirs _ensure_wails _ensure_nsis_docker_image _build_frontend_release
	@echo "Building Wails desktop shell + NSIS sources (windows/$(WAILS_GOARCH))..."
	-cd wails-app && $(WAILS) build -clean -platform windows/$(WAILS_GOARCH) -webview2 embed -nsis
	@# ^ Tolerant of failure ("-" prefix): this call's only job here is
	@# producing wails-app/build/bin/$(APP_NAME).exe, downloading the
	@# WebView2 bootstrapper into build/windows/installer/tmp/, and
	@# refreshing wails_tools.nsh with this version's info substituted in —
	@# its own internal attempt to invoke makensis right afterward reliably
	@# fails on Apple Silicon (see the comment above); the real compile
	@# happens in Docker, below.

	@echo "Building Go server (windows/$(WAILS_GOARCH))..."
	cd go-server && GOOS=windows GOARCH=$(WAILS_GOARCH) go build -o "../wails-app/build/bin/omnidb-server.exe" .
	$(MAKE) _restore_frontend

	@echo "Patching wails_tools.nsh (non-ASCII copyright breaks NSIS's own parser, independent of the makensis crash above)..."
	$(SED_CMD) 's/^\( *!define INFO_COPYRIGHT \).*/\1"Copyright (c) 2015-2026 The OmniDB Team and contributors"/' \
		wails-app/build/windows/installer/wails_tools.nsh

	@echo "Compiling NSIS installer (Docker)..."
	docker run --rm \
		-v "$(CURDIR)/wails-app/build":/work/build \
		omnidb-nsis-builder \
		makensis -DARG_WAILS_AMD64_BINARY=/work/build/bin/OmniDB.exe /work/build/windows/installer/project.nsi

	mkdir -p $(BUILD_DIR)/dist
	mv "wails-app/build/bin/$(APP_NAME)-amd64-installer.exe" "$(BUILD_DIR)/dist/OmniDB-win-x64-setup.exe"
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-win-x64-setup.exe"

# --- DOCS TYPOGRAPHY (TypoLima, https://typolima.80.cz) ---
# Install the TypoLima CLI (pip --user) if it isn't already available, so
# these targets don't require it pre-installed on PATH.
_ensure_typolima:
	@if [ ! -x "$(TYPOLIMA)" ]; then \
		echo "Installing TypoLima CLI..."; \
		pip install --user git+https://github.com/heptau/typolima.git@v1.3.0; \
	fi

# Preview typography fixes (smart quotes, non-breaking spaces, dashes, ...)
# for every translated docs/<lang>/ directory without touching any file.
docs-typo-dry: _ensure_typolima
	@for lang in $(DOCS_LANGS); do \
		echo "=== docs/$$lang ($$lang) ==="; \
		$(TYPOLIMA) docs/$$lang --lang $$lang --recursive --dry-run --diff --preserve-format; \
	done

# Apply typography fixes in-place for every translated docs/<lang>/
# directory. Changes land as regular working-tree edits — review with
# `git diff docs/` before committing.
docs-typo: _ensure_typolima
	@for lang in $(DOCS_LANGS); do \
		echo "-> docs/$$lang ($$lang)"; \
		$(TYPOLIMA) docs/$$lang --lang $$lang --recursive --in-place --preserve-format; \
	done
	@echo "Done. Review changes with: git diff docs/"
