# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.5.0] - 2026-07-14

### Added
- New Go backend (`go-server/`) that progressively takes over the Django/CherryPy backend as a
  strangler-fig migration, with zero change to the frontend or its JSON API contract:
  - Native tree introspection, DDL, properties, and query execution for SQLite, PostgreSQL,
    MySQL, MariaDB, and Oracle, including the full PostgreSQL "long-tail" of previously Django-only
    routes (checks, exclude/rule constraints, event triggers, inheritance/partitions, extended
    statistics, materialized views, functions/procedures/aggregates, sequences/types/domains,
    replication slots/publications/subscriptions, foreign data wrappers) and its ~123-template DDL
    wizard.
  - Edit-data grid, explicit transaction support (`COMMIT`/`ROLLBACK`) for the native query path,
    a resumable multi-statement SQL console, a native SSH terminal, and SSH-tunneled connection
    testing.
  - Native login/session handling (Django-compatible PBKDF2 password verification) and native
    `/workspace/` page rendering, replacing Django as the browser-facing auth and page-render front
    door via a trusted-header interop mechanism, while still-unmigrated Django routes keep working
    unchanged.
  - Native static asset serving — fonts, images, CSS, and JS are now embedded directly into the Go
    binary instead of served by CherryPy.
  - Native user management, connection/group/snippet CRUD, and monitoring dashboard (16 built-in
    PostgreSQL monitoring units plus 1 MySQL unit reimplemented natively).
  - CSV data export extended with XLSX, TSV, Markdown, JSON, and XML output formats.

### Changed
- `wails-app/backend.go` now launches the new Go proxy instead of spawning the Django server
  directly.

### Fixed
- PostgreSQL properties' "Referenced Columns" for foreign keys resolved the wrong table's
  attribute numbers whenever the two tables' column orderings differed.
- Several MySQL/MariaDB tree-introspection queries used `SELECT DISTINCT ... ORDER BY` on a column
  outside the selected list, which MySQL 8/MariaDB reject outright.
- `delete_connection` left orphaned `Tab`/`QueryHistory`/`ConsoleHistory`/`MonUnitsConnections`/
  `GroupConnection` rows behind instead of cascading the delete.
- Saving an existing SQL snippet doubled every single quote in its text on each edit.
- The PostgreSQL properties panel's "Cache Offset" column, based on a system column removed in
  PostgreSQL 18, is no longer shown (it already silently failed against current PostgreSQL either
  way).

### Security
- The query editor's autocomplete and the edit-data grid no longer interpolate cell/filter values
  directly into SQL text — both now use real bind parameters, closing a SQL injection gap present
  in the original implementation.
- Oracle's `kill_backend` now validates its `sid,serial#` argument against a strict pattern before
  use, since `ALTER SYSTEM KILL SESSION` has no bind-parameter form.
- Desktop auto sign-in is no longer reachable at all unless the server is actually running in app
  mode, closing an unauthenticated login backdoor that existed for server/web deployments.

## [3.3.0] - 2026-07-03

### Fixed
- Properties and DDL panels showing nothing for any tree item (table, column, role, etc.) across
  all database types — `outer_connection_tab.js` initialized a new connection tab's
  `treeTabsVisible` flag to `false` while the panel is actually visible by default, so every
  `tree.clickNodeEvent` handler silently no-opped its properties/DDL fetch
- Static JS/CSS fixes not taking effect after an app rebuild — `omnidb-server.py` serves static
  assets with a 24h `Expires` header, and the cache-busting query string only changed on a manual
  version bump, so a browser/webview could keep serving a stale cached copy of a file across app
  restarts for up to a day. Static asset URLs now carry a `STATIC_CACHE_BUST` token generated fresh
  on every server process start, forcing a refetch after every restart

## [3.2.2] - 2026-07-03

### Fixed
- Connections dialog failing to open with an HTTP 500 error — `connections.py` was missing the
  `_parse_post_data()` / `_bad_request()` helpers introduced in 3.2.1, causing a `NameError` on
  every request to `/get_connections/`
- Tooltips rendering raw HTML tags as literal text instead of formatted content —
  `getAttributesOmniDBTooltip()` in workspace.js was escaping pre-built HTML fragments instead of
  just their user-supplied data

### Security
- Escape connection alias, connection string, and tunnel details before interpolating them into
  tooltip and tab-title HTML in workspace.js, outer_connection_tab.js, and outer_terminal_tab.js,
  closing a stored-XSS gap left by the 3.2.1 hardening pass
- Replace the deprecated Homebrew Cask `depends_on macos: ">= :ventura"` string-comparison syntax
  with `depends_on macos: :ventura` in the release Cask generator

## [3.2.1] - 2026-06-30

### Fixed
- Replace unsafe `innerHTML` assignments with `escapeHtml()`, `textContent`, or DOM API across
  query, debug, connections, monitoring, users, notification_control, workspace, console,
  autocomplete, tree (PostgreSQL/MySQL/Oracle/MariaDB/SQLite), edit_data, and tree_snippets
- Add `sanitizeLegend()` to strip event handlers from Chart.js `generateLegend()` output
- Add null guards before `getSelected()[0][0]` in console, autocomplete, plugin_hook, and edit_data
- Replace `bare except: None` with `except Exception` + `logger.error()` in all views
- Normalize `== None` / `!= None` comparisons to `is None` / `is not None` across all views
- Apply consistent code formatting (Prettier) across all JS, SCSS, and CSS files

### Security
- Replace `window[fn]()` dynamic dispatch with an explicit function whitelist in workspace.js
- Add `_parse_post_data()` / `_bad_request()` helpers to all view endpoints — validates POST body
  and returns HTTP 400 on malformed or missing input instead of crashing with an unhandled exception
