# --- Global Config ---
BUILD_DIR = build
WORK_DIR = build_work
APP_NAME = OmniDB
SERVER_DIR = OmniDB
VERSION := $(shell cat VERSION | tr -d '\r\n')

# --- Platform Defaults (can be overridden by targets) ---
MAC_ARCH = osx-arm64
SERVER_SPEC = OmniDB-mac.spec

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
.PHONY: help all clean install-deps _sync_version \
        build-mac-arm64 build-linux build-win \
        release release-local \
        _prepare_dirs _build_server _build_mac _build_linux _build_win

# --- Default Target: Help ---
help:
	@echo "==========================================================="
	@echo "OmniDB Build System"
	@echo "==========================================================="
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo "  make help             - Show this help message"
	@echo "  make install-deps     - Install Python dependencies"
	@echo "  make clean            - Remove build directories"
	@echo ""
	@echo "Build targets (Wails desktop shell, see wails-app/):"
	@echo "  make build-mac-arm64  - Build for Apple Silicon (M1/M2/M3...)"
	@echo "                          Requires the 'wails' CLI on PATH:"
	@echo "                          go install github.com/wailsapp/wails/v2/cmd/wails@latest"
	@echo "  make build-linux      - Build for Linux (x64) — must run ON Linux, Wails"
	@echo "                          cannot cross-compile to Linux from another OS"
	@echo "  make build-win        - Build for Windows (x64) — the Go/Wails part can"
	@echo "                          cross-compile, but omnidb-server.exe needs a real"
	@echo "                          Windows PyInstaller build (see cross-compilation note)"
	@echo ""
	@echo "Release targets:"
	@echo "  make release-local    - Build current platform, verify artifacts"
	@echo "  make release          - Tag and push → GitHub Actions builds all platforms"
	@echo ""
	@echo "IMPORTANT NOTE ON CROSS-COMPILATION:"
	@echo "  PyInstaller does NOT support cross-compilation."
	@echo "  - To build a working Linux binary, run this on Linux (or Docker)."
	@echo "  - To build a working Windows .exe, run this on Windows."
	@echo "==========================================================="

all: help

install-deps:
	@echo "Checking and installing dependencies..."
	pip3 install -r requirements.txt pyinstaller --break-system-packages

clean:
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist
	rm -rf wails-app/build/bin

# --- Platform Specific Targets ---

build-mac-arm64:
	$(MAKE) _build_mac \
		MAC_ARCH=osx-arm64 \
		WAILS_GOARCH=arm64 \
		SERVER_SPEC=OmniDB-mac.spec

build-linux:
	$(MAKE) _build_linux \
		WAILS_GOARCH=amd64 \
		SERVER_SPEC=OmniDB-lin.spec

build-win:
	$(MAKE) _build_win \
		WAILS_GOARCH=amd64 \
		SERVER_SPEC=OmniDB-win.spec

release-local:
	scripts/release.sh --local

release:
	scripts/release.sh --github

# --- Internal Build Steps ---

# 0. Sync version from VERSION file
_sync_version:
	@echo "Syncing version $(VERSION) to all files..."
	$(SED_CMD) "s/OMNIDB_VERSION = 'OmniDB .*'/OMNIDB_VERSION = 'OmniDB $(VERSION)'/g" $(SERVER_DIR)/OmniDB/custom_settings.py
	$(SED_CMD) "s/OMNIDB_SHORT_VERSION = '.*'/OMNIDB_SHORT_VERSION = '$(VERSION)'/g" $(SERVER_DIR)/OmniDB/custom_settings.py
	$(SED_CMD) "s/ARG OMNIDB_VERSION=.*/ARG OMNIDB_VERSION=$(VERSION)/g" Dockerfile
	$(SED_CMD) "s/^version = \".*\"/version = \"$(VERSION)\"/g" pyproject.toml

# 1. Common preparation
_prepare_dirs: _sync_version
	@echo "Cleaning previous builds..."
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist
	@echo "Creating build directory..."
	mkdir -p $(BUILD_DIR)

# 2. Build Python server (PyInstaller)
_build_server:
	@echo "Initializing database..."
	cd $(SERVER_DIR) && python3 manage.py migrate
	@echo "Building Python server using $(SERVER_SPEC)..."
	# WARNING: This builds the binary for the CURRENT RUNNING OS/ARCH
	cd $(SERVER_DIR) && python3 -m PyInstaller $(SERVER_SPEC) \
		--distpath ../$(BUILD_DIR) \
		--workpath ../$(WORK_DIR) \
		--clean --noconfirm

	@echo "Cleaning up unnecessary artifacts from build..."
	find $(BUILD_DIR)/omnidb-server -name "*.spec" -delete

