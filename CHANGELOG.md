# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Query tab: a "Run Statement at Cursor" button that runs just the statement the cursor is
  currently in, with cursor-to-statement matching fixed so a cursor sitting right after a `;`
  always picks the following statement instead of only doing so when whitespace happens to
  separate the two.
- Edit/view cell dialog (Edit Data grid and "View Content" on a query result) now
  syntax-highlights JSON/JSONB and XML values instead of showing them as plain text, based on
  the cell's column type.
- Frontend now has a real `.scss` source for its compiled CSS
  (`go-server/frontend/scss/{omnidb,login}.scss`) — transcribed byte-for-byte from the CSS that
  actually ships rather than restoring the old, already-drifted pre-Go-migration source, which
  no longer matched several since-tuned values (a scrollbar width, some alpha values, the whole
  dark-theme block).
- TypeScript checking (`@ts-check`) now covers all 45 frontend JS files (up from 6), catching a
  number of real bugs along the way — see Fixed.

### Changed
- The ~39,000-line workspace frontend now builds through Vite instead of loading as 72
  hand-ordered `<script>` tags. Every cross-file reference is now a real ES module import instead
  of a lookup through the global object, the bundle runs in strict mode, and a release build is
  minified (666 kB) while the copy committed to the repo stays readable (1.2 MB) so future diffs
  stay reviewable.
- Every inline (`on*=`) event handler in the frontend — in `workspace.html`, in HTML strings built
  by JS, and in Go-generated markup — is now a real `addEventListener` binding or, for markup
  injected into grid cells or by widgets after the fact, goes through a small allowlisted
  delegated dispatcher. No inline handler remains anywhere in this project's own code; the only
  one left in the rendered page belongs to vendored AimaraJS, now set as a property instead of an
  attribute. This closes off the last blocker to a Content-Security-Policy without
  `unsafe-inline`.
- jQuery, Bootstrap, moment.js, and Chart.js's original vendored files are now real npm
  dependencies instead of hand-dropped scripts (each confirmed byte-identical to its released
  package before the swap, so this is a pure delivery-mechanism change on its own).
- Chart.js upgraded 2.9.4 → 4.5.1, dropping its previously-forced moment.js dependency — v2's
  "time" scale needed moment.js internally even though every chart in this app is a plain
  category scale — and the now-confirmed-unused `chartjs-plugin-annotation`. Monitoring dashboard
  and custom-monitor-query chart configs, theme switching, and legend rendering updated for v4's
  renamed options and APIs.
- AG Grid — brought in back in 3.2.0 to replace deprecated Handsontable — is now gone entirely,
  replaced by a hand-rolled, virtualized `VirtualGrid.js` behind the same Handsontable-compatible
  API surface. Drops `ag-grid-community` (356KB gzip, the largest remaining frontend dependency)
  and covers every grid in the app: query results, Edit Data, autocomplete dropdowns, and
  monitoring/list grids.
- The vendored 3.1MB Font Awesome icon font is replaced by a generated stylesheet
  (`scss/_icons.scss`) of hand-mapped inline SVGs, masked over `currentColor` so they still
  inherit color/theme the same way the font glyphs did. Every existing `fa-*` class name keeps
  working unchanged.
- jQuery usage inside the application's own code (as opposed to just its delivery mechanism) has
  been fully removed and replaced with plain DOM APIs (`classList`, `querySelectorAll`/`forEach`,
  `addEventListener`, `getBoundingClientRect`, native `bootstrap.Modal`/`Tooltip` helpers, etc.)
  across every file in `go-server/frontend/src/`. The only remaining exceptions are `console.js`
  and `command_history.js`, which each keep a single call into the third-party, moment.js-based
  `daterangepicker` plugin — there is no vanilla replacement available, so this is a deliberate,
  permanent exception rather than deferred work. Along the way, a handful of leftover
  commented-out dead code blocks (from earlier, unrelated refactors) were also removed.
- Tree context-menu SQL templates (SELECT/INSERT/UPDATE, PostgreSQL routine calls) now use
  trailing commas, `AS` table aliases (Oracle excepted — it rejects `AS` before a table alias),
  and the user's own indent Settings, instead of a hardcoded leading-comma/no-`AS`/4-space style.
