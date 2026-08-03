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
/// Query state
/// </summary>

import { editCellData } from "./header_actions.js";
import { SetAcked, createRequest, removeContext } from "./long_polling.js";
import { showAlert, showConfirm } from "./notification_control.js";
import { whiteRenderer } from "./renderers.js";
import { uiCopyTextToClipboard } from "./workspace.js";

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var v_new_data;

export var v_queryState = {
	Idle: 0,
	Executing: 1,
	Ready: 2,
};

/// <summary>
/// Transaction codes of client requests.
/// </summary>
export var v_queryRequestCodes = {
	Login: 0,
	Query: 1,
	Execute: 2,
	Script: 3,
	QueryEditData: 4,
	SaveEditData: 5,
	CancelThread: 6,
	CloseTab: 8,
	AdvancedObjectSearch: 9,
	Console: 10,
	Terminal: 11,
	Ping: 12,
};

/// <summary>
/// Transaction codes of server responses.
/// </summary>
export var v_queryResponseCodes = {
	LoginResult: 0,
	QueryResult: 1,
	QueryEditDataResult: 2,
	SaveEditDataResult: 3,
	SessionMissing: 4,
	PasswordRequired: 5,
	QueryAck: 6,
	MessageException: 7,
	RemoveContext: 9,
	AdvancedObjectSearchResult: 10,
	ConsoleResult: 11,
	TerminalResult: 12,
	Pong: 13,
};

export function escapeHtml(p_str) {
	var v_div = document.createElement("div");
	v_div.appendChild(document.createTextNode(String(p_str)));
	return v_div.innerHTML;
}

