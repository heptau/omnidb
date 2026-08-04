// @ts-check
/**
 * Replaces the `<script src=".../lib/jquery/jquery.min.js">` tag with the
 * real npm package, published on `window` in the same spot on both pages.
 *
 * Byte-identical to the vendored copy (jQuery 3.7.1, checked by hash), so this
 * is a pure delivery-mechanism swap. Every one of the ~39k lines of workspace
 * and login code that reads the bare `$`/`jQuery` globals keeps doing so --
 * migrating every call site to a real import is a separate, much larger
 * change (see globals.d.ts) and out of scope here. This has to publish the
 * global before anything else runs: it is the very first `<script>` tag on
 * both pages, ahead of early.js, login.js and bootstrap.min.js.
 */
import $ from 'jquery'

window.$ = $
window.jQuery = $
