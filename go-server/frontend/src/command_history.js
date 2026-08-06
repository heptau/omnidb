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

import moment from "moment";
import { execAjax } from "./ajax_control_bridge.js";
import { showConfirm } from "./notification_control.js";
import { blueHtmlRenderer, whiteHtmlRenderer } from "./renderers.js";

export function deleteCommandList() {
	showConfirm("Are you sure you want to clear command history corresponding to applied filters?", function () {
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
		"<div class='mb-2 form-inline justify-content-center'>" +
		"<div class='input-group w-auto mr-2'>" +
		"<span class='my-auto'>Select a daterange:</span>&nbsp;" +
		"<input type='text' class='form-control form-control-sm d-none' placeholder='Start Time' id='cl_input_from_" +
		v_tabTag.tab_id +
		"'>" +
		"<input type='text' class='form-control form-control-sm d-none' placeholder='End Time' id='cl_input_to_" +
		v_tabTag.tab_id +
		"'>" +
		"<button type='button' class='btn btn-sm omnidb__theme__btn--primary' id='cl_time_range_" +
		v_tabTag.tab_id +
		"'>" +
		"<i class='far fa-calendar-alt'></i>&nbsp;" +
		"<span>Last 6 Hours</span> <i class='fa fa-caret-down'></i>" +
		"</button>" +
		"</div>" +
		"<label class='mr-1'>Command contains:</label>" +
		"<input type='text' id='cl_input_contains_" +
		v_tabTag.tab_id +
		"' class='mr-2 form-control' />" +
		"</div>" +
		"<div id='command_history_daterangepicker_container_" +
		v_tabTag.tab_id +
		"' style='position:relative;'></div>" +
		"<div class='mb-2 d-flex justify-content-center align-items-center'>" +
		"<button id='bt_first_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary mx-1' title='First'>First</button>" +
		"<button id='bt_previous_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary mx-1' title='Previous'>Previous</button>" +
		"<span id='cl_curr_page_" +
		v_tabTag.tab_id +
		"'></span> / <span id='cl_num_pages_" +
		v_tabTag.tab_id +
		"'></span>" +
		"<button id='bt_next_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary mx-1' title='Next'>Next</button>" +
		"<button id='bt_last_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--secondary mx-1' title='Last'>Last</button>" +
		"<button id='bt_refresh_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm omnidb__theme__btn--primary mx-1' title='Refresh'><i class='fas fa-sync-alt mr-1'></i>Refresh</button>" +
		"<button id='bt_clear_" +
		v_tabTag.tab_id +
		"' class='bt_execute btn btn-sm btn-danger mx-1' title='Clear List'><i class='fas fa-broom mr-1'></i>Clear List</button>" +
		"</div>";

	var v_gridDiv = v_tabTag.commandHistory.gridDiv;
	v_gridDiv.innerHTML = "";

	if (v_tabTag.commandHistory.grid != null) {
		v_tabTag.commandHistory.grid.destroy();
	}

	var v_columnProperties = [];

	/** @type {any} */
	var v_column = {};
	v_column.title = "Start";
	v_column.readOnly = true;
	// v_column.width = 120;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = "End";
	v_column.readOnly = true;
	// v_column.width = 120;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = "Duration";
	v_column.readOnly = true;
	v_column.width = 100;
	v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = "Status";
	v_column.readOnly = true;
	v_column.width = 50;
	v_column.renderer = "html";
	v_columnProperties.push(v_column);

	// var v_column = new Object();
	// v_column.title =  'Actions';
	// v_column.readOnly = true;
	// v_column.width = 60;
	// v_columnProperties.push(v_column);

	/** @type {any} */
	var v_column = {};
	v_column.title = "Command";
	v_column.readOnly = true;
	// v_column.width = 330;
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
					name: '<div style="position: absolute;"><i class=\"fas fa-bolt cm-all\" style=\"vertical-align: middle;\"></i></div><div style="padding-left: 30px;">Copy Content To Query Tab</div>',
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
	v_tabTag.commandHistory.inputStartedFrom.value = moment().subtract(6, "hour").toISOString();
	v_tabTag.commandHistory.inputStartedTo = document.getElementById("cl_input_to_" + v_tabTag.tab_id);
	v_tabTag.commandHistory.inputStartedTo.value = moment().toISOString();
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

	// Setting daterangepicker
	var cl_time_range = document.getElementById("cl_time_range_" + v_tabTag.tab_id);

	$(cl_time_range).daterangepicker(
		{
			timePicker: true,
			startDate: moment(v_tabTag.commandHistory.inputStartedFrom.value).format("Y-MM-DD H"),
			endDate: moment(v_tabTag.commandHistory.inputStartedTo.value).format("Y-MM-DD H"),
			parentEl: document.getElementById("command_history_daterangepicker_container_" + v_tabTag.tab_id),
			previewUTC: true,
			locale: {
				format: "Y-MM-DD H",
			},
			ranges: {
				"Last 6 Hours": [moment().subtract(6, "hour").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				"Last 12 Hours": [moment().subtract(12, "hour").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				"Last 24 Hours": [moment().subtract(24, "hour").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				"Last 7 Days": [moment().subtract(7, "days").startOf("day").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				"Last 30 Days": [moment().subtract(30, "days").startOf("day").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				Yesterday: [
					moment().subtract(1, "days").startOf("day").format("Y-MM-DD H"),
					moment().subtract(1, "days").endOf("day").format("Y-MM-DD H"),
				],
				"This Month": [moment().startOf("month").format("Y-MM-DD H"), moment().format("Y-MM-DD H")],
				"Last Month": [
					moment().subtract(1, "month").startOf("month").format("Y-MM-DD H"),
					moment().subtract(1, "month").endOf("month").format("Y-MM-DD H"),
				],
			},
		},
		function (start, end, label) {
			v_tabTag.commandHistory.inputStartedFrom.value = moment(start).toISOString();

			// Update Button Labels
			if (label === "Custom Range") {
				$("#cl_time_range_" + v_tabTag.tab_id + " span").html(
					start.format("MMMM D, YYYY hh:mm A") + " - " + end.format("MMMM D, YYYY hh:mm A"),
				);
			} else {
				$("#cl_time_range_" + v_tabTag.tab_id + " span").html(label);
			}

			if (label === "Custom Range" || label === "Yesterday" || label === "Last Month") {
				v_tabTag.commandHistory.inputStartedTo.value = moment(end).toISOString();
			} else v_tabTag.commandHistory.inputStartedTo.value = null;

			refreshCommandList();
		},
	);

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
	var v_command = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.commandHistory.grid.getDataAtRow(p_index)[4];
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(v_command);
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
	closeCommandHistory();
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
