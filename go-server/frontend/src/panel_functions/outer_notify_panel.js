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
 * The Notify section: a channel tree on the left and the messages that
 * arrived on those channels on the right, for whichever connection is
 * currently selected in the Database section's own connection strip.
 *
 * Deliberately *not* its own outer tab control: the whole point of this
 * design is that Notify shows the exact same set of open connections, in the
 * same place, with the same one selected, as the Database section -- so
 * v_connTabControl.tabMenu (the real strip, built by tabs.js) is physically
 * relocated into this section's own slot while it is active (see
 * section_switcher.js's switchSection) instead of this panel keeping a
 * second, independently-synced strip.
 *
 * Listening itself still runs over its own connection, pinned per the
 * backend's notify_session.go -- LISTEN/DBMS_ALERT cannot share a connection
 * with whatever queries are running in that same connection's Query/Console
 * tabs. That session's lifetime now simply mirrors the connection tab's own:
 * started the moment a connection tab opens (see startNotifyForConnTab,
 * called from outer_connection_tab.js), torn down when it closes (the
 * backend already does this from the CloseTab message that tab's own close
 * handler sends -- see longpolling.go's requestTypeCloseTab, which closes a
 * notify session for every tab_id in that batch, and the outer connection
 * tab's own id is always the first entry in it).
 *
 * Messages are ephemeral by design: they live in `tag.messages` and nowhere
 * else, so a reload starts from an empty list. Only the channel list itself
 * (and each channel's active/paused state) is persisted, by the backend.
 */

import { createContext, createRequest } from "../long_polling.js";
import { v_queryRequestCodes } from "../query.js";
import {
	getTreeNotifyChannels,
	refreshNotifyChannels,
	renderNotifyChannelNodes,
} from "../tree_context_functions/tree_notify.js";

// Fixed ids: there is only ever one Notify section instance, so its own
// elements do not need a unique-per-connection prefix -- only the per-tab
// tree/message ids inside buildNotifyTabLayout do, keyed off tab_id as
// everywhere else.
var NOTIFY_STRIP_SLOT_ID = "notify_panel_strip_slot";
var NOTIFY_CONTENT_ID = "notify_panel_content";

/**
 * The two technologies with a real asynchronous notification mechanism:
 * PostgreSQL's LISTEN/NOTIFY and Oracle's DBMS_ALERT. Every open connection
 * gets a pane here regardless (deliberately -- unsupported ones must say so,
 * not just disappear), it just shows a message instead of a channel tree.
 */
var NOTIFY_SUPPORTED_DB_TYPES = ["postgresql", "oracle"];

// The notify sub-tag (see startNotifyForConnTab) currently mounted into
// #notify_panel_content, if any -- tracked so refreshNotifyPane can detach
// its div* references before mounting a different one, rather than leaving
// a later NOTIFY message quietly re-rendering into a detached node.
/** @type {any} */
var v_mounted_notify_tag = null;

/**
 * @param {string} p_db_type
 */
export function notifySupportedDbType(p_db_type) {
	return NOTIFY_SUPPORTED_DB_TYPES.indexOf(p_db_type) !== -1;
}

export var v_createNotifyPanelFunction = function () {
	var v_html =
		"<div class='omnidb__notify'>" +
		"<div id='" +
		NOTIFY_STRIP_SLOT_ID +
		"' class='omnidb__tab-menu--container omnidb__tab-menu--container--primary omnidb__conn-strip-host'></div>" +
		"<div id='" +
		NOTIFY_CONTENT_ID +
		"' class='omnidb__notify__content'></div>" +
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_notify"));
	v_target.innerHTML = v_html;
};

/**
 * Starts the notify session for a newly-created Database connection tab and
 * attaches its state as `p_conn_tab.tag.notify` -- called once, right after
 * outer_connection_tab.js finishes building that tab (after changeDatabase,
 * so selectedDatabaseIndex/selectedDBMS are already populated). An
 * unsupported technology still gets the sub-tag (refreshNotifyPane needs it
 * to know what to show), it just never starts listening.
 * @param {any} p_conn_tab
 */
export function startNotifyForConnTab(p_conn_tab) {
	/** @type {any} */
	var v_notify_tag = {
		tab_id: p_conn_tab.id,
		connID: p_conn_tab.tag.selectedDatabaseIndex,
		dbType: p_conn_tab.tag.selectedDBMS,
		/** @type {any[]} */
		messages: [],
		/** @type {any[]} */
		channels: [],
		// null = every channel, otherwise a Set of the channel names to show.
		filterChannel: null,
		context: null,
		listening: false,
		sessionStopped: false,
		lastStopMessage: null,
		tree: null,
		treeRootNode: null,
		divTab: null,
		divLeft: null,
		divTree: null,
		divBanner: null,
		divFilter: null,
		divMessages: null,
	};
	p_conn_tab.tag.notify = v_notify_tag;

	if (notifySupportedDbType(v_notify_tag.dbType)) {
		startNotifyListening(v_notify_tag);
	}
}

/**
 * Renders the Notify content pane for whichever connection tab is currently
 * selected in the shared strip. Safe to call any time, from anywhere -- it
 * no-ops if the section's own shell has not been built yet (v_createNotifyPanelFunction
 * runs once at startup, before that this is unreachable regardless). Called
 * both when the Notify section becomes active (section_switcher.js) and
 * whenever the selected/open connection tabs change while already looking at
 * it (outer_connection_tab.js's p_selectFunction/p_closeFunction).
 */
export function refreshNotifyPane() {
	var v_content = document.getElementById(NOTIFY_CONTENT_ID);
	if (v_content == null) return;

	if (v_mounted_notify_tag != null) {
		v_mounted_notify_tag.divTab = null;
		v_mounted_notify_tag.divLeft = null;
		v_mounted_notify_tag.divTree = null;
		v_mounted_notify_tag.divBanner = null;
		v_mounted_notify_tag.divFilter = null;
		v_mounted_notify_tag.divMessages = null;
		v_mounted_notify_tag = null;
	}

	v_content.innerHTML = "";

	var v_conn_tab = typeof v_connTabControl !== "undefined" ? v_connTabControl.selectedTab : null;

	// tabs.js's removeTab leaves selectedTab pointing at the tab just
	// removed when nothing selectable is left to fall back to (only the
	// trailing, non-selectable "+" tab remains) -- selectTabIndex silently
	// no-ops for a non-selectable target instead of clearing the selection.
	// That stale tab is always spliced out of tabList itself though, so
	// checking membership there is a reliable way to detect it.
	if (v_conn_tab != null && v_connTabControl.tabList.indexOf(v_conn_tab) === -1) {
		v_conn_tab = null;
	}

	if (v_conn_tab == null || v_conn_tab.tag == null || v_conn_tab.tag.notify == null) {
		renderNotifyEmptyState(v_content);
		return;
	}

	var v_notify_tag = v_conn_tab.tag.notify;
	v_notify_tag.divTab = v_content;
	v_mounted_notify_tag = v_notify_tag;

	if (notifySupportedDbType(v_notify_tag.dbType)) {
		buildNotifyTabLayout(v_notify_tag);
		getTreeNotifyChannels(v_notify_tag);
		if (v_notify_tag.sessionStopped) {
			notifySessionStopped(v_notify_tag, v_notify_tag.lastStopMessage);
		}
	} else {
		renderNotifyUnsupported(v_notify_tag, v_notify_tag.dbType);
	}
}

/**
 * Shown when no connection is open at all -- there is nothing for the
 * shared strip (relocated above this) to point at.
 * @param {HTMLElement} p_content
 */
function renderNotifyEmptyState(p_content) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-bell-slash omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = "No connection open.";
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = "Open a connection in the Database panel to listen for its NOTIFY channels here.";
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
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
 * of which knows about this panel's own content div.
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
 * A connection whose technology has no NOTIFY equivalent still gets a pane --
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

/**
 * Starts (or restarts) the live session for one connection's notify state.
 * Exactly one context per connection tab, created once and never removed --
 * the backend pushes into it for the whole lifetime of the tab, same
 * contract as startTerminal/terminalReturn. Reusing the existing context on
 * a restart is what keeps a stopped-and-restarted session from leaking a
 * context per attempt.
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
 * overloaded the queue in the first place. The message is remembered
 * (lastStopMessage) so the banner can be rebuilt faithfully if this tab's
 * pane is remounted later (see refreshNotifyPane) after the stop happened
 * while some other connection's pane was showing.
 */
export function notifySessionStopped(p_tag, p_message) {
	if (p_tag == null) return;

	p_tag.sessionStopped = true;
	p_tag.listening = false;
	p_tag.lastStopMessage = p_message;
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
