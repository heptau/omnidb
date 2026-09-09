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

/// <summary>
/// Startup function.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var v_modal_password_cancel_callback, v_modal_password_input, v_modal_password_ok_after_hide_function, v_modal_password_ok_clicked, v_modal_password_ok_function;

/**
 * Set by showPasswordPrompt for the connection currently being
 * (re)authenticated -- null whenever that connection isn't postgresql, or
 * isn't in the currently-loaded connection list at all, in which case the
 * .pgpass row stays hidden.
 * @type {{server: string, port: string, database: string, username: string}|null}
 */
var v_pgpass_lookup_info = null;

/** @param {string} id @returns {any} */
function el(id) {
	return document.getElementById(id);
}

function initPasswordModal() {
	// Bootstrap dispatches these as real DOM events, no jQuery needed to listen for them.
	var v_modal_password = /** @type {HTMLElement} */ (document.getElementById("modal_password"));
	v_modal_password.addEventListener("hidden.bs.modal", function (e) {
		if (v_modal_password_ok_clicked != true && v_modal_password_cancel_callback != null) {
			v_modal_password_cancel_callback();
		} else if (v_modal_password_ok_clicked == true && v_modal_password_ok_after_hide_function != null) {
			v_modal_password_ok_after_hide_function();
		}
	});

	v_modal_password.addEventListener("shown.bs.modal", function (e) {
		if (v_modal_password_input != null) {
			v_modal_password_input.focus();
			v_modal_password_input.onkeydown = function (event) {
				if (event.keyCode == 13) {
					v_modal_password_ok_function();
					bootstrap.Modal.getOrCreateInstance(v_modal_password).hide();
				}
			};
		}
	});

	v_modal_password_ok_clicked = false;
	v_modal_password_ok_function = null;
	v_modal_password_ok_after_hide_function = null;
	v_modal_password_cancel_callback = null;
	v_modal_password_input = null;

	// Two quite different things behind one button, so it says what it
	// actually does in each mode (see the block comment below): in the
	// desktop app it grants standing access to the file and the connection
	// then authenticates from it on its own, everywhere else it reads a
	// password out of a file the user picks for this one prompt.
	if (gv_desktopMode) el("modal_password_pgpass_button").textContent = "Grant access to .pgpass\u2026";

	el("modal_password_pgpass_button").addEventListener("click", function () {
		if (gv_desktopMode) {
			grantPgpassAccess(v_pgpass_lookup_info);
		} else {
			el("modal_password_pgpass_input").click();
		}
	});
	el("modal_password_pgpass_input").addEventListener("change", function (e) {
		var v_file = e.target.files ? e.target.files[0] : null;
		// Reset so picking the exact same file again still fires "change".
		e.target.value = "";
		if (v_file && v_pgpass_lookup_info) readPgpassFileViaInput(v_file, v_pgpass_lookup_info);
	});
}

// --- .pgpass support ---------------------------------------------------
//
// A saved connection with no stored password relies on Postgres's libpq
// convention of reading ~/.pgpass at connect time -- the connection form's
// own tooltip already documents this ("If it's a PostgreSQL connection,
// OmniDB will try to retrieve password from .pgpass."). Under macOS App
// Sandbox that file sits outside the sandboxed process's redirected $HOME
// (see wails-app/legacydata.go's sandboxed() comment for the redirection
// itself), so the server-side lookup silently finds nothing and Postgres
// rejects the resulting blank password with SQLSTATE 28P01 -- which is
// exactly the error longpolling.go's queueQueryError now routes to this
// same modal (previously it just dead-ended in a plain error alert).
//
// Rather than requesting broad filesystem entitlements (Mac App Store
// review rejects blanket home-directory access) or copying passwords into
// OmniDB's own database (multiplying where a password lives), the user
// points at their .pgpass file once and macOS keeps that one file readable
// from then on -- a security-scoped bookmark, saved and re-resolved on
// every later launch (see wails-app/pgpassdialog.go).
//
// What that means for this modal, in the desktop app (grantPgpassAccess):
// the button grants that access and nothing else. It never puts a password
// in the input above it -- once access is in place, the *server* resolves
// the matching entry itself while opening the connection (see
// go-server/pgpass_resolve.go), exactly the way libpq does it for a client
// that was never sandboxed to begin with, so every later connect just
// works with nothing to click. Which is also why this prompt should only
// ever appear once per .pgpass file: the retry that follows the grant is
// the last time the file needs a human in the loop.
//
// Outside the desktop app (readPgpassFileViaInput) there is no sandbox to
// route around -- a self-hosted server reads its own ~/.pgpass directly --
// so the button keeps its older, narrower meaning there: read one password
// out of a file the user picks, for this one prompt, and fill it into the
// input. Only the single matching password is ever used; the rest of the
// file's content (every other host's credentials) is discarded once
// parsed. It goes through a plain `<input type="file">`, whose OS panel
// hides .pgpass by default (a dotfile; no HTML attribute can override
// that, confirmed against Chromium/WebKit) -- the user can still toggle
// hidden files in the panel itself, e.g. Cmd+Shift+. on macOS. The desktop
// app has no such limitation: its native panel is opened with
// ShowHiddenFiles: true.

