# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Configurable SQL formatting settings in a new "Formatting" tab under Settings: indent character
  (spaces or tab), indent size (2/3/4), comma style (leading/trailing), and keyword case
  (preserve/uppercase/lowercase). Previously all three were hardcoded (4 spaces, leading comma,
  preserve case) with the indent unit limited to 2/4/8 spaces or tab. The conservative heuristic
  only changes recognized SQL keywords, not identifiers or values; unknown edge cases still
  degrade to leaving the input unchanged.
- Intel Mac (x86_64) build target (`build-mac-intel`) and Homebrew Cask support — the macOS release
  now ships separate archives for Apple Silicon and Intel, and the Homebrew cask auto-detects the
  correct architecture on install. CI builds Intel on `macos-13` runners.

### Fixed
- `handleChangeActiveDatabase` silently swallowed a malformed/missing request body and still replied
  with a success envelope, instead of the `writeBadRequest` every sibling handler in the same file
  uses — a malformed call would leave the tab's active-database override unset while the frontend
  believed the switch had succeeded, the same class of silent-no-op bug fixed elsewhere in 3.8.0.
- `randomLowerAlnum` used `int(b)%36` to map a random byte to the 36-character token alphabet;
  `256 = 36×7 + 4` gave indices 0–3 (a–d) a probability of 8/256 and the rest 7/256, a mild
  modulo bias. Fixed with rejection sampling — bytes ≥ 252 are discarded and re-rolled, making
  every alphabet character equally probable.
- Expired native sessions persisted in the `nativeSessions` map forever unless the same session
  key happened to be looked up or destroyed again, causing a slow memory leak on long-running
  server deployments. Fixed with a background goroutine (`startSessionReaper`) that removes
  expired entries once per hour, started lazily on the first login.
- Race condition in `querycursor.go`: `continueCursor` loaded the cursor from the sync.Map and
  returned it without synchronization; a concurrent `closeCursor` could `LoadAndDelete` and close
  `sql.Rows` between the lookup and `fetchBlock`'s mutex acquisition, causing undefined driver
  behavior. Fixed by having `continueCursor` return the cursor with its mutex already held; mode 1
  callers use `fetchBlockLocked` directly and unlock after.
- `forwardConn` in `ssh_tunnel.go` spawned two `io.Copy` goroutines but only waited for one;
  the second goroutine could leak indefinitely if `defer remote.Close()` was slow. Fixed by
  moving one `io.Copy` inline and closing the connection in the remaining goroutine.
- `runNativeQueryAllData` in `longpolling.go` used `defer tx.Commit()` — the deferred commit
  ran even when `tx.Query()` failed, silently committing an empty/failed transaction. Fixed by
  switching to `defer tx.Rollback()` with an explicit `tx.Commit()` only on success.
- `pollingClients` map entries in `native_polling.go` were never cleaned up when a browser tab
  crashed or `/clear_client/` didn't fire, causing a slow memory leak on server deployments.
  Fixed with `startPollingReaper`, a background goroutine that removes entries with no update
  in over an hour, started lazily from the first long-poll request.
- `handleRefreshMonitoring` in `generic_handlers.go` ran arbitrary user SQL with no read-only
  guard, unlike the custom monitoring query path; an INSERT/UPDATE/DELETE sent as a monitoring
  refresh would execute silently. Fixed by adding the same `isReadOnlyQuery` check used in
  `custom_monitor_query.go`.
- `writeEnvelope` silently dropped JSON encoding errors, making response truncation invisible
  in logs. Fixed by logging the error when encoding fails.
- `openAppDB` opened a fresh `*sql.DB` pool per request without capping connections, letting
  concurrent requests pile up SQLite lock contention on busy servers. Fixed by capping each
  pool to `SetMaxOpenConns(1)` / `SetMaxIdleConns(1)`; callers still open and close their own
  handle per request.
- `quoteMySQLIdent` in `mysql_routines.go` wrapped identifiers in backticks without escaping
  embedded backticks, allowing SQL injection through database object names containing backticks.
  Fixed with `strings.ReplaceAll(name, "`", "``")`.
