# Workspace frontend build

Vite build for the workspace UI's own JavaScript. Output goes to
`../static_assets/OmniDB_app/dist/`, which `static_assets.go` embeds into the
`omnidb-server` binary.

```bash
npm ci
npm run build
npm run check      # legacy-globals bridge invariants, see below
```

`dist/` **is committed**. `go build ./go-server` and `go test ./...` must work
on a machine with no Node installed, and `//go:embed` needs the files to
already exist. CI rebuilds and fails if the committed output does not match the
sources.

## The three bundles

| Bundle | Entry | Loaded by |
| --- | --- | --- |
| `omnidb.early.js` | `src/early.js` | `workspace.html`, before the inline `startLoading()` call |
| `omnidb.bundle.js` | `src/main.js` | `workspace.html`, after the third-party libraries |
| `omnidb.login.js` | `src/login.js` | `login.html` |

They are separate because their `<script>` tags sit at genuinely different
points in the page, not for code-splitting. `ajax_control.js` reads
`#bt_cancel_ajax` out of the DOM as it loads and has to run where its tag was;
`login.html` is a different page that only ever needed three of these files and
has no use for the workspace's 1.2 MB.

Rollup cannot emit more than one IIFE bundle per build, so each has its own
thin config file and `npm run build` runs them in sequence. The shared options
live in `vite.shared.js`. The first build in the sequence is the one that
clears `dist/`.

## Why the sources are not under `static_assets/`

`static_assets.go` embeds with `//go:embed all:static_assets`. The `all:`
prefix means dot-files and everything else, so a `node_modules` anywhere under
that tree would be compiled into the binary. Hence `frontend/` as a sibling.

## Why IIFE bundles and not ES modules

`<script type="module">` is implicitly deferred. `workspace.html` still has
inline classic scripts that must keep running in their current positions
relative to the bundles — `startLoading()` between the early bundle and the
main one, and the block of globals at the very bottom. An IIFE bundle is an
ordinary blocking script, so replacing a run of `<script src=...>` tags with it
does not change when anything executes.

For the same reason Rollup's `"use strict"` pragma is suppressed
(`output.strict: false`). These ~39k lines were written as sloppy-mode classic
scripts and have never been audited for the difference — implicit globals,
top-level `this`, duplicate parameter names. Strict mode would turn each of
those into a runtime error.

## The legacy-globals bridge

Everything still lives in one shared scope, exactly as it did when each file
was its own `<script>`, so no imports were added between the migrated files.
What did change is that a bundled function is no longer automatically a
property of `window` — and the `onclick=` attributes in `workspace.html` are
still evaluated against the global scope. `src/legacy-globals.js` bridges that:
every module is re-exported onto `window` wholesale.

It assigns with `Object.assign`, which is a snapshot rather than a live
binding. `npm run check` enforces the two invariants that keeps honest —
nothing outside the bundle may assign to a bundled export, and nothing inside
may reassign an exported `var`/`let` that outside code reads. Both failures
produce a stale value at runtime rather than an error, so CI runs it too.

`src/bootstrap-globals.js` is the one place that deliberately writes to
`window` *without* declaring anything: it publishes the server-rendered page
configuration, several values of which the app reassigns at runtime. See its
comment.

## Where things stand

Every line of workspace JavaScript this project owns is built from here.
`static_assets/OmniDB_app/js/` is gone; `lib/` holds nothing but third-party
code, still loaded as plain `<script>` tags:

- jQuery, Bootstrap, Ace (+ `mode-sql`, `ext-language_tools`), AG Grid,
  Cytoscape (+ spread, klay), Chart.js (+ annotation plugin), xterm (+ fit),
  moment, daterangepicker, AimaraJS, and the pgexplain bundle (its own React,
  React-DOM and D3).

What is deliberately not done yet:

- **Replacing those with npm packages.** This is where tree-shaking and a
  smaller install would come from. Ace should go last — it fetches its
  `mode-*` and worker files at runtime by URL relative to `basePath`, which
  needs explicit configuration under a bundler.
- **Minification.** `minify: false` while the migration was in progress so each
  commit's `dist/` diff could be read against the source change that produced
  it. Nothing depends on it staying off.
- **Type checking.** `checkJs` with per-file `// @ts-check` would find more
  real bugs in code of this age than anything else on this list.
- **Deleting the bridge.** Needs the ~18 `onclick=` attributes in
  `workspace.html` converted to `addEventListener` first.
- **The CSS.** There is no `.scss` source in the repo — only
  `css/omnidb.min.css` and a source map naming nine files that no longer
  exist. Either reconstruct them from the map or accept the compiled CSS as
  the source. That is a decision, not a task.

Run `SMOKE_CHECKLIST.md` after every change. There are no automated tests.
