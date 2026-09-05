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

/**
 * The Notify section: one outer tab per connection being listened on, each
 * with a channel tree on the left (tree_notify.js) and the messages that
 * arrived on those channels on the right.
 *
 * Deliberately its own tabControl instance rather than v_connTabControl --
 * nothing here needs the query/console/DDL machinery an outer connection tab
 * carries, and v_connTabControl is read all over the bundle as "the currently
 * open DB connection tab", which this panel's tabs are not.
 *
 * Messages are ephemeral by design: they live in `tag.messages` and nowhere
 * else, so a reload starts from an empty list. Only the channel list itself
 * (and each channel's active/paused state) is persisted, by the backend.
 */

import { customMenu } from "../custom_menu.js";
import { createContext, createRequest } from "../long_polling.js";
import { showAlert } from "../notification_control.js";
import { escapeHtml, v_queryRequestCodes } from "../query.js";
import { createTabControl } from "../tabs.js";
import {
	getTreeNotifyChannels,
	refreshNotifyChannels,
	renderNotifyChannelNodes,
} from "../tree_context_functions/tree_notify.js";

// Fixed ids: like the snippets panel, there is only ever one Notify panel
// instance, so the panel's own elements do not need a unique-per-tab prefix.
// Its inner tabs do -- those are keyed off the tab id, as everywhere else.
var NOTIFY_PANEL_ID = "notify_panel";

/**
 * The two technologies with a real asynchronous notification mechanism:
 * PostgreSQL's LISTEN/NOTIFY and Oracle's DBMS_ALERT. Everything else gets a
 * tab too (deliberately -- the picker is not filtered), it just says so.
 */
var NOTIFY_SUPPORTED_DB_TYPES = ["postgresql", "oracle"];

/** @type {any} */
var v_notifyOuterTabControl = null;

/**
 * @param {string} p_db_type
 */
export function notifySupportedDbType(p_db_type) {
	return NOTIFY_SUPPORTED_DB_TYPES.indexOf(p_db_type) !== -1;
}

export var v_createNotifyPanelFunction = function () {
	var v_html =
		"<div id='" +
		NOTIFY_PANEL_ID +
		"' class='omnidb__notify'>" +
		"<div id='" +
		NOTIFY_PANEL_ID +
		"_tabs' class='omnidb__notify__tabs'></div>" +
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_notify"));
	v_target.innerHTML = v_html;

	v_notifyOuterTabControl = createTabControl({
		p_div: NOTIFY_PANEL_ID + "_tabs",
		p_hierarchy: "primary",
	});
	// Same horizontal strip the Database section's connection tabs render as
	// -- see initWorkspace's identical call on v_connTabControl for why the
	// "menu-shown" layout is the one being switched away from here.
	v_notifyOuterTabControl.hideTabMenu();

	var v_add_tab = v_notifyOuterTabControl.createTab({
		p_icon: '<i class="fas fa-plus"></i>',
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			showNotifyConnectionMenu(e);
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Listen on Connection</h5>',
	});
	v_add_tab.elementA.classList.add("omnidb__tab-menu__link--compact");
	// Every connection tab created afterwards is inserted before this one
	// instead of appended past it -- same reason as the outer strip's own
	// Add tab (see create_tab_functions.js).
	v_notifyOuterTabControl.setTrailingTab(v_add_tab);
};

/**
 * The picker behind the "+" tab. Deliberately lists *every* saved connection,
 * including the ones whose technology has no NOTIFY equivalent: those must be
 * visibly marked as unsupported (see renderNotifyUnsupported), not quietly
 * missing from the list.
 */
function showNotifyConnectionMenu(p_event) {
	var v_connections = v_connTabControl.tag.connections || [];

	if (v_connections.length === 0) {
		showAlert("Create connections first.");
		return;
	}

	var v_option_list = [];
	for (var i = 0; i < v_connections.length; i++)
		(function (i) {
			var v_conn = v_connections[i];
			v_option_list.push({
				text: notifyConnectionLabel(v_conn),
				icon: "fas cm-all node-" + v_conn.v_db_type,
				action: function () {
					createNotifyConnTab(v_conn.v_conn_id);
				},
			});
		})(i);

	customMenu(
		{
			x: p_event.clientX + 5,
			y: p_event.clientY + 5,
		},
		v_option_list,
		null,
	);
}

