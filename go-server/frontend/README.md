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

## The eight bundles

| Bundle | Entry | Loaded by |
| --- | --- | --- |
| `omnidb.jquery.js` | `src/jquery-global.js` | both pages, where `lib/jquery/jquery.min.js` used to sit -- the very first `<script>` tag on each |
| `omnidb.bootstrap.js` | `src/bootstrap-framework-global.js` | both pages, right after `omnidb.jquery.js`, where `lib/bootstrap/bootstrap.min.js` used to sit |
| `omnidb.early.js` | `src/early.js` | `workspace.html`, before the inline `startLoading()` call |
| `omnidb.login.js` | `src/login.js` | `login.html` |
| `omnidb.moment.js` | `src/moment-global.js` | `workspace.html`, where `lib/moment/moment.min.js` used to sit |
| `omnidb.ag-grid.js` | `src/ag-grid-global.js` | `workspace.html`, where `lib/ag-grid/ag-grid-community.min.js` used to sit |
| `omnidb.chartjs.js` | `src/chartjs-global.js` | `workspace.html`, where `Chart.bundle.js` + `chartjs-plugin-annotation.min.js` used to sit |
| `omnidb.bundle.js` | `src/main.js` | `workspace.html`, after the third-party libraries |

They are separate because their `<script>` tags sit at genuinely different
points in the page, not for code-splitting. `ajax_control.js` reads
`#bt_cancel_ajax` out of the DOM as it loads and has to run where its tag was;
`login.html` is a different page that only ever needed three of these files and
has no use for the workspace's 1.2 MB; `jquery-global.js` has to publish
`window.$`/`window.jQuery` before literally anything else on either page,
including the other bundles, since none of the ~39k lines that read those
globals were rewritten to import jQuery for themselves; `bootstrap-framework-global.js`
keeps the same position its `<script>` tag always had, right after jQuery's,
though nothing actually depends on that order (Bootstrap 5 does not need
jQuery); `moment-global.js` has
to publish `window.moment` before `daterangepicker.js`'s own `<script>` tag runs, since
that file is not migrated yet and its UMD wrapper falls back to reading the
global when no AMD/CommonJS loader is present; `ag-grid-global.js` keeps the
position its `<script>` tag always had too, though again nothing depends on
it — AgGridAdapter.js only reaches `agGrid.Grid` well after every bundle has
run.

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
- `showAlert`, reached as a global from inside `ajax_control.js` —
  `ajax_control.js` and `notification_control.js` appear in more than one bundle
  each and so cannot import from each other (see above). `execAjax` itself no
  longer needs this for the main bundle: every file there imports it from
  `ajax_control_bridge.js`, a thin wrapper that forwards to the instance
  early.js already published, so main.js and early.js share one instance (and
  one `v_ajax_call`) instead of duplicating the module. login.js still has its
  own real, independent instance — login.html never runs alongside the other
  two, so that duplication is dead weight rather than a correctness problem.

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
- `AgGridAdapter.js`, `ajax_control_bridge.js`
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

- Ace (+ `mode-sql`, `ext-language_tools`), Cytoscape (+ spread, klay),
  xterm (+ fit), daterangepicker, AimaraJS, and the pgexplain bundle (its own
  React, React-DOM and D3). `bootstrap.min.css` and the AG Grid CSS/themes too
  — only each library's JS moved so far; the CSS side of this migration is a
  separate, not-yet-started question.

Five are moved to real npm packages so far:

- `jquery` (`src/jquery-global.js`, its own tiny bundle — see above). The
  vendored copy hashed byte-identical to npm's `3.7.1`, so this is a pure
  delivery-mechanism swap: none of the ~39k lines reading the bare `$`/`jQuery`
  globals had to change, and `globals.d.ts` still declares them (plus
  `window.bootstrap`, for the same reason) for the same reason moment's
  `execAjax`/`showAlert` stay declared — real imports everywhere would be a
  much larger, separate change.
- `bootstrap` (`src/bootstrap-framework-global.js`, its own tiny bundle). The
  vendored `bootstrap.min.js` turned out to be `bootstrap.bundle.min.js`
  (Popper included) under a plain name — hashed identical once compared
  against the right dist file. Imports the ESM build (`import * as bootstrap
  from 'bootstrap'`) plus `@popperjs/core` as an ordinary dependency instead of
  the pre-bundled file, which lets the bundler tree-shake unused components.
  Named "framework", not "bootstrap-global.js", to stay well clear of
  `bootstrap-globals.js` — unrelated, and one character away.
- `moment` (`src/moment-global.js`, its own tiny bundle). It could not just
  become an ordinary import in the main bundle: `daterangepicker.js` is not
  migrated yet and reads `window.moment` at load time, so something has to
  publish that global before its `<script>` tag runs. `console.js` and
  `command_history.js`, the only other consumers, `import moment from
  'moment'` directly and get their own bundled copy — moment has no shared
  state to split-brain on, unlike `ajax_control.js`, so the small duplication
  is a reasonable trade for real types over `any`.
- `ag-grid-community` (`src/ag-grid-global.js`, its own tiny bundle). The
  vendored `ag-grid-community.min.js` hashed byte-identical to the npm
  package's own `dist/ag-grid-community.min.js` at the matching `28.0.2`.
  Imports that exact file rather than the modular ESM entry point on purpose:
  the modular API needs an explicit `ModuleRegistry.registerModules()` call to
  enable each community feature one by one, where this bundle auto-registers
  all of them the same way the old `<script>` tag did. `AgGridAdapter.js`
  keeps reading `agGrid.Grid` off the global, unchanged.
