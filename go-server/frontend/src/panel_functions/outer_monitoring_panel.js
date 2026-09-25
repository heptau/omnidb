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
 * The Monitoring section: the dashboard of monitor units (charts/grids polled
 * on a timer) for whichever connection is currently selected in the Database
 * section's own connection strip. Used to be an inner tab nested inside a
 * connection's own tab strip (see git history / CHANGELOG); promoted to a
 * top-level rail section, between Database and Notify, so it doesn't have to
 * compete for space with Query/Console tabs.
 *
 * Deliberately modeled on outer_notify_panel.js, *not*
 * outer_connected_users_panel.js: Connected Users is stateless
 * request/response with nothing worth preserving across renders, but a
 * monitoring dashboard -- like Notify's channel/message state -- has real
 * standing state (open Chart.js/Handsontable objects, cached data, each
 * unit's active/paused flag, running setTimeout polling loops) that must
 * survive the user switching sections or connections. So unlike Connected
 * Users' pane (rebuilt from scratch on every mount), each connection's
 * dashboard root div is built once, in startMonitoringForConnTab, and then
 * only ever *relocated* (detached/reattached) by refreshMonitoringPane --
 * exactly the same "physically relocate, don't rebuild" trick
 * section_switcher.js's switchSection already uses for the shared connection
 * tab strip itself. This is what makes monitoring polling "keep running in
 * the background" while looking at another section cheap and correct: a
 * unit's timer, Chart.js instance and cached object_data just keep living in
 * the (possibly detached) div exactly as they always did when this was an
 * inner tab hidden by a sibling tab instead.
 *
 * Every unit starts paused (see monitoring.js's buildMonitorUnit) -- a fresh
 * dashboard must not start polling the database the moment a connection
 * opens. "Enable All"/"Pause All" in the toolbar here are the fast way back
 * out of that, on top of each unit's own Play/Pause button.
 */

import { execAjax } from "../ajax_control_bridge.js";
import { t } from "../i18n.js";
import {
	buildMonitorUnit,
	deleteSelectedMonitorUnit,
	editMonitorUnit,
	enableAllMonitorUnits,
	pauseAllMonitorUnits,
	refreshMonitorDashboard,
	refreshMonitorUnitsList,
	refreshMonitorUnitsObjects,
} from "../monitoring.js";

var MONITORING_STRIP_SLOT_ID = "monitoring_panel_strip_slot";
var MONITORING_CONTENT_ID = "monitoring_panel_content";

// Card width presets for the toolbar's size picker -- each is the minimum
// width one card is allowed to shrink to before the CSS grid
// (.dashboard_all, _base.scss) wraps to fewer columns. "full" uses 100%
// specifically (not just a very large px value) so exactly one column always
// fills the row, on any window width, rather than merely being unlikely to
// fit two. Everything else is "as many columns of at least this width as
// currently fit" -- deliberately not a fixed column *count*, since a fixed
// count can't take advantage of a much wider monitor the way a minimum width
// does (2 columns stays 2 columns at 4K; a 420px minimum becomes 5+).
var MONITOR_UNIT_WIDTH_PRESETS = { small: "300px", medium: "420px", large: "600px", full: "100%" };
var MONITOR_UNIT_WIDTH_STORAGE_KEY = "omnidb_monitor_unit_width";

// The one place this frontend reads/writes localStorage -- a deliberate,
// narrow exception to "every user preference lives in OmniDB_app_userdetails"
// (see Settings' theme/font-size/etc., all round-tripped through
// save_config_user): this is a per-browser display convenience for one
// dashboard control, not account data worth syncing across devices or
// machines, so it doesn't belong in that shared, all-in-one settings blob.
/**
 * @returns {string}
 */
function getStoredMonitorUnitWidth() {
	try {
		var v_stored = window.localStorage.getItem(MONITOR_UNIT_WIDTH_STORAGE_KEY);
		if (v_stored && Object.prototype.hasOwnProperty.call(MONITOR_UNIT_WIDTH_PRESETS, v_stored)) return v_stored;
	} catch (err) {
		// Private-browsing/storage-disabled -- fall through to the default.
	}
	return "medium";
}

/**
 * @param {string} p_preset
 */
function storeMonitorUnitWidth(p_preset) {
	try {
		window.localStorage.setItem(MONITOR_UNIT_WIDTH_STORAGE_KEY, p_preset);
	} catch (err) {
		// Best-effort -- a failed save just means the picker resets to the
		// default next time.
	}
}

/**
 * Applies a new width to a Monitoring dashboard's unit-list side panel --
 * shared by the drag handler below and, in principle, anything else that
 * would need to re-clamp it later, mirroring resizeConnectionsPanel's
 * (workspace.js) clamp shape. Only ever touches `width`/`max-width`, never
 * `flex`, so it can't fight with `.omnidb__monitor-unit-panel--collapsed`'s
 * own `width: 0 !important` -- see that class's comment (_base.scss).
 * @param {number} p_mouse_x
 * @param {HTMLElement} p_panel_div
 * @param {HTMLElement} p_root
 */
function resizeMonitorUnitPanel(p_mouse_x, p_panel_div, p_root) {
	var v_total_width = p_root.getBoundingClientRect().width;
	var v_max_allowed_width = v_total_width - 50;
	var v_offset_left = p_panel_div.getBoundingClientRect().left;

	var v_pixel_value = p_mouse_x - v_offset_left;
	if (v_pixel_value < 200) v_pixel_value = 200;
	if (v_pixel_value > v_max_allowed_width) v_pixel_value = v_max_allowed_width;

	var v_width_value = v_pixel_value + "px";
	p_panel_div.style["max-width"] = v_width_value;
	p_panel_div.style["width"] = v_width_value;
}

/**
 * Resize the Manage Units side panel horizontally -- same live, no-rAF drag
 * pattern as workspace.js's resizeConnectionsHorizontal (a plain list with no
 * editor/grid that would need an explicit .resize() call mid-drag).
 * @param {MouseEvent} event
 * @param {HTMLElement} p_panel_div
 * @param {HTMLElement} p_root
 */
function resizeMonitorUnitPanelHorizontal(event, p_panel_div, p_root) {
	event.preventDefault();

	var v_offset_left = p_panel_div.getBoundingClientRect().left;
	var v_start_x = event.x;
	var v_start_width = p_panel_div.getBoundingClientRect().width;

	var v_move = function (/** @type {MouseEvent} */ e) {
		// Anchors the width to where the drag actually started (offset +
		// start width + delta), rather than snapping to wherever within the
		// resize strip the mousedown happened to land -- same reasoning as
		// resizeConnectionsHorizontal.
		resizeMonitorUnitPanel(v_offset_left + v_start_width + (e.x - v_start_x), p_panel_div, p_root);
	};
	var v_up = function () {
		document.body.removeEventListener("mousemove", v_move);
		document.body.removeEventListener("mouseup", v_up);
	};

	document.body.addEventListener("mousemove", v_move);
	document.body.addEventListener("mouseup", v_up);
}

/**
 * The DBMS technologies the Monitoring dashboard is reachable for -- the
 * union of every place it used to be reachable from as an inner tab
 * (Postgres/Oracle's tree context menu, Postgres/MySQL/MariaDB's "+ New Tab"
 * menu). Built-in units only exist server-side for postgresql/mysql
 * (go-server/monitoring_units.go); mariadb/oracle connections still get a
 * panel, just with only whatever custom units the user has saved -- same as
 * before this move, just consistently reachable now.
 */
var MONITORING_SUPPORTED_DB_TYPES = ["postgresql", "mysql", "mariadb", "oracle"];

// The tag (see startMonitoringForConnTab) currently mounted into
// #monitoring_panel_content, if any -- tracked so refreshMonitoringPane can
// detach its rootDiv (not destroy it) before mounting a different one.
/** @type {any} */
var v_mounted_tag = null;

/**
 * @param {string} p_db_type
 */
export function monitoringSupportedDbType(p_db_type) {
	return MONITORING_SUPPORTED_DB_TYPES.indexOf(p_db_type) !== -1;
}

export var v_createMonitoringPanelFunction = function () {
	var v_html =
		"<div class='omnidb__monitoring'>" +
		"<div id='" +
		MONITORING_STRIP_SLOT_ID +
		"' class='omnidb__tab-menu--container omnidb__tab-menu--container--primary omnidb__conn-strip-host'></div>" +
		"<div id='" +
		MONITORING_CONTENT_ID +
		"' class='omnidb__monitoring__content'></div>" +
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_monitoring"));
	v_target.innerHTML = v_html;
};

/**
 * Starts the monitoring dashboard for a newly-created Database connection
 * tab and attaches its state as `p_conn_tab.tag.monitoring` -- called once,
 * right after outer_connection_tab.js starts that connection's Notify
 * session (after changeDatabase, so selectedDatabaseIndex/selectedDBMS are
 * already populated). An unsupported technology still gets the tag
 * (refreshMonitoringPane needs it to know what to show), it just never
 * builds a dashboard or fetches anything.
 * @param {any} p_conn_tab
 */
export function startMonitoringForConnTab(p_conn_tab) {
	var v_id = p_conn_tab.id;
	var v_db_type = p_conn_tab.tag.selectedDBMS;

	/** @type {any} */
	var v_tag = {
		tab_id: v_id,
		connTabTag: p_conn_tab.tag,
		dbType: v_db_type,
		units: [],
		unit_sequence: 0,
		tab_active: true,
		rootDiv: null,
		dashboard_div: null,
		// "Manage Units" state -- a persistent side panel now (see this
		// function's own HTML below), not a modal shared by every connection,
		// so each connection keeps its own list DOM, its own selected row
		// (for the footer's "-" button) and its own collapsed/expanded state,
		// exactly like the dashboard itself.
		unitListDiv: null,
		deleteUnitBtn: null,
		selectedUnitRef: null,
	};
	p_conn_tab.tag.monitoring = v_tag;

	if (!monitoringSupportedDbType(v_db_type)) return;

	// Built detached -- not appended anywhere until refreshMonitoringPane
	// relocates it into view. getElementById would not find these children
	// yet (they aren't part of the document), so lookups below go through
	// this root's own querySelector instead.
	//
	// Layout: a Connections-sidebar-style panel (draggable list + add/remove
	// footer, collapsed by default) sits to the left of the dashboard itself,
	// toggled open by the toolbar's first (icon-only) button -- see this
	// module's own doc comment and CHANGELOG for why this replaced the old
	// "Manage Units" modal.
	var v_root = document.createElement("div");
	v_root.className = "omnidb__monitoring-result-tabs";
	v_root.innerHTML =
		"<div class='omnidb__monitor-unit-panel omnidb__monitor-unit-panel--collapsed' id='monitor_unit_panel_" +
		v_id +
		"'>" +
		"<div id='monitoring_units_grid_" +
		v_id +
		"' class='omnidb__monitor-unit-list'></div>" +
		"<div class='omnidb__list-footer'>" +
		"<div class='omnidb__addremove'>" +
		"<button id='bt_new_unit_" +
		v_id +
		"' type='button' title='" +
		t("modals.monitoring.new_unit") +
		"'><i class='fas fa-plus'></i></button>" +
		"<span class='omnidb__addremove-divider'></span>" +
		"<button id='bt_delete_unit_" +
		v_id +
		"' type='button' title='" +
		t("common.delete") +
		"' disabled><i class='fas fa-minus'></i></button>" +
		"</div>" +
		"</div>" +
		"</div>" +
		"<div class='omnidb__monitor-unit-panel-resize' id='monitor_unit_resize_" +
		v_id +
		"'>" +
		"<div class='resize_line_vertical omnidb__resize-line__container' style='height: 100%;'></div>" +
		"</div>" +
		"<div class='omnidb__monitor-unit-dashboard'>" +
		"<div class='omnidb__monitor-unit-toolbar'>" +
		"<button id='bt_toggle_manage_units_" +
		v_id +
		"' class='btn omnidb__theme__btn--secondary btn-sm my-2 me-2' title='" +
		t("monitoring.manage_units") +
		"'><i class='fas fa-sidebar'></i></button>" +
		"<button id='bt_refresh_dashboard_" +
		v_id +
		"' class='btn omnidb__theme__btn--primary btn-sm my-2 me-2'><i class='fas fa-sync-alt me-2'></i>" +
		t("monitoring.refresh_all") +
		"</button>" +
		"<button id='bt_enable_all_" +
		v_id +
		"' class='btn omnidb__theme__btn--secondary btn-sm my-2 me-2'><i class='fas fa-play me-2'></i>" +
		t("monitoring.enable_all") +
		"</button>" +
		"<button id='bt_pause_all_" +
		v_id +
		"' class='btn omnidb__theme__btn--secondary btn-sm my-2 me-2'><i class='fas fa-pause me-2'></i>" +
		t("monitoring.pause_all") +
		"</button>" +
		"<select id='select_monitor_unit_width_" +
		v_id +
		"' class='form-select form-select-sm omnidb__monitor-unit-width-select my-2' title='" +
		t("monitoring.card_size_label") +
		"'>" +
		"<option value='small'>" + t("monitoring.card_size_small") + "</option>" +
		"<option value='medium'>" + t("monitoring.card_size_medium") + "</option>" +
		"<option value='large'>" + t("monitoring.card_size_large") + "</option>" +
		"<option value='full'>" + t("monitoring.card_size_full") + "</option>" +
		"</select>" +
		"</div>" +
		"<div id='dashboard_" +
		v_id +
		"' class='dashboard_all'></div>" +
		"</div>";

	v_tag.rootDiv = v_root;
	v_tag.dashboard_div = v_root.querySelector("#dashboard_" + v_id);
	v_tag.unitListDiv = v_root.querySelector("#monitoring_units_grid_" + v_id);
	v_tag.deleteUnitBtn = v_root.querySelector("#bt_delete_unit_" + v_id);

	var v_panel_div = /** @type {HTMLElement} */ (v_root.querySelector("#monitor_unit_panel_" + v_id));
	/** @type {HTMLElement} */ (v_root.querySelector("#bt_toggle_manage_units_" + v_id)).addEventListener("click", function () {
		var v_collapsed = v_panel_div.classList.toggle("omnidb__monitor-unit-panel--collapsed");
		if (!v_collapsed) refreshMonitorUnitsList(v_tag);
	});

	var v_resize_line = /** @type {HTMLElement} */ (v_root.querySelector("#monitor_unit_resize_" + v_id));
	v_resize_line.addEventListener("mousedown", (event) => resizeMonitorUnitPanelHorizontal(event, v_panel_div, v_root));
	/** @type {HTMLElement} */ (v_root.querySelector("#bt_new_unit_" + v_id)).addEventListener("click", () => editMonitorUnit());
	/** @type {HTMLElement} */ (v_root.querySelector("#bt_delete_unit_" + v_id)).addEventListener("click", () =>
		deleteSelectedMonitorUnit(v_tag),
	);

	var v_width_select = /** @type {HTMLSelectElement} */ (v_root.querySelector("#select_monitor_unit_width_" + v_id));
	var v_stored_width = getStoredMonitorUnitWidth();
	v_width_select.value = v_stored_width;
	v_tag.dashboard_div.style.setProperty("--monitor-unit-min-width", MONITOR_UNIT_WIDTH_PRESETS[v_stored_width]);
	v_width_select.addEventListener("change", function () {
		var v_preset = v_width_select.value;
		v_tag.dashboard_div.style.setProperty("--monitor-unit-min-width", MONITOR_UNIT_WIDTH_PRESETS[v_preset]);
		storeMonitorUnitWidth(v_preset);
	});

	/** @type {HTMLElement} */ (v_root.querySelector("#bt_refresh_dashboard_" + v_id)).addEventListener("click", () =>
		refreshMonitorDashboard(true, v_tag),
	);
	/** @type {HTMLElement} */ (v_root.querySelector("#bt_enable_all_" + v_id)).addEventListener("click", () =>
		enableAllMonitorUnits(v_tag),
	);
	/** @type {HTMLElement} */ (v_root.querySelector("#bt_pause_all_" + v_id)).addEventListener("click", () =>
		pauseAllMonitorUnits(v_tag),
	);

	var input = JSON.stringify({
		p_database_index: p_conn_tab.tag.selectedDatabaseIndex,
		p_tab_id: v_id,
	});

	execAjax(
		"/get_monitor_units/",
		input,
		function (p_return) {
			for (var i = 0; i < p_return.v_data.length; i++) {
				buildMonitorUnit(p_return.v_data[i], false, v_tag);
			}
			// One snapshot fetch to populate every card -- units are built
			// paused (buildMonitorUnit's active: false default), so nothing
			// reschedules itself afterward until the user presses Play/
			// "Enable All".
			refreshMonitorDashboard(true, v_tag);
		},
		null,
		"box",
	);
}

/**
 * Renders the Monitoring content pane for whichever connection tab is
 * currently selected in the shared strip. Safe to call any time, from
 * anywhere -- it no-ops if the section's own shell has not been built yet.
 * Called both when the Monitoring section becomes active
 * (section_switcher.js) and whenever the selected/open connection tabs
 * change while already looking at it.
 */
export function refreshMonitoringPane() {
	var v_content = document.getElementById(MONITORING_CONTENT_ID);
	if (v_content == null) return;

	// Detach (don't destroy) whatever was mounted before -- v_content.innerHTML
	// = "" would silently kill any still-polling Chart.js/Handsontable
	// instances riding along inside that rootDiv (see this module's own
	// comment on why the dashboard survives being navigated away from).
	if (v_mounted_tag != null && v_mounted_tag.rootDiv && v_mounted_tag.rootDiv.parentElement === v_content) {
		v_content.removeChild(v_mounted_tag.rootDiv);
	}
	v_mounted_tag = null;
	v_content.innerHTML = "";

	var v_conn_tab = typeof v_connTabControl !== "undefined" ? v_connTabControl.selectedTab : null;

	// tabs.js's removeTab leaves selectedTab pointing at the tab just removed
	// when nothing selectable is left to fall back to -- see
	// outer_notify_panel.js's refreshNotifyPane for the same check.
	if (v_conn_tab != null && v_connTabControl.tabList.indexOf(v_conn_tab) === -1) {
		v_conn_tab = null;
	}

	if (v_conn_tab == null || v_conn_tab.tag == null || v_conn_tab.tag.monitoring == null) {
		renderMonitoringEmptyState(v_content);
		return;
	}

	var v_tag = v_conn_tab.tag.monitoring;

	if (!monitoringSupportedDbType(v_tag.dbType)) {
		renderMonitoringUnsupported(v_content, v_tag.dbType);
		return;
	}

	v_mounted_tag = v_tag;
	v_content.appendChild(v_tag.rootDiv);
	// Handsontable can miscalculate a grid unit's layout while its container
	// was hidden/detached -- see refreshMonitorUnitsObjects's own comment.
	refreshMonitorUnitsObjects(v_tag);
}

/**
 * Shown when no connection is open at all -- there is nothing for the shared
 * strip (relocated above this) to point at. Reuses Notify/Connected Users'
 * shared "nothing to show" styling.
 * @param {HTMLElement} p_content
 */
function renderMonitoringEmptyState(p_content) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("monitoring.no_connection_open");
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("monitoring.open_connection_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}

/**
 * A connection whose technology has no monitoring dashboard support at all
 * (e.g. sqlite, mssql, firebird) still gets a pane -- saying so out loud is
 * the whole point, same UX decision as Notify/Connected Users.
 * @param {HTMLElement} p_content
 * @param {string} p_db_type
 */
function renderMonitoringUnsupported(p_content, p_db_type) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("monitoring.not_supported", { technology: p_db_type });
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("monitoring.supported_technologies_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}
