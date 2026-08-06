// @ts-check
/**
 * Event bindings for the static markup in workspace.html, plus the delegated
 * dispatcher used by markup that is generated as a string somewhere else.
 *
 * Every entry below replaces an `on*=` attribute that used to sit on the
 * element. Those attributes are evaluated against the global scope, which is
 * the last thing keeping the legacy-globals bridge alive -- and the reason this
 * frontend cannot adopt a Content-Security-Policy without `unsafe-inline`.
 * Handlers here are ordinary imports instead, so a rename that breaks one is a
 * build error rather than a click that silently does nothing.
 *
 * Order does not matter: it is imported from main.js, whose <script> tag sits
 * below all of this markup, so every element already exists.
 */
import {
  deleteGroup,
  groupChange,
  manageGroup,
  manageGroupSave,
  newConnection,
  newGroup,
  renameGroup,
  saveConnection,
  startConnectionManagement,
  testConnection,
  toggleConnectionsPublic,
  updateConnectionKey,
  updateModalEditConnectionState,
} from './connections.js'
import {
  changeInterfaceFontSize,
  confirmSignout,
  saveConfigUser,
  saveShortcuts,
  setAllAutocompleteTypeCheckboxes,
  showAbout,
  showConfigUser,
  showWebsite,
  updateIndentUnit,
} from './header_actions.js'
import { deleteMonitorUnit, editMonitorUnit, includeMonitorUnit } from './monitoring.js'
import { startSetShortcut } from './shortcuts.js'
import { deleteRowEditData } from './tree_context_functions/edit_data.js'
import { startTutorial } from './tutorial_functions/tutorial.js'
import { listUsers } from './users.js'
import { monitoringAction } from './workspace.js'

// --- delegated actions, for markup this file cannot reach -------------------
//
// Most converted handlers are bound where their markup is written. Some cannot
// be: a tutorial step's buttons are authored in tutorial.js but injected by
// omnis-control.js, and a grid's row-action icon is authored as cell *data* and
// re-rendered by the grid whenever it likes. Those elements carry
//
//     data-omnidb-action="start-tutorial" data-omnidb-arg="connection_tab"
//
// instead of an `on*=` attribute, and the one listener below resolves the action
// name against the table. A name that is not in the table does nothing, so this
// is an allowlist and not an eval -- the same shape workspace.js's
// v_monitoring_action_whitelist already uses for monitoring row actions.
//
// One listener on `document`, installed once, so it also catches markup
// injected long after this module ran.

/** @param {Element} el */
const arg = (el) => el.getAttribute('data-omnidb-arg')
/** @param {Element} el */
const numArg = (el) => parseInt(el.getAttribute('data-omnidb-id') || '', 10)

/** @type {Record<string, (el: Element, event: Event) => void>} */
const DELEGATED_CLICK = {
  'start-tutorial': (el) => startTutorial(arg(el)),

  // Edit data's row-action column. deleteRowEditData takes no arguments -- it
  // reads the grid's selected row, and VirtualGrid's own mousedown handler on
  // the cell has already selected it by the time this click lands.
  'edit-data-delete-row': () => deleteRowEditData(),

  // A monitoring grid's row action (Terminate backend and friends). The row
  // index is baked in at render time, exactly as the attribute did it;
  // monitoringAction resolves the function name against its own allowlist.
  'monitoring-action': (el) => monitoringAction(numArg(el), arg(el)),

  // The monitoring units dialog. These three come from markup the *server*
  // builds (monitoring_handlers.go) -- it emits the data attributes now instead
  // of an onclick, so the last inline handlers on the Go side are gone too.
  'include-monitor-unit': (el) => includeMonitorUnit(numArg(el), arg(el) || undefined),
  'edit-monitor-unit': (el) => editMonitorUnit(numArg(el)),
  'delete-monitor-unit': (el) => deleteMonitorUnit(numArg(el)),
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const el = target.closest('[data-omnidb-action]')
  if (!el) return
  const handler = DELEGATED_CLICK[el.getAttribute('data-omnidb-action') || '']
  if (handler) handler(el, event)
})

/**
 * @param {string} id
 * @param {string} type
 * @param {(e: Event) => void} handler
 */
function bind(id, type, handler) {
  const el = document.getElementById(id)
  // Missing is legitimate: the template wraps the Users and Sign out links in
  // `{% if not desktop_mode %}`, so the desktop build never renders them.
  if (el) el.addEventListener(type, handler)
}