/**
 * Markup for one entry of the connection picker. Same shape workspace.js's
 * showMenuNewTabOuter builds, plus the "not supported" marker.
 */
function notifyConnectionLabel(p_conn) {
	var v_label = "";
	if (p_conn.v_alias && p_conn.v_alias !== "") {
		v_label += "(" + escapeHtml(p_conn.v_alias) + ")";
	}
	if (p_conn.v_conn_string && p_conn.v_conn_string !== "") {
		v_label += " " + escapeHtml(p_conn.v_conn_string);
	} else {
		if (p_conn.v_details1) {
			v_label += " " + escapeHtml(p_conn.v_details1);
		}
		if (p_conn.v_details2) {
			v_label += " - " + escapeHtml(p_conn.v_details2);
		}
	}
	if (!notifySupportedDbType(p_conn.v_db_type)) {
		v_label += '<span class="omnidb__notify__unsupported-tag">not supported</span>';
	}
	return v_label;
}

/**
 * Opens (or re-selects) the Notify tab for one connection. Channels are
 * per-connection, so a second tab on the same connection would only ever be a
 * duplicate of the first -- re-selecting is what the user meant.
 */
export function createNotifyConnTab(p_conn_id) {
	if (v_notifyOuterTabControl == null) return;

	for (var t = 0; t < v_notifyOuterTabControl.tabList.length; t++) {
		var v_existing_tab = v_notifyOuterTabControl.tabList[t];
		if (v_existing_tab.tag != null && v_existing_tab.tag.connID === p_conn_id) {
			v_notifyOuterTabControl.selectTab(v_existing_tab);
			return;
		}
	}

	/** @type {any} */
	var v_conn = null;
	var v_connections = v_connTabControl.tag.connections || [];
	for (var i = 0; i < v_connections.length; i++) {
		if (v_connections[i].v_conn_id === p_conn_id) {
			v_conn = v_connections[i];
		}
	}
	if (v_conn == null) return;

	// Icon lookup mirrors outer_connection_tab.js's: every supported
	// technology ships an .svg, anything else falls back to the old _medium.png.
	var v_icon = '<img src="' + v_url_folder + "/static/OmniDB_app/images/" + v_conn.v_db_type;
	if (
		v_conn.v_db_type === "postgresql" ||
		v_conn.v_db_type === "oracle" ||
		v_conn.v_db_type === "mariadb" ||
		v_conn.v_db_type === "mysql" ||
		v_conn.v_db_type === "sqlite" ||
		v_conn.v_db_type === "mssql"
	) {
		v_icon += '.svg"/>';
	} else {
		v_icon += '_medium.png"/>';
	}

	var v_tooltip_name = "";
	if (v_conn.v_alias) {
		v_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
	}
	if (v_conn.v_conn_string && v_conn.v_conn_string !== "") {
		v_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_conn_string) + "</div>";
	} else {
		if (v_conn.v_details1) {
			v_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
		}
		if (v_conn.v_details2) {
			v_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
		}
	}

	var v_tab = v_notifyOuterTabControl.createTab({
		p_icon: v_icon,
		p_name: v_conn.v_alias ? escapeHtml(v_conn.v_alias) : "",
		p_close: true,
		p_closeFunction: function (e, p_tab) {
			closeNotifyConnTab(p_tab);
		},
		p_omnidb_tooltip_name: v_tooltip_name,
	});

	v_notifyOuterTabControl.selectTab(v_tab);

	/** @type {any} */
	var v_tag = {
		tab_id: v_tab.id,
		connID: p_conn_id,
		dbType: v_conn.v_db_type,
		mode: "notify",
		/** @type {any[]} */
		messages: [],
		/** @type {any[]} */
		channels: [],
		// null = every channel, otherwise a Set of the channel names to show.
		filterChannel: null,
		context: null,
		listening: false,
		sessionStopped: false,
		tree: null,
		treeRootNode: null,
		divTab: v_tab.elementDiv,
		divLeft: null,
		divTree: null,
		divBanner: null,
		divFilter: null,
		divMessages: null,
	};
	v_tab.tag = v_tag;

	if (notifySupportedDbType(v_conn.v_db_type)) {
		buildNotifyTabLayout(v_tag);
		getTreeNotifyChannels(v_tag);
		startNotifyListening(v_tag);
	} else {
		renderNotifyUnsupported(v_tag, v_conn.v_db_type);
	}
}

