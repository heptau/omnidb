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
/// Wipes command history.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { showConfirm } from "./notification_control.js";
import { blueHtmlRenderer, whiteHtmlRenderer } from "./renderers.js";
import { escapeHtml, escapeHtmlAttribute } from "./query.js";
import { t } from "./i18n.js";
import { setupTimeRangePicker } from "./time_range_picker.js";

export function deleteCommandList() {
	showConfirm(t("console.confirm_clear_command_history"), function () {
		execAjax(
			"/clear_command_list/",
			JSON.stringify({
				p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
				p_command_from: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedFrom.value,
				p_command_to: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedTo.value,
				p_command_contains:
					v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputCommandContains.value,
			}),
			function (p_return) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage = 1;
				refreshCommandList();
			},
		);
	});
}

/// <summary>
/// Retrieves and displays command history.
/// </summary>
export function showCommandList() {
	var v_connTag = v_connTabControl.selectedTab.tag;
	var v_tabTag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	v_tabTag.commandHistory.headerDiv.innerHTML =
		"<div class='mb-2 d-flex flex-column gap-2'>" +
		"<div class='d-flex align-items-center gap-2'>" +
		"<span>" + escapeHtml(t("console.time_range")) + "</span>" +
		"<div class='position-relative' id='command_history_timerange_container_" +
		v_tabTag.tab_id +
		"'>" +
		"<input type='text' class='form-control form-control-sm d-none' placeholder='" + escapeHtmlAttribute(t("common.start_time")) + "' id='cl_input_from_" +
		v_tabTag.tab_id +
		"'>" +
		"<input type='text' class='form-control form-control-sm d-none' placeholder='" + escapeHtmlAttribute(t("common.end_time")) + "' id='cl_input_to_" +
		v_tabTag.tab_id +
		"'>" +
		"<button type='button' class='btn btn-sm omnidb__theme__btn--primary' id='cl_time_range_" +
		v_tabTag.tab_id +
		"'>" +
		"<i class='far fa-calendar-alt'></i>&nbsp;" +
		"<span></span> <i class='fa fa-caret-down'></i>" +
		"</button>" +
		"</div>" +
		"</div>" +
		"<div class='d-flex align-items-center gap-2'>" +
		"<label for='cl_input_contains_" + v_tabTag.tab_id + "' class='text-nowrap'>" + escapeHtml(t("console.search_commands")) + "</label>" +
		"<input type='text' id='cl_input_contains_" +
		v_tabTag.tab_id +
		"' class='form-control form-control-sm' />" +
		"</div>" +
		"</div>" +
		"<div class='mb-2 d-flex align-items-center gap-1'>" +
		"<button id='bt_refresh_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--primary' title='" + escapeHtmlAttribute(t("common.refresh")) + "'><i class='fas fa-sync-alt me-1'></i>" + escapeHtml(t("common.refresh")) + "</button>" +
		"<button id='bt_clear_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm btn-danger' title='" + escapeHtmlAttribute(t("console.clear_list")) + "'><i class='fas fa-broom me-1'></i>" + escapeHtml(t("console.clear_list")) + "</button>" +
		"<div class='d-flex align-items-center gap-1 ms-auto'>" +
		"<button id='bt_first_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary' title='" + escapeHtmlAttribute(t("common.first")) + "' aria-label='" + escapeHtmlAttribute(t("common.first")) + "'><i class='fas fa-angle-double-left'></i></button>" +
		"<button id='bt_previous_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary' title='" + escapeHtmlAttribute(t("common.previous")) + "' aria-label='" + escapeHtmlAttribute(t("common.previous")) + "'><i class='fas fa-angle-left'></i></button>" +
		"<span class='mx-1'><span id='cl_curr_page_" +
		v_tabTag.tab_id +
		"'></span> / <span id='cl_num_pages_" +
		v_tabTag.tab_id +
		"'></span></span>" +
		"<button id='bt_next_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary' title='" + escapeHtmlAttribute(t("common.next")) + "' aria-label='" + escapeHtmlAttribute(t("common.next")) + "'><i class='fas fa-angle-right'></i></button>" +
		"<button id='bt_last_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary' title='" + escapeHtmlAttribute(t("common.last")) + "' aria-label='" + escapeHtmlAttribute(t("common.last")) + "'><i class='fas fa-angle-double-right'></i></button>" +
		"</div>" +
		"</div>";

	var v_gridDiv = v_tabTag.commandHistory.gridDiv;
	v_gridDiv.innerHTML = "";

	if (v_tabTag.commandHistory.grid != null) {
		v_tabTag.commandHistory.grid.destroy();
	}

	var v_columnProperties = [];

	/** @type {any} */
	var v_column = {};
	v_column.title = t("common.start_time");
	v_column.readOnly = true;
	v_column.fitContent = true;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = t("common.end_time");
	v_column.readOnly = true;
	v_column.fitContent = true;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = t("common.duration");
	v_column.readOnly = true;
	v_column.fitContent = true;
	v_columnProperties.push(v_column);

	// var v_column = new Object();
	// v_column.title =  'Actions';
	// v_column.readOnly = true;
	// v_column.width = 60;
	// v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = t("console.column_command");
	v_column.readOnly = true;
	v_column.grow = true;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = t("common.status");
	v_column.readOnly = true;
	v_column.fitContent = true;
	v_column.renderer = "html";
	v_columnProperties.push(v_column);

	v_tabTag.commandHistory.grid = new Handsontable(v_gridDiv, {
		licenseKey: "non-commercial-and-evaluation",
		data: [],
		columns: v_columnProperties,
		colHeaders: true,
		rowHeaders: false,
		stretchH: "last",
		copyPaste: {
			pasteMode: "",
			rowsLimit: 1000000000,
			columnsLimit: 1000000000,
		},
		manualColumnResize: true,
		fillHandle: false,
		contextMenu: {
			callback: function (p_key, p_options) {
				if (p_key === "view_data") {
					// editCellData(
					// 	this,
					// 	p_options[0].start.row,
					// 	p_options[0].start.col,
					// 	this.getDataAtCell(p_options[0].start.row, p_options[0].start.col),
					// 	false
					// );
					commandHistoryOpenCmd(p_options[0].start.row);
				}
			},
			items: {
				view_data: {
					name: '<div style="position: absolute;"><i class=\"fas fa-bolt cm-all\" style=\"vertical-align: middle;\"></i></div><div style="padding-left: 30px;">' + escapeHtml(t("console.copy_to_query_tab")) + '</div>',
				},
			},
		},
		cells: function (p_row, p_col, p_prop) {
			var v_cellProperties = {};

			if (p_row % 2 == 0) {
				v_cellProperties.renderer = blueHtmlRenderer;
			} else {
				v_cellProperties.renderer = whiteHtmlRenderer;
			}

			return v_cellProperties;
		},
	});

	bootstrap.Modal.getOrCreateInstance(v_tabTag.commandHistory.modal).show();
	v_tabTag.commandHistory.div.style.display = "block";

	v_tabTag.commandHistory.currentPage = 1;
	v_tabTag.commandHistory.pages = 1;
	v_tabTag.commandHistory.spanNumPages = document.getElementById("cl_num_pages_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.spanNumPages.innerHTML = 1;
	v_tabTag.commandHistory.spanCurrPage = document.getElementById("cl_curr_page_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.spanCurrPage.innerHTML = 1;
	v_tabTag.commandHistory.inputStartedFrom = document.getElementById("cl_input_from_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.inputStartedFrom.value = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
	v_tabTag.commandHistory.inputStartedTo = document.getElementById("cl_input_to_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.inputStartedTo.value = new Date().toISOString();
	v_tabTag.commandHistory.inputCommandContains = document.getElementById("cl_input_contains_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.inputCommandContains.value = v_tabTag.commandHistory.inputCommandContainsLastValue;

	// Bindings for the header just built above, replacing the on*= attributes it
	// used to carry -- see dom_event_bindings.js and README.md. All six handlers
	// live in this module and read the selected tab themselves, as they always
	// did; this header only exists for the tab whose modal is open.
	v_tabTag.commandHistory.inputCommandContains.addEventListener("change", () => refreshCommandList());
	/** @type {[string, () => void][]} */
	var v_headerButtonHandlers = [
		["bt_first_", commandHistoryFirstPage],
		["bt_previous_", commandHistoryPreviousPage],
		["bt_next_", commandHistoryNextPage],
		["bt_last_", commandHistoryLastPage],
		["bt_refresh_", refreshCommandList],
		["bt_clear_", deleteCommandList],
	];
	for (const [id, handler] of v_headerButtonHandlers) {
		/** @type {HTMLElement} */ (document.getElementById(id + v_tabTag.tab_id)).addEventListener("click", () =>
			handler(),
		);
	}

	// Time range dropdown (presets + custom range)
	setupTimeRangePicker({
		button: /** @type {HTMLElement} */ (document.getElementById("cl_time_range_" + v_tabTag.tab_id)),
		label: /** @type {HTMLElement} */ (document.querySelector("#cl_time_range_" + v_tabTag.tab_id + " span")),
		container: /** @type {HTMLElement} */ (document.getElementById("command_history_timerange_container_" + v_tabTag.tab_id)),
		fromInput: v_tabTag.commandHistory.inputStartedFrom,
		toInput: v_tabTag.commandHistory.inputStartedTo,
		onChange: refreshCommandList,
	});

	refreshCommandList();
}

export function commandHistoryNextPage() {
	if (
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage <
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.pages
	) {
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage += 1;
		refreshCommandList();
	}
}

export function commandHistoryPreviousPage() {
	if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage > 1) {
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage -= 1;
		refreshCommandList();
	}
}

export function commandHistoryFirstPage() {
	if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage != 1) {
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage = 1;
		refreshCommandList();
	}
}

export function commandHistoryLastPage() {
	if (
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage !=
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.pages
	) {
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage =
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.pages;
		refreshCommandList();
	}
}

export function commandHistoryOpenCmd(p_index) {
	var v_command = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid.getDataAtRow(p_index)[3];
	closeCommandHistory();
	// Opens the command in a new query tab so the current tab's editor is left untouched.
	v_connTabControl.tag.createQueryTab();
	var v_editor = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor;
	v_editor.setValue(v_command);
	v_editor.clearSelection();
	v_editor.gotoLine(0, 0, true);
}

/// <summary>
/// Retrieves and displays command history.
/// </summary>
export function refreshCommandList() {
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedFromLastValue =
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedFrom.value;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedToLastValue =
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedTo.value;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputCommandContainsLastValue =
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputCommandContains.value;

	execAjax(
		"/get_command_list/",
		JSON.stringify({
			p_command_from: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedFrom.value,
			p_command_to: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedTo.value,
			p_command_contains:
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputCommandContains.value,
			p_current_page: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage,
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
		}),
		function (p_return) {
			if (p_return.v_data.commandList.length == 0) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage = 1;
			}

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.pages = p_return.v_data.pages;
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.spanNumPages.innerHTML =
				p_return.v_data.pages;
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.spanCurrPage.innerHTML =
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage;

			for (let i = 0; i < p_return.v_data.commandList.length; i++) {
				p_return.v_data.commandList[i][0] = new Date(p_return.v_data.commandList[i][0]).toLocaleString();
				p_return.v_data.commandList[i][1] = new Date(p_return.v_data.commandList[i][1]).toLocaleString();
				// The server sends [start, end, duration, status, command]; the grid shows the status last.
				var v_row = p_return.v_data.commandList[i];
				p_return.v_data.commandList[i] = [v_row[0], v_row[1], v_row[2], v_row[4], v_row[3]];
			}

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid.loadData(p_return.v_data.commandList);

			// v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.gridDivParent.style.height = '200px';
		},
		null,
		"box",
	);
}

export function closeCommandHistory() {
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid.destroy();
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid = null;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.div.style.display = "none";
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.headerDiv.innerHTML = "";
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.gridDiv.innerHTML = "";
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.currentPage = 1;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.pages = 1;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.spanNumPages = null;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.spanCurrPage = null;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedFrom = null;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputStartedTo = null;
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.inputCommandContains = null;
	bootstrap.Modal.getOrCreateInstance(
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.modal,
	).hide();
}
