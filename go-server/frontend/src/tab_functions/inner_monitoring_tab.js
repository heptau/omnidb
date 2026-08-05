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

import { execAjax } from "../ajax_control_bridge.js";
import { beforeCloseTab } from "../create_tab_functions.js";
import { editCellData } from "../header_actions.js";
import { showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { escapeHtmlAttribute } from "../query.js";
import { blueHtmlRenderer, whiteHtmlRenderer } from "../renderers.js";
import { removeTab, renameTab, showMenuNewTab } from "../workspace.js";


export var v_createMonitoringTabFunction = function (p_name, p_query, p_actions) {
	var v_name = "Backends";
	if (p_name) v_name = p_name;

	// Removing last tab of the inner tab list
	v_connTabControl.selectedTab.tag.tabControl.removeLastTab();

	// Creating console tab in the inner tab list
	var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
		p_icon: `<i class="fas fa-desktop icon-tab-title"></i>`,
		p_name:
			'<span id="tab_title">' +
			v_name +
			'</span><span id="tab_loading" style="visibility:hidden;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
		p_selectFunction: function () {
			document.title = "OmniDB";
			if (this.tag != null) {
				this.tag.resize();
			}
		},
		p_closeFunction: function (e, p_tab) {
			var v_current_tab = p_tab;
			beforeCloseTab(e, function () {
				removeTab(v_current_tab);
			});
		},
		p_dblClickFunction: renameTab,
	});

	// Selecting newly created tab
	v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);

	// Adding unique names to spans
	var v_tab_title_span = /** @type {HTMLElement} */ (document.getElementById("tab_title"));
	v_tab_title_span.id = "tab_title_" + v_tab.id;
	var v_tab_loading_span = /** @type {HTMLElement} */ (document.getElementById("tab_loading"));
	v_tab_loading_span.id = "tab_loading_" + v_tab.id;
	var v_tab_check_span = /** @type {HTMLElement} */ (document.getElementById("tab_check"));
	v_tab_check_span.id = "tab_check_" + v_tab.id;
	// v_tab_close_span.id = 'tab_close_' + v_tab.id;
	// v_tab_close_span.onclick = function(e) {
	//   var v_current_tab = v_tab;
	//   beforeCloseTab(e,
	//     function() {
	//       removeTab(v_current_tab);
	//     });
	// };

	var v_html =
		"<div class='p-2 omnidb__theme-border--primary'>" +
		"<button id='bt_refresh_" +
		v_tab.id +
		"' class='btn omnidb__theme__btn--primary btn-sm my-2 mr-1' title='Refresh'><i class='fas fa-sync-alt mr-2'></i>Refresh</button>" +
		"<span id='div_query_info_" +
		v_tab.id +
		"' class='query_info'></span>" +
		"<div id='div_result_" +
		v_tab.id +
		"' class='omnidb__query-result-tabs__content' style='width: 100%; overflow: auto;'></div>";
	("</div>");

	// var v_div = document.getElementById('div_' + v_tab.id);
	// v_div.innerHTML = v_html;
	v_tab.elementDiv.innerHTML = v_html;

	// var v_currTabControl = createTabControl({
	//   p_div: v_tab.id + '_tabs',
	//   p_hierarchy: 'secondary'
	// });

	var v_bt_refresh = /** @type {HTMLElement} */ (document.getElementById("bt_refresh_" + v_tab.id));

	var v_resizeFunction = function () {
		var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
		if (v_tab_tag.div_result) {
			v_tab_tag.div_result.style.height =
				window.innerHeight - $(v_tab_tag.div_result).offset().top - 1.25 * v_font_size + "px";
			setTimeout(function () {
				if (v_tab_tag.ht != null) {
					v_tab_tag.ht.render();
				}
			}, 400);
		}
	};

	var v_tag = {
		tab_id: v_tab.id,
		tabTitle: "teste",
		divTree: document.getElementById(v_tab.id + "_tree"),
		divLeft: document.getElementById(v_tab.id + "_div_left"),
		divRight: document.getElementById(v_tab.id + "_div_right"),
		// tab_title_span : v_tab_title_span,
		// tab_close_span : v_tab_close_span,
		query_info: document.getElementById("div_query_info_" + v_tab.id),
		div_result: document.getElementById("div_result_" + v_tab.id),
		bt_refresh: v_bt_refresh,
		tabControl: v_connTabControl.selectedTab.tag.tabControl,
		ht: null,
		query: p_query,
		actions: p_actions,
		mode: "monitor_grid",
		resize: v_resizeFunction,
	};

	//Adding action to button
	v_bt_refresh.onclick = function () {
		refreshMonitoring(v_tag);
	};

	v_tab.tag = v_tag;

	// Creating + tab in the outer tab list
	var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
		p_name: "+",
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			showMenuNewTab(e);
		},
	});
	v_add_tab.tag = {
		mode: "add",
	};

	setTimeout(function () {
		v_resizeFunction();
		refreshMonitoring(v_tag);
	}, 10);
};

