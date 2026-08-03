# Workspace frontend build

Vite build for the workspace UI's own JavaScript. Output goes to
`../static_assets/OmniDB_app/dist/`, which `static_assets.go` embeds into the
`omnidb-server` binary.

```bash
npm ci
npm run build          # unminified — this is what gets committed
npm run build:release  # minified — what the shipped binary embeds
npm run check          # legacy-globals bridge invariants, see below
npm run typecheck      # opted-in files only, see below
```

## Two builds: readable in git, minified in the binary

`dist/` lives in git permanently, so minifying it would turn every future
commit into an unreadable multi-megabyte diff. The binary that ships is a
different question — there, halving the bundle (1.2 MB → 666 kB) is free.

So there are two modes, selected by Vite's `--mode` (not an environment
variable: the Windows build runs these scripts through `cmd.exe`, where
`VAR=1 cmd` is not a thing):

| | `npm run build` | `npm run build:release` |
| --- | --- | --- |
| minified | no | yes |
| sourcemap | yes | yes |
| used by | commits, CI, `make _restore_frontend` | `make _build_frontend_release` |

A release build overwrites `dist/` with minified output, lets `go build` embed
it, and then `make _restore_frontend` puts the readable copy back — so a
release leaves no diff behind. Nothing can commit the minified copy by
accident either: `scripts/prepare_release.sh` stages an explicit file list.

If a build is interrupted between those two steps, `dist/` is left minified.
`npm run build` fixes it, and CI's dist-freshness check would catch it anyway.

`dist/` is committed at all because `go build ./go-server` and `go test ./...`
must work on a machine with no Node installed, and `//go:embed` needs the files
to already exist. CI rebuilds and fails if the committed output does not match
the sources.

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

Strict mode **is** on (`output.strict: true`). It was off through the migration,
because these ~39k lines were written as sloppy-mode classic scripts and the
difference had not been audited. It has been now, and the blocker was implicit
globals — 46 variables assigned without `var`, so each became a property of
`window`. They are declared, and strict mode is what keeps the next one from
being written. See the comment on `strict` in `vite.shared.js` for the rest of
the audit.

## The legacy-globals bridge

Cross-file references are real imports now, so the bridge is no longer what
holds the bundle together. What still needs it:

- the inline event handlers — around 30 `on*=` attributes in `workspace.html`
  and roughly 80 more built as HTML strings inside JS and injected with
  `innerHTML`. All of them are evaluated against the global scope.
- `workspace.html`'s inline bootstrap script, which calls `createOmnis()`.
- `showAlert`, called from `ajax_control.js` in the early bundle, which cannot
  import it (see above).

That comes to 87 names of 549 exports. The bridge still publishes all of them
wholesale rather than an allowlist, because an allowlist that drifts fails at
click time in a way nothing would catch.

Deleting it means converting those ~110 inline handlers to `addEventListener`.
The ones in `workspace.html` are easy; the ones assembled into HTML strings are
the real work, and worth doing — an inline handler is also the only reason this
frontend cannot adopt a Content-Security-Policy without `unsafe-inline`.

It assigns with `Object.assign`, which is a snapshot rather than a live
binding. `npm run check` enforces the two invariants that keeps honest —
nothing outside the bundle may assign to a bundled export, and nothing inside
may reassign an exported `var`/`let` that outside code reads. Both failures
produce a stale value at runtime rather than an error, so CI runs it too.

`src/bootstrap-globals.js` is the one place that deliberately writes to
`window` *without* declaring anything: it publishes the server-rendered page
configuration, several values of which the app reassigns at runtime. See its
comment.

## Type checking

`npm run typecheck` runs `tsc` over this directory. `checkJs` is **off**, so
only files whose first line is `// @ts-check` are actually checked — running it
against all ~39k unannotated lines would produce thousands of findings and
nothing would ever go green.

Add `// @ts-check` to a file when you work on it. The set can only grow, and CI
fails if anything already in it regresses. Currently checked:

- the three bundle entry points, `legacy-globals.js`, `bootstrap-globals.js`
- `AgGridAdapter.js`
- `scripts/check-bridge.mjs`

Running it over *everything* (set `checkJs` and see) reports around 740
findings, down from 4,602 before cross-file references became imports. What is
left is dominated by two shapes, neither of which is a bug: property access on
values typed `any` from the declarations above, and calls that omit a trailing
parameter the callee guards with `if (p_x)` — signatures that lie about being
optional. Exactly four are "Cannot find name", and all four are the Advanced
Object Search functions that do not exist.

`src/globals.d.ts` declares the browser globals the bundle does not own —
`agGrid`, `$`, `ace`, `window.Handsontable`. They are typed `any` on purpose:
that is genuinely all that is known about them while they arrive as `<script>`
tags, and pretending otherwise would be worse than saying so. Real types come
with real npm packages.

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
- **Extending the `// @ts-check` set.** The infrastructure is in place (see
  above); the ~39k unannotated lines are the work.
- **Deleting the bridge.** Needs ~110 inline handlers converted to
  `addEventListener` — see above. Also the prerequisite for a CSP without
  `unsafe-inline`.
- **The CSS.** There is no `.scss` source in the repo — only
  `css/omnidb.min.css` and a source map naming nine files that no longer
  exist. Either reconstruct them from the map or accept the compiled CSS as
  the source. That is a decision, not a task.

Run `SMOKE_CHECKLIST.md` after every change. There are no automated tests.