/**
 * The tree/messages split, built only for a technology that actually has
 * channels -- an unsupported tab gets renderNotifyUnsupported's message
 * instead, with no tree, no context menu and no message table at all.
 */
function buildNotifyTabLayout(p_tag) {
	var v_id = p_tag.tab_id;

	p_tag.divTab.innerHTML =
		"<div class='omnidb__notify__tab'>" +
		"<div id='" +
		v_id +
		"_notify_div_left' class='omnidb__notify__div-left'>" +
		"<div id='" +
		v_id +
		"_notify_tree' class='omnidb__notify__tree'></div>" +
		"<div id='" +
		v_id +
		"_notify_resize_line' class='resize_line_vertical omnidb__resize-line__container omnidb__notify__resize-line'></div>" +
		"</div>" +
		"<div id='" +
		v_id +
		"_notify_div_right' class='omnidb__notify__div-right'>" +
		"<div id='" +
		v_id +
		"_notify_banner' class='omnidb__notify__banner' style='display: none;'></div>" +
		"<div id='" +
		v_id +
		"_notify_filter' class='omnidb__notify__filter'></div>" +
		"<div id='" +
		v_id +
		"_notify_messages' class='omnidb__notify__messages'></div>" +
		"</div>" +
		"</div>";

	p_tag.divLeft = /** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_div_left"));
	p_tag.divTree = /** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_tree"));
	p_tag.divBanner = /** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_banner"));
	p_tag.divFilter = /** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_filter"));
	p_tag.divMessages = /** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_messages"));

	/** @type {HTMLElement} */ (document.getElementById(v_id + "_notify_resize_line")).addEventListener(
		"mousedown",
		function (event) {
			resizeNotifyHorizontal(event, p_tag);
		},
	);

	renderNotifyFilter(p_tag);
	renderNotifyMessages(p_tag);
}

/**
 * Drag handler for the tree/messages splitter. Self-contained rather than
 * routed through workspace.js's resize helpers: those all resolve their
 * target through v_connTabControl (or the single snippet panel tag), neither
 * of which knows about this panel's tabs.
 */
function resizeNotifyHorizontal(p_event, p_tag) {
	p_event.preventDefault();

	var v_move = function (e) {
		var v_width = e.clientX - p_tag.divLeft.getBoundingClientRect().left;
		if (v_width < 150) v_width = 150;
		if (v_width > 600) v_width = 600;
		p_tag.divLeft.style.width = v_width + "px";
	};
	var v_up = function () {
		document.body.removeEventListener("mousemove", v_move);
		document.body.removeEventListener("mouseup", v_up);
	};

	document.body.addEventListener("mousemove", v_move);
	document.body.addEventListener("mouseup", v_up);
}

/**
 * A connection whose technology has no NOTIFY equivalent still gets a tab --
 * saying so out loud is the whole point, per the feature's UX decision.
 */
export function renderNotifyUnsupported(p_tag, p_db_type) {
	var v_div = p_tag.divTab;
	v_div.innerHTML = "";

	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-bell-slash omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = "NOTIFY-style channels are not supported for " + p_db_type + " connections.";
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent =
		"Only PostgreSQL (LISTEN/NOTIFY) and Oracle (DBMS_ALERT) connections support this feature.";
	v_wrapper.appendChild(v_text);

	v_div.appendChild(v_wrapper);
}

function closeNotifyConnTab(p_tab) {
	if (p_tab.tag != null && p_tab.tag.listening) {
		createRequest(v_queryRequestCodes.CloseTab, [{ tab_id: p_tab.tag.tab_id, tab_db_id: null }]);
	}
	p_tab.removeTab();
}