- Add `user=request.user` ownership filter to Connection, Group, Tab, MonUnits,
  MonUnitsConnections, SnippetFile, and SnippetFolder ORM queries to prevent IDOR
- Set `os.chmod(0o600)` with `try/finally` cleanup for SSH key temporary files

## [3.2.0] - 2026-05-08

### Added
- AG Grid v28 to replace the deprecated Handsontable data grid
- `AgGridAdapter` — custom wrapper providing backwards-compatible API and a custom context menu
- ACE editor upgraded to v1.37.3 with native light/dark theme support
- Bootstrap 5.3.3 migration (from v4), including a jQuery shim for modal compatibility
- `PickleSerializer` for Django sessions to maintain compatibility with non-JSON-serializable data
- GitHub Actions workflows for automated testing, linting, and PyInstaller build checks
- Comprehensive test suite covering models, views, and utilities (75 tests)
- `llms.txt` and `llms-full.txt` with SEO link tags across documentation pages
- Vertical resizable splitter between the database tree and the editor panel
- 12px padding to the query editor for improved readability

### Changed
- Django upgraded from 4.2 to 6.0.4
- `psycopg2-binary`, `social-auth-app-django`, and `pgspecial` updated for better stability
- Redesigned icons and their placement in the main menu
- Redesigned "About" dialog and monitoring dashboard aesthetics
- macOS UI: softer button colors, rounded corners (8px), subtle shadows, transparency/blur for
  modals and panels
- Scrollbar styling reduced to 6px subtle bars; native OS appearance enforced for text inputs
- Over 200 documentation images converted to WebP, reducing asset size by ~35%

### Fixed
- PostgreSQL connection issues in bundled macOS application
- Sorting inversion and numeric detection in AgGridAdapter
- Dark mode: use CSS variables consistently across all themed components, context menus, and grids
- macOS bundled library rpaths and app launcher environment
- `SyntaxWarnings` related to invalid escape sequences (Python 3.14 compatibility)

### Removed
- Handsontable (replaced by AG Grid)
- Bootstrap 4 CSS and JavaScript
- Vagrant configuration files and unused hardcoded OAuth credentials
- Unminified `bootstrap.css` from static files

### Security
- Properly signed macOS server native libraries with ad-hoc code signing

## [3.1.2] - 2026-01-30

### Added
- `sqlserver-dark` theme for SQL Server syntax highlighting
- `FUNDING.yml`

### Changed
- ACE editor upgraded to 1.43.6
- Bootstrap upgraded to 4.6.2
- Chart.js upgraded to 2.9.4
- FontAwesome upgraded to 5.15.4
- Popper.js upgraded to 1.16.1
- Roboto upgraded to v3.015; Roboto Mono upgraded to v3.001
- Documentation moved to new domain omnidb.net with improved mobile responsive navigation
- Default editor theme changed to `sqlserver` (light) with automatic dark variant
- Refactored Makefile for improved cross-platform support and build reliability
- `chromium-args` added to `package.json` for correct panel and data persistence in packaged builds
- Replaced hardcoded asset versioning with dynamic variable

### Removed
- Unminified `bootstrap.css` from static files

### Security
- Bootstrap 4.6.2 addresses multiple XSS vulnerabilities
- ACE editor 1.43.6 fixes unsafe dynamic method access
- Chart.js 2.9.4 resolves prototype pollution vulnerability (CVE-2020-7746)

## [3.1.1] - 2026-01-22

### Added
- PostgreSQL 17+ compatibility: fixed checkpoint monitoring query

### Changed
- Django upgraded to 4.2.27
- `social-auth-app-django` pinned to 5.4.1 to restore working OAuth flows
- Documentation: full dark mode support synced with system preference, responsive design
- Makefile now automatically calls `pip install -r requirements.txt` from build targets

### Fixed
- CSS padding — tab button is now properly centered

## [3.1.0] - 2026-01-16

### Added
- Native Apple Silicon (arm64) support via NW.js v0.107.0
- Automatic OS theme switching (light/dark) — removed manual theme selector
- Comprehensive HTML documentation suite
- Makefile: zero-config build with automatic NW.js dependency download and caching
- Makefile: `make dist` target to package the app into a ZIP archive

### Changed
- NW.js updated to v0.107.0 (arm64)
- jQuery upgraded to 3.7.1
- Chart.js upgraded to 2.7.3
- Bundle ID set to `cz.80.omnidb` to resolve keychain conflicts
- Improved responsiveness and macOS integration
- Refactored layout panels for a cleaner interface

### Fixed
- Application now displays as "OmniDB" (not "nwjs") in the macOS menu bar with the correct icon
- Ad-hoc signing and quarantine removal fix "Safe Storage" permission prompts on macOS

## [3.0.3] - 2023-05-10

### Added
- `--password` option to `--createconnection` CLI flag

### Changed
- Improved connection management UI
- Reduced false-positives from security tools

### Fixed
- Query tab: editor key behaviour for up/down arrows
- Console tab: `\describe` command for tables in PostgreSQL 12+
- Console tab: background theme color on console output

## [3.0.0] - 2022-08-01

### Added
- PostgreSQL 13 support
- Database structure tree and Properties/DDL tabs
- LDAP/Active Directory authentication
- PostgreSQL as backend database option
- Graphical explain component
- Connection sharing between users

### Changed
- Switched from WebSocket to Long Polling
- Better connection pooling
- NW.js replaces Electron
- Enhanced keyboard shortcuts per OS
