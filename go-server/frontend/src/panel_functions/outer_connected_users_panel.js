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
 * The Connected Users section: a live grid of server backends/sessions/
 * processes for whichever connection is currently selected in the Database
 * section's own connection strip, with a per-technology terminate action.
 *
 * Same design as Notify (see outer_notify_panel.js's module comment): this is
 * deliberately *not* its own outer tab control. v_connTabControl.tabMenu is
 * physically relocated into this section's own slot while it is active (see
 * section_switcher.js's switchSection), so this pane always shows the exact
 * same set of open connections, in the same place, with the same one
 * selected, as Database and Notify -- instead of keeping a third,
 * independently-synced strip.
 *
 * Unlike Notify, there is no persistent backend session here: this is a
 * plain request/response grid (same /refresh_monitoring/ endpoint the old
 * per-connection "Backends"/"Sessions"/"Process List" inner tab used), so
 * nothing needs to be started when a connection tab opens or torn down when
 * it closes -- the pane is simply rebuilt from scratch, for whichever
 * connection is selected, every time it is (re)shown.
 *
 * The grid itself never shows the raw SQL columns 1:1 -- CONNECTED_USERS_CONFIG's
 * `layout` is a small per-technology list of *composite* columns, each a
 * `value(named)` function that reads one or more raw column values (looked up
 * case-insensitively by name, since drivers differ on casing) and returns
 * either plain text or, for a multi-field column, an escaped HTML string
 * (name plus its numeric id stacked underneath, address:port squashed onto
 * one line, ...). This is what keeps the table narrow despite Oracle's
 * v$session or Postgres's pg_stat_activity returning dozens of raw columns.
 * Every label/tooltip is a t() key (labelKey/tooltipKey, or labelKey1+labelKey2
 * for a two-line header) rather than a literal string, resolved fresh on every
 * fetch -- so a language change takes effect on the next refresh, same as
 * everywhere else in this frontend.
 *
 * Postgres also gets an isSystemRow(named) predicate: pg_stat_activity mixes
 * real client backends with internal background workers (autovacuum,
 * checkpointer, wal writer, ...) that have neither a database nor a user name
 * -- rows that match are hidden by default (renderConnectedUsersGrid) and
 * only shown once the "show system processes" checkbox next to the record
 * count is ticked, since most of the time nobody wants to scroll past them
 * to find an actual client session.
 *
 * The query text itself (only present for Postgres/MySQL/MariaDB -- Oracle's
 * v$session has no query *text* column, and MSSQL/Firebird's curated queries
 * don't select one either) is deliberately never a grid column at all: it
 * rides along as an extra, unrendered element appended to each row, and
 * clicking a row instead opens it in the read-only, syntax-highlighted detail
 * pane below the grid (buildConnectedUsersLayout). That same trailing element
 * is also how the context menu's "Terminate" item recovers the row's
 * original, positional raw data for connectedUsersAction/the
 * xxxTerminateBackend(p_row) functions in workspace.js -- those still index
 * into it exactly as they did when it was the untouched SQL result row,
 * since composing the visible columns never touches it.
 */

import { execAjax } from "../ajax_control_bridge.js";
import { editCellData } from "../header_actions.js";
import { showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { escapeHtml } from "../query.js";
import { t } from "../i18n.js";
import { connectedUsersAction, uiCopyTextToClipboard } from "../workspace.js";
import { switchSection } from "../section_switcher.js";

var CONNECTED_USERS_STRIP_SLOT_ID = "connected_users_panel_strip_slot";
var CONNECTED_USERS_CONTENT_ID = "connected_users_panel_content";

// --- composite-cell helpers --------------------------------------------------
//
// Every raw value here comes straight from the database (a username, an
// application name, ...) so every one of these builds its HTML through
// escapeHtml -- this is rendered with col.renderer === "html", unlike plain
// columns which go through textContent and need no escaping of their own.

/**
 * @param {any} p_value
 */
function isBlank(p_value) {
	return p_value === null || p_value === undefined || p_value === "";
}

/**
 * Two stacked lines: a primary value, and an optional muted secondary one
 * (an "ID: 123" line, a hostname under an address, ...). Omits the second
 * line entirely when it's blank -- fine here, since which of the two a lone
 * line represents is never ambiguous (a name with no id under it still reads
 * as just a name). "–" when both are blank.
 * @param {any} p_line1
 * @param {any} p_line2
 */
function twoLine(p_line1, p_line2) {
	if (isBlank(p_line1) && isBlank(p_line2)) return "–";
	var v_html = "<div>" + escapeHtml(isBlank(p_line1) ? "–" : String(p_line1)) + "</div>";
	if (!isBlank(p_line2)) {
		v_html += "<div class='text-muted' style='font-size:0.85em;'>" + escapeHtml(String(p_line2)) + "</div>";
	}
	return v_html;
}

/**
 * Two stacked lines that are *interchangeable* (either could independently be
 * present or missing, e.g. two different timestamps) -- unlike twoLine, this
 * always renders both, "–" standing in for whichever is blank, so line 1
 * stays line 1 and line 2 stays line 2 no matter which is missing. Paired
 * with a two-line *header* (headerTwoLine) that names each line once instead
 * of repeating a label on every row, and with `verticalAlign: "top"` on the
 * column so the two lines don't drift to the middle of a taller row.
 * @param {any} p_line1
 * @param {any} p_line2
 */
function timeTwoLine(p_line1, p_line2) {
	var v_line1 = isBlank(p_line1) ? "–" : String(p_line1);
	var v_line2 = isBlank(p_line2) ? "–" : String(p_line2);
	return (
		"<div>" +
		escapeHtml(v_line1) +
		"</div><div class='text-muted' style='font-size:0.85em;'>" +
		escapeHtml(v_line2) +
		"</div>"
	);
}

/**
 * "address:port" on one line -- whichever half is present, joined only when
 * both are.
 * @param {any} p_addr
 * @param {any} p_port
 */
function addrPort(p_addr, p_port) {
	if (isBlank(p_addr) && isBlank(p_port)) return null;
	if (!isBlank(p_addr) && !isBlank(p_port)) return p_addr + ":" + p_port;
	return isBlank(p_addr) ? ":" + p_port : String(p_addr);
}

/**
 * A two-line column header, styled the same way as twoLine's data cells
 * (small muted second line) so the two stay visually paired -- used where a
 * composite column's two stacked values carry no per-row label of their own;
 * naming which is which belongs in the header instead, once, rather than on
 * every row. `p_line1`/`p_line2` are already-resolved t() strings (static,
 * developer-chosen translation keys, never raw DB data), so no escaping here.
 * @param {string} p_line1
 * @param {string} p_line2
 */
function headerTwoLine(p_line1, p_line2) {
	return "<div>" + p_line1 + "</div><div class='text-muted' style='font-size:0.85em;'>" + p_line2 + "</div>";
}

/**
 * "type: event" (or whichever half is present) on one line -- Postgres's
 * wait_event_type/wait_event pair.
 * @param {any} p_type
 * @param {any} p_event
 */
function waitLine(p_type, p_event) {
	if (isBlank(p_type) && isBlank(p_event)) return "–";
	if (!isBlank(p_type) && !isBlank(p_event)) return escapeHtml(p_type + ": " + p_event);
	return escapeHtml(String(isBlank(p_type) ? p_event : p_type));
}

/**
 * "event (Ns)" -- Oracle's event/seconds_in_wait pair.
 * @param {any} p_event
 * @param {any} p_seconds
 */
function waitDuration(p_event, p_seconds) {
	if (isBlank(p_event)) return "–";
	if (isBlank(p_seconds)) return escapeHtml(String(p_event));
	return escapeHtml(p_event + " (" + p_seconds + "s)");
}

// MySQL and MariaDB's information_schema.processlist columns are identical.
var MYSQL_PROCESSLIST_LAYOUT = [
	{
		labelKey: "connected_users.col_myproc_user_label",
		tooltipKey: "connected_users.col_myproc_user_tooltip",
		width: 150,
		html: true,
		value: function (v) {
			return twoLine(v.user, isBlank(v.id) ? null : "ID: " + v.id);
		},
	},
	{ labelKey: "connected_users.col_myproc_host_label", tooltipKey: "connected_users.col_myproc_host_tooltip", raw: "host", width: 150 },
	{ labelKey: "connected_users.col_myproc_db_label", tooltipKey: "connected_users.col_myproc_db_tooltip", raw: "db", width: 130 },
	{ labelKey: "connected_users.col_myproc_command_label", tooltipKey: "connected_users.col_myproc_command_tooltip", raw: "command", width: 100 },
	{ labelKey: "connected_users.col_myproc_time_label", tooltipKey: "connected_users.col_myproc_time_tooltip", raw: "time", width: 80, align: "right" },
	{ labelKey: "connected_users.col_myproc_state_label", tooltipKey: "connected_users.col_myproc_state_tooltip", raw: "state", width: 150 },
];

/**
 * One entry per technology that exposes a live backends/sessions/processes
 * view. A technology missing here (e.g. sqlite, which has no server process
 * to list) gets the "not supported" message instead of a grid -- deliberately,
 * same reasoning as Notify's own NOTIFY_SUPPORTED_DB_TYPES.
 *
 * `layout` entries are read case-insensitively against the raw column names
 * that actually came back: either `raw` (a single column, shown as plain
 * text) or `value(named)` (one or more columns, composed into an escaped
 * HTML string -- these set `html: true`). `queryColumnKey` names the one raw
 * column (if any) holding the running SQL text, moved to the detail pane
 * instead of a grid column. `isSystemRow(named)`, if present, marks rows
 * hidden by default (see this module's own doc comment).
 */
var CONNECTED_USERS_CONFIG = {
	postgresql: {
		query: "select * from pg_stat_activity",
		terminateAction: "postgresqlTerminateBackend",
		queryColumnKey: "query",
		isSystemRow: function (v) {
			return isBlank(v.datname) && isBlank(v.usename);
		},
		layout: [
			{ labelKey: "connected_users.col_pg_pid_label", tooltipKey: "connected_users.col_pg_pid_tooltip", raw: "pid", width: 90, align: "right" },
			{
				labelKey: "connected_users.col_pg_database_label",
				tooltipKey: "connected_users.col_pg_database_tooltip",
				width: 150,
				html: true,
				value: function (v) {
					return twoLine(v.datname, isBlank(v.datid) ? null : "ID: " + v.datid);
				},
			},
			{
				labelKey: "connected_users.col_pg_user_label",
				tooltipKey: "connected_users.col_pg_user_tooltip",
				width: 140,
				html: true,
				value: function (v) {
					return twoLine(v.usename, isBlank(v.usesysid) ? null : "ID: " + v.usesysid);
				},
			},
			{
				labelKey: "connected_users.col_pg_client_label",
				tooltipKey: "connected_users.col_pg_client_tooltip",
				width: 170,
				html: true,
				value: function (v) {
					return twoLine(addrPort(v.client_addr, v.client_port), v.client_hostname);
				},
			},
			{ labelKey: "connected_users.col_pg_application_label", tooltipKey: "connected_users.col_pg_application_tooltip", raw: "application_name", width: 140 },
			{
				// Header carries which time is which (two lines, matching the
				// data below it line for line) instead of repeating it on every
				// row -- a per-row "Proces: .../Transakce: ..." label made the
				// timestamps themselves start at a different column on every
				// row, depending on that row's label lengths. verticalAlign
				// "top" plus timeTwoLine's own always-both-lines behaviour is
				// what keeps line 1 always meaning the same thing even when
				// line 2 is missing (or vice versa).
				labelKey1: "connected_users.col_pg_time_start_label1",
				labelKey2: "connected_users.col_pg_time_start_label2",
				tooltipKey: "connected_users.col_pg_time_start_tooltip",
				width: 170,
				html: true,
				verticalAlign: "top",
				value: function (v) {
					return timeTwoLine(v.backend_start, v.xact_start);
				},
			},
			{
				labelKey1: "connected_users.col_pg_time_activity_label1",
				labelKey2: "connected_users.col_pg_time_activity_label2",
				tooltipKey: "connected_users.col_pg_time_activity_tooltip",
				width: 170,
				html: true,
				verticalAlign: "top",
				value: function (v) {
					return timeTwoLine(v.query_start, v.state_change);
				},
			},
			{
				labelKey: "connected_users.col_pg_wait_label",
				tooltipKey: "connected_users.col_pg_wait_tooltip",
				width: 150,
				html: true,
				value: function (v) {
					return waitLine(v.wait_event_type, v.wait_event);
				},
			},
			{ labelKey: "connected_users.col_pg_state_label", tooltipKey: "connected_users.col_pg_state_tooltip", raw: "state", width: 90 },
			{
				labelKey: "connected_users.col_pg_xact_label",
				tooltipKey: "connected_users.col_pg_xact_tooltip",
				width: 130,
				html: true,
				value: function (v) {
					return twoLine(
						isBlank(v.backend_xid) ? null : "XID: " + v.backend_xid,
						isBlank(v.backend_xmin) ? null : "Xmin: " + v.backend_xmin,
					);
				},
			},
			{ labelKey: "connected_users.col_pg_query_id_label", tooltipKey: "connected_users.col_pg_query_id_tooltip", raw: "query_id", width: 100 },
			{ labelKey: "connected_users.col_pg_backend_type_label", tooltipKey: "connected_users.col_pg_backend_type_tooltip", raw: "backend_type", width: 130 },
		],
	},
	mysql: {
		query: "select * from information_schema.processlist",
		terminateAction: "mysqlTerminateBackend",
		queryColumnKey: "info",
		layout: MYSQL_PROCESSLIST_LAYOUT,
	},
	mariadb: {
		query: "select * from information_schema.processlist",
		terminateAction: "mariadbTerminateBackend",
		queryColumnKey: "info",
		layout: MYSQL_PROCESSLIST_LAYOUT,
	},
	oracle: {
		query: "select * from v$session",
		terminateAction: "oracleTerminateBackend",
		queryColumnKey: null,
		isSystemRow: function (v) {
			return isBlank(v.username);
		},
		layout: [
			{
				labelKey: "connected_users.col_oracle_sid_label",
				tooltipKey: "connected_users.col_oracle_sid_tooltip",
				width: 110,
				html: true,
				value: function (v) {
					return twoLine(
						isBlank(v.sid) ? null : "SID: " + v.sid,
						isBlank(v["serial#"]) ? null : "Serial#: " + v["serial#"],
					);
				},
			},
			{ labelKey: "connected_users.col_oracle_user_label", tooltipKey: "connected_users.col_oracle_user_tooltip", raw: "username", width: 120 },
			{ labelKey: "connected_users.col_oracle_status_label", tooltipKey: "connected_users.col_oracle_status_tooltip", raw: "status", width: 90 },
			{ labelKey: "connected_users.col_oracle_schema_label", tooltipKey: "connected_users.col_oracle_schema_tooltip", raw: "schemaname", width: 110 },
			{
				labelKey: "connected_users.col_oracle_client_label",
				tooltipKey: "connected_users.col_oracle_client_tooltip",
				width: 170,
				html: true,
				value: function (v) {
					return twoLine(v.machine, isBlank(v.osuser) ? null : "OS: " + v.osuser);
				},
			},
			{ labelKey: "connected_users.col_oracle_program_label", tooltipKey: "connected_users.col_oracle_program_tooltip", raw: "program", width: 150 },
			{
				labelKey: "connected_users.col_oracle_module_label",
				tooltipKey: "connected_users.col_oracle_module_tooltip",
				width: 160,
				html: true,
				value: function (v) {
					return twoLine(v.module, v.action);
				},
			},
			{ labelKey: "connected_users.col_oracle_client_info_label", tooltipKey: "connected_users.col_oracle_client_info_tooltip", raw: "client_info", width: 180 },
			{ labelKey: "connected_users.col_oracle_logon_label", tooltipKey: "connected_users.col_oracle_logon_tooltip", raw: "logon_time", width: 150 },
			{ labelKey: "connected_users.col_oracle_idle_label", tooltipKey: "connected_users.col_oracle_idle_tooltip", raw: "last_call_et", width: 100, align: "right" },
			{ labelKey: "connected_users.col_oracle_sql_id_label", tooltipKey: "connected_users.col_oracle_sql_id_tooltip", raw: "sql_id", width: 100 },
			{
				labelKey: "connected_users.col_oracle_wait_label",
				tooltipKey: "connected_users.col_oracle_wait_tooltip",
				width: 170,
				html: true,
				value: function (v) {
					return waitDuration(v.event, v.seconds_in_wait);
				},
			},
			{ labelKey: "connected_users.col_oracle_blocking_label", tooltipKey: "connected_users.col_oracle_blocking_tooltip", raw: "blocking_session", width: 100, align: "right" },
		],
	},
	mssql: {
		query:
			"select session_id, login_name, host_name, program_name, status from sys.dm_exec_sessions where is_user_process = 1",
		terminateAction: "mssqlTerminateBackend",
		queryColumnKey: null,
		layout: [
			{ labelKey: "connected_users.col_mssql_session_id_label", tooltipKey: "connected_users.col_mssql_session_id_tooltip", raw: "session_id", width: 90, align: "right" },
			{ labelKey: "connected_users.col_mssql_login_label", tooltipKey: "connected_users.col_mssql_login_tooltip", raw: "login_name", width: 160 },
			{ labelKey: "connected_users.col_mssql_host_label", tooltipKey: "connected_users.col_mssql_host_tooltip", raw: "host_name", width: 140 },
			{ labelKey: "connected_users.col_mssql_program_label", tooltipKey: "connected_users.col_mssql_program_tooltip", raw: "program_name", width: 160 },
			{ labelKey: "connected_users.col_mssql_status_label", tooltipKey: "connected_users.col_mssql_status_tooltip", raw: "status", width: 100 },
		],
	},
	firebird: {
		query:
			"select a.mon$attachment_id, a.mon$user, a.mon$remote_address, " +
			"case a.mon$state when 1 then 'active' else 'idle' end as state " +
			"from mon$attachments a where a.mon$attachment_id <> current_connection",
		terminateAction: "firebirdTerminateBackend",
		queryColumnKey: null,
		layout: [
			{ labelKey: "connected_users.col_firebird_id_label", tooltipKey: "connected_users.col_firebird_id_tooltip", raw: "mon$attachment_id", width: 100, align: "right" },
			{ labelKey: "connected_users.col_firebird_user_label", tooltipKey: "connected_users.col_firebird_user_tooltip", raw: "mon$user", width: 130 },
			{ labelKey: "connected_users.col_firebird_address_label", tooltipKey: "connected_users.col_firebird_address_tooltip", raw: "mon$remote_address", width: 160 },
			{ labelKey: "connected_users.col_firebird_state_label", tooltipKey: "connected_users.col_firebird_state_tooltip", raw: "state", width: 90 },
		],
	},
};

// The mounted pane's own div refs/grid instance, if any -- tracked so a stale
// ajax response (the user switched connection tabs, or left the section,
// while a request was in flight) cannot render into a detached node or the
// wrong connection's pane. Bumped by every refreshConnectedUsersPane call; an
// in-flight request's callback bails if the token it captured no longer
// matches.
var v_render_token = 0;
/** @type {any} */
var v_mounted = null;

/**
 * @param {string} p_db_type
 */
export function connectedUsersSupportedDbType(p_db_type) {
	return Object.prototype.hasOwnProperty.call(CONNECTED_USERS_CONFIG, p_db_type);
}

export var v_createConnectedUsersPanelFunction = function () {
	var v_html =
		"<div class='omnidb__connected-users'>" +
		"<div id='" +
		CONNECTED_USERS_STRIP_SLOT_ID +
		"' class='omnidb__tab-menu--container omnidb__tab-menu--container--primary omnidb__conn-strip-host'></div>" +
		"<div id='" +
		CONNECTED_USERS_CONTENT_ID +
		"' class='omnidb__connected-users__content'></div>" +
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_connected_users"));
	v_target.innerHTML = v_html;
};

/**
 * Renders the Connected Users content pane for whichever connection tab is
 * currently selected in the shared strip. Safe to call any time, from
 * anywhere -- it no-ops if the section's own shell has not been built yet.
 * Called both when the section becomes active (section_switcher.js) and
 * whenever the selected/open connection tabs change while already looking at
 * it (outer_connection_tab.js's p_selectFunction/p_closeFunction).
 */
export function refreshConnectedUsersPane() {
	var v_content = document.getElementById(CONNECTED_USERS_CONTENT_ID);
	if (v_content == null) return;

	v_render_token++;
	v_mounted = null;
	v_content.innerHTML = "";

	var v_conn_tab = typeof v_connTabControl !== "undefined" ? v_connTabControl.selectedTab : null;

	// tabs.js's removeTab leaves selectedTab pointing at the tab just removed
	// when nothing selectable is left to fall back to -- see
	// outer_notify_panel.js's refreshNotifyPane for the same check.
	if (v_conn_tab != null && v_connTabControl.tabList.indexOf(v_conn_tab) === -1) {
		v_conn_tab = null;
	}

	if (v_conn_tab == null || v_conn_tab.tag == null) {
		renderConnectedUsersEmptyState(v_content);
		return;
	}

	var v_db_type = v_conn_tab.tag.selectedDBMS;
	var v_config = CONNECTED_USERS_CONFIG[v_db_type];

	if (v_config == null) {
		renderConnectedUsersUnsupported(v_content, v_db_type);
		return;
	}

	buildConnectedUsersLayout(v_content, v_conn_tab, v_config, v_render_token);
}

/**
 * Shown when no connection is open at all -- there is nothing for the shared
 * strip (relocated above this) to point at.
 * @param {HTMLElement} p_content
 */
function renderConnectedUsersEmptyState(p_content) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("connected_users.no_connection_open");
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("connected_users.open_connection_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}

/**
 * A connection whose technology has no backends/sessions equivalent (e.g.
 * sqlite) still gets a pane -- saying so out loud is the whole point, same UX
 * decision as Notify's renderNotifyUnsupported.
 * @param {HTMLElement} p_content
 * @param {string} p_db_type
 */
function renderConnectedUsersUnsupported(p_content, p_db_type) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("connected_users.not_supported", { technology: p_db_type });
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("connected_users.supported_technologies_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}

/**
 * Builds the grid/detail-pane layout (once per mounted connection tab) and
 * fires the initial fetch. The detail pane and its resize handle start
 * hidden -- showConnectedUsersDetail is what reveals them, the first time a
 * row is clicked. The "show system processes" checkbox also starts hidden;
 * renderConnectedUsersGrid reveals it only for a technology/result that
 * actually has any (see isSystemRow on CONNECTED_USERS_CONFIG).
 * @param {HTMLElement} p_content
 * @param {any} p_conn_tab
 * @param {any} p_config
 * @param {number} p_token
 */
function buildConnectedUsersLayout(p_content, p_conn_tab, p_config, p_token) {
	var v_id = p_conn_tab.id;

	p_content.innerHTML =
		"<div class='omnidb__connected-users__pane'>" +
		"<div class='omnidb__connected-users__info-bar'>" +
		"<span id='connected_users_query_info_" +
		v_id +
		"' class='query_info'></span>" +
		"<label id='connected_users_system_toggle_" +
		v_id +
		"' class='omnidb__connected-users__system-toggle' style='display:none;'>" +
		"<input type='checkbox' id='connected_users_system_checkbox_" +
		v_id +
		"' />" +
		escapeHtml(t("connected_users.show_system_rows")) +
		"</label>" +
		"</div>" +
		"<div id='connected_users_grid_" +
		v_id +
		"' class='omnidb__connected-users__grid'></div>" +
		"<div id='connected_users_resize_" +
		v_id +
		"' class='omnidb__resize-line__container' style='display:none;'><div class='resize_line_horizontal'></div></div>" +
		"<div id='connected_users_detail_" +
		v_id +
		"' class='omnidb__connected-users__detail' style='display:none;'>" +
		"<div class='omnidb__connected-users__detail-toolbar'>" +
		"<span>" +
		escapeHtml(t("connected_users.query_detail_title")) +
		"</span>" +
		"<div>" +
		"<button id='connected_users_detail_copy_" +
		v_id +
		"' type='button' class='btn btn-sm omnidb__theme__btn--secondary me-1' title='" +
		escapeHtml(t("common.copy")) +
		"'><i class='fas fa-copy'></i></button>" +
		"<button id='connected_users_detail_send_" +
		v_id +
		"' type='button' class='btn btn-sm omnidb__theme__btn--secondary' title='" +
		escapeHtml(t("connected_users.open_in_query_tab")) +
		"'><i class='fas fa-file-import'></i></button>" +
		"</div>" +
		"</div>" +
		"<div id='connected_users_detail_editor_" +
		v_id +
		"' class='omnidb__connected-users__detail-editor'></div>" +
		"</div>" +
		"</div>";

	var v_tag = {
		token: p_token,
		connID: p_conn_tab.tag.selectedDatabaseIndex,
		tab_id: v_id,
		query: p_config.query,
		layout: p_config.layout,
		terminateAction: p_config.terminateAction,
		queryColumnKey: p_config.queryColumnKey,
		queryColRawIndex: -1,
		isSystemRow: p_config.isSystemRow || null,
		showSystemRows: false,
		/** @type {any} */
		lastData: null,
		query_info: document.getElementById("connected_users_query_info_" + v_id),
		systemToggle: document.getElementById("connected_users_system_toggle_" + v_id),
		systemCheckbox: /** @type {HTMLInputElement} */ (document.getElementById("connected_users_system_checkbox_" + v_id)),
		divGrid: document.getElementById("connected_users_grid_" + v_id),
		divResize: document.getElementById("connected_users_resize_" + v_id),
		divDetail: document.getElementById("connected_users_detail_" + v_id),
		divDetailEditor: document.getElementById("connected_users_detail_editor_" + v_id),
		detailVisible: false,
		/** @type {any} */
		detailEditor: null,
		currentSql: "",
		ht: null,
	};

	v_mounted = v_tag;

	v_tag.systemCheckbox.addEventListener("change", function () {
		v_tag.showSystemRows = v_tag.systemCheckbox.checked;
		if (v_tag.lastData) renderConnectedUsersGrid(v_tag, v_tag.lastData);
	});
	/** @type {HTMLElement} */ (document.getElementById("connected_users_resize_" + v_id)).addEventListener(
		"mousedown",
		function (e) {
			resizeConnectedUsersVertical(e, v_tag);
		},
	);
	/** @type {HTMLElement} */ (document.getElementById("connected_users_detail_copy_" + v_id)).addEventListener(
		"click",
		function () {
			uiCopyTextToClipboard(v_tag.currentSql);
		},
	);
	/** @type {HTMLElement} */ (document.getElementById("connected_users_detail_send_" + v_id)).addEventListener(
		"click",
		function () {
			sendConnectedUsersQueryToNewTab(v_tag.currentSql);
		},
	);

	fetchConnectedUsers(v_tag);
}

/**
 * Re-fetches whichever connection's pane is currently mounted -- called by
 * the context menu's "Refresh" item and, after a successful terminate, by
 * each technology's own xxxTerminateBackendConfirm (tree_context_functions/*).
 */
export function refreshConnectedUsers() {
	if (v_mounted != null) fetchConnectedUsers(v_mounted);
}

/**
 * Drag handler for the grid/detail split. Self-contained rather than routed
 * through workspace.js's resizeVertical: that one assumes a connection tab's
 * own tag shape (editorDivId/div_result), which this pane doesn't have --
 * same reasoning as outer_notify_panel.js's own resizeNotifyHorizontal.
 * @param {MouseEvent} p_event
 * @param {any} p_tag
 */
function resizeConnectedUsersVertical(p_event, p_tag) {
	p_event.preventDefault();

	var v_move = function (e) {
		var v_container = p_tag.divDetail.parentElement;
		var v_rect = v_container.getBoundingClientRect();
		var v_height = v_rect.bottom - e.clientY;
		if (v_height < 80) v_height = 80;
		if (v_height > v_rect.height - 120) v_height = v_rect.height - 120;
		p_tag.divDetail.style.flex = "0 0 " + v_height + "px";
		if (p_tag.detailEditor) p_tag.detailEditor.resize();
	};
	var v_up = function () {
		document.body.removeEventListener("mousemove", v_move);
		document.body.removeEventListener("mouseup", v_up);
	};

	document.body.addEventListener("mousemove", v_move);
	document.body.addEventListener("mouseup", v_up);
}

/**
 * Reveals (on first use) or updates the read-only SQL detail pane for a
 * clicked row. A no-op for technologies with no query-text column at all
 * (Oracle/MSSQL/Firebird's current queries don't select one) -- there is
 * nothing to show, so the pane never appears for them.
 * @param {any} p_tag
 * @param {any[]} p_raw_row
 */
function showConnectedUsersDetail(p_tag, p_raw_row) {
	if (p_tag.queryColRawIndex < 0) return;

	var v_sql = p_raw_row[p_tag.queryColRawIndex];
	if (v_sql == null) v_sql = "";
	p_tag.currentSql = String(v_sql);

	if (!p_tag.detailVisible) {
		p_tag.detailVisible = true;
		p_tag.divResize.style.display = "";
		p_tag.divDetail.style.display = "";
	}

	if (p_tag.detailEditor == null) {
		p_tag.detailEditor = ace.edit(p_tag.divDetailEditor);
		p_tag.detailEditor.$blockScrolling = Infinity;
		p_tag.detailEditor.setTheme("ace/theme/" + v_editor_theme);
		p_tag.detailEditor.session.setMode("ace/mode/sql");
		p_tag.detailEditor.setFontSize(Number(v_font_size));
		p_tag.detailEditor.setReadOnly(true);
		p_tag.detailEditor.setHighlightActiveLine(false);
		p_tag.detailEditor.setHighlightGutterLine(false);
	}

	p_tag.detailEditor.setValue(p_tag.currentSql);
	p_tag.detailEditor.clearSelection();
	p_tag.detailEditor.gotoLine(0, 0, true);
	p_tag.detailEditor.resize();
}

/**
 * Opens a new Query tab on the row's own connection and drops the clicked
 * query's text into it. Database must already be the visible section before
 * createQueryTab() builds the tab -- Ace cannot lay itself out inside a
 * display:none container (same reasoning as outer_connection_tab.js's
 * v_createConnTabFunction, which does this same switchSection-then-build
 * for the exact same reason).
 * @param {string} p_sql
 */
function sendConnectedUsersQueryToNewTab(p_sql) {
	switchSection("database");
	v_connTabControl.tag.createQueryTab();
	var v_editor = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor;
	v_editor.setValue(p_sql);
	v_editor.clearSelection();
	v_editor.gotoLine(0, 0, true);
	v_editor.focus();
}

/**
 * Builds a lowercase-column-name -> value map for one raw result row, so
 * layout entries can read `v.datname`/`v.usesysid`/etc regardless of the
 * column order the query actually returned them in.
 * @param {string[]} p_col_names
 * @param {any[]} p_row
 */
function namedRow(p_col_names, p_row) {
	/** @type {Record<string, any>} */
	var v_named = {};
	for (var i = 0; i < p_col_names.length; i++) {
		v_named[String(p_col_names[i]).toLowerCase()] = p_row[i];
	}
	return v_named;
}

/**
 * @param {any} p_tag
 */
function fetchConnectedUsers(p_tag) {
	execAjax(
		"/refresh_monitoring/",
		JSON.stringify({
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tab_id,
			p_query: p_tag.query,
		}),
		function (p_return) {
			// The user may have switched connection tabs, or left the section
			// entirely, while this request was in flight -- a stale response
			// must not render into (or resurrect) a detached pane.
			if (p_tag.token !== v_render_token || v_mounted !== p_tag) return;

			p_tag.lastData = p_return.v_data;
			renderConnectedUsersGrid(p_tag, p_return.v_data);
		},
		function (p_return) {
			if (p_tag.token !== v_render_token || v_mounted !== p_tag) return;

			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					p_tag.connID,
					function () {
						fetchConnectedUsers(p_tag);
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
		true,
	);
}

/**
 * Builds columns/rows from an already-fetched server response and (re)mounts
 * the grid -- split out from fetchConnectedUsers so toggling "show system
 * processes" can re-render from the last response without another round
 * trip. Every (re)fetch -- but *not* a plain toggle of the checkbox -- also
 * resets the detail pane back to hidden, same reasoning as never showing it
 * before the first click: its content would otherwise refer to a row that
 * may not exist (or may have changed) any more.
 * @param {any} p_tag
 * @param {any} p_data
 * @param {boolean} [p_reset_detail]
 */
function renderConnectedUsersGrid(p_tag, p_data, p_reset_detail) {
	if (p_reset_detail !== false) {
		p_tag.detailVisible = false;
		p_tag.divResize.style.display = "none";
		p_tag.divDetail.style.display = "none";
		p_tag.currentSql = "";
	}

	if (p_tag.ht != null) {
		p_tag.ht.destroy();
		p_tag.ht = null;
	}

	p_tag.query_info.textContent = t("connected_users.record_count", { count: p_data.v_data.length });

	var v_lower_names = p_data.v_col_names.map(function (n) {
		return String(n).toLowerCase();
	});
	p_tag.queryColRawIndex = p_tag.queryColumnKey ? v_lower_names.indexOf(p_tag.queryColumnKey) : -1;

	var v_column_properties = p_tag.layout.map(function (col) {
		/** @type {any} */
		var v_col = {
			title: col.labelKey1 ? headerTwoLine(t(col.labelKey1), t(col.labelKey2)) : t(col.labelKey),
			width: col.width,
			align: col.align,
			verticalAlign: col.verticalAlign,
			tooltip: col.raw ? t(col.labelKey) + " (" + col.raw + ") -- " + t(col.tooltipKey) : t(col.tooltipKey),
		};
		if (col.html) v_col.renderer = "html";
		return v_col;
	});

	var v_all_rows = [];
	var v_system_count = 0;
	for (var i = 0; i < p_data.v_data.length; i++) {
		var v_named = namedRow(p_data.v_col_names, p_data.v_data[i]);
		var v_is_system = !!(p_tag.isSystemRow && p_tag.isSystemRow(v_named));
		if (v_is_system) v_system_count++;
		if (v_is_system && !p_tag.showSystemRows) continue;

		var v_row = p_tag.layout.map(function (col) {
			return col.value ? col.value(v_named) : v_named[col.raw];
		});
		// The untouched raw row, so the context menu's Terminate item and the
		// detail pane can both still reach data that isn't shown as its own
		// composite column any more -- see this module's own doc comment for
		// why this rides along unrendered instead of becoming a column.
		v_row.push(JSON.stringify(p_data.v_data[i]));
		v_all_rows.push(v_row);
	}

	p_tag.systemToggle.style.display = p_tag.isSystemRow && v_system_count > 0 ? "" : "none";

	p_tag.ht = new Handsontable(p_tag.divGrid, {
		licenseKey: "non-commercial-and-evaluation",
		data: v_all_rows,
		columns: v_column_properties,
		colHeaders: true,
		rowHeaders: true,
		// Every row here has (at least) a two-line composite cell, genuinely
		// taller than the single-line rows every other grid in the app
		// renders -- VirtualGrid.js's scroll-position math assumes whatever
		// height it's told rows are, so this must match the real rendered
		// height or the scrollbar overshoots the actual content and snaps
		// back at the bottom.
		rowHeight: 58,
		fillHandle: false,
		copyPaste: { pasteMode: "", rowsLimit: 1000000000, columnsLimit: 1000000000 },
		manualColumnResize: true,
		contextMenu: {
			callback: function (key, options) {
				if (key === "refresh") {
					fetchConnectedUsers(p_tag);
				} else if (key === "view_data") {
					editCellData(
						this,
						options[0].start.row,
						options[0].start.col,
						this.getDataAtCell(options[0].start.row, options[0].start.col),
						false,
					);
				} else if (key === "copy") {
					this.selectCell(options[0].start.row, options[0].start.col, options[0].end.row, options[0].end.col);
					document.execCommand("copy");
				} else if (key === "terminate") {
					connectedUsersAction(options[0].start.row, p_tag.terminateAction);
				}
			},
			items: {
				refresh: {
					name:
						'<div style="position: absolute;"><i class="fas fa-sync-alt cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">' +
						t("common.refresh") +
						"</div>",
				},
				copy: {
					name:
						'<div style="position: absolute;"><i class="fas fa-copy cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">' +
						t("common.copy") +
						"</div>",
				},
				view_data: {
					name:
						'<div style="position: absolute;"><i class="fas fa-edit cm-all" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">' +
						t("common.view_content") +
						"</div>",
				},
				terminate: {
					name:
						'<div style="position: absolute;"><i class="fas fa-times cm-all text-danger" style="vertical-align: middle;"></i></div><div style="padding-left: 30px;">' +
						t("common.terminate") +
						"</div>",
				},
			},
		},
	});

	// VirtualGrid has no row-click/selection hook of its own -- a plain click
	// on its scroll container is enough, since a row's own mousedown (which
	// runs first) has already updated getSelected() by the time this fires.
	p_tag.ht.getGridDiv().addEventListener("click", function () {
		var v_selected = p_tag.ht.getSelected();
		if (!v_selected || v_selected.length === 0) return;
		var v_row = p_tag.ht.getDataAtRow(v_selected[0][0]);
		if (!v_row || v_row.length === 0) return;
		try {
			showConnectedUsersDetail(p_tag, JSON.parse(v_row[v_row.length - 1]));
		} catch (e) {
			// Malformed/absent raw row -- nothing sensible to show.
		}
	});
}

/**
 * Resolves a context-menu row back to its original, untouched SQL result row
 * -- used by workspace.js's connectedUsersAction, exactly as it did when this
 * data still rode in the grid itself (composing the visible columns never
 * touches the trailing raw copy -- see this module's own doc comment).
 * @param {number} p_row_index
 */
export function getConnectedUsersRowData(p_row_index) {
	if (v_mounted == null || v_mounted.ht == null) return null;
	var v_row = v_mounted.ht.getDataAtRow(p_row_index);
	if (v_row == null || v_row.length === 0) return null;
	try {
		return JSON.parse(v_row[v_row.length - 1]);
	} catch (e) {
		return null;
	}
}