/**
 * Starts (or restarts) the live session for one tab. Exactly one context per
 * tab, created once and never removed -- the backend pushes into it for the
 * whole lifetime of the tab, same contract as startTerminal/terminalReturn.
 * Reusing the existing context on a restart is what keeps a stopped-and-
 * restarted session from leaking a context per attempt.
 */
export function startNotifyListening(p_tag) {
	if (p_tag.context == null) {
		p_tag.context = createContext({ tab_tag: p_tag, acked: false });
	}

	p_tag.sessionStopped = false;
	p_tag.listening = true;

	createRequest(
		v_queryRequestCodes.NotifyListen,
		{ v_db_index: p_tag.connID, v_tab_id: p_tag.tab_id },
		p_tag.context.code,
	);
}

export function notifyMessageReceived(p_message, p_context) {
	var v_tag = p_context.tab_tag;
	if (v_tag == null) return;

	v_tag.messages.push({
		channel: p_message.v_data.v_channel,
		payload: p_message.v_data.v_payload,
		ts: p_message.v_data.v_timestamp,
	});

	renderNotifyMessages(v_tag);
}

/**
 * The backend gave up on this session (currently only because the client was
 * not draining the polling queue fast enough). Restarting is manual on
 * purpose: an automatic retry would walk straight back into whatever
 * overloaded the queue in the first place.
 */
export function notifySessionStopped(p_tag, p_message) {
	if (p_tag == null) return;

	p_tag.sessionStopped = true;
	p_tag.listening = false;
	renderNotifyChannelNodes(p_tag);

	if (p_tag.divBanner == null) return;

	p_tag.divBanner.innerHTML = "";

	var v_text = document.createElement("span");
	v_text.textContent = p_message ? String(p_message) : "Listening was stopped.";
	p_tag.divBanner.appendChild(v_text);

	var v_button = document.createElement("button");
	v_button.type = "button";
	v_button.className = "btn btn-sm omnidb__theme__btn--secondary ms-2";
	v_button.textContent = "Restart Listening";
	v_button.addEventListener("click", function () {
		restartNotifyListening(p_tag);
	});
	p_tag.divBanner.appendChild(v_button);

	p_tag.divBanner.style.display = "";
}

function restartNotifyListening(p_tag) {
	p_tag.divBanner.innerHTML = "";
	p_tag.divBanner.style.display = "none";

	startNotifyListening(p_tag);
	refreshNotifyChannels(p_tag);
}

/**
 * The channel filter row: an "All channels" checkbox plus one per channel,
 * and the Clear All button. Purely client-side -- nothing here ever reaches
 * the backend, there is nothing stored there to filter or clear.
 */
export function renderNotifyFilter(p_tag) {
	if (p_tag == null || p_tag.divFilter == null) return;

	var v_div = p_tag.divFilter;
	v_div.innerHTML = "";

	var v_channels = p_tag.channels || [];

	v_div.appendChild(
		buildNotifyFilterCheckbox(p_tag.tab_id + "_notify_filter_all", "All channels", p_tag.filterChannel == null, function (p_checked) {
			p_tag.filterChannel = p_checked ? null : new Set();
			renderNotifyFilter(p_tag);
			renderNotifyMessages(p_tag);
		}),
	);

	for (var i = 0; i < v_channels.length; i++)
		(function (i) {
			var v_name = v_channels[i].name;
			var v_checked = p_tag.filterChannel == null || p_tag.filterChannel.has(v_name);

			v_div.appendChild(
				buildNotifyFilterCheckbox(p_tag.tab_id + "_notify_filter_" + i, v_name, v_checked, function (p_checked) {
					/** @type {Set<string>} */
					var v_set;
					if (p_tag.filterChannel == null) {
						v_set = new Set();
						for (var k = 0; k < v_channels.length; k++) v_set.add(v_channels[k].name);
					} else {
						v_set = new Set(p_tag.filterChannel);
					}

					if (p_checked) v_set.add(v_name);
					else v_set.delete(v_name);

					// Back to "everything" rather than a Set that happens to
					// list everything -- otherwise a channel added later would
					// silently start out filtered away.
					p_tag.filterChannel = v_set.size === v_channels.length ? null : v_set;

					renderNotifyFilter(p_tag);
					renderNotifyMessages(p_tag);
				}),
			);
		})(i);

	var v_clear_all = document.createElement("button");
	v_clear_all.type = "button";
	v_clear_all.className = "btn btn-sm omnidb__theme__btn--secondary omnidb__notify__filter-clear";
	v_clear_all.textContent = "Clear All";
	v_clear_all.addEventListener("click", function () {
		clearAllNotifyMessages(p_tag);
	});
	v_div.appendChild(v_clear_all);
}

