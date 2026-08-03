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
// button. It has to be *this* bundle's copy of ajax_control.js: the file ends up
// in all three bundles, so workspace.html loads two independent instances of it,
// each with its own `v_ajax_call`. main.js does not expose ajaxControl, so
// `window.execAjax` -- what the inline handlers and this button used to reach --
// is the early copy, and only the early copy's cancelAjax can abort what it
// started. (Requests made through `import { execAjax }` inside the main bundle
// use the other instance and have never been cancellable. Pre-existing; fixing
// it means having one instance, not one per bundle.)
if (ajaxControl.v_cancel_button) {
  ajaxControl.v_cancel_button.addEventListener('click', ajaxControl.cancelAjax)
}
