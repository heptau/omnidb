BUILD_DIR = build
WORK_DIR = build_work
DEPS_DIR = build_deps
APP_NAME = OmniDB.app
SERVER_DIR = OmniDB
SERVER_SPEC = OmniDB-mac.spec

.PHONY: all clean build

all: build

clean:
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist

build:
	@echo "Cleaning previous builds..."
	rm -rf $(BUILD_DIR) $(WORK_DIR)
	rm -rf $(SERVER_DIR)/build $(SERVER_DIR)/dist

	@echo "Checking dependencies..."
	@if [ ! -d "$(DEPS_DIR)/$(APP_NAME)" ]; then \
		echo "Error: $(APP_NAME) not found in $(DEPS_DIR)."; \
		echo "Please download the OmniDB.app skeleton and place it at $(DEPS_DIR)/$(APP_NAME)"; \
		exit 1; \
	fi

	@echo "Creating build directory..."
	mkdir -p $(BUILD_DIR)

	@echo "Copying application skeleton..."
	cp -R $(DEPS_DIR)/$(APP_NAME) $(BUILD_DIR)/$(APP_NAME)

	@echo "Cleaning existing app resources..."
	# Remove existing sources if the skeleton was not clean
	rm -rf $(BUILD_DIR)/$(APP_NAME)/Contents/Resources/app.nw/*

	@echo "Copying web application resources..."
	# Ensure the app.nw directory exists
	mkdir -p $(BUILD_DIR)/$(APP_NAME)/Contents/Resources/app.nw
	cp -R deploy/app/* $(BUILD_DIR)/$(APP_NAME)/Contents/Resources/app.nw/

	@echo "Initializing database..."
	cd $(SERVER_DIR) && python3 manage.py migrate

	@echo "Building Python server..."
	# Running from SERVER_DIR to ensure relative paths in .spec file work correctly
	# Using WORK_DIR for temporary build artifacts
	cd $(SERVER_DIR) && python3 -m PyInstaller $(SERVER_SPEC) --distpath ../$(BUILD_DIR) --workpath ../$(WORK_DIR) --clean --noconfirm

	@echo "Integrating server into application..."
	# Move the generated omnidb-server folder into app.nw
	mv $(BUILD_DIR)/omnidb-server $(BUILD_DIR)/$(APP_NAME)/Contents/Resources/app.nw/

	@echo "Build successful! Application is located at $(BUILD_DIR)/$(APP_NAME)"
	@echo "NOTE: On macOS, you may need to run the following command to allow the app to run:"
	@echo "      xattr -cr $(BUILD_DIR)/$(APP_NAME)"

