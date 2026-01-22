BUILD_DIR = build
WORK_DIR = build_work
DEPS_DIR = build_deps
APP_NAME = OmniDB.app
SERVER_DIR = OmniDB
SERVER_SPEC = OmniDB-mac.spec

NWJS_VERSION = v0.107.0
NWJS_ARCH = osx-arm64
NWJS_ZIP = nwjs-${NWJS_VERSION}-${NWJS_ARCH}.zip
NWJS_URL = https://dl.nwjs.io/${NWJS_VERSION}/${NWJS_ZIP}
NWJS_UNZIPPED_DIR = nwjs-${NWJS_VERSION}-${NWJS_ARCH}

BUNDLE_ID = cz.80.omnidb
APP_DISPLAY_NAME = OmniDB

ICON_SOURCE = deploy/macosx/mac-icon.icns
APP_PLIST = $(BUILD_DIR)/$(APP_NAME)/Contents/Info.plist
APP_BINARY_DIR = $(BUILD_DIR)/$(APP_NAME)/Contents/MacOS
APP_RESOURCES_DIR = $(BUILD_DIR)/$(APP_NAME)/Contents/Resources

.PHONY: all clean clean-deps build dist

all: install-deps build

install-deps:
	@echo "Checking and installing dependencies..."
	pip3 install -r requirements.txt pyinstaller --break-system-packages

clean:
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist

clean-deps: clean
	rm -rf $(DEPS_DIR)

$(DEPS_DIR)/$(NWJS_ZIP):
	@echo "Creating deps directory..."
	mkdir -p $(DEPS_DIR)
	@echo "Downloading NW.js $(NWJS_VERSION) for $(NWJS_ARCH)..."
	curl -L -o "$@" "$(NWJS_URL)"

$(DEPS_DIR)/$(APP_NAME): $(DEPS_DIR)/$(NWJS_ZIP)
	@echo "Unzipping NW.js..."
	unzip -q "$(DEPS_DIR)/$(NWJS_ZIP)" -d "$(DEPS_DIR)"
	@echo "Moving app bundle to target name..."
	mv "$(DEPS_DIR)/$(NWJS_UNZIPPED_DIR)/nwjs.app" "$(DEPS_DIR)/$(APP_NAME)"
	@echo "Cleaning up temp unzip folder..."
	rm -rf "$(DEPS_DIR)/$(NWJS_UNZIPPED_DIR)"
	@echo "Dependencies ready in $(DEPS_DIR)/$(APP_NAME)"

build: $(DEPS_DIR)/$(APP_NAME)
	@echo "Cleaning previous builds..."
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist

	@echo "Creating build directory..."
	mkdir -p $(BUILD_DIR)

	@echo "Copying application skeleton..."
	cp -R $(DEPS_DIR)/$(APP_NAME) $(BUILD_DIR)/$(APP_NAME)

	@echo "Configuring application metadata and icon..."
	cp "$(ICON_SOURCE)" "$(APP_RESOURCES_DIR)/app.icns"
	
	sed -i '' 's/io.nwjs.nwjs/$(BUNDLE_ID)/g' "$(APP_PLIST)"
	
	sed -i '' 's/nw.icns/app.icns/g' "$(APP_PLIST)"
	
	sed -i '' 's/nwjs/$(APP_DISPLAY_NAME)/g' "$(APP_PLIST)"
	
	mv "$(APP_BINARY_DIR)/nwjs" "$(APP_BINARY_DIR)/$(APP_DISPLAY_NAME)"

	@echo "Cleaning existing app resources..."
	rm -rf $(APP_RESOURCES_DIR)/app.nw/*

	@echo "Copying web application resources..."
	mkdir -p $(APP_RESOURCES_DIR)/app.nw
	cp -R deploy/app/* $(APP_RESOURCES_DIR)/app.nw/

	@echo "Initializing database..."
	cd $(SERVER_DIR) && python3 manage.py migrate

	@echo "Building Python server..."
	cd $(SERVER_DIR) && python3 -m PyInstaller $(SERVER_SPEC) \
		--distpath ../$(BUILD_DIR) \
		--workpath ../$(WORK_DIR) \
		--clean --noconfirm

	@echo "Integrating server into application..."
	mv $(BUILD_DIR)/omnidb-server $(APP_RESOURCES_DIR)/app.nw/

	@echo "Signing application (Ad-hoc)..."
	xattr -cr $(BUILD_DIR)/$(APP_NAME)
	codesign --force --deep --sign - $(BUILD_DIR)/$(APP_NAME)

	@echo "Build successful! Application is located at $(BUILD_DIR)/$(APP_NAME)"
	@echo "Bundle ID set to: $(BUNDLE_ID)"

dist: build
	@echo "Packaging application for distribution..."
	mkdir -p $(BUILD_DIR)/dist
	cd $(BUILD_DIR) && zip -ry dist/OmniDB-macOS.zip $(APP_NAME)
	@echo "---------------------------------------------------"
	@echo "Distribution package ready at: $(BUILD_DIR)/dist/OmniDB-macOS.zip"
	@echo "IMPORTANT: Users without Apple Dev Certificate must open the app"
	@echo "           by Right-Click -> Open on the first run!"
	@echo "---------------------------------------------------"

