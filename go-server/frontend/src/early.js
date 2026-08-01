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