- `scss/omnidb.scss` (5,757 lines) is split into `scss/omnidb/{base,theme-light,theme-dark,
  variables,topbar}.scss`, cut along boundaries that already existed in the transcription
  (structural rules, then the light-theme color pass, then the dark-theme
  `@media (prefers-color-scheme: dark)` pass, then the CSS custom properties and the newer Topbar
  redesign) rather than an invented grouping, so the reorganization carries no cascade risk.
  `omnidb.scss` itself is now just the license header plus five `@use` statements; compiled CSS
  output confirmed byte-identical before/after in both expanded and compressed styles.

### Fixed
- Query tab Cancel was a no-op for the case it matters most: a slow initial query (e.g. a `SELECT`
  with no `WHERE`/no index) ran with no way to abort it, and its cursor was only published after
  the query returned, so clicking Cancel mid-run found nothing to close. Also fixes mid-stream
  cancellation of "Fetch all", previously a documented gap.
- "Fetch all" duplicated every row already loaded on screen instead of continuing from where the
  grid left off — it re-executed the query from scratch and appended the whole result onto rows
  already loaded by the initial run. It now resumes the same query cursor "Fetch more" uses.
- Ctrl-F/Ctrl-H (find/replace) did nothing in any Ace-based editor (query, console, snippets,
  edit-data filter, monitoring dashboard) — the search/replace commands were still bound to those
  keys, but the Go migration never bundled Ace's search-box UI module, so invoking them silently
  failed. Restored.
- The Users dialog's Add/Remove/Edit was broken in three independent ways since the Go migration,
  none of which logged anything or told the user a save had failed: adding a user sent a JSON
  shape the backend couldn't decode (and silently discarded any pending edits to existing users in
  the same request); removing a user sent an id type the backend no longer accepted; and deleting
  a user always tried to delete from four Django-only tables the app database never creates,
  aborting the whole transaction.
- Several actions appeared to succeed but silently did nothing, because a browser `<select>`/
  `<input>` value is always a string and the Go side couldn't decode a quoted number into its
  integer field: renaming/deleting a connection group, saving a group's connection list, saving
  the monitoring dashboard/unit refresh interval, and terminating a PostgreSQL/MySQL/MariaDB
  backend from the monitoring grid. All now accept either form.
- Edit Data was completely non-functional against the Go backend on every database engine —
  opening it on any table reported "This feature is not available" outright, traced to the
  row-limit field arriving as a quoted string the backend's decoder rejected. Editing and saving
  now also work end-to-end (insert/update/delete verified against a live PostgreSQL server).
- The Edit cell content dialog's Save silently discarded every edit instead of writing it back to
  the grid — the only way to edit a multi-line value, so this affected every such edit made
  through it.
- Edit Data's Cancel button and its filter-editor autocomplete both threw and got stuck: a
  leftover call to a long-removed WebSocket API, and a variable referenced before it was declared.
- Console tab: command history dates weren't formatted for display, unlike the same column in the
  Query tab's Command History.
- Tree nodes for a failed catalog lookup showed the error as literal, unclickable escaped HTML
  instead of a "View Detail" link — the label was already correctly escaped for XSS safety, which
  incidentally also broke the link that safety measure sat inside of.
- Several dead call sites that threw when actually clicked are removed rather than left as silent
  dead ends: a monitoring dashboard chart-legend click handler and a duplicate "Alter Table" menu
  entry in the MySQL/MariaDB/Oracle trees, both calling functions never defined anywhere in this
  codebase's history.
- Login page was missing `<meta charset="utf-8">`.
- The tutorial walkthrough's "Query Result" step referenced a `divResult` property that doesn't
  exist on a query tab's tag object (the real property is `div_result`) — jQuery's
  `$(undefined).find(...)` had been silently swallowing that typo indefinitely, so the step never
  highlighted anything; surfaced as a real crash only once converted to a direct DOM lookup (see
  jQuery removal above). Fixed the property name.
