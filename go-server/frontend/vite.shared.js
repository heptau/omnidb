import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Shared build options for the workspace bundles.
 *
 * There are two, because the <script> tags they replace sit on opposite sides
 * of an inline classic script that must keep running between them -- see
 * README.md. Rollup cannot emit two IIFE bundles from one build (the format
 * has no way to express more than one entry), so each gets its own config and
 * they run in sequence.
 *
 * @param {{entry: string, fileName: string, name: string, emptyOutDir?: boolean}} opts
 */
export function workspaceBundle({ entry, fileName, name, emptyOutDir = false }) {
  return defineConfig(({ mode }) => ({
    build: {
      // Straight into the tree that static_assets.go's `//go:embed
      // all:static_assets` picks up, so a plain `go build ./go-server` keeps
      // working with no manifest lookup and no extra Go-side wiring. The
      // sources themselves live here in frontend/src/ instead, deliberately
      // OUTSIDE static_assets/ -- `all:` would otherwise embed node_modules
      // into the binary.
      outDir: here('../static_assets/OmniDB_app/dist'),
      // Only the first build in the sequence clears the directory; the second
      // would otherwise delete the first one's output. Nothing but these
      // builds ever writes there, so wiping it is safe even though it sits
      // outside Vite's root (which is what makes Vite ask for the flag).
      emptyOutDir,
      // The webview is Chromium/WebKit of a known-recent vintage in the
      // desktop shell, and the server mode targets current browsers. No need
      // to down-level anything.
      target: 'es2022',
      // Off for the committed build, on for the one that ships.
      //
      // dist/ lives in git permanently (see README.md), so a minified build
      // there would make every future commit an unreadable multi-megabyte
      // diff. The binary embeds dist/ though, and there minification is worth
      // having. So `npm run build` writes readable output for the repository
      // and `npm run build:release` overwrites it with minified output just
      // long enough for `go build` to embed it -- the Makefile restores the
      // readable one afterwards.
      //
      // Selected by Vite's --mode rather than an environment variable: the
      // Windows build runs these same scripts through cmd.exe, where
      // `VAR=1 cmd` is not a thing.
      minify: mode === 'release' ? 'esbuild' : false,
      // On in both. It is the only way to make sense of a stack trace from a
      // minified bundle, and the whole point of shipping one is that someone
      // eventually reports an error from it.
      sourcemap: true,
      lib: {
        entry: here(entry),
        // IIFE, NOT ES modules. `<script type="module">` is implicitly
        // deferred, and workspace.html has inline classic scripts that must
        // run in their existing positions relative to these bundles -- most
        // visibly `startLoading()` between the two of them, and the block of
        // template-substituted globals at the very bottom. An IIFE bundle is
        // an ordinary blocking script, so load semantics stay bit-identical
        // to the individual <script> tags it replaces.
        formats: ['iife'],
        name,
        fileName: () => fileName,
      },
      rollupOptions: {
        output: {
          // "use strict" is on. It was off through the migration because these
          // ~39k lines were written as sloppy-mode classic scripts and had
          // never been audited for the difference; the audit has since
          // happened, name by name:
          //
          //  - Implicit globals were the real blocker. All 46 are declared now
          //    (`i`, `v_node` and friends across the tree files), which strict
          //    mode is what keeps true from here on. The audit missed one:
          //    `v_current_os` had an ambient `declare let` in globals.d.ts,
          //    which silenced tsc without creating anything, so its bare
          //    assignment threw and took shortcuts.js's whole ready handler
          //    with it. `npm run check` now enforces that every `declare let`
          //    names a global something actually creates.
          //  - Strict-mode *syntax* was never at risk: these files carry
          //    `export`, so esbuild has always parsed them as ES modules,
          //    where duplicate parameter names, legacy octal literals and
          //    `with` are already errors. There are none.
          //  - No top-level `this`, so nothing depends on it being the global
          //    object.
          //  - Nothing assigns to another module's exported binding, which
          //    would now throw rather than silently do nothing.
          //  - renderers.js mutates `arguments[5]` and forwards `arguments` to
          //    the built-in renderer. Strict mode unmaps `arguments` from the
          //    named parameters, but none of those functions reads the named
          //    parameter afterwards, so the forwarded object still carries the
          //    value they meant to substitute.
          strict: true,
        },
      },
    },
  }))
}
