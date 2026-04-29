# Changelog

All notable changes to this project will be documented in this file.

## [3.1.2] - 2024-??-??

### Security & Dependencies
- Upgraded to Django 5+ (latest 6.0.x)
- Upgraded Bootstrap to 4.6.2 (resolved multiple XSS vulnerabilities)
- Upgraded ACE editor to 1.43.6 (fixed unsafe dynamic method access)
- Upgraded Chart.js to 2.9.4 (resolved prototype pollution vulnerability)
- Upgraded FontAwesome to 5.15.4 (latest bug fixes)
- Upgraded Popper.js to 1.16.1
- Upgraded social-auth-app-django to 5.8.0
- Updated psycopg2-binary to 2.9.12
- Updated social-auth-core to 4.8.7

### Build System
- Fixed Python 3.14 syntax warnings (escape sequences)
- Refactored Makefile for better cross-platform support

### Code Quality
- Fixed test suite (75 tests passing)
- Added missing utility functions to Spartacus.Utils
- Fixed deprecated setDaemon() calls

### UI/UX
- Added new sqlserver-dark theme for SQL Server editor
- Changed default editor theme to sqlserver (light), with automatic dark variant support
- Improved mobile responsive navigation

## [3.1.1] - 2024-02-15

### Core & Dependencies
- Upgraded to Django 4.2.27 (Security & Stability)
- Added compatibility for PostgreSQL 17+ (Fixed checkpoint monitoring)
- Pinned social-auth-app-django to 5.4.1 for compatibility

### UI/UX
- Fixed CSS padding to correctly center the "tab" button

### Documentation
- Modernized CSS with support for mobile devices and dark mode

### Build System
- Updated Makefile to automatically install dependencies

## [3.1.0] - 2023-10-15

### UI/UX
- Consolidated light/dark theme logic to respect OS preferences automatically
- Removed manual theme selection from settings
- Improved appearance and responsiveness on MacOS

### Build System
- Added MacOS Silicon build support
- Consolidated build output directory structure

### Documentation
- Added comprehensive HTML documentation

### Libraries
- Updated jQuery to 3.7.1
- Updated Chart.js to 2.7.3

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