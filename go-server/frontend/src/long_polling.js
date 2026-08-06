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

import { execAjax } from "./ajax_control_bridge.js";
import { cancelConsoleTab, consoleReturn, consoleSQL } from "./console.js";
import { showAlert, showError } from "./notification_control.js";
import { showPasswordPrompt } from "./passwords.js";
import { cancelSQLTab, queryError, querySQL, querySQLReturn, v_queryResponseCodes } from "./query.js";
import { terminalReturn } from "./terminal.js";
import { cancelEditDataTab, queryEditDataReturn, saveEditDataReturn } from "./tree_context_functions/edit_data.js";

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var v_context_code;


export var v_client_id;
/** @type {any} */
export var v_polling_ajax = null;

export var v_context_object = {
	contextCode: 0,
	/** @type {{code: number, context: any}[]} */
	contextList: [],
};

export var v_polling_started = false;

/// <summary>
/// Startup function.
/// </summary>
function initKeepAlive() {
	setInterval(function () {
		execAjax("/client_keep_alive/", JSON.stringify({}), function (p_return) {}, null, "box", false);
	}, 60000);
}
// jQuery's $(fn) is never synchronous, even when the document is already
// ready, so this defers the same way -- but unlike plugin_hook.js's
// initHookRegistry, this body doesn't touch anything created
// asynchronously, so a single deferred tick (no retry/poll) is enough.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initKeepAlive);
else setTimeout(initKeepAlive, 0);

export function call_polling(p_startup) {
	v_polling_ajax = execAjax(
		"/long_polling/",
		JSON.stringify({
			p_startup: p_startup,
		}),
		function (p_return) {
			for (var i = 0; i < p_return.returning_rows.length; i++) {
				try {
					polling_response(p_return.returning_rows[i]);
				} catch (err) {}
			}
			call_polling(false);
		},
		null,
		"box",
		false,
		null,
		function () {},
	);
}

window.addEventListener("beforeunload", function () {
	clear_client().then(function () {});
});

async function clear_client() {
	// A plain GET needs no CSRF header (see csrfSafeMethod), and `keepalive`
	// is what lets this request actually complete during page unload, which
	// is the only time this is ever called.
	try {
		await fetch(v_url_folder + "/clear_client", { keepalive: true });
	} catch (err) {}
}

export function polling_response(p_message) {
	var v_message = p_message;

	/** @type {number|null} */
	var p_context_code = null;
	/** @type {any} */
	var p_context = null;

	if (v_message.v_context_code != 0 && v_message.v_context_code != null) {
		for (var i = 0; i < v_context_object.contextList.length; i++) {
			if (v_context_object.contextList[i].code == v_message.v_context_code) {
				p_context = v_context_object.contextList[i].context;
				p_context_code = v_context_object.contextList[i].code;
				break;
			}
		}
	}

	switch (v_message.v_code) {
		// Pong is a leftover of the WebSocket transport: the handler it called,
		// websocketPong(), has not existed for a long time, and the Go backend
		// never sends this code (there is no Pong in longpolling.go's response
		// constants). Kept as an explicit no-op rather than deleted so an
		// unexpected Pong falls through here instead of into the "unhandled
		// code" path.
		case v_queryResponseCodes.Pong: {
			break;
		}
		case v_queryResponseCodes.SessionMissing: {
			showAlert("Session not found please reload the page.");
			break;
		}
		case v_queryResponseCodes.MessageException: {
			if (p_context) {
				SetAcked(p_context);
				queryError(p_message, p_context);
				removeContext(p_context_code);
			} else {
				showError(p_message.v_data);
			}
			break;
		}
		case v_queryResponseCodes.PasswordRequired: {
			if (p_context) {
				SetAcked(p_context);
				QueryPasswordRequired(p_context, v_message.v_data);
				break;
			}
		}
		case v_queryResponseCodes.QueryAck: {
			if (p_context) {
				SetAcked(p_context);
				break;
			}
		}
		case v_queryResponseCodes.QueryResult: {
			if (p_context) {
				SetAcked(p_context);
				if (!v_message.v_error || v_message.v_data.v_chunks) {
					p_context.tab_tag.tempData = p_context.tab_tag.tempData.concat(v_message.v_data.v_data);
				}
				if (!v_message.v_data.v_chunks || v_message.v_data.v_last_block || v_message.v_error) {
					v_message.v_data.v_data = [];
					querySQLReturn(v_message, p_context);
					//Remove context
					removeContext(p_context_code);
				}
			}
			break;
		}
		case v_queryResponseCodes.ConsoleResult: {
			if (p_context) {
				if (!v_message.v_error) {
					p_context.tab_tag.tempData += v_message.v_data.v_data;
				}
				if (v_message.v_data.v_last_block || v_message.v_error) {
					v_message.v_data.v_data = [];
					consoleReturn(v_message, p_context);
					//Remove context
					removeContext(p_context_code);
				}
			}
			break;
		}
		case v_queryResponseCodes.TerminalResult: {
			if (p_context) {
				terminalReturn(v_message, p_context);
			}
			break;
		}
		case v_queryResponseCodes.QueryEditDataResult: {
			if (p_context) {
				SetAcked(p_context);
				queryEditDataReturn(v_message, p_context);
				removeContext(p_context_code);
			}
			break;
		}
		case v_queryResponseCodes.SaveEditDataResult: {
			if (p_context) {
				saveEditDataReturn(v_message, p_context);
				removeContext(p_context_code);
			}
			break;
		}
		case v_queryResponseCodes.RemoveContext: {
			if (p_context) {
				removeContext(p_context_code);
			}
			break;
		}
		default: {
			break;
		}
	}
}

