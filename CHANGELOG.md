# Changelog

All notable changes to this project will be documented in this file.

## [3.2.0] - 2026-05-08 – The Modernization & UX Update

This major release introduces a complete UI/UX overhaul with macOS-inspired styling, a migration to Bootstrap 5 and AG Grid, critical dependency upgrades (including Django 6 support), and significantly improved stability for macOS users.

### 🎨 UI/UX & Visual Styling
- **macOS Aesthetic:** Introduced a cleaner look with softer button colors, rounded corners (8px), subtle shadows, and transparency/blur effects for modals and panels.
- **Improved Workspace:** Added a vertical resizable splitter between the database tree and the editor for better layout control.
- **Redesigned Interface:** Fully revamped icons and their placement in the menu.
- **Native Look:** Enforced native OS appearance for text inputs and improved scrollbar styling (6px subtle bars).
- **Dark Mode Excellence:** Comprehensive fixes for dark mode using consistent CSS variables, themed context menus, and improved focus visibility in grids.
- **Dashboard & Dialogs:** Redesigned "About" dialog and refined the aesthetics of the monitoring dashboard.

### 📊 Data Grid & Editor
- **AG Grid Migration:** Replaced the deprecated Handsontable with **AG Grid v28**.
- **AgGridAdapter:** Created a custom adapter for backwards compatibility, including a new custom context menu.
- **Enhanced Sorting:** Improved numeric detection and fixed sorting inversion logic.
- **ACE Editor:** Upgraded to v1.37.3 with native light/dark theme support.
- **Query Editor:** Added 12px padding for better readability.

### 🛠️ Technical Migration & Backend
- **Bootstrap 5:** Migrated from v4 to **v5.3.3**, including a jQuery shim for modal compatibility and refactored grid/utility classes.
- **Django 6 Support:** Upgraded Django from 4.2 to **6.0.4**.
- **Session Handling:** Added a custom `PickleSerializer` to maintain compatibility with non-JSON serializable session data in newer Django versions.
- **Python 3.14 Compatibility:** Fixed various `SyntaxWarnings` related to invalid escape sequences.
- **Dependency Updates:** Updated `psycopg2-binary`, `social-auth-app-django`, and `pgspecial` for better stability.

### 🍎 macOS Improvements
- **Native Fixes:** Resolved PostgreSQL connection issues specifically occurring in bundled macOS applications.
- **Security:** Properly signed macOS server native libraries.
- **Bundle Stability:** Fixed app launcher environment and library rpaths for the Electron/packaged build.

### 📚 Documentation & Maintenance
- **Performance:** Converted over 200 documentation images to **WebP**, reducing asset size by ~35%.
- **CI/CD:** Added GitHub Actions workflows for automated testing, linting, and PyInstaller build checks.
- **Testing:** Implemented a comprehensive test suite covering models, views, and utilities (75 tests total).
- **Project Cleanup:** Removed obsolete tests, Vagrant configurations, and unused hardcoded OAuth credentials.
- **SEO & AI:** Added `llms.txt` and `llms-full.txt` for better indexing and LLM-assisted development.


## [3.1.2] - 2026-01-30 – Security & Improvements Release

This release focuses heavily on **security updates** for several frontend dependencies, enhanced editor theming, documentation relocation and mobile improvements, plus various build and code quality fixes.

### 🔒 Security & Dependencies
- Upgraded **Bootstrap** to 4.6.2 (addresses multiple XSS vulnerabilities)
- Upgraded **ACE editor** to 1.43.6 (fixes unsafe dynamic method access)
- Upgraded **Chart.js** to 2.9.4 (resolves prototype pollution vulnerability – CVE-2020-7746)
- Upgraded **FontAwesome** to 5.15.4 (latest bug fixes & improvements)
- Upgraded **Popper.js** to 1.16.1 (better compatibility with updated Bootstrap)
- Upgraded font **Roboto** to v3.015 (improved variable font support + bug fixes)
- Upgraded font **Roboto Mono** to v3.001 (variable font support + better rendering)

### 🎨 UI/UX & Editor
- Added new **sqlserver-dark** theme for SQL Server syntax highlighting
- Changed default editor theme to **sqlserver** (light), with automatic dark variant support
- Removed unminified `bootstrap.css` from static files (project cleanup)

