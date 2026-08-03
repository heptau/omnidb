// @ts-check
/**
 * Event bindings for the static markup in workspace.html.
 *
 * Every entry below replaces an `on*=` attribute that used to sit on the
 * element. Those attributes are evaluated against the global scope, which is
 * the last thing keeping the legacy-globals bridge alive -- and the reason this
 * frontend cannot adopt a Content-Security-Policy without `unsafe-inline`.
 * Handlers here are ordinary imports instead, so a rename that breaks one is a
 * build error rather than a click that silently does nothing.
 *
 * This file covers workspace.html only. The handlers built as HTML strings
 * inside JS and injected with innerHTML are the larger remaining half; see
 * README.md.
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
import { editMonitorUnit } from './monitoring.js'
import { startSetShortcut } from './shortcuts.js'
import { listUsers } from './users.js'

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
// comment there for why it has to be that bundle's copy of ajax_control.js.