/**
 * @typedef {{hostname: string, port: string, database: string, username: string, password: string}} PgpassEntry
 */

/**
 * Parses .pgpass file text into entries, mirroring libpq's own format:
 * hostname:port:database:username:password per line, "\\" and "\:"
 * escaped, "*" a wildcard for any field, "#" comments and blank lines
 * skipped. See https://www.postgresql.org/docs/current/libpq-pgpass.html
 *
 * Exported for connections.js's "Import from .pgpass" (non-desktop
 * fallback path) to reuse rather than re-implement.
 * @param {string} text
 * @returns {PgpassEntry[]}
 */
export function parsePgpassText(text) {
	/** @type {PgpassEntry[]} */
	var v_entries = [];
	text.split(/\r?\n/).forEach(function (p_raw_line) {
		var v_line = p_raw_line.trim();
		if (v_line === "" || v_line[0] === "#") return;

		// Split on unescaped colons only -- a naive v_line.split(":") would
		// also break on an escaped "\:" inside a field.
		var v_parts = [];
		var v_current = "";
		for (var i = 0; i < v_line.length; i++) {
			if (v_line[i] === "\\" && (v_line[i + 1] === ":" || v_line[i + 1] === "\\")) {
				v_current += v_line[i + 1];
				i++;
			} else if (v_line[i] === ":") {
				v_parts.push(v_current);
				v_current = "";
			} else {
				v_current += v_line[i];
			}
		}
		v_parts.push(v_current);

		if (v_parts.length === 5) {
			v_entries.push({ hostname: v_parts[0], port: v_parts[1], database: v_parts[2], username: v_parts[3], password: v_parts[4] });
		}
	});
	return v_entries;
}

/**
 * @param {PgpassEntry[]} p_entries
 * @param {string} p_hostname
 * @param {string} p_port
 * @param {string} p_database
 * @param {string} p_username
 * @returns {string|null}
 */
function findPgpassPassword(p_entries, p_hostname, p_port, p_database, p_username) {
	for (var i = 0; i < p_entries.length; i++) {
		var v_entry = p_entries[i];
		if (
			(v_entry.hostname === "*" || v_entry.hostname === p_hostname) &&
			(v_entry.port === "*" || v_entry.port === p_port) &&
			(v_entry.database === "*" || v_entry.database === p_database) &&
			(v_entry.username === "*" || v_entry.username === p_username)
		) {
			return v_entry.password;
		}
	}
	return null;
}

/**
 * Shows a .pgpass-specific error inline in the password modal, rather than
 * through showAlert's own modal -- showAlert stacks a second Bootstrap
 * modal on top of this already-open one, and the two end up sharing the
 * same z-index (Bootstrap doesn't know to bump a modal opened without
 * going through its own stacking counter), so the alert can render behind
 * modal_password instead of over it. An inline message avoids that
 * entirely and reads better anyway, tied as it is to the button right
 * above it rather than to a separate popup.
 * @param {string} p_message
 */
function showPgpassError(p_message) {
	var v_error_div = el("modal_password_pgpass_error");
	v_error_div.textContent = p_message;
	v_error_div.style.display = "block";
}

