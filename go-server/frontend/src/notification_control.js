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


// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var v_message_modal_animating, v_message_modal_queued, v_message_modal_queued_function, v_shown_callback;

// The message modal's markup is always present in workspace.html/login.html,
// so these ids are guaranteed to resolve -- this just gets that past tsc
// without a cast at every call site.
/** @param {string} id @returns {HTMLElement} */
function el(id) {
	return /** @type {HTMLElement} */ (document.getElementById(id));
}

export function checkSessionMessage() {
	execAjax(
		"/check_session_message/",
		JSON.stringify({}),
		function (p_return) {
			if (p_return.v_data != "") showAlert(p_return.v_data);
		},
		null,
		"box",
	);
}

/// <summary>
/// Startup function.
/// </summary>
function initMessageModal() {
	v_message_modal_animating = false;
	v_message_modal_queued = false;
	v_message_modal_queued_function = null;
	v_shown_callback = null;
	// Bootstrap dispatches these as real DOM events, no jQuery needed to listen for them.
	var v_modal_message = el("modal_message");
	v_modal_message.addEventListener("hide.bs.modal", function (e) {
		v_message_modal_animating = true;
	});
	v_modal_message.addEventListener("show.bs.modal", function (e) {
		v_message_modal_animating = true;
	});
	v_modal_message.addEventListener("hidden.bs.modal", function (e) {
		el("modal_message_content").innerHTML = "";
		v_message_modal_animating = false;
		if (v_message_modal_queued == true) {
			if (v_message_modal_queued_function != null) v_message_modal_queued_function();
			bootstrap.Modal.getOrCreateInstance(v_modal_message).show();
		}
		v_message_modal_queued = false;
		v_message_modal_queued_function = null;
	});
	v_modal_message.addEventListener("shown.bs.modal", function (e) {
		v_message_modal_animating = false;
		if (v_shown_callback) {
			v_shown_callback();
			v_shown_callback = null;
		}
	});
}
// This body only registers listeners on a static modal already present in
// workspace.html/login.html at page load, so a single deferred tick is
// enough -- see passwords.js's initPasswordModal for the same shape.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMessageModal);
else setTimeout(initMessageModal, 0);

/**
 * @param {(() => void)|null} [p_content_function]
 * @param {boolean|null} [p_large]
 */
export function showMessageModal(p_content_function, p_large) {
	var v_dialog = el("modal_message_dialog");

	if (p_large == null || p_large == false) {
		v_dialog.classList.remove("modal-xl");
	} else {
		v_dialog.classList.add("modal-xl");
	}

	if (!v_message_modal_animating) {
		if (p_content_function != null) p_content_function();
		bootstrap.Modal.getOrCreateInstance(el("modal_message")).show();
	} else {
		v_message_modal_queued = true;
		v_message_modal_queued_function = p_content_function;
	}
}

/** @param {string} p_message */
export function showError(p_message) {
	var v_content_div = el("modal_message_content");
	var v_button_yes = el("modal_message_yes");
	var v_button_ok = el("modal_message_ok");
	var v_button_no = el("modal_message_no");
	var v_button_cancel = el("modal_message_cancel");

	v_content_div.textContent = p_message;

	v_button_yes.style.display = "none";
	v_button_ok.style.display = "";
	v_button_no.style.display = "none";
	v_button_cancel.style.display = "none";

	showMessageModal();

	setTimeout(function () {
		v_button_yes.focus();
	}, 500);
}

/**
 * @param {string} p_info
 * @param {(() => void)|null} [p_funcYes]
 * @param {boolean|null} [p_large]
 * @param {boolean} [p_is_html]
 */
