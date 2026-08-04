// @ts-check
/**
 * The login page's own behaviour: field validation, sign-in, and the bindings
 * for the three controls on the form.
 *
 * This used to be an inline `<script>` at the bottom of static/login.html, with
 * `onchange=`/`onkeydown=`/`onclick=` attributes pointing at it. It is here so
 * the page carries no executable markup -- the same reason the workspace's
 * handlers moved into dom_event_bindings.js. See README.md.
 *
 * v_url_folder and v_csrf_cookie_name stay in the page: they are server-rendered
 * values, and ajax_control.js reads them off `window`.
 */
import { cancelAjax, execAjax, v_cancel_button } from './ajax_control.js'
import { checkSessionMessage, showAlert } from './notification_control.js'

/**
 * Marks the field's wrapper empty or not, which is what the label animation and
 * the red outline are driven from.
 *
 * @param {HTMLInputElement | null} field
 */
export function validateField(field) {
  if (!field) return
  const parent = field.parentElement
  if (!parent) return
  if (field.value !== null && field.value !== '') {
    parent.classList.remove('isEmpty')
  } else {
    parent.classList.add('isEmpty')
  }
}

/** @returns {HTMLInputElement} */
const userField = () => /** @type {HTMLInputElement} */ (document.getElementById('txt_user'))
/** @returns {HTMLInputElement} */
const pwdField = () => /** @type {HTMLInputElement} */ (document.getElementById('txt_pwd'))

/**
 * Marks every empty field and reports whether any was.
 *
 * The original wrote `{el: field, val: field.value}` objects and then tested the
 * *object* against null and '', which is never true -- so it marked nothing and
 * always reported no errors, and sign-in went ahead with empty fields for the
 * server to reject. The fields themselves are tested now.
 */
function markEmptyFields() {
  let anyEmpty = false
  for (const field of [userField(), pwdField()]) {
    if (!field || field.value === '') anyEmpty = true
    validateField(field)
  }
  return anyEmpty
}

export function signIn() {
  const user = userField()
  const pwd = pwdField()
  user.blur()
  pwd.blur()

  if (markEmptyFields()) return

  execAjax(
    '/sign_in/',
    JSON.stringify({ p_username: user.value, p_pwd: pwd.value }),
    function (p_return) {
      if (p_return.v_data >= 0) {
        window.open(v_url_folder + '/workspace', '_self')
      } else if (p_return.v_data == -2) {
        showAlert('Invalid authentication token, use omnidb-server to support multiple users.')
      } else {
        showAlert('Invalid username or password.')
      }
    },
    null,
    'box',
  )
}

/**
 * Wires the form and does the page's startup work.
 *
 * Called from login.js *after* exposeGlobals, not at module evaluation, and that
 * ordering is load-bearing: notification_control.js's checkSessionMessage calls
 * execAjax as a bare global (it is one of the three files that appear in more
 * than one bundle and so cannot import from each other -- see README.md), so it
 * throws ReferenceError until exposeGlobals has published it. The inline script
 * this replaces got the same ordering for free by sitting in $(document).ready.
 *
 * The bundle's <script> tag is at the bottom of the page, below the form, so
 * every element already exists by the time this runs.
 */
export function initLoginPage() {
  checkSessionMessage()
  markEmptyFields()

  for (const field of [userField(), pwdField()]) {
    if (!field) continue
    field.addEventListener('change', () => validateField(field))
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') signIn()
    })
  }

  const signInButton = document.getElementById('bt_sign_in')
  if (signInButton) signInButton.addEventListener('click', () => signIn())

  // Replaces the onclick="cancelAjax()" attribute on the loading overlay's
  // Cancel button. workspace.html's copy is bound from early.js, for the reason
  // explained there.
  if (v_cancel_button) {
    v_cancel_button.addEventListener('click', cancelAjax)
  }
}
