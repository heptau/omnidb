// @ts-check
/**
 * Entry point for the early bundle.
 *
 * These files load before the inline `startLoading()` call in workspace.html
 * and before the third-party libraries, so they cannot ride along in
 * main.js -- see README.md. ajax_control.js in particular reads
 * `#bt_cancel_ajax` out of the DOM at load time, so it also depends on
 * sitting where its <script> tag sat.
 */
import { exposeGlobals } from './legacy-globals.js'

import * as ajaxControl from './ajax_control.js'
import './context_menu_guard.js'

exposeGlobals(
  ajaxControl,
)

// Replaces the onclick="cancelAjax()" attribute on the loading overlay's Cancel
// button. It has to be *this* bundle's copy of ajax_control.js: login.js has
// its own real copy too (login.html never loads this bundle, so no conflict
// there), but every file in the main bundle imports execAjax and friends from
// ajax_control_bridge.js instead of ajax_control.js directly, forwarding to
// `window.execAjax` etc -- what this button reaches -- so this is the only
// instance running on workspace.html and its cancelAjax can abort anything
// the main bundle starts too.
if (ajaxControl.v_cancel_button) {
  ajaxControl.v_cancel_button.addEventListener('click', ajaxControl.cancelAjax)
}