- `handleTestConnection` called `openAppDB` then `appDB.Close()` before checking the error from
  `resolveTestConnectionSecrets`, so a panic there would leak the connection. Fixed by closing
  it with `defer` instead.
- `handleClientKeepAlive` created a new `pollingClient` entry on every heartbeat, even when
  no session had ever started polling. Fixed by only updating `lastUpdate` when the client
  already exists in the map.
- `randomLowerAlnum` read one CSPRNG byte per iteration (50+ syscalls for a token). Fixed by
  batch-reading into a larger buffer and iterating in-memory.
- `readFormData` replaced the request body with partial data even when `io.ReadAll` failed,
  so downstream code would process a truncated request body. Fixed by only restoring the body
  on success.
- `reindentSQLSafe` caught `runtime.Error` panics (nil pointer dereference, index out of
  bounds), silently hiding real programming bugs. Fixed by re-panicking on `runtime.Error`.
- `handleGetMonitorUnitList` interpolated user-supplied plugin names directly into JavaScript
  string literals in `onclick` attributes without escaping, allowing HTML injection through
  database-stored monitor unit names. Fixed with a `jsString` helper that escapes `\`, `"`,
  `\n`, and `\r`.

## [3.8.0] - 2026-07-16

### Added
- Native application menu bar for the Wails desktop shell (OmniDB/Edit/View/Window/Help), wired
  through `WindowExecJS` so menu items reach the loaded page regardless of which origin served it
  (`workspace.html` is served entirely by `go-server` via a full top-level navigation, never through
  Wails' own asset server, so the more obvious `window.runtime` event-bridge approach silently never
  worked). Covers About, Settings, Connections, Snippets, Switch Menu, toggling the database tree and
  Properties/DDL panel, Getting Started, Keyboard Shortcuts, and external links; Quit and the external
  links are native. Deliberately a fully custom top-level menu instead of `menu.AppMenu()`'s macOS role,
  to keep a proper app-level About/Settings entry instead of a generic native About panel.
- `Cmd`/`Ctrl+Shift+C`/`S`/`M` keyboard shortcuts for Connections/Snippets/Switch Menu, matching the
  existing Shift-qualified pattern used for Toggle Properties/DDL Panel.
- Properties/DDL support for PostgreSQL database nodes and all other previously-unported object types
  in the tree (role, tablespace, extension, schema, sequence, function/procedure/aggregate/trigger
  function, domain, composite/enum type, materialized view, fdw/foreign server/foreign table/user
  mapping, event trigger, publication, subscription, statistics object) — expanding any of these
  always dead-ended in "This feature is not available." since the Go migration; now reuses existing
  DDL infrastructure where PostgreSQL has it and hand-synthesizes the rest the same way pgAdmin/DBeaver
  do, live-verified against a real PostgreSQL 16 server.
- Native OS "Save As" dialog for exporting query results in the desktop app: `go-server` relays the
  request over a loopback HTTP hop to a tiny server the Wails process now runs
  (`wails-app/savedialog.go`), since `workspace.html`'s origin never gets a direct Wails runtime
  binding. Browser/server (`-H`) mode is unaffected and keeps the previous "the file is ready, click
  to download" link.
- Query tabs opened through the native Go query path are now actually persisted (`OmniDB_app_tab`,
  including a new `last_used` column with an automatic schema migration for existing installs) and
  restored in most-recently-used order on reconnect — the frontend already sent the fields needed for
  this on every run, but the Go query handler silently dropped all of them since the migration, so no
  native query ever created or updated a tab record.