function hidePgpassError() {
	el("modal_password_pgpass_error").style.display = "none";
}

/**
 * @param {File} p_file
 * @param {{server: string, port: string, database: string, username: string}} p_lookup_info
 */
function readPgpassFileViaInput(p_file, p_lookup_info) {
	var v_reader = new FileReader();
	v_reader.onload = function (e) {
		var v_text = /** @type {string} */ (/** @type {FileReader} */ (e.target).result);
		var v_password = findPgpassPassword(
			parsePgpassText(v_text),
			p_lookup_info.server,
			p_lookup_info.port,
			p_lookup_info.database,
			p_lookup_info.username,
		);
		if (v_password === null) {
			showPgpassError(
				"No matching entry found in that .pgpass file for " +
					p_lookup_info.server +
					":" +
					p_lookup_info.port +
					":" +
					p_lookup_info.database +
					":" +
					p_lookup_info.username,
			);
			return;
		}
		hidePgpassError();
		v_modal_password_input.value = v_password;
	};
	v_reader.readAsText(p_file);
}

/**
 * Desktop-app counterpart to readPgpassFileViaInput, and deliberately not
 * the same kind of operation: this asks the shell process (through
 * go-server/pgpass_grant.go) to show its native Open dialog and *keep*
 * access to whatever file the user picks, then retries the operation that
 * raised this prompt. No password crosses back -- the server resolves it
 * from the granted file on the retry's own connect, see this file's
 * .pgpass block comment above.
 *
 * p_lookup_info is only sent so the picked file can be checked for a
 * matching entry right away: without that check, picking a .pgpass that
 * has nothing for this connection would look like it worked, and the only
 * feedback would be the same password prompt reappearing a moment later
 * after another 28P01. It can be null (a connection that isn't in the
 * loaded list), in which case the grant is still fine -- it just retries
 * without that check.
 * @param {{server: string, port: string, database: string, username: string}|null} p_lookup_info
 */
function grantPgpassAccess(p_lookup_info) {
	fetch("/pgpass_grant/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			hostname: p_lookup_info ? p_lookup_info.server : "",
			port: p_lookup_info ? p_lookup_info.port : "",
			database: p_lookup_info ? p_lookup_info.database : "",
			username: p_lookup_info ? p_lookup_info.username : "",
		}),
	})
		.then(function (p_response) {
			return p_response.json();
		})
		.then(function (p_result) {
			if (p_result.cancelled) return;
			if (p_result.error) {
				showPgpassError(p_result.error);
				return;
			}
			if (!p_result.matched && p_lookup_info) {
				showPgpassError(
					"OmniDB can use that file now, but it has no entry for " +
						p_lookup_info.server +
						":" +
						p_lookup_info.port +
						":" +
						p_lookup_info.database +
						":" +
						p_lookup_info.username +
						" -- pick another file, or type the password above.",
				);
				return;
			}
			hidePgpassError();
			retryWithPgpassPassword();
		})
		.catch(function (p_err) {
			showPgpassError("Could not reach the desktop app's file picker: " + p_err);
		});
}

/**
 * Submits the prompt with an empty password, which is what makes the
 * server fall back to the just-granted .pgpass file (an empty password is
 * precisely the case pgx and applyPgpassPassword resolve from a passfile,
 * see go-server/pgpass_resolve.go) and, on success, remember for this
 * session that this connection needs no typed password at all.
 *
 * Goes through the modal's own OK path rather than calling
 * checkPasswordPrompt directly, so the retry behaves exactly like a
 * hand-typed password being submitted: same renew_password round-trip,
 * same "reopen the prompt with the server's error" branch if it still
 * fails, same after-hide callback that resumes whatever the user was
 * doing when the prompt appeared.
 */
function retryWithPgpassPassword() {
	v_modal_password_input.value = "";
	v_modal_password_ok_function();
	bootstrap.Modal.getOrCreateInstance(/** @type {HTMLElement} */ (document.getElementById("modal_password"))).hide();
}

