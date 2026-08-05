// @ts-check
/**
 * Replaces the `<script src=".../lib/bootstrap/bootstrap.min.js">` tag with
 * the real npm package, published on `window` in the same spot on both pages.
 *
 * Named "framework" and not just "bootstrap-global.js" to keep it well away
 * from bootstrap-globals.js, which is unrelated: that one publishes the
 * server-rendered page configuration, not the Bootstrap UI framework.
 *
 * The vendored file was `bootstrap.bundle.min.js` (Popper included) renamed
 * to `bootstrap.min.js` -- checked by hash. Importing the plain `bootstrap`
 * package (its ESM build, real named exports) plus `@popperjs/core` as an
 * ordinary dependency gets the same Popper-included behavior through the
 * bundler instead, with actual tree-shaking of unused components.
 */
import * as bootstrap from 'bootstrap'

window.bootstrap = bootstrap