// escapeHtml above goes through a text node, which escapes & < > but leaves
// both quote characters alone — correct for text content, wrong for an
// attribute value, where an unescaped quote ends the attribute and everything
// after it is parsed as more attributes. Use this whenever a value is going
// between quotes in a string of markup.
export function escapeHtmlAttribute(p_str) {
	return String(p_str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

//Adding padLeft function to Number
Number.prototype.padLeft = function (base, chr) {
	var len = String(base || 10).length - String(this).length + 1;
	return len > 0 ? new Array(len).join(chr || "0") + this : this;
};

export function cancelSQL(p_tab_tag) {
	var v_tab_tag;
	if (p_tab_tag) v_tab_tag = p_tab_tag;
	else v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	//sendWebSocketMessage(v_queryWebSocket, v_queryRequestCodes.CancelThread, v_tab_tag.tab_id, false);
	createRequest(v_queryRequestCodes.CancelThread, v_tab_tag.tab_id);

	cancelSQLTab();
}

export function cancelSQLTab(p_tab_tag) {
	var v_tab_tag;
	if (p_tab_tag) v_tab_tag = p_tab_tag;
	else v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor) {
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setReadOnly(false);
	}

	v_tab_tag.state = v_queryState.Idle;
	v_tab_tag.tab_loading_span.style.visibility = "hidden";
	v_tab_tag.tab_check_span.style.display = "none";
	v_tab_tag.bt_cancel.style.display = "none";
	v_tab_tag.query_info.innerHTML = "Canceled.";
	setTabStatus(v_tab_tag, 0);

	removeContext(v_tab_tag.context.v_context_code);

	SetAcked(v_tab_tag.context);
}

export function getQueryEditorValue() {
	var v_selected_text = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText();

	if (v_selected_text != "") return v_selected_text;
	else return v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();
}

/// <summary>
/// Best-effort check for the classic "forgot the WHERE clause" mistake (or
/// an always-destructive DROP/TRUNCATE), so querySQL can warn before running
/// it instead of after. Comment-stripping mirrors the Go backend's
/// isReadOnlyQuery (custom_monitor_query.go) — deliberately simple, since
/// this is a safety net against an honest mistake, not a security boundary:
/// a missed edge case just means no warning, never a blocked query.
/// </summary>
export function destructiveSQLWarning(p_sql) {
	var v_stripped = p_sql;
	for (;;) {
		v_stripped = v_stripped.replace(/^[\s\r\n]+/, "");
		if (v_stripped.indexOf("--") === 0) {
			var v_newline = v_stripped.indexOf("\n");
			if (v_newline < 0) {
				v_stripped = "";
				break;
			}
			v_stripped = v_stripped.substring(v_newline + 1);
			continue;
		}
		if (v_stripped.indexOf("/*") === 0) {
			var v_end = v_stripped.indexOf("*/");
			if (v_end < 0) {
				v_stripped = "";
				break;
			}
			v_stripped = v_stripped.substring(v_end + 2);
			continue;
		}
		break;
	}

	var v_upper = v_stripped.toUpperCase();
	if (/^(DROP|TRUNCATE)\b/.test(v_upper)) {
		return "This statement is destructive and cannot be undone. Run it anyway?";
	}
	if (/^(DELETE|UPDATE)\b/.test(v_upper) && !/\bWHERE\b/.test(v_upper)) {
		return "This statement has no WHERE clause and will affect ALL rows. Run it anyway?";
	}
	return null;
}

export function querySQL(
	p_mode,
	p_all_data = false,
	p_query = getQueryEditorValue(),
	p_callback = null,
	p_log_query = true,
	p_save_query = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue(),
	p_cmd_type = null,
	p_clear_data = false,
	p_tab_title = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_title_span.innerHTML,
) {
	// Only the actual "Run" action (mode 0) gets the confirmation — modes
	// 1-4 (fetch more/fetch all/commit/rollback) re-invoke querySQL for a
	// statement the user already committed to running, not a fresh decision.
	var v_run = function () {
		executeQuerySQL(p_mode, p_all_data, p_query, p_callback, p_log_query, p_save_query, p_cmd_type, p_clear_data, p_tab_title);
	};
	var v_warning = p_mode == 0 ? destructiveSQLWarning(p_query) : null;
	if (v_warning) {
		showConfirm(v_warning, v_run);
	} else {
		v_run();
	}
}

export function executeQuerySQL(p_mode, p_all_data, p_query, p_callback, p_log_query, p_save_query, p_cmd_type, p_clear_data, p_tab_title) {
	var v_state = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.state;

	if (v_state != v_queryState.Idle) {
		showAlert("Tab with activity in progress.");
	} else {
		var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
		v_tab_tag.tempData = [];
		var v_sql_value = p_query;
		var v_db_index = v_connTabControl.selectedTab.tag.selectedDatabaseIndex;
		var v_tab_loading_span = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_loading_span;
		var v_tab_close_span = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_close_span;

		if (v_sql_value.trim() == "") {
			showAlert("Please provide a string.");
		} else {
			//Change to run mode if database index changed
			if (
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex == null ||
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex !=
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex
			) {
				p_mode = 0;
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.currDatabaseIndex =
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex;
			}

			var v_message_data = {
				v_sql_cmd: v_sql_value,
				v_sql_save: p_save_query,
				v_cmd_type: p_cmd_type,
				v_db_index: v_db_index,
				v_conn_tab_id: v_connTabControl.selectedTab.id,
				v_tab_id: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_id,
				v_tab_db_id: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_db_id,
				v_mode: p_mode,
				v_all_data: p_all_data,
				v_log_query: p_log_query,
				v_tab_title: p_tab_title,
				v_autocommit: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.check_autocommit.checked,
			};

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setReadOnly(true);
			}

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.state = v_queryState.Executing;

			var start_time = new Date().getTime();

			var d = new Date(),
				dformat =
					[(d.getMonth() + 1).padLeft(), d.getDate().padLeft(), d.getFullYear()].join("/") +
					" " +
					[d.getHours().padLeft(), d.getMinutes().padLeft(), d.getSeconds().padLeft()].join(":");

			v_tab_tag.tab_loading_span.style.visibility = "visible";
			v_tab_tag.bt_cancel.style.display = "inline-block";
			v_tab_tag.bt_fetch_more.style.display = "none";
			v_tab_tag.bt_fetch_all.style.display = "none";
			v_tab_tag.bt_commit.style.display = "none";
			v_tab_tag.bt_rollback.style.display = "none";
			v_tab_tag.div_notices.innerHTML = "";
			setTabStatus(v_tab_tag, 2);

			var v_has_selected_text = false;
			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText() != "")
				v_has_selected_text = true;

			var v_context = {
				tab_tag: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag,
				start_time: new Date().getTime(),
				start_datetime: dformat,
				cmd_type: p_cmd_type,
				database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
				mode: p_mode,
				has_selected_text: v_has_selected_text,
				callback: p_callback,
				acked: false,
				all_data: p_all_data,
				query: p_query,
				log_query: p_log_query,
				save_query: p_save_query,
				clear_data: p_clear_data,
				tab_title: p_tab_title,
			};
			v_context.tab_tag.context = v_context;

			if ((p_mode == 0 && p_callback == null) || p_clear_data) {
				if (v_context.tab_tag.ht != null) {
					v_context.tab_tag.ht.destroy();
					v_context.tab_tag.ht = null;
				}

				v_context.tab_tag.div_result.innerHTML = "";
			}
			v_context.tab_tag.query_info.innerHTML = "<b>Start time</b>: " + escapeHtml(String(dformat)) + "<br><b>Running...</b>";

			//sendWebSocketMessage(v_queryWebSocket, v_queryRequestCodes.Query, v_message_data, false, v_context);
			createRequest(v_queryRequestCodes.Query, v_message_data, v_context);

			/*setTimeout(function() {
				if (!v_context.acked) {
					cancelSQLTab(v_context.tab_tag);
					showAlert('No response from query server.');
				}
			},10000);*/
		}
	}
}

