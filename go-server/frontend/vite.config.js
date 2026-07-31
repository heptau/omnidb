import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  build: {
    // Straight into the tree that static_assets.go's `//go:embed
    // all:static_assets` picks up, so a plain `go build ./go-server` keeps
    // working with no manifest lookup and no extra Go-side wiring. The
    // sources themselves live here in frontend/src/ instead, deliberately
    // OUTSIDE static_assets/ -- `all:` would otherwise embed node_modules
    // into the binary.
    outDir: here('../static_assets/OmniDB_app/dist'),
    // Nothing but this build's own output ever lands in dist/, so wiping it
    // is safe even though it sits outside Vite's root (which is what makes
    // Vite ask for the flag explicitly).
    emptyOutDir: true,
    // The webview is Chromium/WebKit of a known-recent vintage in the
    // desktop shell, and the server mode targets current browsers. No need
    // to down-level anything.
    target: 'es2022',
    // Deliberately off for now. The whole point of the file-by-file
    // migration is that each commit's dist/ diff can be eyeballed against
    // the source change that produced it; minified output makes that
    // impossible. Turn this on once every file has moved.
    minify: false,
    sourcemap: true,
    lib: {
      entry: here('src/main.js'),
      // IIFE, NOT ES modules. `<script type="module">` is implicitly
      // deferred, and workspace.html has inline classic scripts that must
      // run in their existing positions relative to this bundle -- most
      // visibly `startLoading()` right after the early scripts, and the
      // block of template-substituted globals at the very bottom. An IIFE
      // bundle is an ordinary blocking script, so load semantics stay
      // bit-identical to the individual <script> tags it replaces.
      formats: ['iife'],
      name: 'OmniDBWorkspaceBundle',
      fileName: () => 'omnidb.bundle.js',
    },
    rollupOptions: {
      output: {
        // No "use strict" pragma. ES modules are always strict, but the
        // ~39k lines being migrated were written as sloppy-mode classic
        // scripts and have never been audited for the differences
        // (implicit globals, top-level `this`, duplicate parameter names).
        // Rollup would otherwise wrap the bundle in a strict IIFE and turn
        // every one of those into a runtime error. Revisit once the
        // migration is finished and the code can be checked deliberately.
        strict: false,
      },
    },
  },
})
