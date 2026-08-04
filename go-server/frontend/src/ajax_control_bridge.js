// @ts-check
/**
 * Forwards to the early bundle's ajax_control.js instance.
 *
 * workspace.html loads omnidb.early.js and omnidb.bundle.js as two independent
 * IIFE builds (see vite.shared.js), so importing ajax_control.js directly from
 * a file that ends up in the main bundle would give it a second copy of the
 * module -- its own v_ajax_call and v_cancel_button, disconnected from
 * early.js's. The loading overlay's Cancel button is wired to early.js's
 * cancelAjax, so a request started through that second copy could never be
 * aborted by it.
 *
 * early.js's `exposeGlobals(ajaxControl)` call publishes its instance onto
 * `window` before this bundle runs. Every file here should import from this
 * file instead of ajax_control.js directly, so every workspace request goes
 * through the one instance the Cancel button actually knows about.
 *
 * `window.` is not optional here: a bare reference to a name this module also
 * exports binds to its own export, not the global.
 */

/** @type {typeof import('./ajax_control.js').execAjax} */
export function execAjax(...args) {
	return window.execAjax(...args);
}

/** @type {typeof import('./ajax_control.js').startLoading} */
export function startLoading(...args) {
	return window.startLoading(...args);
}

/** @type {typeof import('./ajax_control.js').endLoading} */
export function endLoading(...args) {
	return window.endLoading(...args);
}

/** @type {typeof import('./ajax_control.js').getCookie} */
export function getCookie(...args) {
	return window.getCookie(...args);
}

/** @type {typeof import('./ajax_control.js').csrfSafeMethod} */
export function csrfSafeMethod(...args) {
	return window.csrfSafeMethod(...args);
}