- The Users dialog referenced a `#div_users` element to toggle an `isActive` class on open/close,
  but that id has never existed in `workspace.html` — another jQuery-selector-on-nothing case
  masked by `$("#div_users")`'s silent no-op. Left as a no-op rather than adding markup for a class
  nothing else reads.

### Removed
- Advanced Object Search — 1,064 lines in `tree_postgresql.js` plus its two dedicated request
  codes. Its only entry point was a commented-out context-menu item, and its body called three
  functions that don't exist anywhere in this codebase's git history; it has been unreachable and
  non-functional since the Go migration.
- Dead vendored assets that were never actually loaded: `lib/popper`, `lib/json_html`, and
  `lib/omnis_legere` — the features they used to back were migrated to real ES modules a while
  ago, leaving these `go:embed`-ded copies as pure dead weight in the server binary.

### Security
- Every inline event handler in this project's own frontend and Go-generated markup is gone (see
  Changed) — the only inline handler left anywhere in the rendered page belongs to vendored
  AimaraJS, and even that one no longer uses an inline attribute. This was the last requirement
  standing in the way of a Content-Security-Policy without `unsafe-inline`.
- Addressed the open GitHub code-scanning alerts as of 2026-08-06: the console's `\d NAME` catalog
  lookup now binds the table/schema name as a query parameter instead of splicing it into the SQL
  text (`console_meta.go`); the desktop shell's save-dialog file copy now opens the source file
  through an `os.Root` rooted at the export temp dir instead of a string-checked path
  (`wails-app/savedialog.go`), so containment is enforced by the OS on every path component
  instead of resting on a `filepath.Rel` comparison; and the icon-build script's HTML-comment
  stripping now loops to a fixpoint instead of a single regex pass (`gen-icons.mjs`). The SQL
  console/query-editor alerts on `console.go`/`querycursor.go` were left as-is and annotated
  in-line — they flag the user's own typed SQL reaching the database, which is the tool's intended
  function, not a privilege boundary crossing (same call already made for that file's sibling
  alerts). `querycursor.go`'s multi-statement runner had two more call sites doing the exact same
  thing (the per-statement `Exec` in its statement-splitting loop, both the autocommit and
  transaction branches) that were missed in the first pass and kept surfacing as new alerts on
  every push; annotated the same way.
- `npm run check` (the legacy-globals bridge script) crashed the `go-server` CI job outright: it
  still scanned `static_assets/OmniDB_app/js/` for legacy files, a directory a prior commit emptied
  and removed entirely once the last third-party scripts moved into `lib/`. Removed the dead
  reference; the bridge check now only has `workspace.html` left to scan on the legacy side.

## [4.1.0] - 2026-07-30

