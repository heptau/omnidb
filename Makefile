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
        build-mac-arm64 build-mac-intel build-linux build-linux-docker build-win \
        prepare-release release \
        _prepare_dirs _ensure_wails _build_frontend _build_mac _build_linux _build_win \
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
	@echo "  make build-mac-arm64  - Build for Apple Silicon (M1/M2/M3...)"
	@echo "  make build-mac-intel  - Build for Intel Mac (x86_64)"
	@echo "  make build-linux      - Build for Linux (x64) — must run ON Linux, Wails'"
	@echo "                          own Linux webview (GTK/CGO) cannot cross-compile"
	@echo "  make build-linux-docker - Build for Linux (x64) from macOS/Windows, via Docker"
	@echo "  make build-win        - Build for Windows (x64) — fully cross-compiles from"
	@echo "                          macOS/Linux (Wails' pure-Go WebView2 loader)"
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
		go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0; \
	fi

# Rebuild the workspace UI bundle (go-server/frontend/ -> the dist/ directory
# static_assets.go embeds). The output is committed, so this is not what makes
# a build possible -- it is what stops a release from shipping a bundle that
# no longer matches its sources.
_build_frontend:
	@echo "Building workspace frontend bundle..."
	cd go-server/frontend && npm ci && npm run build

# --- MAC OS BUILD LOGIC (Wails) ---
_build_mac: _prepare_dirs _ensure_wails _build_frontend
	@echo "Building Wails desktop shell (darwin/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform darwin/$(WAILS_GOARCH)

	@echo "Setting up .app structure..."
	rm -rf $(BUILD_DIR)/$(APP_NAME).app
	mv "wails-app/build/bin/$(APP_NAME).app" "$(BUILD_DIR)/$(APP_NAME).app"

	$(eval APP_CONTENT := $(BUILD_DIR)/$(APP_NAME).app/Contents)

	@echo "Updating macOS metadata..."
	plutil -replace CFBundleShortVersionString -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	plutil -replace CFBundleVersion -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"

	@echo "Building Go server..."
	cd go-server && GOOS=darwin GOARCH=$(WAILS_GOARCH) go build -o "../$(APP_CONTENT)/MacOS/omnidb-server" .

	@echo "Signing..."
	-xattr -cr $(BUILD_DIR)/$(APP_NAME).app
	-codesign --force --deep --sign - $(BUILD_DIR)/$(APP_NAME).app || echo "Signing skipped or failed (non-fatal)"

	@echo "Packaging Mac Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip $(APP_NAME).app
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip"

# --- LINUX BUILD LOGIC (Wails) ---
# Wails refuses to cross-compile for Linux from another OS, so this target
# must run ON Linux. Needs libgtk-3-dev and libwebkit2gtk-4.1-dev installed —
# Wails' Linux webview is a real CGO/GTK binding, unlike the pure-Go one it
# uses for Windows. The webkit2_41 build tag is required on distros that only
# ship webkit2gtk-4.1 (Debian bookworm+, Ubuntu 24.04+) — without it Wails'
# pkg-config lookup hardcodes the older webkit2gtk-4.0 and fails (verified
# against github.com/wailsapp/wails/v2@v2.12.0's
# pkg/assetserver/webview/*_linux.go `#cgo !webkit2_41 pkg-config: ...` tags).
_build_linux: _prepare_dirs _ensure_wails _build_frontend
	@echo "Building Wails desktop shell (linux/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform linux/$(WAILS_GOARCH) -tags webkit2_41

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-linux"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-linux"
	mv "wails-app/build/bin/$(APP_NAME)" "$(BUILD_DIR)/$(APP_NAME)-linux/$(APP_NAME)"

	@echo "Building Go server..."
	cd go-server && GOOS=linux GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-linux/omnidb-server" .

	@echo "Packaging Linux Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && tar -czf dist/OmniDB-$(VERSION)-linux-x64.tar.gz $(APP_NAME)-linux
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-linux-x64.tar.gz"

# --- WINDOWS BUILD LOGIC (Wails) ---
# Fully cross-compiles from macOS/Linux (verified: produces a real PE32+
# .exe using Wails' pure-Go WebView2 loader, no mingw/CGO needed) — but on
# CI this runs natively on windows-latest anyway.
_build_win: _prepare_dirs _ensure_wails _build_frontend
	@echo "Building Wails desktop shell (windows/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform windows/$(WAILS_GOARCH) -webview2 embed

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-win"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-win"
	mv "wails-app/build/bin/$(APP_NAME).exe" "$(BUILD_DIR)/$(APP_NAME)-win/$(APP_NAME).exe"

	@echo "Building Go server..."
	cd go-server && GOOS=windows GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-win/omnidb-server.exe" .

	@echo "Packaging Windows Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && $(ZIP_CMD) dist/OmniDB-$(VERSION)-win-x64.zip $(APP_NAME)-win
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-win-x64.zip"

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
