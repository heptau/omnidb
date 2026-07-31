/**
 * Publishes the server-rendered page configuration onto `window`.
 *
 * workspace.html used to carry roughly twenty-five separate `{{ }}`
 * substitutions, each dropped straight into a JavaScript string literal:
 *
 *     var v_user_name = '{{ user_name }}';
 *
 * Every one of those was a place where a value containing a quote, a newline
 * or `</script>` would break the page or worse, and the Go side had to keep a
 * hand-written escaper (and a special case for `user_name`, which appeared in
 * both an HTML text node and a JS string and therefore needed two different
 * escapings of the same value). They are now one JSON document in a
 * `<script type="application/json">` tag, which the browser never parses as
 * code and which json.Marshal escapes correctly by construction.
 *
 * These are assigned onto `window` rather than declared here on purpose. Much
 * of the workspace reassigns them at runtime -- `v_theme` when the user
 * switches themes, for instance -- and the bundle is not in strict mode, so a
 * bare `v_theme = 'dark'` anywhere in it writes straight through to the global
 * object. A module-level `let` here would shadow that for the rest of the
 * bundle and silently split the value in two.
 */
const el = document.getElementById('omnidb_bootstrap')
if (!el) {
  throw new Error('omnidb_bootstrap: the page config script tag is missing')
}
const cfg = JSON.parse(el.textContent)

Object.assign(window, {
  v_editor_theme: cfg.editor_theme,
  v_theme: cfg.theme,
  v_font_size: cfg.font_size,
  v_user_id: cfg.user_id,
  v_user_key: cfg.user_key,
  v_user_name: cfg.user_name,
  v_csv_encoding: cfg.csv_encoding,
  v_csv_delimiter: cfg.csv_delimiter,
  v_indent_unit: cfg.indent_unit,
  v_indent_char: cfg.indent_char,
  v_indent_size: cfg.indent_size,
  v_comma_style: cfg.comma_style,
  v_keyword_case: cfg.keyword_case,
  v_autocomplete_disabled_types: cfg.autocomplete_disabled_types,
  v_version: cfg.omnidb_version,
  v_short_version: cfg.omnidb_short_version,
  v_url_folder: cfg.url_folder,
  v_welcome_closed: cfg.welcome_closed,
  gv_desktopMode: cfg.desktop_mode,
  v_tab_token: cfg.tab_token,
  v_show_terminal_option: cfg.show_terminal_option,
  v_menu_item: cfg.menu_item,
  v_super_user: cfg.super_user,
  v_csrf_cookie_name: cfg.csrf_cookie_name,
  v_shortcuts: cfg.shortcuts,

  // Aliases the old inline block derived from the values above. Kept because
  // plenty of code reads them by these names.
  v_session_key: cfg.user_key,
  v_user_login: cfg.user_name,
})
