# Workspace frontend build

Vite build for the workspace UI's own JavaScript. Output goes to
`../static_assets/OmniDB_app/dist/`, which `static_assets.go` embeds into the
`omnidb-server` binary.

```bash
npm ci
npm run build      # or: npm run watch
```

`dist/` **is committed**. `go build ./go-server` and `go test ./...` must work
on a machine with no Node installed, and `//go:embed` needs the files to
already exist. CI rebuilds and fails if the committed output does not match the
sources.

## Why the sources are not under `static_assets/`

`static_assets.go` embeds with `//go:embed all:static_assets`. The `all:`
prefix means dot-files and everything else, so a `node_modules` anywhere under
that tree would be compiled into the binary. Hence `frontend/` as a sibling.

## Why an IIFE bundle and not ES modules

`<script type="module">` is implicitly deferred. `workspace.html` still has
inline classic scripts that must keep running in their current positions
relative to the bundle — `startLoading()` immediately after the early scripts,
and the block of template-substituted globals at the very bottom. An IIFE
bundle is an ordinary blocking script, so replacing a run of `<script src=...>`
tags with it does not change when anything executes.

## Migration status

The frontend is being moved into this build **one file at a time**, in the
order the `<script>` tags appear in `workspace.html` — that tag order is the
de-facto dependency graph, and converting out of order would silently reorder
initialization.

Everything still lives in one shared scope, exactly as it did when each file
was its own `<script>`, so no imports need to be added between migrated files.
What does change is that a bundled function is no longer automatically a
property of `window`, which the not-yet-migrated files and the `onclick=`
attributes in `workspace.html` still depend on. `src/legacy-globals.js` bridges
that: every migrated module is re-exported onto `window` wholesale. The bridge
shrinks as files move and disappears entirely at the end.

The bridge assigns with `Object.assign`, which is a snapshot rather than a
live binding. `npm run check` enforces the two invariants that keeps honest —
nothing outside the bundle may assign to a bundled export, and nothing inside
may reassign an exported `var`/`let` that unmigrated code reads. Both failures
produce a stale value at runtime rather than an error, so CI runs it too.

Run `SMOKE_CHECKLIST.md` after every step. There are no automated tests.