/// <summary>
/// Refreshes monitoring tab.
/// </summary>
export function refreshMonitoring(p_tab_tag) {
	if (!p_tab_tag) var p_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	execAjax(
		"/refresh_monitoring/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_query: p_tab_tag.query,
		}),
		function (p_return) {
			var v_data = p_return.v_data;

			if (p_tab_tag.ht != null) {
				p_tab_tag.ht.destroy();
				p_tab_tag.ht = null;
			}

			p_tab_tag.query_info.innerHTML = v_data.v_query_info;

			var columnProperties = [];

			var v_fixedColumnsLeft = 0;

			if (p_tab_tag.actions != null) {
				v_fixedColumnsLeft = 1;
				for (var i = 0; i < v_data.v_data.length; i++) {
					var v_actions_html = "";
					for (var j = 0; j < p_tab_tag.actions.length; j++) {
						if (p_tab_tag.actions[j].icon.includes("fa-times")) {
							p_tab_tag.actions[j].icon += " text-danger";
						} else {
							p_tab_tag.actions[j].icon += " omnidb__theme-text--primary";
						}
						// data attributes rather than an onclick: this is cell *data*, so
						// the grid re-renders it whenever it likes and there is no moment
						// at which a listener could be attached. One delegated listener in
						// dom_event_bindings.js resolves the name. The row index is baked
						// in here exactly as the attribute baked it in, and the action name
						// is still checked against monitoringAction's own allowlist.
						v_actions_html +=
							'<div class="text-center"><i class="' +
							p_tab_tag.actions[j].icon +
							'" data-omnidb-action="monitoring-action" data-omnidb-id="' +
							i +
							'" data-omnidb-arg="' +
							escapeHtmlAttribute(p_tab_tag.actions[j].action) +
							'"></i></div>';
					}
					v_data.v_data[i].unshift(v_actions_html);
				}

				/** @type {any} */
				var col = {};
				col.readOnly = true;
				col.title = "Actions";
				col.renderer = "html";
				columnProperties.push(col);
			}

			for (var i = 0; i < v_data.v_col_names.length; i++) {
				/** @type {any} */
				var col2 = {};
				col2.readOnly = true;
				col2.title = v_data.v_col_names[i];
				columnProperties.push(col2);
			}

			p_tab_tag.ht = new Handsontable(p_tab_tag.div_result, {
				licenseKey: "non-commercial-and-evaluation",
				data: v_data.v_data,
				columns: columnProperties,
				colHeaders: true,
				rowHeaders: true,
				fixedColumnsLeft: v_fixedColumnsLeft,
				fillHandle: false,
				//copyRowsLimit : 1000000000,
				//copyColsLimit : 1000000000,
				copyPaste: { pasteMode: "", rowsLimit: 1000000000, columnsLimit: 1000000000 },
				manualColumnResize: true,
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
							this.selectCell(options[0].start.row, options[0].start.col, options[0].end.row, options[0].end.col);
							document.execCommand("copy");
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
					if (row % 2 == 0) cellProperties.renderer = blueHtmlRenderer;
					else cellProperties.renderer = whiteHtmlRenderer;
					return cellProperties;
				},
			});
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						refreshMonitoring(p_tab_tag);
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
