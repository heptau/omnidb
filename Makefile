# --- Global Config ---
BUILD_DIR = build
WORK_DIR = build_work
DEPS_DIR = build_deps
APP_NAME = OmniDB
SERVER_DIR = OmniDB
BUNDLE_ID = net.omnidb
APP_DISPLAY_NAME = OmniDB
NWJS_VERSION = v0.112.0
VERSION := $(shell cat VERSION | tr -d '\r\n')

# --- Platform Defaults (can be overridden by targets) ---
NWJS_ARCH = osx-arm64
NWJS_EXT = .zip
SERVER_SPEC = OmniDB-mac.spec
PLATFORM_TYPE = macos

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

# --- URLs ---
NWJS_FILENAME = nwjs-${NWJS_VERSION}-${NWJS_ARCH}
NWJS_ZIP = ${NWJS_FILENAME}${NWJS_EXT}
NWJS_URL = https://dl.nwjs.io/${NWJS_VERSION}/${NWJS_ZIP}

# --- Phony Targets ---
.PHONY: help all clean clean-deps install-deps _sync_version \
        build-mac-arm64 build-mac-intel build-linux build-win \
        release release-local \
        _prepare_dirs _download_nwjs _build_server _bundle_mac _bundle_linux _bundle_win

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
	@echo "  make clean-deps       - Remove downloaded dependencies (NW.js)"
	@echo ""
	@echo "Build targets:"
	@echo "  make build-mac-arm64  - Build for Apple Silicon (M1/M2/M3...)"
	@echo "  make build-mac-intel  - Build for Intel Mac (x64)"
	@echo "  make build-linux      - Build for Linux (x64)"
	@echo "  make build-win        - Build for Windows (x64)"
	@echo ""
	@echo "Release targets:"
	@echo "  make release-local    - Build current platform, verify artifacts"
	@echo "  make release          - Tag and push → GitHub Actions builds all platforms"
	@echo ""
	@echo "IMPORTANT NOTE ON CROSS-COMPILATION:"
	@echo "  PyInstaller does NOT support cross-compilation."
	@echo "  - To build a working Linux binary, run this on Linux (or Docker)."
	@echo "  - To build a working Windows .exe, run this on Windows."
	@echo "  - To build Mac Intel on Mac ARM, ensure you use universal2"
	@echo "    or run the terminal via Rosetta."
	@echo "==========================================================="

all: help

install-deps:
	@echo "Checking and installing dependencies..."
	pip3 install -r requirements.txt pyinstaller --break-system-packages

clean:
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist

clean-deps: clean
	rm -rf $(DEPS_DIR)

# --- Platform Specific Targets ---

build-mac-arm64:
	$(MAKE) _build_mac \
		NWJS_ARCH=osx-arm64 \
		SERVER_SPEC=OmniDB-mac.spec

build-mac-intel:
	$(MAKE) _build_mac \
		NWJS_ARCH=osx-x64 \
		SERVER_SPEC=OmniDB-mac.spec

build-linux:
	$(MAKE) _build_linux \
		NWJS_ARCH=linux-x64 \
		NWJS_EXT=.tar.gz \
		SERVER_SPEC=OmniDB-lin.spec

build-win:
	$(MAKE) _build_win \
		NWJS_ARCH=win-x64 \
		NWJS_EXT=.zip \
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
	$(SED_CMD) "s/<small>v.*<\/small>/<small>v$(VERSION)<\/small>/g" deploy/app/index.html
	$(SED_CMD) "s/ARG OMNIDB_VERSION=.*/ARG OMNIDB_VERSION=$(VERSION)/g" Dockerfile
	$(SED_CMD) "s/^version = \".*\"/version = \"$(VERSION)\"/g" pyproject.toml

# 1. Common preparation
_prepare_dirs: _sync_version
	@echo "Cleaning previous builds..."
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist
	@echo "Creating build directory..."
	mkdir -p $(BUILD_DIR) $(DEPS_DIR)

# 2. Download NW.js (Universal logic)
$(DEPS_DIR)/$(NWJS_ZIP):
	@echo "Downloading NW.js $(NWJS_VERSION) for $(NWJS_ARCH)..."
	curl -L -o "$@" "$(NWJS_URL)"

# 3. Build Python server (PyInstaller)
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