export function showAlert(p_info, p_funcYes = null, p_large = null, p_is_html = false) {
	var v_create_content_function = function () {
		var v_content_div = el("modal_message_content");
		var v_button_yes = el("modal_message_yes");
		var v_button_ok = el("modal_message_ok");
		var v_button_no = el("modal_message_no");
		var v_button_cancel = el("modal_message_cancel");

		// p_is_html is only for callers passing pre-built markup they wrote
		// themselves (static strings, or dynamic values already HTML-escaped
		// before being embedded - see uiCopyTextToClipboard). Every other
		// caller passes plain text, often straight from a server response, so
		// textContent stays the default to avoid rendering it as markup.
		if (p_is_html) {
			v_content_div.innerHTML = p_info;
		} else {
			v_content_div.textContent = p_info;
		}

		v_button_ok.onclick = function () {
			if (p_funcYes != null) p_funcYes();
		};

		v_button_yes.style.display = "none";
		v_button_ok.style.display = "";
		v_button_no.style.display = "none";
		v_button_cancel.style.display = "none";
	};

	showMessageModal(v_create_content_function, p_large);
}

/**
 * @param {string} p_info
 * @param {(() => void)|null} [p_funcYes]
 * @param {(() => void)|null} [p_funcNo]
 * @param {(() => void)|null} [p_shownCallback]
 * @param {boolean|null} [p_large]
 * @param {string|null} [p_yes_label] Overrides the affirmative button's label
 * (default "Ok") -- e.g. "Delete", so a destructive confirmation names the
 * actual action instead of a generic acknowledgement.
 */
export function showConfirm(p_info, p_funcYes = null, p_funcNo = null, p_shownCallback = null, p_large = null, p_yes_label = null) {
	var v_create_content_function = function () {
		if (p_shownCallback != null) v_shown_callback = p_shownCallback;

		var v_content_div = el("modal_message_content");
		var v_button_yes = el("modal_message_yes");
		var v_button_ok = el("modal_message_ok");
		var v_button_no = el("modal_message_no");
		var v_button_cancel = el("modal_message_cancel");

		v_content_div.textContent = p_info;
		v_button_ok.textContent = p_yes_label || "Ok";

		v_button_ok.onclick = function () {
			if (p_funcYes != null) p_funcYes();
		};

		v_button_cancel.onclick = function () {
			if (p_funcNo) p_funcNo();
		};

		v_button_yes.style.display = "none";
		v_button_no.style.display = "none";
		v_button_ok.style.display = "";
		v_button_cancel.style.display = "";
	};

	showMessageModal(v_create_content_function, p_large);
}

/**
 * @param {string} p_info
 * @param {() => void} p_funcYes
 * @param {(() => void)|null} [p_funcNo]
 */
export function showConfirm2(p_info, p_funcYes, p_funcNo) {
	var v_content_div = el("modal_message_content");
	var v_button_yes = el("modal_message_yes");
	var v_button_ok = el("modal_message_ok");
	var v_button_no = el("modal_message_no");
	var v_button_cancel = el("modal_message_cancel");

	v_content_div.textContent = p_info;

	v_button_yes.onclick = function () {
		p_funcYes();
	};

	v_button_no.onclick = function () {
		if (p_funcNo != null) {
			p_funcNo();
		}
	};

	v_button_cancel.onclick = function () {};

	v_button_yes.style.display = "";
	v_button_no.style.display = "";
	v_button_ok.style.display = "none";
	v_button_cancel.style.display = "";

	showMessageModal();
}

/**
 * @param {string} p_info
 * @param {() => void} p_funcYes
 * @param {(() => void)|null} [p_funcNo]
 */
export function showConfirm3(p_info, p_funcYes, p_funcNo) {
	var v_content_div = el("modal_message_content");
	var v_button_yes = el("modal_message_yes");
	var v_button_ok = el("modal_message_ok");
	var v_button_no = el("modal_message_no");
	var v_button_cancel = el("modal_message_cancel");

	v_content_div.textContent = p_info;

	v_button_yes.onclick = function () {
		p_funcYes();
	};

	v_button_no.onclick = function () {
		if (p_funcNo != null) {
			p_funcNo();
		}
	};

	v_button_yes.style.display = "";
	v_button_no.style.display = "";
	v_button_ok.style.display = "none";
	v_button_cancel.style.display = "none";

	showMessageModal();
}
