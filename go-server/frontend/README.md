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

That audit missed one, and the way it missed is worth knowing. `v_current_os`
had an ambient `declare let` in `globals.d.ts`, so it read as owned-by-someone-
else rather than as an implicit global. Ambient declarations have no runtime
effect: nothing created the global, its bare assignment threw ReferenceError,
and because that assignment was the first line of a jQuery ready handler it took
every keyboard shortcut in the app with it. `npm run check` now refuses any
`declare let` that is neither declared in `workspace.html` nor published by
`bootstrap-globals.js`.

## No inline event handlers

There are none left. Not in `workspace.html`, not in `login.html`, not in any
HTML string built inside JS, and not in the markup the Go side generates. The
count went 59 + 13 + 4 in the templates and the Go handlers, plus about 90 in
JS-built strings, to zero.

Two remain in the rendered page and both come from the vendored AimaraJS, which
puts `oncontextmenu="return false;"` on its tree container. That is third-party
code in `lib/`, and it is the only thing between this frontend and a
Content-Security-Policy without `unsafe-inline`.

Handlers are bound one of two ways:

- **Where the markup is written**, right after the `innerHTML` assignment or the
  element's creation. This is most of them, and it is preferred: the handler is
  an ordinary import, so a rename that breaks a binding is a build error.
- **Through a delegated dispatcher** in `dom_event_bindings.js`, for markup that
  cannot be reached at its write site — a tutorial step authored in
  `tutorial.js` but injected by `omnis-control.js`, and grid row actions that
  live in cell *data* and are re-rendered by the grid at will. Those elements
  carry `data-omnidb-action="…"` (plus `data-omnidb-arg` / `data-omnidb-id`) and
  one listener on `document` resolves the name against a table. Unknown names do
  nothing, so it is an allowlist, not an eval.

The Go side emits no executable markup either. `get_users` used to send a
ready-made `<i … onclick='removeUser("3")'>` per row and
`get_monitor_unit_list` one per action icon; both send ids now and the frontend
builds the element.

## The legacy-globals bridge

Cross-file references are real imports now, and the inline handlers are gone, so
the bridge is down to:

- `workspace.html`'s inline bootstrap script, which calls `createOmnis()` and
  declares the globals bundled code assigns to;
- `execAjax` and `showAlert`, reached as globals from `ajax_control.js` and
  `notification_control.js` — those two files appear in more than one bundle and
  so cannot import from each other (see above).

The bridge still publishes all 551 exports wholesale rather than an allowlist,
because an allowlist that drifts fails at click time in a way nothing would
catch.

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

Running it over *everything* (set `checkJs` and see) reports 1,482 findings,
down from 4,602 before cross-file references became imports. What is left is
dominated by three shapes, none of which is a bug: property access on values
typed `any` from the declarations above (TS2339, 409), possibly-null from a
`getElementById` that is never checked (TS18047/TS2531/TS18048, 576 together),
and calls that omit a trailing parameter the callee guards with `if (p_x)` —
signatures that lie about being optional (TS2554, 217).

"Cannot find name" is **zero**. It was four, all of them Advanced Object
Search's, until that dead function was deleted.

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
- **Deleting the bridge.** What is left needs `workspace.html`'s inline
  bootstrap script to go and `ajax_control.js`/`notification_control.js` to stop
  living in more than one bundle — see above.
- **A Content-Security-Policy without `unsafe-inline`.** Nothing in this
  project's own markup blocks it any more. AimaraJS's
  `oncontextmenu="return false;"` on the tree container does; it is two lines in
  `lib/aimaraJS/lib/Aimara.js`.

## The stylesheets

`scss/omnidb.scss` and `scss/login.scss` compile to
`static_assets/OmniDB_app/css/omnidb.min.css` and `login.min.css` via dart-sass,
the same committed-source / built-output split as the JS bundles above, and the
same two npm scripts drive both: `npm run build` (readable, committed) and
`npm run build:release` (compressed, for the shipped binary — see
`package.json`). `ag-grid-custom.css`, `xterm.css` and `user_select_guard.css`
are hand-written CSS with no `.scss` behind them and are untouched by any of
this; only the two files that used to be generated have a source now.

That "used to be" is worth spelling out, because it explains why this took
longer than copying a file. There **was** a real `.scss` source for these once
— the old source map (deleted along with the rest of the Django-era frontend)
named nine files, and eight of the nine turned up unchanged in git history.
Compiling them, though, did not reproduce the CSS that was actually shipping:
a scrollbar width, a couple of alpha values, and the entire dark-theme block
had already drifted from that source by the time it was deleted, with no
record of when or why. Given that, "restore the old scss" would have silently
reverted whatever those since-tuned values were fixing — so `scss/omnidb.scss`
and `scss/login.scss` are direct transcriptions of the CSS that was actually
committed, not reconstructions of the lost original. The one exception is two
real defects in that shipped CSS a browser silently tolerated and a strict
parser doesn't: a stray extra `}`, and a comment sitting mid-selector-list.
Both are fixed; see the comment at the top of `scss/omnidb.scss` for specifics.

Nesting, variables, and splitting into partials are all available to reach for
incrementally from here. None of that happened this pass — turning ~5,700
lines of flat CSS into idiomatic Sass in one sitting would have meant
re-checking all of it by eye for a benefit no more real than doing it one rule
at a time, later, as each part is actually touched.

Run `SMOKE_CHECKLIST.md` after every change. There are no automated tests.
