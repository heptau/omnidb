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

import { beforeCloseTab } from "../create_tab_functions.js";
import { saveMonitorScript, selectUnitTemplate, testMonitorScript } from "../monitoring.js";
import { removeTab, renameTab, showMenuNewTab } from "../workspace.js";
import { t } from "../i18n.js";

export var v_createNewMonitorUnitTabFunction = function () {
	// Removing last tab of the inner tab list
	v_connTabControl.selectedTab.tag.tabControl.removeLastTab();

	let v_name_html = '<span id="tab_title">' + t("monitoring.monitor_unit_tab") + '</span>';
	let v_status_html =
		'<span id="tab_loading" style="display:none;">' +
		'<i class="tab-icon node-spin"></i>' +
		"</span>" +
		'<i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>';

	// Creating console tab in the inner tab list
	var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
		p_icon: '<i class="fas fa-align-left icon-tab-title"></i>',
		p_name: v_name_html,
		p_status: v_status_html,
		p_selectFunction: function () {
			if (this.tag != null) {
				this.tag.resize();
			}
		},
		p_closeFunction: function (e, p_tab) {
			var v_current_tab = p_tab;
			beforeCloseTab(e, function () {
				removeTab(v_current_tab);
				if (v_tab.tag.tabCloseFunction) v_tab.tag.tabCloseFunction(v_tab.tag);
			});
		},
		p_dblClickFunction: renameTab,
	});

	v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);

	// Custom monitoring units run a single SQL query now (see
	// go-server/custom_monitor_query.go) instead of the original two Python
	// scripts (script_chart/script_data, executed server-side in a
	// RestrictedPython sandbox — no Go equivalent). "chart"-type units need
	// one small piece of declarative config a SQL query can't express — the
	// Chart.js chart type — picked from select_chart_type instead of a
	// second code editor. "graph" (Cytoscape) units are no longer offered:
	// no built-in unit ever used that type, so there's no reference shape
	// to design a SQL convention against.
	var v_html =
		'<button id="bt_test_unit_' +
		v_tab.id +
		'" class="btn omnidb__theme__btn--secondary btn-sm my-1 me-1">' + t("monitoring.test") + '</button>' +
		'<button id="bt_save_unit_' +
		v_tab.id +
		'" class="btn omnidb__theme__btn--secondary btn-sm my-1">' + t("common.save") + '</button>' +
		'<div class="row">' +
		'  <div class="col-md-3 mb-3">' +
		'    <label for="conn_form_title">' + t("monitoring.name") + '</label>' +
		'    <input type="text" class="form-control" id="txt_unit_name_' +
		v_tab.id +
		'" placeholder="' + t("monitoring.name") + '">' +
		"  </div>" +
		'  <div class="col-md-3 mb-3">' +
		'    <label for="conn_form_type">' + t("monitoring.type") + '</label>' +
		'    <select id="select_type_' +
		v_tab.id +
		'" class="form-control">' +
		'      <option value="timeseries">' + t("monitoring.timeseries") + '</option>' +
		'      <option value="chart">' + t("monitoring.chart_no_append") + '</option>' +
		'      <option value="grid">' + t("monitoring.grid") + '</option>' +
		"    </select>" +
		"  </div>" +
		'  <div class="col-md-3 mb-3">' +
		'    <label for="conn_form_title">' + t("monitoring.refresh_interval") + '</label>' +
		'    <input type="text" class="form-control" id="txt_interval_' +
		v_tab.id +
		'" placeholder="' + t("monitoring.title") + '">' +
		"  </div>" +
		'  <div class="col-md-3 mb-3">' +
		'    <label for="conn_form_type">' + t("monitoring.template") + '</label>' +
		'    <select id="select_template_' +
		v_tab.id +
		'" class="form-control">' +
		"      <option value=-1>" + t("monitoring.select_template") + "</option>" +
		"    </select>" +
		"  </div>" +
		"</div>" +
		'<div class="row" id="chart_type_row_' +
		v_tab.id +
		'" style="display:none;">' +
		'  <div class="col-md-3 mb-3">' +
		'    <label for="conn_form_type">' + t("monitoring.chart_type") + '</label>' +
		'    <select id="select_chart_type_' +
		v_tab.id +
		'" class="form-control">' +
		'      <option value="bar">' + t("monitoring.chart_bar") + '</option>' +
		'      <option value="pie">' + t("monitoring.chart_pie") + '</option>' +
		'      <option value="doughnut">' + t("monitoring.chart_doughnut") + '</option>' +
		'      <option value="line">' + t("monitoring.chart_line") + '</option>' +
		"    </select>" +
		"  </div>" +
		"</div>" +
		'<div class="row">' +
		'  <div class="col-md-12 mb-1">' +
		'    <label for="conn_form_title">' + t("monitoring.sql_query") + '</label>' +
		"  </div>" +
		'  <div class="col-md-12">' +
		'    <div id="txt_data_' +
		v_tab.id +
		'" style=" width: 100%; height: 250px;"></div>' +
		"  </div>" +
		"</div>";

	var v_div = /** @type {HTMLElement} */ (document.getElementById("div_" + v_tab.id));
	v_div.innerHTML = v_html;

	// Bindings for the unit editor just built above.
	/** @type {HTMLElement} */ (document.getElementById("bt_test_unit_" + v_tab.id)).addEventListener("click", () =>
		testMonitorScript(),
	);
	/** @type {HTMLElement} */ (document.getElementById("bt_save_unit_" + v_tab.id)).addEventListener("click", () =>
		saveMonitorScript(),
	);
	// The attribute this replaces interpolated v_tab.id *unquoted*, so the
	// browser evaluated `toggleMonitorUnitChartType(omnidb_main_tablist_tab6_...)`
	// as an identifier and threw ReferenceError. Picking "Chart (No Append)" by
	// hand therefore never revealed the Chart Type row -- it only appeared when
	// loading a saved chart unit, where monitoring.js calls this with the id
	// properly.
	/** @type {HTMLElement} */ (document.getElementById("select_type_" + v_tab.id)).addEventListener("change", () =>
		toggleMonitorUnitChartType(v_tab.id),
	);
	/** @type {HTMLElement} */ (document.getElementById("select_template_" + v_tab.id)).addEventListener(
		"change",
		(e) => selectUnitTemplate(/** @type {HTMLSelectElement} */ (e.target).value),
	);

	var langTools = ace.require("ace/ext/language_tools");

	var v_select_chart_type = /** @type {HTMLSelectElement} */ (document.getElementById("select_chart_type_" + v_tab.id));
	// Adapter so save/load/test code can keep calling .editor.getValue()/
	// .setValue()/.clearSelection()/.gotoLine()/.resize()/.destroy()
	// unchanged, whether "editor" is really an Ace instance (script_chart,
	// historically) or -- now -- this plain chart-type <select>. destroy()
	// matters even though there's nothing to tear down: workspace.js's
	// removeTab() calls it unconditionally whenever tag.editor != null, with
	// no guard for it being missing -- omitting it here threw a TypeError
	// that aborted removeTab() before it reached p_tab.removeTab(), so
	// closing this tab silently did nothing at all.
	var v_editor = {
		getValue: function () {
			return v_select_chart_type.value;
		},
		setValue: function (v) {
			v_select_chart_type.value = v || "bar";
		},
		clearSelection: function () {},
		gotoLine: function () {},
		resize: function () {},
		destroy: function () {},
	};

	var v_txt_data = document.getElementById("txt_data_" + v_tab.id);
	var v_editor_data = ace.edit("txt_data_" + v_tab.id);
	v_editor_data.$blockScrolling = Infinity;
	v_editor_data.setTheme("ace/theme/" + v_editor_theme);
	v_editor_data.session.setMode("ace/mode/sql");
	v_editor_data.setFontSize(Number(v_font_size));
	v_editor_data.commands.bindKey("ctrl-space", null);
	v_editor_data.commands.bindKey("Cmd-,", null);
	v_editor_data.commands.bindKey("Ctrl-,", null);
	v_editor_data.commands.bindKey("Cmd-Delete", null);
	v_editor_data.commands.bindKey("Ctrl-Delete", null);
	v_editor_data.commands.bindKey("Ctrl-Up", null);
	v_editor_data.commands.bindKey("Ctrl-Down", null);

	var v_resizeFunction = function () {
		var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
		if (v_tab_tag.editorDataDiv) {
			var v_new_height =
				window.innerHeight -
				(v_tab_tag.editorDataDiv.getBoundingClientRect().top + window.scrollY) -
				v_font_size +
				"px";
			v_tab_tag.editorDataDiv.style.height = v_new_height;
			v_tab_tag.editor_data.resize();
		}
	};

	var v_tag = {
		tab_id: v_tab.id,
		mode: "monitor_unit",
		editor: v_editor,
		editor_data: v_editor_data,
		editorDataDiv: v_txt_data,
		select_type: document.getElementById("select_type_" + v_tab.id),
		select_chart_type: v_select_chart_type,
		select_template: document.getElementById("select_template_" + v_tab.id),
		input_unit_name: document.getElementById("txt_unit_name_" + v_tab.id),
		input_interval: document.getElementById("txt_interval_" + v_tab.id),
		div_result: document.getElementById("monitoring_unit_test_result"),
		div_result_label: document.getElementById("monitoring_unit_test_legend"),
		bt_test: document.getElementById("bt_test_" + v_tab.id),
		tabControl: v_connTabControl.selectedTab.tag.tabControl,
		unit_id: null,
		object: null,
		resize: v_resizeFunction,
		tabCloseFunction: function (p_tag) {
			try {
				p_tag.object.destroy();
			} catch (err) {}
		},
	};

	toggleMonitorUnitChartType(v_tab.id);

	v_tab.tag = v_tag;

	// Creating + tab in the outer tab list
	var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab({
		p_icon: '<i class="fas fa-plus"></i>',
		p_close: false,
		p_selectable: false,
		p_isDraggable: false,
		p_clickFunction: function (e) {
			showMenuNewTab(e);
		},
	});
	v_add_tab.elementA.classList.add("omnidb__tab-menu__link--compact");
	v_add_tab.tag = {
		mode: "add",
	};


	setTimeout(function () {
		v_resizeFunction();
	}, 10);
};

// Shows the Chart Type dropdown only for "chart"-type units (the only type
// that needs it — "timeseries" is always a line chart, "grid" doesn't chart
// at all).
export function toggleMonitorUnitChartType(p_tab_id) {
	var v_row = /** @type {HTMLElement} */ (document.getElementById("chart_type_row_" + p_tab_id));
	var v_type_select = /** @type {HTMLSelectElement} */ (document.getElementById("select_type_" + p_tab_id));
	if (!v_row || !v_type_select) return;
	v_row.style.display = v_type_select.value == "chart" ? "" : "none";
}