export function QueryPasswordRequired(p_context, p_message) {
	if (p_context.tab_tag.mode == "query") {
		showPasswordPrompt(
			p_context.database_index,
			function () {
				cancelSQLTab(p_context.tab_tag);
				//querySQL(p_context.mode);
				querySQL(
					p_context.mode,
					p_context.all_data,
					p_context.query,
					p_context.callback,
					p_context.log_query,
					p_context.save_query,
					p_context.cmd_type,
					p_context.clear_data,
					p_context.tab_title,
				);
			},
			function () {
				cancelSQLTab(p_context.tab_tag);
			},
			p_message,
		);
	} else if (p_context.tab_tag.mode == "edit") {
		showPasswordPrompt(
			p_context.database_index,
			function () {
				cancelEditDataTab(p_context.tab_tag);
				//queryEditData();
			},
			function () {
				cancelEditDataTab(p_context.tab_tag);
			},
			p_message,
		);
	} else if (p_context.tab_tag.mode == "console") {
		showPasswordPrompt(
			p_context.database_index,
			function () {
				cancelConsoleTab(p_context.tab_tag);
				p_context.tab_tag.editor_input.setValue(p_context.tab_tag.last_command);
				p_context.tab_tag.editor_input.clearSelection();
				consoleSQL(p_context.check_command, p_context.mode);
			},
			function () {
				cancelConsoleTab(p_context.tab_tag);
			},
			p_message,
		);
	}
}

export function createContext(p_context) {
	v_context_object.contextCode += 1;
	v_context_code = v_context_object.contextCode;
	p_context.v_context_code = v_context_code;
	var v_context = {
		code: v_context_code,
		context: p_context,
	};
	v_context_object.contextList.push(v_context);
	return v_context;
}

export function removeContext(p_context_code) {
	for (var i = 0; i < v_context_object.contextList.length; i++) {
		if (v_context_object.contextList[i].code == p_context_code) {
			v_context_object.contextList.splice(i, 1);
			break;
		}
	}
}

export function createRequest(p_messageCode, p_messageData, p_context) {
	var v_context_code = 0;

	//Configuring context
	if (p_context != null) {
		//Context code is passed
		if (p_context === parseInt(p_context, 10)) {
			v_context_code = p_context;
		} else {
			v_context_object.contextCode += 1;
			v_context_code = v_context_object.contextCode;
			p_context.v_context_code = v_context_code;
			var v_context = {
				code: v_context_code,
				context: p_context,
			};
			v_context_object.contextList.push(v_context);
		}
	}

	if (v_polling_ajax == null) call_polling(true);
	else if (v_polling_ajax.readyState == 0 || v_polling_ajax.readyState == 4) {
		call_polling(false);
	}

	execAjax(
		"/create_request/",
		JSON.stringify({
			v_code: p_messageCode,
			v_context_code: v_context_code,
			v_data: p_messageData,
		}),
		function (p_return) {
			/*if (!v_polling_started) {
					v_polling_started=true;
					call_polling(true);
				}*/
		},
		null,
		"box",
		false,
	);
}

export function SetAcked(p_context) {
	if (p_context) p_context.acked = true;
}
