# Workspace frontend smoke checklist

The workspace frontend (`go-server/static_assets/OmniDB_app/js`, ~39 000 lines)
has **no automated tests** — no unit tests, no browser tests, nothing. This
checklist is the entire safety net. It exists because the frontend is being
moved onto a Vite build one file at a time (see `README.md` in this directory),
and each of those steps is a mechanical change that can silently break
initialization order or drop a function off `window`.

Run it after every migration step. It takes about ten minutes.

## Ground rules

- **The browser console must stay empty.** Open DevTools *before* loading the
  workspace and keep it open for the whole pass. A single
  `Uncaught ReferenceError: someFunction is not defined` is the exact failure
  mode this migration risks, and it usually surfaces far away from the file
  that caused it — a missing method on one object breaks a feature several
  layers downstream (this already happened once with the Handsontable→AG Grid
  adapter). Treat any new console error as a blocker, not a note.
- **Compare against `master`, not against memory.** If something looks wrong,
  check whether it is also wrong before the change. Plenty of this UI has
  long-standing quirks.
- **Test with a real database.** A PostgreSQL connection exercises the most
  code by far; the other engines share the same tab/grid machinery but have
  their own tree implementations.

## Startup

- [ ] App window opens and the loading overlay (`#div_loading`) disappears.
- [ ] The welcome tab renders.
- [ ] Console is clean.
- [ ] Reload the page (Cmd/Ctrl-R). Everything above still holds — a lot of
      state is rebuilt on reload and some ordering bugs only appear the second
      time.

## Connections

- [ ] Header → Connections opens `#modal_connections` and lists saved
      connections.
- [ ] Toggle the list/card layout button.
- [ ] New connection → the edit dialog opens with the correct fields for the
      selected engine (switching `#conn_form_type` reshuffles which fields
      are visible).
- [ ] Test Connection reports success for a good connection and a readable
      error for a bad one.
- [ ] Save, then reopen the dialog — the values round-tripped.
- [ ] Connection groups: create, rename, assign a connection, delete.

## Object tree — once per engine

Do the full pass for **PostgreSQL**, then a shorter pass (expand, context menu,
one action) for **MySQL/MariaDB**, **Oracle** and **SQLite**. Each engine has
its own `tree_*.js`, and they do not share code.

- [ ] Connecting expands the tree root without error.
- [ ] Expand schemas → tables → columns; the node icons are correct.
- [ ] Login roles and group roles show different icons (PostgreSQL).
- [ ] Right-click a table → the context menu appears with the expected entries.
- [ ] Context menu → Edit Data opens an edit-data tab.
- [ ] Context menu → an action that generates SQL (e.g. Create/Drop) opens a
      query tab pre-filled with a template.
- [ ] The DDL / properties panel populates for a table, a view, a function and
      a role — including the comment and privileges sections.
- [ ] Advanced object search finds a known table.

## Query tab

- [ ] New query tab; the Ace editor takes focus and accepts typing.
- [ ] Run a `SELECT` — results land in the AG Grid, row count and timer show.
- [ ] Sort a grid column, resize a column, select a cell range and copy.
- [ ] Run a multi-statement script (two `SELECT`s separated by `;`) — both
      execute.
- [ ] Run a long query and cancel it with the cancel button.
- [ ] Run a query with a deliberate syntax error — the error is shown in the
      message pane, not swallowed.
- [ ] Autocomplete: type `select * from ` and trigger it; picking an entry
      inserts it and leaves focus in the editor.
- [ ] Explain and Explain Analyze render the plan visualization.
- [ ] Indent/format SQL.
- [ ] Export results to CSV and to XLSX; the file downloads and opens.
- [ ] Query history dialog lists the queries just run and filters by text/date.

## Edit data tab

- [ ] Opens with the table's rows.
- [ ] Edit a cell, add a row, mark a row for deletion.
- [ ] Save applies the changes; the generated SQL is shown.
- [ ] Cancel/revert discards pending changes.

## Console tab

- [ ] Opens and shows a prompt.
- [ ] Run a `SELECT` — output is rendered.
- [ ] Run a backslash command (`\dt` on PostgreSQL).
- [ ] Command history navigates with the arrow keys.

## Terminal tab

Only for a connection with SSH tunneling configured.

- [ ] Terminal opens, xterm renders, keystrokes echo.
- [ ] Resizing the window reflows the terminal (the `fit` addon).

## Monitoring

- [ ] Monitoring tab opens and the unit list loads.
- [ ] The dashboard renders its charts and refreshes on the configured
      interval.
- [ ] Monitoring units dialog: add, edit and delete a unit.

## Snippets

- [ ] Snippet panel opens; the snippet tree lists saved snippets.
- [ ] Create a folder and a snippet, save it, reopen it.
- [ ] Insert a snippet into a query tab.
- [ ] Delete the snippet and the folder.

## Graph / ERD

- [ ] The graph tab renders the schema diagram (Cytoscape).
- [ ] Layout switching and zoom work.

## Users and configuration

- [ ] Users dialog (admin only) lists users; create, edit and delete one.
- [ ] Config dialog opens.
- [ ] Change the theme (light/dark) — it applies immediately, including the
      Ace editor theme and the AG Grid theme.
- [ ] Change the font size.
- [ ] Shortcuts tab: record a new shortcut, save, and verify it fires.
- [ ] Autocomplete type checkboxes toggle, including the select-all control.

## Tabs and shortcuts

- [ ] Open several inner tabs; switch with the configured shortcuts.
- [ ] Close an inner tab and an outer connection tab.
- [ ] Rename a tab.
- [ ] Drag a tab to reorder it.

## Misc header actions

- [ ] About dialog shows the correct version.
- [ ] The documentation link opens in the external browser (in the desktop
      shell this goes through the Wails `BrowserOpenURL` relay — a plain
      `window.open` is silently swallowed there).
- [ ] Sign out returns to the login page (server mode only; the desktop shell
      auto-authenticates).

## Server mode

The desktop shell auto-authenticates and never shows the login form, so this
part is easy to break without noticing.

- [ ] Start `omnidb-server -H` and load it in a normal browser.
- [ ] The login page renders and its JS works.
- [ ] Signing in reaches the workspace, which behaves as above.