# --- MAC OS BUILD LOGIC (Wails) ---
_build_mac: _prepare_dirs
	@echo "Building Wails desktop shell (darwin/$(WAILS_GOARCH))..."
	cd wails-app && wails build -clean -platform darwin/$(WAILS_GOARCH)

	@echo "Setting up .app structure..."
	rm -rf $(BUILD_DIR)/$(APP_NAME).app
	mv "wails-app/build/bin/$(APP_NAME).app" "$(BUILD_DIR)/$(APP_NAME).app"

	$(eval APP_CONTENT := $(BUILD_DIR)/$(APP_NAME).app/Contents)
	$(eval APP_RESOURCES := $(APP_CONTENT)/Resources)

	@echo "Updating macOS metadata..."
	plutil -replace CFBundleShortVersionString -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	plutil -replace CFBundleVersion -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"

	# Build server
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	rm -rf $(APP_RESOURCES)/omnidb-server
	mv $(BUILD_DIR)/omnidb-server $(APP_RESOURCES)/omnidb-server

	@echo "Fixing bundled server library rpaths..."
	-find "$(APP_RESOURCES)/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -delete_rpath @loader_path/../.. {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path/.. {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path/../.. {} \; 2>/dev/null
	find "$(APP_RESOURCES)/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec codesign --force --sign - {} \;

	@echo "Signing..."
	-xattr -cr $(BUILD_DIR)/$(APP_NAME).app
	-codesign --force --deep --sign - $(BUILD_DIR)/$(APP_NAME).app || echo "Signing skipped or failed (non-fatal)"

	@echo "Packaging Mac Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip $(APP_NAME).app
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-macOS-$(MAC_ARCH).zip"

# --- LINUX BUILD LOGIC (Wails) ---
# Wails refuses to cross-compile for Linux from another OS, so this target
# must run ON Linux — same constraint _build_server already has for
# PyInstaller. Needs libgtk-3-dev and libwebkit2gtk-4.1-dev (or 4.0 on older
# distros) installed — Wails' Linux webview is a real CGO/GTK binding,
# unlike the pure-Go one it uses for Windows.
_build_linux: _prepare_dirs
	@echo "Building Wails desktop shell (linux/$(WAILS_GOARCH))..."
	cd wails-app && wails build -clean -platform linux/$(WAILS_GOARCH)

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-linux"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-linux"
	mv "wails-app/build/bin/$(APP_NAME)" "$(BUILD_DIR)/$(APP_NAME)-linux/$(APP_NAME)"

	# Build server
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	mv $(BUILD_DIR)/omnidb-server "$(BUILD_DIR)/$(APP_NAME)-linux/omnidb-server"

	@echo "Packaging Linux Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && tar -czf dist/OmniDB-$(VERSION)-linux-x64.tar.gz $(APP_NAME)-linux
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-linux-x64.tar.gz"

# --- WINDOWS BUILD LOGIC (Wails) ---
# The Go/Wails part genuinely cross-compiles from macOS/Linux (verified:
# produces a real PE32+ .exe using Wails' pure-Go WebView2 loader, no
# mingw/CGO needed) — but on CI this runs natively on windows-latest anyway.
_build_win: _prepare_dirs
	@echo "Building Wails desktop shell (windows/$(WAILS_GOARCH))..."
	cd wails-app && wails build -clean -platform windows/$(WAILS_GOARCH) -webview2 embed

	@echo "Setting up directory structure..."
	rm -rf "$(BUILD_DIR)/$(APP_NAME)-win"
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-win"
	mv "wails-app/build/bin/$(APP_NAME).exe" "$(BUILD_DIR)/$(APP_NAME)-win/$(APP_NAME).exe"

	@echo "Building server..."
	# WARNING: PyInstaller cannot cross-compile — must run on Windows for a
	# working omnidb-server.exe. Not an issue on CI (runs natively on
	# windows-latest).
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	mv $(BUILD_DIR)/omnidb-server* "$(BUILD_DIR)/$(APP_NAME)-win/"

	@echo "Packaging Windows Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && $(ZIP_CMD) dist/OmniDB-$(VERSION)-win-x64.zip $(APP_NAME)-win
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-win-x64.zip"
