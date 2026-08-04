// @ts-check
/**
 * Entry point for the login page's bundle.
 *
 * static/login.html is a separate page from the workspace and only ever loaded
 * three of these files. It gets its own bundle rather than the workspace's
 * 1.2 MB one, which it has no use for.
 *
 * login_page.js holds what used to be the page's own inline <script>. Its
 * startup runs *after* exposeGlobals -- see the comment on initLoginPage for why
 * that order matters. The page carries no executable markup now.
 */
import { exposeGlobals } from './legacy-globals.js'

import * as notificationControl from './notification_control.js'
import * as ajaxControl from './ajax_control.js'
import './context_menu_guard.js'
import { initLoginPage } from './login_page.js'

exposeGlobals(
  notificationControl,
  ajaxControl,
)

initLoginPage()