- Switching to a sibling database within a PostgreSQL connection tab (the tree's "this node is a
  different database" prompt) now actually changes which database subsequent queries/listings in that
  tab hit, not just the tab's title — previously a no-op left over from an incorrect assumption during
  the Go migration that no route needed it.
- The desktop app now feels less like a bare web page: the native/system right-click context menu and
  text selection (drag-highlight, iOS-style press-and-hold callout) are suppressed everywhere except
  editable fields, the Ace-based SQL/console/DDL editors, Handsontable grids, and query status/error
  text.
- New public documentation chapter, "24. Editor Keyboard Shortcuts", listing the Ace editor's own
  shortcut set (line operations, selection, multicursor, navigation, find/replace, folding) — this
  content used to live only on an in-app `/shortcuts/` help page (see Removed).

### Fixed
- Custom and built-in monitoring units' live charts threw `v_object.labels[0] is undefined` starting
  on their second refresh — `handleRefreshMonitorUnits` kept returning the full Chart.js constructor
  shape instead of the flat labels/datasets shape the frontend expects after the first refresh.
- PostgreSQL connections created via the "Connection string" field (server/port/database left blank)
  had that string silently discarded everywhere it mattered, so every such connection actually hit
  whatever database libpq's empty-host default resolves to (a local Unix socket) instead of the
  configured target.
- Running a query from the Query tab never wrote anything to Command History (the insert side was
  never ported during the PostgreSQL long-tail migration), and once history rows did start being
  saved, a string-vs-string date comparison bug meant every row silently failed the default "Last 6
  Hours" filter (and every other date range) regardless of its actual time-of-day, affecting both
  Query and Console history.
- The Settings dialog could hang or stack a second modal backdrop if reopened while already open, and
  Esc didn't close it at all (`keyboard: false` was left over from an unrelated change). Both fixed;
  the equivalent Plugins-dialog bug is moot now that the Plugins dialog is gone entirely (see Removed).
- Three separate bugs in the PostgreSQL "switch to a sibling database" tree flow each left the clicked
  node's spinner stuck forever: dismissing the confirmation dialog via Escape/the X button/a backdrop
  click (rather than Yes/No) never resolved the pending callback; `selectedDatabaseNode` being unset
  threw instead of being guarded; and the tab title update used raw DOM calls (`.innerHTML`/
  `.appendChild`) against what is actually a jQuery collection, which silently no-ops/throws. A related
  root-cause fix keeps the tab's notion of "currently selected database" in sync with
  `current_database()` as queried live by the backend, instead of only ever the saved connection's
  static field, which could never match for connection-string-only connections or a renamed database.
- Two dialogs still showed literal escaped HTML (`&lt;br/&gt;`, `&lt;b&gt;...&lt;/b&gt;`) instead of
  rendered markup — the "please close any tabs of type X before changing connection" message and the
  copy-to-clipboard confirmation — both missed by 3.7.0's fix for the same class of bug (the shared
  `showAlert` helper itself needed a new opt-in `p_is_html` parameter, defaulting to plain-text-safe).
- The Settings dialog was missing its `<h5>` title entirely (only the close button showed), the
  Connections/Edit Connection modals now resize smoothly instead of jumping at Bootstrap's fixed
  breakpoints, and dark theme now styles the modal title text color, which had no rule at all.
- Graceful shutdown could block for up to `httpServer.Shutdown`'s full timeout waiting on any
  in-flight long-polling request; those requests now also select on a shutdown-scoped context and
  return immediately once shutdown begins.
- `/static/temp/` (generated export files) is now served through an explicit handler that verifies the
  resolved path can't escape the temp directory and forces `Content-Disposition: attachment` so a
  CSV/XML/etc. export downloads instead of rendering inline in the browser, instead of a bare
  `http.FileServer`.
- `/save_config_user/` silently failed to persist font size: the frontend sends it as a JSON string,
  which failed to unmarshal into the handler's previous `int` field.

### Changed
- Documentation nav (`docs/en/docs/*.html`, `docs/llms.txt`, `docs/llms-full.txt`, `docs/sitemap.xml`)
  updated for the new "Editor Keyboard Shortcuts" chapter, with a cross-reference added from the
  "Writing SQL Queries" chapter.

### Removed
- The entire plugin system: the Plugins dialog and toolbar link, the native menu's "Plugins" item, all
  six backend routes and the `plugins_stub.go` fallback, and the documented "Plugin API" — it always
  showed an empty grid and any upload attempt always failed, with no Go equivalent to Django's dynamic
  plugin loading and no path forward, so removing it outright was more honest than leaving a dead
  dialog in place.
