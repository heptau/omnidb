// @ts-check
/**
 * Replaces the `<script src=".../lib/moment/moment.min.js">` tag with the real
 * npm package, published on `window` in the same spot in workspace.html.
 *
 * daterangepicker.js sits in the next `<script>` tag and is not migrated yet:
 * as a plain script (no AMD/CommonJS loader present) its UMD wrapper falls
 * through to `root.moment`, so it needs the global to exist before its own
 * tag runs. console.js and command_history.js -- the only other consumers --
 * `import moment from 'moment'` directly instead of reading this global.
 */
import moment from 'moment'

window.moment = moment