export function checkQueryStatus(p_tab) {
	if (p_tab.tag.state == v_queryState.Ready) {
		querySQLReturnRender(p_tab.tag.data, p_tab.tag.context);
	}
}

export function querySQLReturn(p_data, p_context) {
	//Update tab_db_id if not null in response
	if (p_data.v_data.v_inserted_id) {
		p_context.tab_tag.tab_db_id = p_data.v_data.v_inserted_id;
	}

	if (!p_data.v_error) p_data.v_data.v_data = p_context.tab_tag.tempData;

	p_context.tab_tag.tempData = [];

	//If query wasn't canceled already
	if (p_context.tab_tag.state != v_queryState.Idle) {
		if (
			p_context.tab_tag.tab_id == p_context.tab_tag.tabControl.selectedTab.id &&
			p_context.tab_tag.connTab.id == p_context.tab_tag.connTab.tag.connTabControl.selectedTab.id
		) {
			querySQLReturnRender(p_data, p_context);
		} else {
			p_context.tab_tag.state = v_queryState.Ready;
			p_context.tab_tag.context = p_context;
			p_context.tab_tag.data = p_data;

			p_context.tab_tag.tab_loading_span.style.visibility = "hidden";
			p_context.tab_tag.tab_check_span.style.display = "";
		}
	}
}

export function setTabStatus(p_tab_tag, p_con_status) {
	if (p_con_status == 0) {
		p_tab_tag.query_tab_status_text.innerHTML = "Not connected";
		p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-closed";
		p_tab_tag.query_tab_status.title = "Not connected";
		p_tab_tag.query_tab_status.innerHTML = "";
	} else if (p_con_status == 1) {
		p_tab_tag.query_tab_status_text.innerHTML = "Idle";
		p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle position-relative";
		p_tab_tag.query_tab_status.title = "Idle";
		p_tab_tag.query_tab_status.innerHTML =
			'<div style="position: absolute; width: 12px; height: 12px; overflow: visible; left: 0px; top: 0px; display: block;">' +
			'<span class="omnis__circle-waves omnis__circle-waves--idle">' +
			"<span></span>" +
			"<span></span>" +
			"<span></span>" +
			"<span></span>" +
			"</span>" +
			"</div>";
	} else if (p_con_status == 2) {
		p_tab_tag.query_tab_status_text.innerHTML = "Running";
		p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-running position-relative";
		p_tab_tag.query_tab_status.title = "Running";
		p_tab_tag.query_tab_status.innerHTML =
			'<div style="position: absolute; width: 12px; height: 12px; overflow: visible; left: 0px; top: 0px; display: block;">' +
			'<span class="omnis__circle-waves omnis__circle-waves--running">' +
			"<span></span>" +
			"<span></span>" +
			"<span></span>" +
			"<span></span>" +
			"</span>" +
			"</div>";
	} else if (p_con_status == 3) {
		p_tab_tag.query_tab_status_text.innerHTML = "Idle in transaction";
		p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle_in_transaction";
		p_tab_tag.query_tab_status.title = "Idle in transaction";
		p_tab_tag.query_tab_status.innerHTML = "";
	} else if (p_con_status == 4) {
		p_tab_tag.query_tab_status_text.innerHTML = "Idle in transaction (aborted)";
		p_tab_tag.query_tab_status.className = "fas fa-dot-circle tab-status tab-status-idle_in_transaction_aborted";
		p_tab_tag.query_tab_status.title = "Idle in transaction (aborted)";
		p_tab_tag.query_tab_status.innerHTML = "";
	}
}