- `chart.js` + `chartjs-plugin-annotation` (`src/chartjs-global.js`, one tiny
  bundle for both). The vendored "Chart.bundle.js" was `Chart.bundle.min.js`
  under a plain name, same story as Bootstrap; the annotation plugin differed
  from `chartjs-plugin-annotation@0.5.7` only in comment indentation and a
  trailing newline. Imports the plain `chart.js` package (not the bundle) so
  its own `require('moment')` resolves to this project's real `moment`
  dependency instead of embedding a second copy; the annotation plugin does
  its own `require('chart.js')` internally; and since both resolve to the
  same module instance, the plugin's `Chart.Annotation = ...` side effect
  patches the exact object this file publishes to `window.Chart`.
  `chart.js@2.9.4`'s own `dist/Chart.js` has old JSDoc that this project's
  TypeScript cannot parse — a syntax error inside the package, not anything
  under `src/`. `jsconfig.json`'s `paths` remaps the `chart.js` specifier to
  `src/types/chart.js.d.ts` for type-checking purposes only; Vite's bundling
  is untouched by tsconfig `paths`, so the real package still ships at
  runtime. A `declare module 'chart.js'` in `globals.d.ts` would not have
  worked here — TypeScript only falls back to an ambient declaration when a
  specifier fails to resolve, and `chart.js` resolves just fine.

**Cytoscape's and xterm's vendored versions could not be identified.**
`cytoscape.min.js` carries no version banner, and its size (304,971 bytes)
falls between published `3.0.1` (288,849) and `3.1.0` (307,006) with no
version in between. `xterm.js` (no banner either) falls between `3.4.1`
(295,088 bytes) and `3.5.0` (335,952) — and diffing it against `3.5.0` anyway
turned up over 17,000 differing lines, not just a version gap, so it is not
that release either. (`fit.js` and its `Terminal.applyAddon(fit)` call site in
`outer_terminal_tab.js` confirm this is a pre-v4 xterm — the addon API v4
removed.) Neither matches any released build closely enough to diff with
confidence. Given `daterangepicker`'s local patch below, guessing the closest
version and swapping it in unverified is exactly the mistake to avoid. Both
stay vendored until someone can pin the exact source — the project's own git
history predating this migration is the most likely way in.

**Ace has a real local patch too, in `mode-sql.js`.** `ace.js` and
`ext-language_tools.js` hash byte-identical to `ace-builds@1.37.3`'s own
`src-min/` build (checked directly — the version string is right there in
`ace.js`, no guessing needed for those two). `mode-sql.js` does not: the
vendored copy is unminified and roughly 300 lines longer than the stock
build, adding a `SqlFoldMode` with dollar-quoted string/function-body
folding (`$$ ... $$` / `$tag$ ... $tag$`), IF/CASE block folding, and an
indentation-based fallback — none of which stock `ace-builds` has. This is on
top of the already-known reason Ace goes last (it fetches `mode-*` and worker
files at runtime by URL relative to `basePath`, which needs explicit
bundler configuration): migrating it means keeping this custom fold mode
alive, most likely by moving its logic into project-owned source that
extends the stock SQL mode rather than replacing the file outright.

**`daterangepicker` is not a safe drop-in.** The vendored copy has a local
patch to its start/end-date picking logic (`this.pickingEndDate`, changed
around the `if ((this.endDate && !this.pickingEndDate) || ...)` branch) that
the npm `daterangepicker@3.1.0` package — otherwise the matching version —
does not have. Diff the two before ever touching this one; swapping it for the
plain npm package would silently reintroduce whatever picking bug that patch
fixed.

**AimaraJS has no npm package at all** — not published under `aimarajs`,
`aimara`, or any obvious name. It has to stay a vendored file regardless of
how the rest of this list goes, unless it is replaced with a different
library entirely.

**The pgexplain bundle is not a vendoring problem, it's an age problem.**
`react.js`/`react-dom.js` in `lib/explain/` are React **0.14.9** (2015) —
`pgplan.js`, the actual explain-plan visualizer, is project-owned code
written against that API (most likely `React.createClass`, removed in
React 16). Moving this to a current npm React is not a script-tag swap, it is
a rewrite of `pgplan.js` against a modern API; out of scope for this pass.

This is also a reason to diff first, not just version-match, for every
library on this list — jQuery, Bootstrap, moment, AG Grid, Chart.js, and two
of Ace's three files happened to be clean; `daterangepicker` and Ace's
`mode-sql.js` were not, and Cytoscape/xterm could not even be version-matched
enough to try.

What is deliberately not done yet:

- **Replacing the rest with npm packages.** This is where tree-shaking and a
  smaller install would come from.
- **Extending the `// @ts-check` set.** The infrastructure is in place (see
  above); the ~39k unannotated lines are the work.
- **Deleting the bridge.** What is left needs `workspace.html`'s inline
  bootstrap script to go, plus `ajax_control.js` (early.js, login.js) and
  `notification_control.js` (main.js, login.js) each still having a real
  instance of their own in more than one bundle — see above. The main bundle no
  longer duplicates ajax_control.js itself (see `ajax_control_bridge.js`), but
  that only removed one of the two files, and only for one of the two bundles
  each still appears in.
- **A Content-Security-Policy without `unsafe-inline`.** Nothing blocks it any
  more. AimaraJS's `oncontextmenu="return false;"` on the tree container used
  to be the last thing in the way; it is now a property assignment
  (`v_div.oncontextmenu = function () {...}`) in `lib/aimaraJS/lib/Aimara.js`
  instead of an attribute, which CSP does not treat as inline script.

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