### Added
- Properties panel's DDL tab now shows each object's comment and privileges below its `CREATE`
  statement, not just the bare statement. Previously only PostgreSQL tables/views/foreign tables
  (and table columns, triggers, constraints, rules) included them, because their DDL came from
  one big query that already did; everything else — schemas, sequences, functions/procedures/
  aggregates, domains, types, materialized views, roles, databases, tablespaces, extensions and
  the whole FDW/replication long tail — showed neither, even when both were set. Now all of them
  emit `COMMENT ON …` (plus per-column comments for materialized views) and `GRANT …`
  statements, with a role's memberships standing in for its privileges. MySQL/MariaDB gets
  `GRANT` statements for tables, views and routines (`SHOW CREATE` already carries the comments),
  and Oracle gets both `COMMENT ON TABLE`/`COMMENT ON COLUMN` and object/column grants, which
  `DBMS_METADATA.GET_DDL` leaves out entirely. Every generated `COMMENT ON` breaks the line
  before `IS`, so a long comment doesn't push the object it belongs to off the right edge of the
  DDL panel (which doesn't soft-wrap).
- PostgreSQL object tree now distinguishes login roles ("users") from group roles in the Roles
  list with a different icon, based on `rolcanlogin` — previously every role showed the same
  single-user icon regardless of whether it could actually log in.
- Query tab now asks for confirmation before running `DROP`/`TRUNCATE` or a `DELETE`/`UPDATE`
  with no `WHERE` clause — a best-effort, comment-stripped check (the same tradeoff as the
  backend's read-only-query guard: a safety net against an honest mistake, not a security
  boundary) routes the statement through the existing confirmation modal before it reaches the
  backend.
- SQL editor autocomplete: a per-user setting for which suggestion categories to show,
  unambiguous keyword suffixes (`SELECT` → `SELECT `, `COALESCE` → `COALESCE(`, etc.), a `::`
  popup that only offers data types, a single results column for schema/database/role/
  tablespace/extension suggestions (their second column was always empty), and the `VARBIT`/
  `ELSIF` keywords.

### Changed
- CI now builds the Wails frontend (`npm ci && npm run build`) before compiling `wails-app`,
  matching what `wails build` already does via the Wails CLI — the plain `go build ./...` step
  CI used had no way to satisfy `//go:embed all:frontend/dist` on a fresh checkout, since
  `frontend/dist` is generated and gitignored.
- `SECURITY.md` updated to reflect the Go backend (scope now points at `go-server/`/
  `wails-app/`) instead of the pre-4.0 Python/Django/plugin-system era.

### Fixed
- Properties/DDL panel failed outright ("object does not exist anymore. Please refresh the tree
  view") for any PostgreSQL schema, role, tablespace, extension, database, type, domain, event
  trigger, publication, subscription, extended-statistics object or foreign table whose name needs
  quoting — mixed case, a space, a reserved word. Those catalog queries compared the raw name
  against a `p_object` the tree had already run through `quote_ident()`, so the object was never
  found; the same names are now matched (and emitted in the DDL text) the way the sequence and
  table-column queries already were. A failure in the new comment/privileges lookups is also
  swallowed rather than turned into an error dialog now, so an unreadable catalog costs that
  section of the DDL text and not the whole panel.
- PostgreSQL trigger and rule DDL emitted an invalid `COMMENT ON … ON "schema.table"` — the
  qualified table name was passed through `quote_ident()` as a whole, quoting it into a single
  identifier — and a trigger's `CREATE TRIGGER` had no `;` before that appended comment. A
  constraint's comment likewise didn't quote the constraint name. All three are now emitted the
  way `regclass`/`quote_ident` intend, so the text is valid SQL for names needing quoting too.
- Oracle DDL was cut off after 4000 characters — `DBMS_METADATA.GET_DDL`'s CLOB was read through
  `dbms_lob.substr(..., 4000, 1)`, so a wide or partitioned table, or a long function/package
  body, showed a statement truncated mid-line with nothing saying so. The CLOB is now read whole,
  falling back to the old truncated read if the driver refuses the LOB fetch.
- Query tab: running multiple statements separated by semicolons (e.g. `select 1; select 2;`)
  against PostgreSQL failed outright with `cannot insert multiple commands into a prepared
  statement (SQLSTATE 42601)`, since the whole editor text was handed to the driver as one query
  going through pgx's extended query protocol (implicit `Prepare`), which Postgres rejects for
  more than one command. Fixed by splitting the text into individual statements (same splitter
  the console tab already uses), running every statement but the last via `Exec` on a pinned
  connection/transaction, and using the last statement's result set for the tab's grid.
- SQL editor autocomplete: the macOS manual-trigger shortcut collided with the native "start of
  line" binding (moved to Option+Space); suggestions only triggered after 3+ characters typed;
  the wrong entry could get selected on Enter/click due to a row-index-vs-filtered-list mismatch
  in the AG Grid popup; AG Grid's async cell-focus tracking stole keyboard focus from the editor
  after any grid rebuild (schema/table/function lists, and right after typing `::`); and Tab lost
  editor focus entirely because the handler never called `preventDefault()`.
- `postgresqlChangeRolePassword` only ever generated the legacy md5 password-verifier format,
  never the SCRAM-SHA-256 verifier Postgres has defaulted new passwords to since version 10 —
  changing a role's password against a server whose `pg_hba.conf` requires `scram-sha-256`
  silently set a password nobody could actually log in with. Fixed by reading the target
  server's own `password_encryption` setting and generating whichever verifier format it
  actually uses; live-verified end-to-end against a real PostgreSQL 16 server under both auth
  methods, including that a wrong password is still correctly rejected.

### Removed
- Legacy NW.js deploy scripts (`deploy/linux/{deploy.sh,build_images.sh,pkgbuild/,tarbuild/}`,
  `deploy/windows/{deploy.sh,win-icon.ico}`, `deploy/macosx/deploy.sh`) — hardcoded old NW.js
  versions, predated the current Makefile build system, and weren't invoked by the Makefile or
  any CI workflow.

### Security
- Closed a family of defense-in-depth SQL-injection gaps flagged by CodeQL where a
  request-controlled identifier (table/column/role/schema name) was properly quoted/escaped but
  the original, unvalidated string — not the validated one — still flowed into a query with no
  bind-parameter form for that identifier (`PRAGMA`, `ALTER ROLE`, `SHOW CREATE`, etc.). None
  were exploitable at runtime (escaping was already correct), but none were provably safe to
  static analysis either. Fixed across every flagged site by verifying the identifier against
  the connection's own catalog first and building the query from *that returned, trusted value*
  instead of the original parameter: SQLite PRAGMA table/index names
  (`sqliteTableExists`/`sqliteTableOrViewExists`), Postgres `ALTER ROLE` role names (looked up in
  `pg_roles`), MySQL `SHOW CREATE`'s schema/object and DDL kind keyword, edit-data grid column
  names and PK values, and Oracle's kill-session `sid`/`serial#` (now parsed into integers and
  rebuilt rather than only regex-guarded). The Wails desktop shell's native save-dialog relay got
  the same treatment for its `srcPath`, since the loopback listener can't authenticate that its
  caller really is go-server.
- Aimara.js's tree widget and omnis-legere.js's EXPLAIN visualizer built `innerHTML` from raw
  object names / EXPLAIN JSON fields with no HTML escaping (Aimara only stripped quotes) — any
  table/column/role/snippet name containing markup could execute JS for anyone browsing that
  connection's tree, including other users on a shared/public connection. Both now escape before
  rendering.
- go-server's double-submit CSRF check previously only applied to `/sign_in/`; a single
  `requireCSRF` middleware now covers every native state-changing POST route (save/delete
  connection, users, snippets, monitor units, role passwords, kill-backend, edit-data, etc.)
  instead of relying solely on the `SameSite=Lax` cookie attribute. The desktop shell's loopback
  `/open-url` relay now validates the URL scheme (http/https only) itself rather than relying
  solely on the caller and Wails' own sanitizer. Session and CSRF cookies now set `Secure` based
  on the actual request (TLS or `X-Forwarded-Proto: https`) instead of leaving it off
  unconditionally.
- The docs site's language redirect (`docs/index.html`, `docs/assets/lang-switcher.js`) read a
  language code from `localStorage`/a click target and, despite an existing whitelist check,
  still passed the original tainted string to `window.location.href` — reworked so the value
  that actually reaches `location.href` is always the literal whitelisted array entry, never the
  original candidate.
- Dependency updates: Vite 3.0.7 → 6.4.3 (13 Dependabot advisories in the Wails frontend dev
  server: `@fs`/`?raw`/`?inline&import`/`.svg` path-traversal bypasses), `golang.org/x/crypto`
  0.33.0 → 0.52.0 (CVE-2024-45337, SSH server source-address-validation bypass),
  `golang.org/x/net` 0.54.0 → 0.56.0 (HTML parser CPU-exhaustion DoS).
- Pinned `wails install` to v2.12.0 and `typolima` to v1.3.0 in the build tooling, instead of
  installing whatever is latest on every build.

## [4.0.0] - 2026-07-27

### Added
- Console Tab: `\dt`, `\d`/`\d NAME`, `\du`, `\l`, and `\df` — psql-style catalog-browsing
  backslash commands (list tables, describe a table/view, list roles, list databases, list
  functions), implemented across PostgreSQL, MySQL/MariaDB, Oracle and SQLite. Where an engine
  has no equivalent concept (e.g. SQLite has no roles or multiple databases), the command says
  so directly instead of erroring or returning a misleading result.

### Changed
- The server binary is now named `omnidb-server` (was `omnidb-go-server`) — the `-go-` was a
  leftover from the Python-to-Go migration with no meaning to an end user. Applies to the
  release archive's binary name, the Go module name, and the `OMNIDB_SERVER_PATH` dev override
  (was `OMNIDB_GO_SERVER_PATH`).

### Fixed
- SQL editor autocomplete only ever showed the static keyword list, never tables/columns/schemas/
  etc., and kept the wrong item highlighted while typing. Root cause: three Handsontable-API
  calls (`deselectCell`, `getSettings`/`updateSettings`, `getCell`) the autocomplete popup still
  makes were never ported to `AgGridAdapter.js` during the Handsontable → AG Grid migration,
  so each one threw immediately — the first (`deselectCell`, inside `renew_autocomplete`) before
  the code that even requests catalog completions from the backend ever ran, the second
  (`getSettings`, inside the response handler) before the code that merges those results into
  the popup ever ran. Added all three to `AgGridAdapter.js`.
- Tree "Doc: ..." menu items (e.g. right-click a database → "Doc: Databases") and the About
  dialog's "OmniDB"/"GitHub" links opened an embedded panel that stayed permanently blank, with
  no visible error. Root cause: they rendered the target page inside an `<iframe>`, and every
  site they point at (postgresql.org confirmed via response headers, also applies to github.com)
  sends `X-Frame-Options`/CSP `frame-ancestors` headers that refuse to be framed at all — there is
  no way to embed such a page, so the iframe approach could never have worked. Changed
  `website_tab.js` to open these links externally instead (first fix used `window.open()`
  directly, which turned out to be a silent no-op inside the desktop app's own webview — see the
  next entry).
- The `window.open()` fix above did nothing when run inside the packaged desktop app (no popup,
  no new window, no console error) — Wails' webview doesn't support it. Added a native relay: the
  desktop app now runs a tiny loopback listener (`wails-app/openurl.go`, sharing the save-dialog
  server) that calls `wailsruntime.BrowserOpenURL`, and go-server's new `/open_external_url/`
  (`open_external_url.go`) forwards requests to it. The frontend (`website_tab.js`) picks between
  that relay and a plain `window.open()` based on `gv_desktopMode`, mirroring the existing
  `/export_save_dialog/` pattern used for native "Save As" dialogs.

### Removed
- The interactive PL/pgSQL step debugger: the "Debug Function"/"Debug Procedure" tree menu
  entries, their frontend (`debug.js`, `inner_debugger_tab.js`), and the two Go handlers behind
  them. It was never ported to Go during the 3.6.x rewrite — clicking it always returned "This
  feature is not available." — and reviving it would mean building it again from scratch, not
  just wiring it up, since it depended on a `shared_preload_libraries` PostgreSQL C extension
  that can't be loaded on any managed/cloud Postgres anyway. See Legacy Features & History in
  the public docs.

## [3.9.0] - 2026-07-23

### Added
- First column in query result tables is now pinned (frozen) so it stays visible when scrolling
  horizontally through wide result sets.
- Result tables with many columns now scroll horizontally instead of squeezing all columns into
  the available space; each column has a 120px minimum width. Tables with few columns still
  expand to fill the full width.
- Column headers in query result tables now show a native tooltip on hover with the full column
  name and database type (e.g. `created_at [TIMESTAMP]`), making truncated headers explorable
  without widening columns. The tooltip text is served from `rows.ColumnTypes().DatabaseTypeName()`
  for native Go connections.
- Reduced padding in AG Grid header cells (`4px` left/right) so columns use available width more
  efficiently; truncated header text now shows `…` ellipsis via `text-overflow: ellipsis`.
- Configurable SQL formatting settings in a new "Formatting" tab under Settings: indent character
  (spaces or tab), indent size (2/3/4), comma style (leading/trailing), and keyword case
  (preserve/uppercase/lowercase). Previously all three were hardcoded (4 spaces, leading comma,
  preserve case) with the indent unit limited to 2/4/8 spaces or tab. The conservative heuristic
  only changes recognized SQL keywords, not identifiers or values; unknown edge cases still
  degrade to leaving the input unchanged.
- Intel Mac (x86_64) build target (`build-mac-intel`) and Homebrew Cask support — the macOS release
  now ships separate archives for Apple Silicon and Intel, and the Homebrew cask auto-detects the
  correct architecture on install. CI builds Intel on `macos-13` runners.
- SQL editor code folding beyond plain brackets: `$$...$$` / `$tag$...$tag$` dollar-quoted blocks,
  `IF...END IF`, `CASE...END CASE` (with nesting support), and an indentation-based fallback for
  blocks without explicit delimiters (e.g. a `SELECT` with many indented output columns).

### Fixed
- A query execution error (e.g. a SQL syntax error) showed a modal dialog instead of being routed
  to the query tab's "Messages" panel, and left the "Cancel" button stuck visible with the editor
  read-only, since that code path (`queueQueryError` → `MessageException`) never went through the
  normal query-completion handling that resets tab state. Fixed by routing context-bound query
  errors to a new `queryError` handler that resets the tab (re-enables the editor, hides
  Cancel/commit/rollback), writes the error into the Messages panel, and switches to it — the modal
  is now only shown for errors with no associated query tab.
- Right-clicking a cell in the query results grid and choosing "View Content" or "Copy" did
  nothing, a regression from the Handsontable → AG Grid migration. "View Content" built the
  Bootstrap 5 modal but never called `.modal("show")`; "Copy" called `document.execCommand("copy")`
  against a nonexistent DOM selection, since the AG Grid adapter's `selectCell` only sets grid
  focus/row-selection state, not a browser `Selection`/`Range`. Fixed by showing the modal
  explicitly and by building the copied text from the selected cell range and writing it via the
  existing `uiCopyTextToClipboard` helper.
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
- Running a statement with no result rows (DDL like `CREATE OR REPLACE FUNCTION`, or a DML
  statement with no matching rows) against a native connection left the query tab spinning
  forever with the Cancel button stuck visible, even though the statement had already completed
  successfully server-side. `fetchBlockLocked` in `querycursor.go` returned a nil `[][]string`
  for a zero-row result, which encodes to JSON `null`; the frontend's chunk accumulator
  (`long_polling.js`) does `tempData.concat(v_data.v_data)`, and `[].concat(null)` produces
  `[null]` instead of `[]`, so the grid renderer tried to read `.length` off that `null` "row"
  and threw — an exception silently swallowed by an empty `catch` in the long-polling loop,
  before the code that hides the spinner/Cancel button ever ran. Fixed by initializing the
  block as `make([][]string, 0, blockSize)` so an empty result always encodes as `[]`, matching
  the convention already used by `runNativeQueryAllData` and `handleCommitOrRollback`.
- `resolveTestConnectionSecrets` (test_connection.go) fetched a saved connection's stored
  password/SSH-tunnel credentials by id with no ownership or public check at all — any
  authenticated user could point `/test_connection/` at a connection id belonging to another
  user, override the target server/port with one they control, and leave the password blank to
  reuse the victim's stored secret, which would then be dialed straight to the attacker's host.
  Fixed by applying the same owner-or-public check `connection_info.go`/`terminal.go` already use
  for every other route that reads a saved connection's secrets.
- `renderWorkspacePage` substituted the username and several user-configurable settings (CSV
  delimiter, theme, indent character/size, comma style, keyword case — none validated against a
  charset or enum before being saved) into `workspace.html` with no escaping at all, both as raw
  HTML and inside single-quoted JS string literals, unlike the Django template this replaced
  (auto-escaped by default). A superuser could plant a malicious username to XSS any user who
  later loaded their workspace (session/credential theft); any user could self-XSS via a crafted
  setting. Fixed with HTML escaping for the HTML context and a dedicated JS-string escaper (also
  guarding against a `</script` breakout) for the JS context.
- `handleTempFiles`'s sibling-directory check used `strings.HasPrefix(filePath, dir)` with no
  trailing-separator check — the classic bug where a sibling directory whose name happens to
  start with the same prefix (e.g. `temp` vs. a future `temp-secret`) would incorrectly pass the
  check. Fixed to use `filepath.Rel` + explicit `..`-prefix rejection, the pattern already used
  correctly next door in `export_save_dialog.go`.
- Several PostgreSQL queries silently returned no rows for any schema/table/column/sequence
  needing identifier quoting (mixed case, reserved words): `postgresqlPrimaryKeys`/
  `postgresqlUniques`/`postgresqlSequences` filtered their schema via
  `quote_ident(relnamespace::regnamespace::text)`, which double-quotes a schema that already
  needed quoting; `postgresqlPropertiesTableField`/`postgresqlDDLTableField` compared a raw
  catalog column name against an already quote_ident()-quoted parameter; `postgresqlRoutineFields`'s
  "returns" pseudo-row and `postgresqlTemplateSelectFunction`'s function-id match were missing a
  `quote_ident()` every other producer of that id string applies. Fixed across all of them and
  live-verified against real quoted schema/table/column/sequence/function names.
- `GetObjectDescription`'s "role" spec queried `shobj_description` against `pg_roles` (a view)
  instead of `pg_authid` (the real catalog backing role comments), so `COMMENT ON ROLE` always
  showed as empty. Its "rule" spec matched only by rule name, which is only unique per table, so
  two tables with an identically-named rule could misattribute the comment to the wrong table.
  Both fixed — the latter by reading straight off `pg_rewrite`'s own oid instead of joining by name.
- `postgresqlExcludes`' attribute list wasn't guaranteed to come back in the same order as its
  paired operator list for a multi-column `EXCLUDE` constraint, which could scramble which
  operator applies to which column. Fixed with explicit `unnest(...) with ordinality` ordering on
  both sides.
- `postgresqlChangeRolePassword` re-quoted an already quote_ident()-quoted role name a second
  time, so changing the password of any role needing quoting (mixed case, reserved word) failed
  outright with "role does not exist" (verified live). It also hashed the md5 password verifier
  against that same still-quoted string rather than the real role name, meaning even a successful
  change would have set a verifier the real login flow could never match. Fixed by unquoting back
  to the raw role name before hashing, then re-quoting only for the DDL text; live-verified
  end-to-end (password changed, then logged in with it).
- `mysqlFunctionFields`/`mysqlProcedureFields` ordered their parameter list by `seq desc`,
  reversing the declared parameter order and putting a function's return type last instead of
  first (a copy-paste inversion — Oracle's equivalents already used ascending order). Fixed.
- `oracleFunctionDefinition`/`oracleProcedureDefinition` ignored `p_schema` when asking
  `dbms_metadata.get_ddl` for a function/procedure's DDL, so viewing one owned by any schema other
  than the connected user's own silently failed or returned the wrong object — the same class of
  bug already fixed elsewhere in this file's Properties/DDL/FK queries. Fixed by threading the
  schema through as `get_ddl`'s third argument.
- `sqlitePrimaryKeys` emitted one row per primary-key *column* instead of one per constraint, so
  any table with a composite primary key showed duplicate "Primary Key" tree nodes. Fixed.
- `handleTerminalRequest`/`openOrReuseConsoleSession` had no guard against two near-simultaneous
  requests for the same brand-new tab both seeing "no live session" and both opening one — the
  loser's SSH client/PTY (or DB connection) then leaked forever, since only whichever session won
  the final map store could ever be closed later. Fixed with a per-tab lock shared by both.
- `activeDatabaseMap` (active_database.go) and `passwordMemoryMap` (password_prompt.go) had no
  cleanup at all, unlike `nativeSessions`/`pollingClients` (each already fixed with their own
  reaper) — the latter held a remembered plaintext password in memory indefinitely, well past its
  own timeout window. Fixed by sweeping both alongside the existing hourly session reaper.

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
- Boolean values in query result grids now display as `true`/`false` instead of `1`/`0`, and in
  the console transcript as `true`/`false` instead of `True`/`False`, matching PostgreSQL's own
  text output convention.
- `TIMESTAMPTZ` values in query result grids and the console transcript no longer include the
  timezone abbreviation (`CET`/`CEST`/etc.) — they now render with the numeric UTC offset only
  (e.g. `2026-07-17 14:30:00.123456+02:00`), matching PostgreSQL's own text output.
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