/**
 * @param {string} selector
 * @param {string} type
 * @param {(e: Event) => void} handler
 */
function bindAll(selector, type, handler) {
  document.querySelectorAll(selector).forEach((el) => el.addEventListener(type, handler))
}

// --- header ----------------------------------------------------------------
//
// These are `<a href="#">`, and the attributes they replace did not return
// false, so the fragment navigation they cause is left as it was.
bind('omnidb__utilities-menu__link-connections', 'click', () => startConnectionManagement())
bind('omnidb__utilities-menu__link-user', 'click', () => listUsers())
bind('omnidb__utilities-menu__link-config', 'click', () => showConfigUser())
bind('omnidb__utilities-menu__link-about', 'click', () => showAbout())
bind('omnidb__utilities-menu__link-signout', 'click', () => confirmSignout())

// --- connections modal -----------------------------------------------------
bind('button_new_connection', 'click', () => newConnection())
bind('group_selector', 'change', (e) => groupChange(/** @type {HTMLSelectElement} */ (e.target).value))
bind('button_new_group', 'click', () => newGroup())
bind('button_group_rename', 'click', () => renameGroup())
bind('button_group_manage', 'click', () => manageGroup())
bind('button_group_delete', 'click', () => deleteGroup())
bind('button_manage_group_save', 'click', () => manageGroupSave())
bind('conn_list_public', 'change', () => toggleConnectionsPublic())

// --- edit connection modal -------------------------------------------------
//
// updateModalEditConnectionState reads e.target.id to decide which half of the
// form to enable, so it gets the event itself rather than a wrapper.
for (const id of [
  'conn_form_type',
  'conn_form_server',
  'conn_form_port',
  'conn_form_database',
  'conn_form_user',
  'conn_form_connstring',
  'conn_form_use_tunnel',
  'conn_form_ssh_server',
  'conn_form_ssh_port',
  'conn_form_ssh_user',
]) {
  bind(id, 'input', updateModalEditConnectionState)
}
bind('conn_form_ssh_password', 'input', updateConnectionKey)
bind('conn_form_ssh_key_input', 'change', updateConnectionKey)
bind('conn_form_button_test_connection', 'click', () => testConnection())
bind('conn_form_button_save_connection', 'click', () => saveConnection())

// --- about modal -----------------------------------------------------------
bind('about_link_website', 'click', () => showWebsite('OmniDB', 'https://www.omnidb.net'))
bind('about_link_github', 'click', () => showWebsite('GitHub', 'https://github.com/heptau/omnidb'))

// --- monitoring units modal ------------------------------------------------
bind('button_new_monitor_unit', 'click', () => editMonitorUnit())

// --- settings: shortcuts ---------------------------------------------------
//
// By prefix rather than by listing ten ids, so adding a shortcut row to the
// template needs no change here. The Save button is `button_save_shortcuts`
// and so does not match.
bindAll('#config_shortcuts button[id^="shortcut_"]', 'click', (e) =>
  startSetShortcut(e.currentTarget),
)
bind('button_save_shortcuts', 'click', () => saveShortcuts())

// --- settings: options -----------------------------------------------------
bind('sel_interface_font_size', 'change', (e) =>
  changeInterfaceFontSize(/** @type {HTMLInputElement} */ (e.target).value),
)
// The `return false;` these carried is why they get preventDefault -- they are
// `<a href="#">` and the fragment jump would scroll the modal body.
bind('link_autocomplete_all', 'click', (e) => {
  e.preventDefault()
  setAllAutocompleteTypeCheckboxes(true)
})
bind('link_autocomplete_none', 'click', (e) => {
  e.preventDefault()
  setAllAutocompleteTypeCheckboxes(false)
})

// --- settings: formatting --------------------------------------------------
bindAll('input[name="indent_char"], input[name="indent_size"]', 'change', () => updateIndentUnit())
bindAll('input[name="comma_style"]', 'change', (e) => {
  v_comma_style = /** @type {HTMLInputElement} */ (e.target).value
})
bindAll('input[name="keyword_case"]', 'change', (e) => {
  v_keyword_case = /** @type {HTMLInputElement} */ (e.target).value
})

// --- settings: all three tabs share one Save ------------------------------
bindAll('.omnidb__save-config-user', 'click', () => saveConfigUser())

// The loading overlay's Cancel button is bound in early.js, not here -- see the
// comment there. It can still abort requests started from this bundle: every
// file here imports execAjax from ajax_control_bridge.js, which forwards to
// early.js's instance instead of bundling its own.