export function querySQLReturnRender(p_message, p_context) {
	p_context.tab_tag.state = v_queryState.Idle;
	p_context.tab_tag.context = null;
	p_context.tab_tag.data = null;

	if (p_context.tab_tag.editor) {
		p_context.tab_tag.editor.setReadOnly(false);
	}

	var v_div_result = p_context.tab_tag.div_result;
	var v_query_info = p_context.tab_tag.query_info;

	var v_data = p_message.v_data;

	//Show commit/rollback buttons if transaction is open
	if (v_data.v_con_status == 3 || v_data.v_con_status == 4) {
		p_context.tab_tag.bt_commit.style.display = "";
		p_context.tab_tag.bt_rollback.style.display = "";
	} else {
		p_context.tab_tag.bt_commit.style.display = "none";
		p_context.tab_tag.bt_rollback.style.display = "none";
	}

	setTabStatus(p_context.tab_tag, p_message.v_data.v_con_status);

	if (p_context.callback != null) {
		if (p_message.v_error) {
			v_div_result.innerHTML = '<div class="error_text">' + escapeHtml(p_message.v_data.message) + "</div>";
			v_query_info.innerHTML =
				"<b>Start time</b>: " +
				escapeHtml(String(p_context.start_datetime)) +
				" <b>Duration</b>: " +
				escapeHtml(String(p_message.v_data.v_duration));
		} else {
			v_query_info.innerHTML =
				"<b>Start time</b>: " +
				escapeHtml(String(p_context.start_datetime)) +
				" <b>Duration</b>: " +
				escapeHtml(String(p_message.v_data.v_duration));
			p_context.callback(p_message);
		}
	} else {
		p_context.tab_tag.selectDataTabFunc();

		if (p_context.tab_tag.div_count_notices) {
			p_context.tab_tag.div_count_notices.style.display = "none";
		}

		if (v_data.v_notices_length > 0) {
			if (p_context.tab_tag.div_count_notices) {
				p_context.tab_tag.div_count_notices.innerHTML = v_data.v_notices_length;
				p_context.tab_tag.div_count_notices.style.display = "inline-block";
				p_context.tab_tag.div_notices.textContent = v_data.v_notices;
			}
		}

		if (p_message.v_error) {
			v_div_result.innerHTML = '<div class="error_text">' + escapeHtml(p_message.v_data.message) + "</div>";
			v_query_info.innerHTML =
				"<b>Start time</b>: " +
				escapeHtml(String(p_context.start_datetime)) +
				" <b>Duration</b>: " +
				escapeHtml(String(p_message.v_data.v_duration));
			if (p_message.v_data.position != null) {
				if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor && !p_context.has_selected_text) {
					v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(
						p_message.v_data.position.row,
						p_message.v_data.position.col,
					);
					v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.textInput.focus();
				}
			}
		} else {
			//Script
			if (p_context.sel_value == 0) {
				v_query_info.innerHTML =
					"<b>Start time</b>: " +
					escapeHtml(String(p_context.start_datetime)) +
					" <b>Duration</b>: " +
					escapeHtml(String(p_message.v_data.v_duration));

				v_div_result.innerHTML = '<div class="query_info">' + escapeHtml(p_message.v_data.v_data) + "</div>";
			}
			//Query
			else {
				//Show fetch buttons if data has 50 rows
				if (v_data.v_data.length >= 50 && p_context.mode != 2) {
					if (p_context.tab_tag.bt_fetch_more) {
						p_context.tab_tag.bt_fetch_more.style.display = "";
					}

					if (p_context.tab_tag.bt_fetch_all) {
						p_context.tab_tag.bt_fetch_all.style.display = "";
					}
				} else {
					if (p_context.tab_tag.bt_fetch_more) {
						p_context.tab_tag.bt_fetch_more.style.display = "none";
					}

					if (p_context.tab_tag.bt_fetch_all) {
						p_context.tab_tag.bt_fetch_all.style.display = "none";
					}
				}

				if (p_context.mode == 0) {
					v_div_result.innerHTML = "";

					window.scrollTo(0, 0);
					if (v_data.v_data.length == 0 && v_data.v_col_names.length == 0) {
						v_query_info.innerHTML =
							"<b>Start time</b>: " +
							escapeHtml(String(p_context.start_datetime)) +
							" <b>Duration</b>: " +
							escapeHtml(String(p_message.v_data.v_duration));
						if (typeof p_message.v_data.v_status == "string")
							v_div_result.innerHTML = '<div class="query_info">' + escapeHtml(p_message.v_data.v_status) + "</div>";
						else v_div_result.innerHTML = '<div class="query_info">Done</div>';
					} else {
						v_query_info.innerHTML =
							"<span class='omnidb__query-info__value' style='font-weight: 900;'>" +
							v_data.v_data.length +
							"</span><span> rows</span><span> in </span><span class='omnidb__query-info__value' style='font-weight: 600;'>" +
							escapeHtml(String(p_message.v_data.v_duration)) +
							"</span>" +
							"<br/><span>Start time</span>: <span class='omnidb__query-info__value' style='font-weight: 600;'>" +
							escapeHtml(String(p_context.start_datetime)) +
							"</span>";

						var columnProperties = [];

						for (var i = 0; i < v_data.v_col_names.length; i++) {
							var col = new Object();

							col.readOnly = true;

							col.title = v_data.v_col_names[i];

							if (i === 0) {
								col.pinned = 'left';
							}

							var colType = v_data.v_col_types && v_data.v_col_types[i] ? v_data.v_col_types[i] : null;
							if (colType) {
								col.tooltip = v_data.v_col_names[i] + " [" + colType + "]";

								var typeUpper = String(colType).toUpperCase();
								if (/^(INT2|INT4|INT8|SMALLINT|INTEGER|BIGINT|TINYINT|MEDIUMINT|OID|INT|NUMERIC|DECIMAL|DEC|REAL|FLOAT|FLOAT4|FLOAT8|DOUBLE|MONEY|NUMBER|BINARY_FLOAT|BINARY_DOUBLE)$/.test(typeUpper)) {
									col.align = "right";
								} else if (/^(BOOL|BOOLEAN|BIT)$/.test(typeUpper)) {
									col.align = "center";
								} else if (/^(CHAR|BPCHAR)$/.test(typeUpper)) {
									col.align = "center";
								}
							} else {
								col.tooltip = v_data.v_col_names[i];
							}

							columnProperties.push(col);
						}

						var container = v_div_result;
						p_context.tab_tag.ht = new Handsontable(container, {
							licenseKey: "non-commercial-and-evaluation",
							data: v_data.v_data,
							columns: columnProperties,
							colHeaders: true,
							rowHeaders: true,
							// stretchH: 'last',
							autoRowSize: false,
							//copyRowsLimit : 1000000000,
							//copyColsLimit : 1000000000,
							copyPaste: { pasteMode: "", rowsLimit: 1000000000, columnsLimit: 1000000000 },
							manualColumnResize: true,
							// modifyColWidth: function(width, col){
							//   if(width > 300){
							//     return 280
							//   }
							// },
							fillHandle: false,
							contextMenu: {
								callback: function (key, options) {
									if (key === "view_data") {
										editCellData(
											this,
											options[0].start.row,
											options[0].start.col,
											this.getDataAtCell(options[0].start.row, options[0].start.col),
											false,
										);
									} else if (key === "copy") {
										var v_start_row = Math.min(options[0].start.row, options[0].end.row);
										var v_end_row = Math.max(options[0].start.row, options[0].end.row);
										var v_start_col = Math.min(options[0].start.col, options[0].end.col);
										var v_end_col = Math.max(options[0].start.col, options[0].end.col);
										var v_ht = this;
										var v_lines = [];
										for (var v_row = v_start_row; v_row <= v_end_row; v_row++) {
											var v_cells = [];
											for (var v_col = v_start_col; v_col <= v_end_col; v_col++) {
												var v_cell_value = v_ht.getDataAtCell(v_row, v_col);
												v_cells.push(v_cell_value == null ? "" : String(v_cell_value));
											}
											v_lines.push(v_cells.join("\t"));
										}
										uiCopyTextToClipboard(v_lines.join("\n"));
									}
								},
								items: {
									copy: {
										name: '<div style=\"position: absolute;\"><i class=\"fas fa-copy cm-all\" style=\"vertical-align: middle;\"></i></div><div style=\"padding-left: 30px;\">Copy</div>',
									},
									view_data: {
										name: '<div style=\"position: absolute;\"><i class=\"fas fa-edit cm-all\" style=\"vertical-align: middle;\"></i></div><div style=\"padding-left: 30px;\">View Content</div>',
									},
								},
							},
							cells: function (row, col, prop) {
								var cellProperties = {};
								cellProperties.renderer = whiteRenderer;
								return cellProperties;
							},
						});
					}
				}
				//Adding fetched data
				else if (p_context.mode == 1 || p_context.mode == 2) {
					v_new_data = p_context.tab_tag.ht.getSourceData();
					v_query_info.innerHTML =
						"<span class='omnidb__query-info__value' style='font-weight: 900;'>" +
						(v_new_data.length + v_data.v_data.length) +
						"</span><span> rows</span><span> in </span><span class='omnidb__query-info__value' style='font-weight: 600;'>" +
						escapeHtml(String(p_message.v_data.v_duration)) +
						"</span>" +
						"<br/><span>Start time</span>: <span class='omnidb__query-info__value' style='font-weight: 600;'>" +
						escapeHtml(String(p_context.start_datetime)) +
						"</span>";
					for (var i = 0; i < v_data.v_data.length; i++) {
						v_new_data.push(v_data.v_data[i]);
					}
					p_context.tab_tag.ht.loadData(v_new_data);
					v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.childNodes[0].childNodes[0].scrollTop =
						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.childNodes[0].childNodes[0].scrollHeight;
				}
				//COMMIT or ROLLBACK
				else {
					if (p_context.tab_tag.ht != null)
						v_query_info.innerHTML =
							"<b>Start time</b>: " +
							escapeHtml(String(p_context.start_datetime)) +
							" <b>Duration</b>: " +
							escapeHtml(String(p_message.v_data.v_duration)) +
							"<br/>Status: " +
							escapeHtml(p_message.v_data.v_status);
					else {
						v_query_info.innerHTML =
							"<b>Start time</b>: " +
							escapeHtml(String(p_context.start_datetime)) +
							" <b>Duration</b>: " +
							escapeHtml(String(p_message.v_data.v_duration));
						v_div_result.innerHTML = '<div class="query_info">' + escapeHtml(p_message.v_data.v_status) + "</div>";
					}
				}
			}
		}
	}

	p_context.tab_tag.tab_loading_span.style.visibility = "hidden";
	p_context.tab_tag.tab_check_span.style.display = "none";
	p_context.tab_tag.bt_cancel.style.display = "none";
}

export function queryError(p_message, p_context) {
	var v_tab_tag = p_context.tab_tag;

	v_tab_tag.state = v_queryState.Idle;
	v_tab_tag.context = null;
	v_tab_tag.data = null;

	if (v_tab_tag.editor) {
		v_tab_tag.editor.setReadOnly(false);
	}

	v_tab_tag.bt_commit.style.display = "none";
	v_tab_tag.bt_rollback.style.display = "none";

	setTabStatus(v_tab_tag, 1);

	v_tab_tag.div_notices.innerHTML = '<div class="error_text">' + escapeHtml(p_message.v_data) + "</div>";
	if (v_tab_tag.div_count_notices) {
		v_tab_tag.div_count_notices.innerHTML = 1;
		v_tab_tag.div_count_notices.style.display = "inline-block";
	}
	v_tab_tag.selectMessageTabFunc();

	v_tab_tag.query_info.innerHTML =
		"<b>Start time</b>: " + escapeHtml(String(p_context.start_datetime)) + "<br><b>Error</b>";

	v_tab_tag.tab_loading_span.style.visibility = "hidden";
	v_tab_tag.tab_check_span.style.display = "none";
	v_tab_tag.bt_cancel.style.display = "none";
}
