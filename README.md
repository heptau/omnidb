# OmniDB

**Website**: https://www.omnidb.net

## Release Notes

### 3.1.2 changes
- **Security & Dependencies**
	- Upgraded Bootstrap to 4.6.2 (resolved multiple XSS vulnerabilities)
	- Upgraded ACE editor to 1.43.6 (fixed unsafe dynamic method access)
	- Upgraded Chart.js to 2.9.4 (resolved prototype pollution vulnerability)
	- Upgraded FontAwesome to 5.15.4 (latest bug fixes)
	- Upgraded Popper.js to 1.16.1 (improved compatibility with Bootstrap 4.6.2)
	- Upgraded font Roboto to v3.015 (improved variable font support + bug fixes)
	- Upgraded font Roboto Mono to v3.001 (variable font support + rendering improvements)
- **UI/UX & Editor**
	- Added new sqlserver-dark theme for SQL Server editor
	- Changed default editor theme to sqlserver (light), with automatic dark variant support
	- Removed unminified bootstrap.css from static files (cleanup)
- **Documentation**
	- Moved documentation to omnidb.net domain
	- Added/enhanced landing page and content
	- Improved mobile responsive navigation
	- Separated JavaScript logic for better maintainability
	- Updated download URL
- **Build & Development**
	- Refactored Makefile for better cross-platform support and build reliability
	- Added chromium-args to package.json (ensures proper panel/data persistence in SQLite for packaged builds)
- **Website & Other**
	- Updated OmniDB website link to HTTPS
	- Removed obsolete sponsor information
	- Added FUNDING.yml file
- **Code Quality & Maintenance**
	- Replaced hardcoded asset versioning with dynamic variable
	- Improved formatting and added copyright notices where missing

### 3.1.1 changes
- **Core & Dependencies**
	- Upgraded to Django 4.2.27 (Security & Stability)
	- Added compatibility for PostgreSQL 17+ (Fixed checkpoint monitoring)
	- Pinned social-auth-app-django to 5.4.1 for compatibility
- **UI/UX**
	- Fixed CSS padding to correctly center the "tab" button
- **Documentation**
	- Modernized CSS with support for mobile devices and dark mode
- **Build System**
	- Updated Makefile to automatically install dependencies

### 3.1.0 changes
- **UI/UX**
	- Consolidated light/dark theme logic to respect OS preferences automatically
	- Removed manual theme selection from settings
	- Improved appearance and responsiveness on MacOS
- **Build System**
	- Added MacOS Silicon build support
	- Consolidated build output directory structure
- **Documentation**
	- Added comprehensive HTML documentation
- **Libraries**
	- Updated jQuery to 3.7.1
	- Updated Chart.js to 2.7.3

### 3.0.3 changes

- **Bug Fixes**
	- Query Tab: Fixed editor key behaviours related to up/down arrows (skipping rows, text selection, text shifting, text indenting)
	- Console Tab: Fixed issue describe command for tables in PostgreSQL 12+
	- Console Tab: Fixed background theme color on console output when changing themes
- **Improvements**
	- Reduced chances of having OmniDB being flagged as a threat by security tools (false-positives)
	- Outer Menu: Improved layout and behaviour, providing better awareness of the context
	- Result Grid: Improved resizing behaviours
	- Added password option on --createconnection

### 3.0.2 changes
- **Re-included**
	- Explain visualizer component from OmniDB 2.x
	- Shortcuts for issueing Explain and Explain Analyze
- **Bug Fixes**
	- Fixed missing dark theme colors on connection results when in full-view
	- Fixed conflict between the z-index of the new explain visualizer and the database tree context menus
- **Improvements**
	- Added a toggle to switch between the old and new explain components
	- Improved client-side CPU usage performance (browser rendering gpu-intensive processes)
	- Added a new node-spin loading icon for dark themes with improved visibility

### 3.0.1 changes
- **Bug Fixes**
	- Fixed an issue in the long polling mechanism
	- Dark theme colors on autocomplete selection
- **Improvements**
	- Added snippets and custom monitoring units to the OmniDB 2 to 3 automatic migration process

### 3.0.0 changes
- **New features**
	- PostgreSQL 13 support
	- Database structure tree and Properties/DDL tabs with support to additional PostgreSQL objects
	- Option to use Active Directory / LDAP to authenticate OmniDB's users
	- Option to use PostgreSQL as OmniDB's backend database
	- Additional monitoring units
	- Omnis UI helper component (offering walkthroughs)
	- OmniDB's own graphical explain component (displaying Explain and Explain Analyze)
	- Option to share connections between OmniDB users
- **Improvements**
	- Core Changes
		- ~~Websocket~~ > Long Polling
		- Better handling of database connections, reusing connection when appropriate
		- Shared tunnels
		- Updated python and javascript libraries (security + stability)
		- ~~Electron~~ > NWJS (New desktop technology)
		- Enhanced shortcuts, allowing users to maintain shortcuts per OS
	- UX/UI improvements for several elements (Connections management, Autocomplete, Global snippet panel with quick-[save/load], contextual menus).


![](https://raw.githubusercontent.com/docs/assets/dashboard.png)