/**
 * @param {string} p_id
 * @param {string} p_label
 * @param {boolean} p_checked
 * @param {(p_checked: boolean) => void} p_change_function
 */
function buildNotifyFilterCheckbox(p_id, p_label, p_checked, p_change_function) {
	var v_wrapper = document.createElement("label");
	v_wrapper.className = "omnidb__notify__filter-item";
	v_wrapper.htmlFor = p_id;

	var v_input = document.createElement("input");
	v_input.type = "checkbox";
	v_input.id = p_id;
	v_input.checked = p_checked;
	v_input.addEventListener("change", function () {
		p_change_function(v_input.checked);
	});
	v_wrapper.appendChild(v_input);

	// Channel names are user-supplied -- text node, never markup.
	var v_text = document.createElement("span");
	v_text.textContent = p_label;
	v_wrapper.appendChild(v_text);

	return v_wrapper;
}

function notifyFilteredMessages(p_tag) {
	if (p_tag.filterChannel == null) return p_tag.messages;

	var v_filter = p_tag.filterChannel;
	return p_tag.messages.filter(function (p_message) {
		return v_filter.has(p_message.channel);
	});
}

/**
 * Rebuilds the whole message table from `tag.messages` on every change. A
 * plain table on purpose: this is an append-only, ephemeral log, so a grid
 * component would be all cost and no benefit here.
 */
export function renderNotifyMessages(p_tag) {
	if (p_tag == null || p_tag.divMessages == null) return;

	var v_div = p_tag.divMessages;
	v_div.innerHTML = "";

	var v_messages = notifyFilteredMessages(p_tag);

	if (v_messages.length === 0) {
		var v_empty = document.createElement("div");
		v_empty.className = "omnidb__notify__empty";
		v_empty.textContent =
			p_tag.messages.length === 0 ? "No messages received yet." : "No messages on the selected channels.";
		v_div.appendChild(v_empty);
		return;
	}

	var v_table = document.createElement("table");
	v_table.className = "omnidb__notify__table";

	var v_thead = document.createElement("thead");
	var v_header_row = document.createElement("tr");
	var v_columns = ["Channel", "Time", "Payload"];
	for (var c = 0; c < v_columns.length; c++) {
		var v_th = document.createElement("th");
		v_th.textContent = v_columns[c];
		v_header_row.appendChild(v_th);
	}
	v_thead.appendChild(v_header_row);
	v_table.appendChild(v_thead);

	var v_tbody = document.createElement("tbody");
	for (var i = 0; i < v_messages.length; i++) {
		var v_row = document.createElement("tr");
		// Channel name and payload both come straight from the database --
		// built as text nodes, never interpolated into a string of markup.
		var v_cells = [v_messages[i].channel, v_messages[i].ts, v_messages[i].payload];
		for (var k = 0; k < v_cells.length; k++) {
			var v_td = document.createElement("td");
			v_td.textContent = v_cells[k] == null ? "" : String(v_cells[k]);
			v_row.appendChild(v_td);
		}
		v_tbody.appendChild(v_row);
	}
	v_table.appendChild(v_tbody);

	v_div.appendChild(v_table);

	// Append-only log -- keep the newest row in view.
	v_div.scrollTop = v_div.scrollHeight;
}

export function clearNotifyChannelMessages(p_tag, p_channel_name) {
	p_tag.messages = p_tag.messages.filter(function (p_message) {
		return p_message.channel !== p_channel_name;
	});
	renderNotifyMessages(p_tag);
}

export function clearAllNotifyMessages(p_tag) {
	p_tag.messages = [];
	renderNotifyMessages(p_tag);
}