/**
 * Resolves the postgresql connection details for p_database_index (a
 * connection id, matching v_connTabControl.tag.connections[i].v_conn_id --
 * see connections.js's showConnectionList for the same lookup) into what
 * readPgpassFileViaInput/grantPgpassAccess need to match a .pgpass entry. Returns null for any
 * non-postgresql connection (mysql/oracle/etc. have no passfile
 * convention) or one not found in the currently-loaded list, which is what
 * keeps the "Use .pgpass" row hidden for those.
 * @param {number|string} p_database_index
 * @returns {{server: string, port: string, database: string, username: string}|null}
 */
function resolvePgpassLookupInfo(p_database_index) {
	var v_connections = v_connTabControl && v_connTabControl.tag ? v_connTabControl.tag.connections : null;
	if (!v_connections) return null;
	for (var i = 0; i < v_connections.length; i++) {
		var v_conn = v_connections[i];
		if (v_conn.v_conn_id == p_database_index) {
			if (v_conn.v_db_type !== "postgresql") return null;
			return {
				server: v_conn.v_server || "",
				port: v_conn.v_port || "",
				// v_pgpass_database, not v_database -- a connection defined
				// via a connection string (rather than the discrete
				// Server/Port/Database/User fields) leaves v_database blank
				// (see go-server/appdb_database_list.go's
				// resolvePgpassMatchFields), so matching against it would
				// always report "no matching entry", even correctly, for
				// exactly that class of connection.
				database: v_conn.v_pgpass_database || "",
				username: v_conn.v_username || "",
			};
		}
	}
	return null;
}
// This body only registers listeners on a static modal already present in
// workspace.html at page load, so (like autocomplete.js's
// initAutocompleteObject) a single deferred tick is enough -- no need to
// poll for an async-created dependency the way plugin_hook.js's
// initHookRegistry does.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPasswordModal);
else setTimeout(initPasswordModal, 0);

export function showPasswordPrompt(
	p_database_index,
	p_callback_function,
	p_cancel_callback_function,
	p_message,
	p_send_tab_id = true,
) {
	v_modal_password_ok_clicked = false;
	v_modal_password_cancel_callback = p_cancel_callback_function;
	var v_content_div = /** @type {HTMLElement} */ (document.getElementById("modal_password_content"));
	var v_button_ok = /** @type {HTMLElement} */ (document.getElementById("modal_password_ok"));
	var v_button_cancel = /** @type {HTMLElement} */ (document.getElementById("modal_password_cancel"));
	v_modal_password_input = /** @type {HTMLInputElement} */ (document.getElementById("txt_password_prompt"));

	v_pgpass_lookup_info = resolvePgpassLookupInfo(p_database_index);
	el("modal_password_pgpass_row").style.display = v_pgpass_lookup_info ? "block" : "none";
	hidePgpassError();

	if (p_message) v_content_div.textContent = p_message;

	bootstrap.Modal.getOrCreateInstance(/** @type {HTMLElement} */ (document.getElementById("modal_password"))).show();

	v_modal_password_ok_function = function () {
		v_modal_password_ok_clicked = true;
		checkPasswordPrompt(p_database_index, p_callback_function, p_cancel_callback_function, p_send_tab_id);
	};

	v_button_ok.onclick = v_modal_password_ok_function;

	v_button_cancel.onclick = function () {
		v_modal_password_ok_clicked = false;
		if (p_cancel_callback_function) p_cancel_callback_function();
	};
}

export function checkPasswordPrompt(p_database_index, p_callback_function, p_cancel_callback_function, p_send_tab_id) {
	var v_password = /** @type {HTMLInputElement} */ (document.getElementById("txt_password_prompt")).value;
	var v_tab_id = "";
	if (p_send_tab_id) v_tab_id = v_connTabControl.selectedTab.id;

	v_modal_password_ok_after_hide_function = function () {
		execAjax(
			"/renew_password/",
			JSON.stringify({ p_database_index: p_database_index, p_tab_id: v_tab_id, p_password: v_password }),
			function (p_return) {
				if (p_callback_function) p_callback_function();
			},
			function (p_return) {
				showPasswordPrompt(
					p_database_index,
					p_callback_function,
					p_cancel_callback_function,
					p_return.v_data,
					p_send_tab_id,
				);
			},
			"box",
		);
	};
}
