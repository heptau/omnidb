// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

The MIT License (MIT)

Portions Copyright (c) 2015-2026, The OmniDB Team
Portions Copyright (c) 2017-2026, 2ndQuadrant Limited
Portions Copyright (c) 2025-2026, Zbyněk Vanžura

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { t } from "./i18n.js";

//Number of active AJAX calls
export var v_calls_count = 0;
export var v_is_loading = false;

/**
 * Used to add a loading gif modal above page content.
 */
export function startLoading() {
	v_calls_count++;
	if (!v_is_loading) {
		/** @type {HTMLElement} */ (document.getElementById("div_loading")).style.display = "block";
		v_is_loading = true;
	}
}

/**
 * Used to remove a loading gif modal above page content.
 */
export function endLoading() {
	if (v_calls_count > 0) {
		v_calls_count--;
	}

	if (v_calls_count == 0) {
		/** @type {HTMLElement} */ (document.getElementById("div_loading")).style.display = "none";
		v_is_loading = false;
	}
}

/**
 * Headers for a raw fetch() JSON POST to this backend: the same
 * X-CSRFToken double-submit header execAjax attaches, which every
 * non-safe-method route requires (see go-server/native_session.go's
 * requireCSRF).
 * @returns {Record<string, string>}
 */
export function jsonPostHeaders() {
	return {
		"Content-Type": "application/json",
		"X-CSRFToken": getCookie(v_csrf_cookie_name) || "",
	};
}

/**
 * Used to get a cookie value from document, based on cookie name.
 * @param {string} name - the name of the cookie in the document.
 * @returns {string|null} cookie value, if exists.
 */

export function getCookie(name) {
	/** @type {string|null} */
	var cookieValue = null;

	if (document.cookie && document.cookie !== "") {
		var cookies = document.cookie.split(";");

		for (var i = 0; i < cookies.length; i++) {
			var cookie = cookies[i].trim();

			// Does this cookie string begin with the name we want?
			if (cookie.substring(0, name.length + 1) === name + "=") {
				cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
				break;
			}
		}
	}

	return cookieValue;
}

/**
 * Used to get see if a http request is one of: GET, HEAD, OPTIONS, TRACE.
 * @param {string} method - the method to be checked.
 * @returns {boolean} if the http request is one of GET, HEAD, OPTIONS, TRACE or not.
 */
export function csrfSafeMethod(method) {
	return /^(GET|HEAD|OPTIONS|TRACE)$/.test(method);
}

/** @type {any} */
export var v_ajax_call = null;
export var v_cancel_button = document.getElementById("bt_cancel_ajax");

/**
 * Abort last ajax call.
 */
export function cancelAjax() {
	if (v_ajax_call != null) {
		v_ajax_call.abort();
	}
}

/**
 * ## execAjax
 * @desc Used to execute an AJAX call.
 *
 * Everything past p_data is optional -- the body guards each one with a null
 * check -- and most call sites stop after p_notifMode. The @param types say so
 * now; they used to be unconditional, which made every short call a type error.
 *
 * @param {String} p_url - The url of the view to be executed.
 * @param {Object} p_data - A JavaScript object containing anything you want to pass as parameter to the server. Must be in JSON.stringify format.
 * @param {Function|null} [p_successFunc] - A callback to be called if AJAX call succeeds.
 * @param {Function|null} [p_errorFunc] - A callback to be called if AJAX call succeeds but returns with errors.
 * @param {String|null} [p_notifMode] - The notification mode of this call.
 * @param {Boolean|null} [p_loading] - If this AJAX call should add a loading gif or not.
 * @param {Boolean|null} [p_cancel_button] - If the cancel button must be displayed or not.
 * @param {Function|false} [p_onAjaxErrorCallBack] - A callback to be called on AJAX error. Ex: connectivity issue.
 * @return {any} Contextual callback returns based on status cases and returned data.
 */
export function execAjax(
	p_url,
	p_data,
	p_successFunc,
	p_errorFunc,
	p_notifMode,
	p_loading,
	p_cancel_button,
	p_onAjaxErrorCallBack = false,
) {
	// Starting the load animation if requested.
	if (p_loading == null || p_loading == true) {
		startLoading();
	}
	// Showing the cancel button during the ajax if requested.
	if (v_cancel_button != null) {
		v_cancel_button.style.display = "none";

		if (p_cancel_button != null && p_cancel_button == true) {
			v_cancel_button.style.display = "block";
		}
	}
	// Requesting data with fetch. The returned handle mimics the two bits of
	// jqXHR the callers still rely on: abort() and readyState (0 = idle or
	// aborted, 1 = in flight, 4 = finished -- long_polling.js polls it).
	var v_controller = new AbortController();
	var v_handle = {
		readyState: 1,
		abort: function () {
			v_handle.readyState = 0;
			v_controller.abort();
		},
	};
	v_ajax_call = v_handle;

	var v_finishLoading = function () {
		// Terminating the load animation.
		if (p_loading == null || p_loading == true) {
			endLoading();
		}
	};
	var v_fail = function (msg) {
		v_finishLoading();
		// Calling the optional function assigned as a callback if the ajax request fails.
		if (p_onAjaxErrorCallBack) {
			p_onAjaxErrorCallBack(msg);
		} else {
			// Prompting error messages related to ajax error.
			if (msg.readyState != 0) {
				showAlert(t("errors.request_error"));
			} else {
				if (msg.statusText != "abort") {
					reportOffline();
				}
			}
		}
	};

	(async function () {
		var p_return;
		try {
			var v_response = await fetch(v_url_folder + p_url, {
				method: "POST",
				// URLSearchParams sets the form-urlencoded Content-Type itself.
				body: new URLSearchParams({
					data: typeof p_data === "string" ? p_data : JSON.stringify(p_data),
					tab_token: "",
				}),
				headers: { "X-CSRFToken": getCookie(v_csrf_cookie_name) || "" },
				signal: v_controller.signal,
			});
			if (!v_response.ok) {
				v_handle.readyState = 4;
				v_fail({ readyState: 4, status: v_response.status, statusText: v_response.statusText });
				return;
			}
			p_return = await v_response.json();
		} catch (e) {
			var err = /** @type {any} */ (e);
			if (err && err.name === "AbortError") {
				v_handle.readyState = 0;
				v_fail({ readyState: 0, status: 0, statusText: "abort" });
			} else if (err instanceof SyntaxError) {
				// Reached the server but the body wasn't JSON (jQuery's "parsererror").
				v_handle.readyState = 4;
				v_fail({ readyState: 4, status: 200, statusText: "parsererror" });
			} else {
				// Network failure -- the server is unreachable.
				v_handle.readyState = 0;
				v_fail({ readyState: 0, status: 0, statusText: "error" });
			}
			return;
		}
		v_handle.readyState = 4;

		// Callbacks run outside the try above, so an exception thrown by one of
		// them is not mistaken for a request failure.
		v_finishLoading();
		// Intercepting the workflow when the request returns with evaluated server errors.
		if (p_return.v_error) {
			if (p_return.v_error_id == 1) {
				showAlert(t("errors.not_authenticated"));
			} else if (p_errorFunc) {
				p_errorFunc(p_return);
			} else {
				showAlert(p_return.v_data);
			}
		}
		// Resuming the workflow with the success callback function.
		else {
			if (p_successFunc != null) {
				p_successFunc(p_return);
			}
		}
	})();

	return v_ajax_call;
}

/**
 * Reporting that webserver is off.
 */
export function reportOffline() {
	showAlert(t("errors.webserver_shutdown"));
	var v_status_img = document.getElementById("ajax_status");
}
