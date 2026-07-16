# --- Global Config ---
BUILD_DIR = build
WORK_DIR = build_work
APP_NAME = OmniDB
VERSION := $(shell cat VERSION | tr -d '\r\n')

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
        build-mac-arm64 build-mac-intel build-linux build-win \
        release release-local \
        _prepare_dirs _ensure_wails _build_mac _build_linux _build_win

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
	@echo "  make build-win        - Build for Windows (x64) — fully cross-compiles from"
	@echo "                          macOS/Linux (Wails' pure-Go WebView2 loader)"
	@echo ""
	@echo "Release targets:"
	@echo "  make release-local    - Build current platform, verify artifacts"
	@echo "  make release          - Tag and push → GitHub Actions builds all platforms"
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

build-win:
	$(MAKE) _build_win \
		WAILS_GOARCH=amd64

release-local:
	scripts/release.sh --local

release:
	scripts/release.sh --github

# --- Internal Build Steps ---

# 0. Sync version from VERSION file
_sync_version:
	@echo "Syncing version $(VERSION) to all files..."
	$(SED_CMD) "s/omnidbShortVersion = \".*\"/omnidbShortVersion = \"$(VERSION)\"/g" go-server/version.go
	$(SED_CMD) "s|<small>v[0-9.]*</small>|<small>v$(VERSION)</small>|g" wails-app/frontend/index.html

# 1. Common preparation
_prepare_dirs: _sync_version
	@echo "Cleaning previous builds..."
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	@echo "Creating build directory..."
	mkdir -p $(BUILD_DIR)

# Install the Wails CLI (into `go env GOPATH`/bin) if it isn't already
# available, so builds don't require it pre-installed on PATH.
_ensure_wails:
	@if [ ! -x "$(WAILS)" ]; then \
		echo "Installing Wails CLI..."; \
		go install github.com/wailsapp/wails/v2/cmd/wails@latest; \
	fi

# --- MAC OS BUILD LOGIC (Wails) ---
_build_mac: _prepare_dirs _ensure_wails
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
	cd go-server && GOOS=darwin GOARCH=$(WAILS_GOARCH) go build -o "../$(APP_CONTENT)/MacOS/omnidb-go-server" .

	@echo "Signing..."
	-xattr -cr $(BUILD_DIR)/$(APP_NAME).app
	-codesign --force --deep --sign - $(BUILD_DIR)/$(APP_NAME).app || echo "Signing skipped or failed (non-fatal)"

	@echo "Packaging Mac Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip $(APP_NAME).app
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip"

# --- LINUX BUILD LOGIC (Wails) ---
# Wails refuses to cross-compile for Linux from another OS, so this target
# must run ON Linux. Needs libgtk-3-dev and libwebkit2gtk-4.1-dev (or 4.0 on
# older distros) installed — Wails' Linux webview is a real CGO/GTK binding,
# unlike the pure-Go one it uses for Windows.
_build_linux: _prepare_dirs _ensure_wails
	@echo "Building Wails desktop shell (linux/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform linux/$(WAILS_GOARCH)

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-linux"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-linux"
	mv "wails-app/build/bin/$(APP_NAME)" "$(BUILD_DIR)/$(APP_NAME)-linux/$(APP_NAME)"

	@echo "Building Go server..."
	cd go-server && GOOS=linux GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-linux/omnidb-go-server" .

	@echo "Packaging Linux Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && tar -czf dist/OmniDB-$(VERSION)-linux-x64.tar.gz $(APP_NAME)-linux
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-linux-x64.tar.gz"

# --- WINDOWS BUILD LOGIC (Wails) ---
# Fully cross-compiles from macOS/Linux (verified: produces a real PE32+
# .exe using Wails' pure-Go WebView2 loader, no mingw/CGO needed) — but on
# CI this runs natively on windows-latest anyway.
_build_win: _prepare_dirs _ensure_wails
	@echo "Building Wails desktop shell (windows/$(WAILS_GOARCH))..."
	cd wails-app && $(WAILS) build -clean -platform windows/$(WAILS_GOARCH) -webview2 embed

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-win"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-win"
	mv "wails-app/build/bin/$(APP_NAME).exe" "$(BUILD_DIR)/$(APP_NAME)-win/$(APP_NAME).exe"

	@echo "Building Go server..."
	cd go-server && GOOS=windows GOARCH=$(WAILS_GOARCH) go build -o "../$(BUILD_DIR)/$(APP_NAME)-win/omnidb-go-server.exe" .

	@echo "Packaging Windows Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && $(ZIP_CMD) dist/OmniDB-$(VERSION)-win-x64.zip $(APP_NAME)-win
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-win-x64.zip"