- The in-app `/shortcuts/` static help page — its Ace-editor shortcut reference now lives in the public
  docs instead (see Added).

## [3.7.0] - 2026-07-15

### Added
- Custom monitoring units now actually run: a unit's "script" is a single SQL query
  (`SELECT`/`WITH` only) instead of the old Python `script_chart`/`script_data` pair, which had
  no equivalent since the Go migration and always returned "not supported". Supports the same
  three shapes the 17 built-in units already use — `grid` (raw columns/rows), `chart`
  (one row per category, Bar/Pie/Doughnut/Line picked from a dropdown), and `timeseries`
  (one row, each numeric column becomes an appended line series). The `graph` unit type is
  dropped for custom units — it never had a working implementation or a built-in example to
  model one on.
- `-H`/`--host` CLI flag for `go-server`, restoring the documented "OmniDB Server"
  network-accessible deployment mode, which was actually impossible until now (the listener was
  hardcoded to `127.0.0.1` with no way to change it). Ignored in desktop app mode (`-A`), which
  always stays loopback-only. The loopback-only `/internal/shutdown/` endpoint is now only
  registered when the effective listen host is actually loopback.

### Fixed
- Several dialogs showed literal escaped HTML (`&lt;input ...&gt;`) instead of a real input
  field or formatted text: "New Group"/"Rename Group" and the SSH password prompt in
  Connections, renaming a tab, creating/renaming a snippet and the snippet overwrite warning,
  changing a PostgreSQL role's password, and the "change active database" confirmation. All
  were broken by an earlier XSS-hardening pass that switched the shared modal helpers from
  `innerHTML` to `textContent`; each caller now builds its own DOM nodes instead of the shared
  helper re-interpreting HTML strings.
- The monitoring-unit "Test" modal threw silently for `grid`/`chart`/`timeseries` results (a
  variable was read before being assigned), leaving the modal blank — never previously
  reachable since custom units always errored out first.

### Changed
- Documentation (`docs/en/docs/`, `docs/llms.txt`, `docs/llms-full.txt`) updated to match the Go
  backend: removed stale WebSocket, Django/CherryPy/Tornado, PyInstaller, Oracle Instant Client,
  and plugin-system content, rewrote the OmniDB Server deployment page around `-A`/`-H`/`-p`/`-d`,
  and replaced the monitoring dashboard's Python-script tutorial with the new SQL-query one.
- Existing custom monitoring units saved before this release still hold Python source in their
  query field; they'll now fail with a SQL syntax error instead of "not supported" and need to be
  rewritten as SQL queries.

### Removed
- `support_matrix.xlsx` and the empty, already-gitignored `build_deps/` directory.

## [3.6.0] - 2026-07-14

### Removed
- Django, CherryPy, and PyInstaller entirely — from the build, the runtime, and the source tree.
  The Go backend (`go-server/`) is now the sole server implementation; the Wails shell only ever
  spawns `omnidb-go-server`, never a Python process. The old Django source tree, `requirements.txt`,
  `pyproject.toml`, `Dockerfile`, and the Python virtualenv are all gone from the repository.

### Fixed
- The desktop app could get stuck on the loading screen indefinitely: a fast-starting Go backend
  could emit its "ready" event before the frontend had finished registering its listener, and the
  event was silently dropped. This never surfaced while Django (slow to start) was the backend.
  The frontend now explicitly signals the backend once it's listening, instead of the backend
  guessing when that's safe.
- The loading screen's version label was hardcoded and had drifted out of sync with the app's
  actual version; it's now kept in sync automatically on every build.
- A brand-new install (no pre-existing `~/.omnidb`) had no way to create the app database's schema
  or a default account, now that Django's `manage.py migrate` no longer exists to do it — the Go
  backend now bootstraps the schema and a default `admin`/`admin` account itself on first run
  against an empty database, and is a no-op against any existing one.

### Changed
- CI (`tests.yml`) now builds, vets, and tests the Go backend and Wails shell directly, instead of
  testing the now-removed Django application.