# --- MAC OS BUILD LOGIC ---
_build_mac: _prepare_dirs $(DEPS_DIR)/$(NWJS_ZIP)
	@echo "Unzipping NW.js for Mac..."
	unzip -q -o "$(DEPS_DIR)/$(NWJS_ZIP)" -d "$(DEPS_DIR)"

	@echo "Setting up .app structure..."
	rm -rf $(BUILD_DIR)/$(APP_NAME).app
	mv "$(DEPS_DIR)/$(NWJS_FILENAME)/nwjs.app" "$(BUILD_DIR)/$(APP_NAME).app"
	rm -rf "$(DEPS_DIR)/$(NWJS_FILENAME)"

	# Variables for Mac paths
	$(eval APP_CONTENT := $(BUILD_DIR)/$(APP_NAME).app/Contents)
	$(eval APP_RESOURCES := $(APP_CONTENT)/Resources)
	$(eval APP_MACOS := $(APP_CONTENT)/MacOS)

	@echo "Configuring metadata and icon..."
	cp "deploy/macosx/mac-icon.icns" "$(APP_RESOURCES)/app.icns"
	$(SED_CMD) 's/io.nwjs.nwjs/$(BUNDLE_ID)/g' "$(APP_CONTENT)/Info.plist"
	$(SED_CMD) 's/nw.icns/app.icns/g' "$(APP_CONTENT)/Info.plist"
	$(SED_CMD) 's/nwjs/$(APP_DISPLAY_NAME)/g' "$(APP_CONTENT)/Info.plist"
	mv "$(APP_MACOS)/nwjs" "$(APP_MACOS)/$(APP_DISPLAY_NAME)"

	@echo "Updating macOS metadata..."
	plutil -replace CFBundleShortVersionString -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	plutil -replace CFBundleVersion -string "$(VERSION)" "$(APP_CONTENT)/Info.plist"
	plutil -replace NSHumanReadableCopyright -string "$$(printf "Portions Copyright (c) 2015-2026, The OmniDB Team\nPortions Copyright (c) 2017-2026, 2ndQuadrant Limited\nPortions Copyright (c) 2025-2026, Zbyněk Vanžura")" "$(APP_CONTENT)/Info.plist"

	@echo "Updating localized metadata..."
	find "$(BUILD_DIR)/$(APP_NAME).app" -name "InfoPlist.strings" -exec plutil -convert xml1 {} \;
	find "$(BUILD_DIR)/$(APP_NAME).app" -name "InfoPlist.strings" -exec plutil -replace NSHumanReadableCopyright -string "$$(printf "Portions Copyright (c) 2015-2026, The OmniDB Team\nPortions Copyright (c) 2017-2026, 2ndQuadrant Limited\nPortions Copyright (c) 2025-2026, Zbyněk Vanžura")" {} \;
	find "$(BUILD_DIR)/$(APP_NAME).app" -name "InfoPlist.strings" -exec plutil -replace CFBundleGetInfoString -string "OmniDB $(VERSION), Portions Copyright (c) 2015-2026" {} \;

	@echo "Copying web app..."
	rm -rf $(APP_RESOURCES)/app.nw/*
	mkdir -p $(APP_RESOURCES)/app.nw
	cp -R deploy/app/* $(APP_RESOURCES)/app.nw/

	# Build server
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	mv $(BUILD_DIR)/omnidb-server $(APP_RESOURCES)/app.nw/

	@echo "Fixing bundled server library rpaths..."
	-find "$(APP_RESOURCES)/app.nw/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -delete_rpath @loader_path/../.. {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/app.nw/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/app.nw/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path/.. {} \; 2>/dev/null
	-find "$(APP_RESOURCES)/app.nw/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec install_name_tool -add_rpath @loader_path/../.. {} \; 2>/dev/null
	find "$(APP_RESOURCES)/app.nw/omnidb-server/_internal" -type f \( -name "*.dylib" -o -name "*.so" \) -exec codesign --force --sign - {} \;

	@echo "Signing..."
	-xattr -cr $(BUILD_DIR)/$(APP_NAME).app
	-codesign --force --deep --sign - $(BUILD_DIR)/$(APP_NAME).app || echo "Signing skipped or failed (non-fatal)"

	@echo "Packaging Mac Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-$(VERSION)-macOS-$(NWJS_ARCH).zip $(APP_NAME).app
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-macOS-$(NWJS_ARCH).zip"

# --- LINUX BUILD LOGIC ---
_build_linux: _prepare_dirs $(DEPS_DIR)/$(NWJS_ZIP)
	@echo "Extracting NW.js for Linux..."
	tar -xzf "$(DEPS_DIR)/$(NWJS_ZIP)" -C "$(DEPS_DIR)"

	@echo "Setting up Linux structure..."
	mv "$(DEPS_DIR)/$(NWJS_FILENAME)" "$(BUILD_DIR)/$(APP_NAME)-linux"

	@echo "Copying web app..."
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-linux/package.nw"
	cp -R deploy/app/* "$(BUILD_DIR)/$(APP_NAME)-linux/package.nw/"

	# Build server
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	mv $(BUILD_DIR)/omnidb-server "$(BUILD_DIR)/$(APP_NAME)-linux/package.nw/"

	@echo "Renaming executable..."
	mv "$(BUILD_DIR)/$(APP_NAME)-linux/nw" "$(BUILD_DIR)/$(APP_NAME)-linux/$(APP_NAME)"

	@echo "Packaging Linux Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && tar -czf dist/OmniDB-$(VERSION)-linux-x64.tar.gz $(APP_NAME)-linux
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-linux-x64.tar.gz"

# --- WINDOWS BUILD LOGIC ---
_build_win: _prepare_dirs $(DEPS_DIR)/$(NWJS_ZIP)
	@echo "Unzipping NW.js for Windows..."
	unzip -q -o "$(DEPS_DIR)/$(NWJS_ZIP)" -d "$(DEPS_DIR)"

	@echo "Setting up Windows structure..."
	mv "$(DEPS_DIR)/$(NWJS_FILENAME)" "$(BUILD_DIR)/$(APP_NAME)-win"

	@echo "Copying web app..."
	mkdir -p "$(BUILD_DIR)/$(APP_NAME)-win/package.nw"
	cp -R deploy/app/* "$(BUILD_DIR)/$(APP_NAME)-win/package.nw/"

	# Build server
	$(MAKE) _build_server SERVER_SPEC=$(SERVER_SPEC)

	@echo "Integrating server..."
	# WARNING: PyInstaller on Mac generates a Mac binary, not Windows .exe!
	mv $(BUILD_DIR)/omnidb-server* "$(BUILD_DIR)/$(APP_NAME)-win/package.nw/"

	@echo "Renaming executable..."
	mv "$(BUILD_DIR)/$(APP_NAME)-win/nw.exe" "$(BUILD_DIR)/$(APP_NAME)-win/$(APP_NAME).exe"

	@echo "Packaging Windows Dist..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && $(ZIP_CMD) dist/OmniDB-$(VERSION)-win-x64.zip $(APP_NAME)-win
	@echo "Done: $(BUILD_DIR)/dist/OmniDB-$(VERSION)-win-x64.zip"