### 📚 Documentation
- Moved documentation to new domain **omnidb.net**
- Added/enhanced landing page and overall content
- Improved mobile responsive navigation
- Separated JavaScript logic for better maintainability
- Updated download URL

### 🛠️ Build & Development
- Refactored **Makefile** for improved cross-platform support and build reliability
- Added `chromium-args` to `package.json` (ensures panels and data persist correctly in SQLite for packaged/Electron builds)

### 🌐 Website & Other
- Updated OmniDB website link to **HTTPS**
- Removed obsolete sponsor information
- Added **FUNDING.yml** file

### 🧹 Code Quality & Maintenance
- Replaced hardcoded asset versioning with dynamic variable
- Improved code formatting and added missing copyright notices


## [3.1.1] - 2026-01-22 – Maintenance & Compatibility Release

This is a smaller follow-up release to 3.1.0, focusing on security updates, PostgreSQL 17 support, documentation improvements and build process convenience.

### 🔒 Core & Dependencies
* Upgraded to **Django 4.2.27** (security & stability patches)
* Added compatibility with **PostgreSQL 17+** (fixed checkpoint monitoring)
* Pinned `social-auth-app-django` to **5.4.1** (restores working OAuth flows)

### 🎨 UI/UX Fixes
* Fixed CSS padding – **tab button** is now properly centered

### 📚 Documentation
* Modernized CSS
  * Responsive design & good mobile readability
  * Full dark mode support (syncs with system preference)

### 🛠️ Build System
* Updated Makefile – **automatically installs dependencies**
  (`pip install -r requirements.txt` is now called from make targets)


## [3.1.0] - 2026-01-16 - Apple Silicon Support, Auto-Theming & Enhanced macOS Build

This release marks a significant update to version 3.1.0, introducing native Apple Silicon support, automatic theme switching, comprehensive documentation, and a completely overhauled build system for macOS.

### 🎨 UI/UX Improvements
*   **Automatic Theme Switching:** Removed the manual theme selector. The application now automatically adapts to the OS system theme (Light/Dark mode).
*   **Responsive Design:** Improved responsiveness and integration, specifically optimized for macOS environments.
*   **Layout Refactoring:** Refactored layout panels for a cleaner interface.

### 🍎 macOS & Build System Overhaul
*   **Native Apple Silicon Support:** The build is now based on NW.js `v0.107.0` (arm64), ensuring native performance on M1/M2/M3 chips.
*   **Refactored Makefile:**
    *   **Zero-Config Build:** Automatically downloads and caches NW.js dependencies (no manual setup required).
    *   **Branding:** Fixed application identity. The app now properly displays as **OmniDB** (instead of "nwjs") in the menu bar and uses the correct icon.
    *   **Bundle ID:** Set unique Bundle Identifier (`cz.80.omnidb`) to resolve keychain conflicts.
    *   **Ad-Hoc Signing:** Implemented ad-hoc signing and quarantine removal to fix persistent "Safe Storage" permission prompts.
    *   **Distribution:** Added `make dist` target to automatically package the app into a ZIP file.

### 📚 Documentation
*   **New HTML Documentation:** Added a comprehensive suite of HTML documentation.
*   **Updated Guides:** Installation and feature guides have been updated to reflect v3.1.0 changes.

### 🔧 Under the Hood
*   **Dependencies Updated:**
    *   jQuery upgraded to `3.7.1`.
    *   Chart.js upgraded to `2.7.3`.
*   **Code Quality:** General code cleanup and formatting across backend and frontend.


## [3.0.3] - 2023-05-10

### Bug Fixes
- Query Tab: Fixed editor key behaviours related to up/down arrows
- Console Tab: Fixed issue describe command for tables in PostgreSQL 12+
- Console Tab: Fixed background theme color on console output

### Improvements
- Reduced false-positives from security tools
- Improved connection management UI
- Added password option on --createconnection

## [3.0.0] - 2022-08-01

### New features
- PostgreSQL 13 support
- Database structure tree and Properties/DDL tabs
- LDAP/Active Directory authentication
- PostgreSQL as backend database option
- Graphical explain component
- Connection sharing between users

### Improvements
- Switched from Websocket to Long Polling
- Better connection pooling
- NW.js instead of Electron
- Enhanced shortcuts per OS