### Added
- Native login/session handling in the Go backend (Django-compatible PBKDF2 password
  verification), replacing Django as the browser-facing auth front door via a trusted-header
  interop mechanism, while every still-unmigrated Django route keeps working unchanged.
- Native `/workspace/` page render and root `/` (`check_session`/`check_session_message`).
- Native static asset serving — fonts, images, CSS, and JS are now embedded directly into the Go
  binary instead of served by CherryPy.
- Full PostgreSQL "long-tail" natively in Go: ~45 previously Django-only routes (checks,
  exclude/rule constraints, event triggers, inheritance/partitions, extended statistics,
  materialized views, functions/procedures/aggregates, sequences/types/domains, replication
  slots/publications/subscriptions, foreign data wrappers) and its ~123-template DDL wizard.
- Native user management and monitoring dashboard (16 built-in PostgreSQL monitoring units plus
  1 MySQL unit reimplemented natively).
- `kill_backend` for MySQL/MariaDB/Oracle and `get_sqlite_version`, natively in Go.
- Data export extended with XLSX, TSV, Markdown, JSON, and XML output formats alongside CSV.

### Fixed
- `delete_connection` left orphaned `Tab`/`QueryHistory`/`ConsoleHistory`/`MonUnitsConnections`/
  `GroupConnection` rows behind instead of cascading the delete.

### Security
- Oracle's `kill_backend` now validates its `sid,serial#` argument against a strict pattern before
  use, since `ALTER SYSTEM KILL SESSION` has no bind-parameter form.
- Desktop auto sign-in is no longer reachable at all unless the server is actually running in app
  mode, closing an unauthenticated login backdoor that existed for server/web deployments.

## [3.4.0] - 2026-07-13

### Added
- New Go backend (`go-server/`) that progressively takes over the Django/CherryPy backend as a
  strangler-fig migration, with zero change to the frontend or its JSON API contract:
  - Native tree introspection, DDL, properties, and query execution for SQLite, PostgreSQL,
    MySQL, MariaDB, and Oracle.
  - Edit-data grid, explicit transaction support (`COMMIT`/`ROLLBACK`) for the native query path,
    and a resumable multi-statement SQL console.
  - A native SSH terminal and SSH-tunneled connection testing.
  - DB-agnostic workspace routes (`get_database_list`, `draw_graph`, `get_autocomplete_results`,
    `change_active_database`, `save_config_user`) and connections/groups/snippets CRUD
    (`save_connection`/`test_connection`/`delete_connection` and friends).

### Changed
- `wails-app/backend.go` now launches the new Go proxy instead of spawning the Django server
  directly.

### Fixed
- PostgreSQL properties' "Referenced Columns" for foreign keys resolved the wrong table's
  attribute numbers whenever the two tables' column orderings differed.
- The PostgreSQL properties panel's "Cache Offset" column, based on a system column removed in
  PostgreSQL 18, is no longer shown (it already silently failed against current PostgreSQL either
  way).
- Several MySQL/MariaDB tree-introspection queries used `SELECT DISTINCT ... ORDER BY` on a column
  outside the selected list, which MySQL 8/MariaDB reject outright.
- MariaDB-only `algorithm` column no longer queried against MySQL 8's `information_schema.views`,
  where it doesn't exist.
- Oracle's foreign-key introspection used `user_constraints`/`user_cons_columns` (only the
  connected user's own constraints) instead of `all_constraints`/`all_cons_columns`, unlike the
  matching PK/unique queries in the same file.
- Oracle's `GetProperties`/`GetDDL` ignored the schema argument passed in from the frontend,
  silently returning empty properties/DDL for any object outside the connected user's own schema.
- Deleting a snippet folder or a connection group left orphaned rows behind instead of cascading
  the delete, since SQLite doesn't enforce Django ORM's `on_delete=CASCADE` at the schema level.
- Saving an existing SQL snippet doubled every single quote in its text on each edit.
- `get_groups` returned `null` instead of an empty list for a group with no connections.

### Security
- The query editor's autocomplete and the edit-data grid no longer interpolate cell/filter values
  directly into SQL text — both now use real bind parameters, closing a SQL injection gap present
  in the original implementation.

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
