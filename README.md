# OmniDB 3.1.1

## Release Notes

- New features:
	- PostgreSQL 13 support
	- Database structure tree and Properties/DDL tabs with support to additional PostgreSQL objects
	- Option to use Active Directory / LDAP to authenticate OmniDB's users
	- Option to use PostgreSQL as OmniDB's backend database
	- Additional monitoring units
	- Omnis UI helper component (offering walkthroughs)
	- OmniDB's own graphical explain component (displaying Explain and Explain Analyze)
	- Option to share connections between OmniDB users


- Improvements:
	- Core Changes
		- ~~Websocket~~ > Long Polling
		- Better handling of database connections, reusing connection when appropriate
		- Shared tunnels
		- Updated python and javascript libraries (security + stability)
		- ~~Electron~~ > NWJS (New desktop technology)
		- Enhanced shortcuts, allowing users to maintain shortcuts per OS
	- UX/UI improvements for several elements (Connections management, Autocomplete, Global snippet panel with quick-[save/load], contextual menus).

- 3.0.1 changes
	- Bug Fixes
		- Fixed an issue in the long polling mechanism
		- Dark theme colors on autocomplete selection
	- Improvements
		- Added snippets and custom monitoring units to the OmniDB 2 to 3 automatic migration process

- 3.0.2 changes
	- Re-included
		- Explain visualizer component from OmniDB 2.x
		- Shortcuts for issueing Explain and Explain Analyze
	- Bug Fixes
		- Fixed missing dark theme colors on connection results when in full-view
		- Fixed conflict between the z-index of the new explain visualizer and the database tree context menus
	- Improvements
		- Added a toggle to switch between the old and new explain components
		- Improved client-side CPU usage performance (browser rendering gpu-intensive processes)
		- Added a new node-spin loading icon for dark themes with improved visibility

- 3.0.3 changes
	- Bug Fixes
		- Query Tab: Fixed editor key behaviours related to up/down arrows (skipping rows, text selection, text shifting, text indenting)
		- Console Tab: Fixed issue describe command for tables in PostgreSQL 12+
		- Console Tab: Fixed background theme color on console output when changing themes
	- Improvements
		- Reduced chances of having OmniDB being flagged as a threat by security tools (false-positives)
		- Outer Menu: Improved layout and behaviour, providing better awareness of the context
		- Result Grid: Improved resizing behaviours
		- Added password option on --createconnection

- 3.1.0 changes
	- UI/UX
		- Consolidated light/dark theme logic to respect OS preferences automatically
		- Removed manual theme selection from settings
		- Improved appearance and responsiveness on MacOS
	- Build System
		- Added MacOS Silicon build support
		- Consolidated build output directory structure
	- Documentation
		- Added comprehensive HTML documentation
	- Libraries
		- Updated jQuery to 3.7.1
		- Updated Chart.js to 2.7.3

- 3.1.1 changes
	- Core & Dependencies
		- Upgraded to Django 4.2.27 (Security & Stability)
		- Added compatibility for PostgreSQL 17+ (Fixed checkpoint monitoring)
		- Pinned social-auth-app-django to 5.4.1 for compatibility
	- UI/UX
		- Fixed CSS padding to correctly center the "tab" button
	- Documentation
		- Modernized CSS with support for mobile devices and dark mode
	- Build System
		- Updated Makefile to automatically install dependencies

**Website**: https://www.omnidb.net

![](https://raw.githubusercontent.com/docs/assets/dashboard.png)
