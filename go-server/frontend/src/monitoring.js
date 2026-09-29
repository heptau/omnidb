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

import { endLoading, execAjax, startLoading } from "./ajax_control_bridge.js";
import { customMenu } from "./custom_menu.js";
import { adjustChartTheme, adjustGraphTheme, editCellData } from "./header_actions.js";
import { t } from "./i18n.js";
import { showAlert, showConfirm, showError } from "./notification_control.js";
import { showPasswordPrompt } from "./passwords.js";
import { escapeHtml } from "./query.js";
import { toggleMonitorUnitChartType } from "./tab_functions/inner_monitoring_dashboard_tab.js";
import { switchSection } from "./section_switcher.js";

// Chart.js v2 had a chart.generateLegend()/options.legendCallback pair for
// building a custom HTML legend from a chart instance; both were removed in
// v3+ with no replacement. The documented v3+ way to get the same per-item
// {text, fillStyle, ...} data Chart.js's own built-in legend renders from is
// to call the legend plugin's own generateLabels straight off the chart
// instance -- this works whether or not the built-in legend is actually
// displayed (see the "legend.display = false" toggle at each call site,
// which exists so this custom label strip can replace it instead).
//
// Built as DOM nodes rather than an HTML string: a label's text is a dataset
// label from a monitor unit's result, i.e. database data, so it goes in via
// textContent. (This used to be an HTML string run through an attribute
// blocklist, which stripped on*/href/src but left any other markup live.)
//
// No click handler: this used to carry onclick=updateDataset(event, ...), a
// function that has never existed anywhere in this repository's history --
// clicking a legend label threw a ReferenceError. Toggling a dataset from the
// legend would be a feature to add, not a call to restore.
/**
 * @param {HTMLElement} p_target
 * @param {any} p_chart
 */
function renderChartLegend(p_target, p_chart) {
	var v_items = p_chart.options.plugins.legend.labels.generateLabels(p_chart);
	p_target.replaceChildren();
	for (var i = 0; i < v_items.length; i++) {
		var v_group = document.createElement("span");
		v_group.className = "dashboard_unit_label_group";
		var v_box = document.createElement("span");
		v_box.className = "dashboard_unit_label_box";
		// fillStyle can also be a CanvasGradient/CanvasPattern, which has no
		// CSS equivalent -- the old string concatenation produced an invalid
		// "[object CanvasGradient]" declaration for those anyway.
		if (typeof v_items[i].fillStyle === "string") v_box.style.backgroundColor = v_items[i].fillStyle;
		var v_label = document.createElement("span");
		v_label.id = "legend-" + i + "-item";
		v_label.className = "dashboard_unit_label";
		v_label.textContent = v_items[i].text == null ? "" : String(v_items[i].text);
		v_group.appendChild(v_box);
		v_group.appendChild(v_label);
		p_target.appendChild(v_group);
	}
}

/**
 * Stops a unit's timer, destroys its chart/graph object if any, and removes
 * its card from the DOM -- the client-side half of "this unit is no longer
 * shown", shared by closeMonitorUnit (the card's own "×") and
 * saveMonitorUnitOrder's removal diff (unchecking it in "Manage Units").
 * Does not touch v_tab_tag.units itself -- callers splice/filter that
 * however suits their own loop.
 * @param {any} p_unit
 */
function teardownMonitorUnit(p_unit) {
	clearTimeout(p_unit.timeout_object);
	if (p_unit.type == "graph" && p_unit.object != null) {
		p_unit.object.destroy();
	}
	if (p_unit.div.parentElement) p_unit.div.parentElement.removeChild(p_unit.div);
}

export function closeMonitorUnit(p_div) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		var v_unit = v_tab_tag.units[i];
		if (v_unit.div == p_div) {
			teardownMonitorUnit(v_unit);
			v_tab_tag.units.splice(i, 1);

			// Hides the unit server-side (soft: the row and its interval
			// override survive, see hideMonitorUnit's own comment) --
			// re-showing it from "Manage Units" finds it again instead of
			// recreating it from scratch.
			execAjax(
				"/hide_monitor_unit/",
				JSON.stringify({ p_saved_id: v_unit.saved_id }),
				function (p_return) {},
				null,
				"box",
				false,
			);

			break;
		}
	}
}

export function updateUnitSavedInterval(p_div) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		var v_unit = v_tab_tag.units[i];
		if (v_unit.div == p_div) {
			// parseInt because an <input>'s value is a string and the backend
			// unmarshals this into an integer, which rejects "30" outright and
			// fails the whole request. See flexInt in go-server/flex_int.go.
			// A value that is not a positive whole number has nothing worth
			// persisting, so it is not sent at all.
			var v_interval = parseInt(v_unit.input_interval.value, 10);
			if (v_interval > 0) {
				execAjax(
					"/update_saved_monitor_unit_interval/",
					JSON.stringify({ p_saved_id: v_unit.saved_id, p_interval: v_interval }),
					function (p_return) {},
					null,
					"box",
					false,
				);
			}

			break;
		}
	}
}

function pauseUnit(p_unit) {
	clearTimeout(p_unit.timeout_object);
	p_unit.active = false;
	p_unit.button_play.style.display = "inline-block";
	p_unit.button_pause.style.display = "none";
}

function playUnit(p_unit, p_tab_tag) {
	clearTimeout(p_unit.timeout_object);
	p_unit.active = true;
	p_unit.button_play.style.display = "none";
	p_unit.button_pause.style.display = "inline-block";
	refreshMonitorDashboard(true, p_tab_tag, p_unit.div);
}

export function pauseMonitorUnit(p_div) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		if (v_tab_tag.units[i].div == p_div) {
			pauseUnit(v_tab_tag.units[i]);
			break;
		}
	}
}

export function playMonitorUnit(p_div) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		if (v_tab_tag.units[i].div == p_div) {
			playUnit(v_tab_tag.units[i], v_tab_tag);
			break;
		}
	}
}

/**
 * Bulk "Enable All"/"Pause All" toolbar actions -- iterates every unit for
 * the given (or currently selected) connection's dashboard. Only units not
 * already in the target state are touched, so this is also safe to call
 * repeatedly (e.g. re-clicking "Enable All" doesn't restart already-running
 * timers).
 * @param {any} [p_tag]
 */
export function enableAllMonitorUnits(p_tag) {
	var v_tab_tag = p_tag || v_connTabControl.selectedTab.tag.monitoring;
	if (!v_tab_tag) return;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		if (!v_tab_tag.units[i].active) playUnit(v_tab_tag.units[i], v_tab_tag);
	}
}

/**
 * @param {any} [p_tag]
 */
export function pauseAllMonitorUnits(p_tag) {
	var v_tab_tag = p_tag || v_connTabControl.selectedTab.tag.monitoring;
	if (!v_tab_tag) return;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		if (v_tab_tag.units[i].active) pauseUnit(v_tab_tag.units[i]);
	}
}

export function buildMonitorUnit(p_unit, p_first, p_tag) {
	var v_tab_tag = p_tag || v_connTabControl.selectedTab.tag.monitoring;
	var v_dashboard_div = v_tab_tag.dashboard_div;

	var v_return_unit = p_unit;

	/** @type {any} */
	var v_unit = null;

	var div = document.createElement("div");
	div.className = "omnidb__monitor-unit__col my-2";
	var div_card = document.createElement("div");
	div_card.className = "card omnidb__monitor-unit__card";
	var div_card_body = document.createElement("div");
	div_card_body.className = "card-body";
	var div_loading = document.createElement("div");
	div_loading.classList.add("div_loading");
	div_loading.innerHTML =
		'<div class="div_loading_cover"></div>' +
		'<div class="div_loading_content">' +
		'  <div class="spinner-border text-primary" style="width: 4rem; height: 4rem;" role="status">' +
		'    <span class="sr-only ">Loading...</span>' +
		"  </div>" +
		"</div>";

	var div_header = document.createElement("div");
	div_header.className = "d-flex flex-column gap-2";

	var div_header_row1 = document.createElement("div");
	div_header_row1.className = "d-flex justify-content-between align-items-center";

	var button_close = document.createElement("button");
	button_close.className = "omnidb__monitor-unit__header-btn text-muted";
	button_close.title = t("common.close");
	button_close.onclick = (function (div) {
		return function () {
			closeMonitorUnit(div);
		};
	})(div);
	button_close.innerHTML = "<i class='fas fa-times'></i>";

	var title = document.createElement("span");
	title.className = "flex-grow-1 text-center fw-bold";
	title.textContent = v_return_unit.v_title;

	div_header_row1.appendChild(button_close);
	div_header_row1.appendChild(title);

	// Custom units only (v_plugin_name == "" -- built-ins are native Go code
	// with no SQL/settings to edit, see monitoring_units.go). Balances the
	// close button on the other side of the title, same "×" reveal-on-hover
	// treatment, so an editable card reads as such without adding permanent
	// chrome to every card.
	if (!v_return_unit.v_plugin_name) {
		var button_edit = document.createElement("button");
		button_edit.className = "omnidb__monitor-unit__header-btn text-muted";
		button_edit.title = t("common.edit");
		button_edit.onclick = function () {
			editMonitorUnit(v_return_unit.v_id);
		};
		button_edit.innerHTML = "<i class='fas fa-edit'></i>";
		div_header_row1.appendChild(button_edit);
	} else {
		div_header_row1.appendChild(document.createElement("div"));
	}

	var div_header_row2 = document.createElement("div");
	div_header_row2.className = "d-flex align-items-center gap-2";

	var button_refresh = document.createElement("button");
	button_refresh.onclick = (function (div) {
		return function () {
			refreshMonitorDashboard(true, v_tab_tag, div);
		};
	})(div);
	button_refresh.innerHTML = "<i class='fas fa-sync-alt fa-light'></i>";
	button_refresh.className = "btn omnidb__theme__btn--secondary btn-sm";
	button_refresh.title = t("common.refresh");
	var button_pause = document.createElement("button");
	button_pause.onclick = (function (div) {
		return function () {
			pauseMonitorUnit(div);
		};
	})(div);
	button_pause.innerHTML = "<i class='fas fa-pause-circle fa-light'></i>";
	button_pause.className = "btn omnidb__theme__btn--secondary btn-sm";
	button_pause.title = t("notify.pause");
	// Units start paused (see the `active: false` default below) -- Pause
	// starts hidden, Play visible, until the unit is actually running.
	button_pause.style.display = "none";
	var button_play = document.createElement("button");
	button_play.onclick = (function (div) {
		return function () {
			playMonitorUnit(div);
		};
	})(div);
	button_play.innerHTML = "<i class='fas fa-play-circle fa-light'></i>";
	button_play.className = "btn omnidb__theme__btn--secondary btn-sm";
	button_play.title = t("monitoring.play");
	var interval = document.createElement("input");
	interval.value = v_return_unit.v_interval;
	interval.className = "form-control form-control-sm";
	interval.style.width = "60px";
	interval.onkeypress = function () {
		var v_charCode = /** @type {any} */ (event).charCode;
		return v_charCode >= 48 && v_charCode <= 57;
	};
	interval.onchange = function () {
		var v_value = interval.value;
		if (v_value == "" || v_value == "0") {
			interval.value = "30";
		}
		updateUnitSavedInterval(div);
	};
	var interval_text = document.createElement("span");
	interval_text.className = "text-nowrap";
	interval_text.innerHTML = "seconds";
	var details = document.createElement("span");
	details.classList.add("unit_header_element");
	details.innerHTML = "";

	div_header_row2.appendChild(button_refresh);
	div_header_row2.appendChild(button_pause);
	div_header_row2.appendChild(button_play);
	div_header_row2.appendChild(interval);
	div_header_row2.appendChild(interval_text);
	div_header_row2.appendChild(details);

	div_header.appendChild(div_header_row1);
	div_header.appendChild(div_header_row2);

	var div_error = document.createElement("div");
	div_error.classList.add("error_text");
	var div_content = document.createElement("div");
	var div_label = document.createElement("div");
	div_label.className = "dashboard_unit_legend_box";

	var div_content_group = document.createElement("div");
	div_content_group.className = "dashboard_unit_content_group";
	div_card_body.appendChild(div_loading);
	div_card_body.appendChild(div_header);
	div_card_body.appendChild(div_error);

	div_card.appendChild(div_card_body);
	div.appendChild(div_card);

	div_content_group.appendChild(div_content);
	div_content_group.appendChild(div_label);
	div_card_body.appendChild(div_content_group);

	if (p_first) v_dashboard_div.insertBefore(div, v_dashboard_div.firstChild);
	else v_dashboard_div.appendChild(div);

	//Increment unit sequence
	v_tab_tag.unit_sequence += 1;

	v_unit = {
		type: "",
		object: null,
		object_data: null,
		saved_id: v_return_unit.v_saved_id,
		id: v_return_unit.v_id,
		plugin_name: v_return_unit.v_plugin_name,
		div: div,
		div_loading: div_loading,
		div_details: details,
		div_error: div_error,
		div_content: div_content,
		div_label: div_label,
		button_pause: button_pause,
		button_play: button_play,
		input_interval: interval,
		error: false,
		timeout_object: null,
		unit_sequence: v_tab_tag.unit_sequence,
		// Paused by default: a freshly (re)loaded dashboard must not start
		// polling the database on its own -- the user opts in per-unit (Play)
		// or all at once ("Enable All", see enableAllMonitorUnits).
		active: false,
	};
	v_tab_tag.units.push(v_unit);

	return div;
}

export function deleteMonitorUnit(p_unit_id) {
	showConfirm(t("monitoring.confirm_delete_unit"), function () {
		var input = JSON.stringify({ p_unit_id: p_unit_id });

		execAjax(
			"/delete_monitor_unit/",
			input,
			function (p_return) {
				refreshMonitorUnitsList(v_connTabControl.selectedTab.tag.monitoring);
			},
			null,
			"box",
		);
	});
}

/**
 * The footer's "-" button: deletes whichever row the user last clicked in
 * this connection's own "Manage Units" list (see buildMonitorUnitList's row
 * click handler), if any and if it's actually a deletable custom unit -- the
 * button itself is only enabled in that case (see updateDeleteUnitButtonState),
 * but this is the single source of truth deleteMonitorUnit's own confirm
 * dialog runs against, not the button's disabled attribute.
 * @param {any} p_tag
 */
export function deleteSelectedMonitorUnit(p_tag) {
	if (!p_tag || !p_tag.selectedUnitRef || !p_tag.selectedUnitRef.owned) return;
	deleteMonitorUnit(p_tag.selectedUnitRef.unit_id);
}

export function editMonitorUnit(p_unit_id) {
	// The unit editor is an inner tab of the Database section's own
	// connection strip -- Ace cannot lay itself out inside a display:none
	// container, and "Manage Units" is opened from the Monitoring section, so
	// Database must be made visible first (same reasoning as
	// outer_connected_users_panel.js's sendConnectedUsersQueryToNewTab).
	switchSection("database");
	v_connTabControl.tag.createNewMonitorUnitTab();

	var input1 = JSON.stringify({
		p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
		p_tab_id: v_connTabControl.selectedTab.id,
		p_mode: 1,
	});

	execAjax(
		"/get_monitor_unit_list/",
		input1,
		function (p_return) {
			var v_select_template = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.select_template;
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.template_list = [];

			p_return.v_data.data.forEach(function (p_unit, p_index) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.template_list.push({
					plugin_name: p_unit[0],
					id: p_return.v_data.id_list[p_index],
				});
				var v_option = document.createElement("option");
				v_option.value = p_index;
				v_option.textContent = "(" + p_unit[2] + ") " + p_unit[1];
				v_select_template.appendChild(v_option);
			});
		},
		null,
		"box",
	);

	if (p_unit_id != null) {
		var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

		var input2 = JSON.stringify({ p_unit_id: p_unit_id });

		execAjax(
			"/get_monitor_unit_details/",
			input2,
			function (p_return) {
				v_tab_tag.input_unit_name.value = p_return.v_data.title;
				v_tab_tag.input_interval.value = p_return.v_data.interval;
				v_tab_tag.select_type.value = p_return.v_data.type;
				toggleMonitorUnitChartType(v_tab_tag.tab_id);
				v_tab_tag.editor.setValue(p_return.v_data.script_chart);
				v_tab_tag.editor.clearSelection();
				v_tab_tag.editor.gotoLine(0, 0, true);
				v_tab_tag.editor_data.setValue(p_return.v_data.script_data);
				v_tab_tag.editor_data.clearSelection();
				v_tab_tag.editor_data.gotoLine(0, 0, true);
				v_tab_tag.unit_id = p_unit_id;
			},
			null,
			"box",
		);
	}
}

export function saveMonitorScript() {
	var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	if (v_tab_tag.input_unit_name.value.trim() == "") {
		showAlert(t("monitoring.name_required"));
	} else {
		// parseInt: see the comment in updateUnitSavedInterval. Here an
		// unparseable value goes as null, which the backend replaces with its
		// own 30 second default.
		var v_interval = parseInt(v_tab_tag.input_interval.value, 10);
		var input = JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_unit_id: v_tab_tag.unit_id,
			p_unit_name: v_tab_tag.input_unit_name.value,
			p_unit_type: v_tab_tag.select_type.value,
			p_unit_interval: v_interval > 0 ? v_interval : null,
			p_unit_script_data: v_tab_tag.editor_data.getValue(),
			p_unit_script_chart: v_tab_tag.editor.getValue(),
		});

		execAjax(
			"/save_monitor_unit/",
			input,
			function (p_return) {
				v_tab_tag.unit_id = p_return.v_data;

				showAlert(t("monitoring.unit_saved"));
			},
			function (p_return) {
				if (p_return.v_data.password_timeout) {
					showPasswordPrompt(
						v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
						function () {
							saveMonitorScript();
						},
						null,
						p_return.v_data.message,
					);
				} else {
					showError(p_return.v_data);
				}
			},
			"box",
		);
	}
}

export function selectUnitTemplate(p_value) {
	if (p_value != -1) {
		var v_element_item = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.template_list[p_value];
		var input = JSON.stringify({ p_unit_id: v_element_item.id, p_unit_plugin_name: v_element_item.plugin_name });

		execAjax(
			"/get_monitor_unit_template/",
			input,
			function (p_return) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.innerHTML = "";
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result_label.innerHTML = "";
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.select_type.value = p_return.v_data.type;
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.input_interval.value = p_return.v_data.interval;
				toggleMonitorUnitChartType(v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.tab_id);

				var v_editor = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor;
				v_editor.setValue(p_return.v_data.script_chart);
				v_editor.clearSelection();
				v_editor.gotoLine(0, 0, true);

				var v_editor_data = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor_data;
				v_editor_data.setValue(p_return.v_data.script_data);
				v_editor_data.clearSelection();
				v_editor_data.gotoLine(0, 0, true);
			},
			null,
			"box",
		);
	}
}

// Bootstrap dispatches this as a real DOM event, no jQuery needed to listen for it.
/** @type {HTMLElement} */ (document.getElementById("modal_monitoring_unit_test")).addEventListener(
	"shown.bs.modal",
	function (e) {
	var v_script_chart = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();
	var v_script_data = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor_data.getValue();
	var v_type = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.select_type.value;

	var input = JSON.stringify({
		p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
		p_tab_id: v_connTabControl.selectedTab.id,
		p_script_chart: v_script_chart,
		p_script_data: v_script_data,
		p_type: v_type,
	});

	execAjax(
		"/test_monitor_script/",
		input,
		function (p_return) {
			var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
			var v_type = v_tab_tag.select_type.value;
			var v_div_result = v_tab_tag.div_result;

			if (v_tab_tag.object != null) {
				v_tab_tag.object.destroy();
				v_tab_tag.object = null;
			}

			var v_return_unit = p_return.v_data;

			try {
				if (p_return.v_data.v_error) {
					v_div_result.textContent = "";
					var v_err_div = document.createElement("div");
					v_err_div.className = "error_text";
					v_err_div.textContent = p_return.v_data.v_message;
					v_div_result.appendChild(v_err_div);
				} else if (v_type == "timeseries" || v_type == "chart" || v_return_unit.v_type == "chart_append") {
					var canvas = document.createElement("canvas");
					canvas.style.height = "250px";
					canvas.style.width = v_div_result.offsetWidth;
					v_div_result.appendChild(canvas);

					var ctx = canvas.getContext("2d");
					var v_show_legend = false;
					try {
						v_return_unit.v_object.options.responsive = true;
						v_return_unit.v_object.options.maintainAspectRatio = false;
						if (v_return_unit.v_object.options.plugins == null) {
							v_return_unit.v_object.options.plugins = {};
						}
						if (v_return_unit.v_object.options.plugins.legend == null) {
							v_return_unit.v_object.options.plugins.legend = {
								display: false,
							};
							v_show_legend = true;
						} else {
							if (v_return_unit.v_object.options.plugins.legend.display == true) v_show_legend = true;
							v_return_unit.v_object.options.plugins.legend.display = false;
						}
					} catch (err) {}
					v_tab_tag.object = new Chart(ctx, v_return_unit.v_object);
					adjustChartTheme(v_tab_tag.object);
					if (v_show_legend) {
						renderChartLegend(v_tab_tag.div_result_label, v_tab_tag.object);
					}
				} else if (v_type == "grid") {
					var columnProperties = [];

					for (var j = 0; j < p_return.v_data.v_object.columns.length; j++) {
						/** @type {any} */
						var col = {};
						col.readOnly = true;
						col.title = p_return.v_data.v_object.columns[j];
						columnProperties.push(col);
					}
					v_div_result.className = "dashboard_unit_grid";
					v_tab_tag.object = new Handsontable(v_div_result, {
						licenseKey: "non-commercial-and-evaluation",
						data: p_return.v_data.v_object.data,
						columns: columnProperties,
						colHeaders: true,
						rowHeaders: true,
						//copyRowsLimit : 1000000000,
						//copyColsLimit : 1000000000,
						copyPaste: { pasteMode: "", rowsLimit: 1000000000, columnsLimit: 1000000000 },
						manualColumnResize: true,
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
							return cellProperties;
						},
					});
				} else if (v_type == "graph") {
					v_div_result.className = "unit_graph";
					p_return.v_data.v_object.container = v_div_result;
					v_tab_tag.object = cytoscape(p_return.v_data.v_object);
					adjustGraphTheme(v_tab_tag.object);
				}
			} catch (err) {
				v_div_result.textContent = "";
				var v_err_div2 = document.createElement("div");
				v_err_div2.className = "error_text";
				v_err_div2.textContent = String(err);
				v_div_result.appendChild(v_err_div2);
			}

			endLoading();
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						testMonitorScript();
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
	);
	},
);

export function testMonitorScript() {
	startLoading();

	var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
	v_tab_tag.div_result_label.innerHTML = "";
	var v_div_result = v_tab_tag.div_result;
	v_div_result.innerHTML = "";
	v_div_result.className = "";

	bootstrap.Modal.getOrCreateInstance(
		/** @type {HTMLElement} */ (document.getElementById("modal_monitoring_unit_test")),
	).show();
}

// --- "Manage Units" list: show/hide + drag-to-reorder --------------------
//
// Plain HTML5 drag and drop, no library -- same shape as connections.js's
// Connections sidebar reordering (bindConnectionDrag/bindConnectionListDrop/
// persistConnectionOrder there). Handsontable has no row-drag support
// anywhere else in this codebase, so this list is built as plain DOM rows
// instead of a grid.
//
// A row's checkbox is the single show/hide toggle (replacing the old
// one-way "include" checkmark, which had no way to hide a unit again short
// of deleting its custom definition, and no guard against including the
// same unit twice). Every checkbox change or drag-end recomputes the full
// set of currently-checked rows, in DOM order, and posts it as this
// connection's whole shown-and-ordered set (see saveMonitorUnitOrder).

/** The row currently being dragged, or null. @type {HTMLElement|null} */
var v_monunit_drag_item = null;

/**
 * Refreshes this connection's own "Manage Units" list -- called when its
 * panel is expanded (see outer_monitoring_panel.js's toggle button) and
 * after a delete, same "reload whenever the list becomes relevant again"
 * timing the old modal's shown.bs.modal listener used to provide.
 * @param {any} p_tag
 */
export function refreshMonitorUnitsList(p_tag) {
	var input = JSON.stringify({
		p_database_index: p_tag.connTabTag.selectedDatabaseIndex,
		p_tab_id: p_tag.tab_id,
		p_mode: 0,
	});

	execAjax(
		"/get_monitor_unit_list/",
		input,
		function (p_return) {
			buildMonitorUnitList(p_tag, p_return.v_data.items);
			endLoading();
		},
		null,
		"box",
	);
}

/**
 * @param {any} p_tag
 * @param {any[]} p_items
 */
function buildMonitorUnitList(p_tag, p_items) {
	var p_list_div = p_tag.unitListDiv;

	// Units that have ever been shown -- currently shown, or hidden but
	// still holding the position they had -- come first, sorted by that
	// position; units never shown at all come after, alphabetically (there
	// is no meaningful order among them yet). Grouping by "has a saved_id"
	// rather than by "shown" is what lets a hidden unit keep sitting in its
	// old spot instead of falling to the alphabetical tail -- re-checking it
	// then finds it already in the right place, no row-moving needed at all
	// (see the checkbox's own "change" listener below).
	var v_sorted = p_items.slice().sort(function (a, b) {
		var v_a_has_position = a.saved_id > 0;
		var v_b_has_position = b.saved_id > 0;
		if (v_a_has_position !== v_b_has_position) return v_a_has_position ? -1 : 1;
		if (v_a_has_position) return a.position - b.position;
		return a.title.localeCompare(b.title);
	});

	p_list_div.innerHTML = "";
	// A fresh render has nothing selected -- the row it used to point at may
	// not even exist at the same DOM node any more.
	p_tag.selectedUnitRef = null;
	updateDeleteUnitButtonState(p_tag);

	for (var i = 0; i < v_sorted.length; i++) {
		var v_item = v_sorted[i];

		var v_row = document.createElement("div");
		v_row.className = "omnidb__monitor-unit-list__item";
		v_row.setAttribute("data-plugin-name", v_item.plugin_name);
		v_row.setAttribute("data-unit-id", String(v_item.unit_id));

		v_row.innerHTML =
			"<input type='checkbox' class='omnidb__monitor-unit-list__checkbox'" +
			(v_item.shown ? " checked" : "") +
			" />" +
			"<span class='omnidb__monitor-unit-list__title'>" +
			escapeHtml(v_item.title) +
			"</span>" +
			"<span class='omnidb__monitor-unit-list__type'>" +
			escapeHtml(v_item.type) +
			"</span>" +
			"<span class='omnidb__monitor-unit-list__interval'>" +
			escapeHtml(String(v_item.interval)) +
			"s</span>";

		p_list_div.appendChild(v_row);
		bindMonitorUnitDrag(v_row, p_list_div);

		var v_checkbox = /** @type {HTMLInputElement} */ (v_row.querySelector(".omnidb__monitor-unit-list__checkbox"));
		bindMonitorUnitRowInteractions(p_tag, v_row, v_item, v_checkbox);
	}

	bindMonitorUnitListDrop(p_list_div);
}

/**
 * Wires one row's non-drag interactions: the checkbox (show/hide, unchanged
 * from before), a plain click to select the row (for the footer's "-"
 * button), and -- for custom units only, same "owned" gate the old inline
 * icons used -- a double-click and a right-click context menu to edit/delete
 * it, mirroring how connections.js's own list rows work (double-click
 * connects, right-click opens Edit/Delete) instead of always-visible icon
 * buttons. Takes the row/item/checkbox as real parameters (not closed over
 * from the caller's loop variable) so each row's handlers close over its own
 * values, not whichever happened to be last by the time a listener fires.
 * @param {any} p_tag
 * @param {HTMLElement} p_row
 * @param {any} p_item
 * @param {HTMLInputElement} p_checkbox
 */
function bindMonitorUnitRowInteractions(p_tag, p_row, p_item, p_checkbox) {
	// A row is never moved just for being checked/unchecked -- the sort in
	// buildMonitorUnitList already placed it exactly where it belongs (a unit
	// that was shown before, even if hidden right now, sits at its old
	// position; a genuinely new one sits in the alphabetical tail, after
	// every positioned row). Moving it here would be exactly the bug this
	// doesn't have: re-checking a hidden unit must land it back where it was,
	// not at the end. saveMonitorUnitOrder simply reads off whichever rows
	// are checked, in their current (unchanged) DOM order.
	p_checkbox.addEventListener("change", function () {
		saveMonitorUnitOrder();
	});

	p_row.addEventListener("click", function (e) {
		if (e.target === p_checkbox) return;
		selectMonitorUnitRow(p_tag, p_row, p_item);
	});

	if (p_item.owned) {
		p_row.addEventListener("dblclick", function () {
			editMonitorUnit(p_item.unit_id);
		});
		p_row.addEventListener("contextmenu", function (e) {
			e.preventDefault();
			selectMonitorUnitRow(p_tag, p_row, p_item);
			customMenu(
				{ x: e.clientX + 5, y: e.clientY + 5 },
				[
					{
						text: t("common.edit"),
						icon: "fas cm-all fa-edit",
						action: function () {
							editMonitorUnit(p_item.unit_id);
						},
					},
					{
						text: t("common.delete"),
						icon: "fas cm-all fa-times",
						action: function () {
							deleteMonitorUnit(p_item.unit_id);
						},
					},
				],
				null,
			);
		});
	} else {
		// A built-in unit has nothing to edit/delete -- still swallow the
		// right-click so the browser's own context menu doesn't appear where
		// every other row shows a real one.
		p_row.addEventListener("contextmenu", function (e) {
			e.preventDefault();
		});
	}
}

/**
 * @param {any} p_tag
 * @param {HTMLElement} p_row
 * @param {any} p_item
 */
function selectMonitorUnitRow(p_tag, p_row, p_item) {
	var v_rows = p_tag.unitListDiv.querySelectorAll(".omnidb__monitor-unit-list__item--selected");
	for (var i = 0; i < v_rows.length; i++) {
		v_rows[i].classList.remove("omnidb__monitor-unit-list__item--selected");
	}
	p_row.classList.add("omnidb__monitor-unit-list__item--selected");
	p_tag.selectedUnitRef = { plugin_name: p_item.plugin_name, unit_id: p_item.unit_id, owned: p_item.owned };
	updateDeleteUnitButtonState(p_tag);
}

/**
 * @param {any} p_tag
 */
function updateDeleteUnitButtonState(p_tag) {
	if (!p_tag.deleteUnitBtn) return;
	p_tag.deleteUnitBtn.disabled = !(p_tag.selectedUnitRef && p_tag.selectedUnitRef.owned);
}

/**
 * @param {HTMLElement} p_row
 * @param {HTMLElement} p_list_div
 */
function bindMonitorUnitDrag(p_row, p_list_div) {
	p_row.setAttribute("draggable", "true");

	p_row.addEventListener("dragstart", function (e) {
		v_monunit_drag_item = p_row;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			// Firefox starts no drag at all unless some data is set.
			e.dataTransfer.setData("text/plain", "");
		}
		setTimeout(function () {
			p_row.classList.add("omnidb__monitor-unit-list__item--dragging");
		}, 0);
	});

	p_row.addEventListener("dragend", function () {
		p_row.classList.remove("omnidb__monitor-unit-list__item--dragging");
		if (v_monunit_drag_item !== p_row) return;
		v_monunit_drag_item = null;
		saveMonitorUnitOrder();
	});
}

/**
 * @param {HTMLElement} p_list_div
 * @param {number} p_y
 * @returns {HTMLElement|null}
 */
function getMonitorUnitDragTarget(p_list_div, p_y) {
	/** @type {HTMLElement|null} */
	var v_closest = null;
	var v_closest_offset = Number.NEGATIVE_INFINITY;
	var v_rows = p_list_div.querySelectorAll(".omnidb__monitor-unit-list__item");
	for (var i = 0; i < v_rows.length; i++) {
		var v_row = /** @type {HTMLElement} */ (v_rows[i]);
		if (v_row === v_monunit_drag_item) continue;
		var v_box = v_row.getBoundingClientRect();
		var v_offset = p_y - v_box.top - v_box.height / 2;
		if (v_offset < 0 && v_offset > v_closest_offset) {
			v_closest_offset = v_offset;
			v_closest = v_row;
		}
	}
	return v_closest;
}

/**
 * @param {HTMLElement} p_list_div
 */
function bindMonitorUnitListDrop(p_list_div) {
	p_list_div.addEventListener("dragover", function (e) {
		if (v_monunit_drag_item === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		var v_target = getMonitorUnitDragTarget(p_list_div, e.clientY);
		if (v_target === null) {
			if (p_list_div.lastElementChild !== v_monunit_drag_item) p_list_div.appendChild(v_monunit_drag_item);
		} else if (v_target.previousElementSibling !== v_monunit_drag_item) {
			p_list_div.insertBefore(v_monunit_drag_item, v_target);
		}
	});

	p_list_div.addEventListener("drop", function (e) {
		if (v_monunit_drag_item === null) return;
		e.preventDefault();
	});
}

/**
 * Persists the full set of currently-checked rows, in DOM order, as this
 * connection's shown-and-ordered set (see go-server/monitoring_handlers.go's
 * handleSaveMonitorUnitOrder), then reconciles the live dashboard against
 * it.
 */
function saveMonitorUnitOrder() {
	var v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;
	var v_list_div = v_tab_tag && v_tab_tag.unitListDiv;
	if (!v_list_div || !v_tab_tag) return;

	var v_rows = v_list_div.querySelectorAll(".omnidb__monitor-unit-list__item");
	/** @type {any[]} */
	var v_units = [];
	for (var i = 0; i < v_rows.length; i++) {
		var v_row = /** @type {HTMLElement} */ (v_rows[i]);
		var v_checkbox = /** @type {HTMLInputElement} */ (v_row.querySelector(".omnidb__monitor-unit-list__checkbox"));
		if (v_checkbox.checked) {
			v_units.push({
				p_plugin_name: v_row.getAttribute("data-plugin-name") || "",
				p_unit: parseInt(v_row.getAttribute("data-unit-id") || "0", 10),
			});
		}
	}

	execAjax(
		"/save_monitor_unit_order/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_units: v_units,
		}),
		function () {
			reconcileMonitorDashboard(v_tab_tag);
		},
		null,
		"box",
		// No loading overlay: this is a background detail of a gesture
		// (a checkbox click, a drag) the user already sees the result of --
		// same reasoning as connections.js's persistConnectionOrder.
		false,
	);
}

/**
 * Re-fetches this connection's now-saved shown units and reconciles the
 * live dashboard against them: units no longer shown are torn down, newly
 * shown ones are built (paused, like any fresh unit), and units that stay
 * shown are only ever moved to their new DOM position -- their timer/chart
 * object is left running untouched, so reordering or hiding one unit never
 * resets another that's already polling.
 * @param {any} p_tab_tag
 */
function reconcileMonitorDashboard(p_tab_tag) {
	var input = JSON.stringify({
		p_database_index: p_tab_tag.connTabTag.selectedDatabaseIndex,
		p_tab_id: p_tab_tag.tab_id,
	});

	execAjax(
		"/get_monitor_units/",
		input,
		function (p_return) {
			var v_desired = p_return.v_data;

			for (var i = p_tab_tag.units.length - 1; i >= 0; i--) {
				var v_unit = p_tab_tag.units[i];
				var v_still_shown = v_desired.some(function (d) {
					return d.v_plugin_name === v_unit.plugin_name && d.v_id === v_unit.id;
				});
				if (!v_still_shown) {
					teardownMonitorUnit(v_unit);
					p_tab_tag.units.splice(i, 1);
				}
			}

			var v_new_divs = [];
			// Rebuilt from scratch in v_desired's order, replacing
			// p_tab_tag.units at the end -- otherwise the DOM ends up
			// correctly reordered (every card is appendChild'd in v_desired
			// order below) while this array silently keeps whatever order
			// units were originally built/pushed in, which is exactly the
			// kind of mismatch that made this function's own behavior hard
			// to verify from the console while fixing this.
			var v_reordered_units = [];
			for (var j = 0; j < v_desired.length; j++) {
				var v_d = v_desired[j];
				/** @type {any} */
				var v_existing = null;
				for (var k = 0; k < p_tab_tag.units.length; k++) {
					if (p_tab_tag.units[k].plugin_name === v_d.v_plugin_name && p_tab_tag.units[k].id === v_d.v_id) {
						v_existing = p_tab_tag.units[k];
						break;
					}
				}
				if (v_existing) {
					p_tab_tag.dashboard_div.appendChild(v_existing.div);
					v_reordered_units.push(v_existing);
				} else {
					v_new_divs.push(buildMonitorUnit(v_d, false, p_tab_tag));
					// buildMonitorUnit just pushed the new unit onto
					// p_tab_tag.units itself, always as the last element --
					// grab it here, at v_desired's own position for it,
					// rather than after this loop (where every new unit
					// would land bunched at the very end regardless of
					// where each one actually belongs).
					v_reordered_units.push(p_tab_tag.units[p_tab_tag.units.length - 1]);
				}
			}
			p_tab_tag.units = v_reordered_units;

			for (var m = 0; m < v_new_divs.length; m++) {
				refreshMonitorDashboard(true, p_tab_tag, v_new_divs[m]);
			}

			refreshMonitorUnitsObjects(p_tab_tag);
		},
		null,
		"box",
		false,
	);
}

/**
 * Re-renders every grid-type unit's Handsontable instance -- needed after the
 * dashboard div is relocated into view (see outer_monitoring_panel.js's
 * refreshMonitoringPane), since Handsontable can miscalculate its layout
 * while its container was hidden/detached.
 * @param {any} [p_tag]
 */
export function refreshMonitorUnitsObjects(p_tag) {
	var v_tab_tag = p_tag || v_connTabControl.selectedTab.tag.monitoring;
	if (!v_tab_tag) return;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		if (v_tab_tag.units[i].type == "grid" && v_tab_tag.units[i].object) {
			v_tab_tag.units[i].object.render();
		}
	}
}


export function refreshMonitorDashboard(p_loading, p_tab_tag, p_div) {
	/** @type {any[]} */
	var v_units = [];
	/** @type {any} */
	var v_tab_tag = null;
	if (p_tab_tag) v_tab_tag = p_tab_tag;
	else v_tab_tag = v_connTabControl.selectedTab.tag.monitoring;

	if (v_tab_tag.units.length > 0) {
		for (var i = 0; i < v_tab_tag.units.length; i++) {
			var v_unit_rendered = 0;
			if (v_tab_tag.units[i].object != null) v_unit_rendered = 1;

			if (!p_div) {
				if (p_loading) v_tab_tag.units[i].div_loading.style.display = "block";
				v_units.push({
					saved_id: v_tab_tag.units[i].saved_id,
					id: v_tab_tag.units[i].id,
					sequence: v_tab_tag.units[i].unit_sequence,
					rendered: v_unit_rendered,
					interval: v_tab_tag.units[i].input_interval.value,
					plugin_name: v_tab_tag.units[i].plugin_name,
					object_data: v_tab_tag.units[i].object_data,
				});
				clearTimeout(v_tab_tag.units[i].timeout_object);
			} else if (p_div == v_tab_tag.units[i].div) {
				if (p_loading) v_tab_tag.units[i].div_loading.style.display = "block";
				v_units.push({
					saved_id: v_tab_tag.units[i].saved_id,
					id: v_tab_tag.units[i].id,
					sequence: v_tab_tag.units[i].unit_sequence,
					rendered: v_unit_rendered,
					interval: v_tab_tag.units[i].input_interval.value,
					plugin_name: v_tab_tag.units[i].plugin_name,
					object_data: v_tab_tag.units[i].object_data,
				});
				clearTimeout(v_tab_tag.units[i].timeout_object);
				break;
			}
		}

		var input = JSON.stringify({
			p_database_index: v_tab_tag.connTabTag.selectedDatabaseIndex,
			p_tab_id: v_tab_tag.connTabTag.tab_id,
			p_ids: v_units,
		});

		execAjax(
			"/refresh_monitor_units/",
			input,
			function (p_return) {
				for (var i = 0; i < p_return.v_data.length; i++) {
					var v_return_unit = p_return.v_data[i];

					/** @type {any} */
					var v_unit = null;
					//find corresponding object
					for (var p = 0; p < v_tab_tag.units.length; p++) {
						if (v_return_unit.v_sequence == v_tab_tag.units[p].unit_sequence) {
							v_tab_tag.units[p].saved_id = v_return_unit.v_saved_id;
							v_tab_tag.units[p].type = v_return_unit.v_type;
							if (v_return_unit.v_object) {
								if (v_return_unit.v_object.data) {
									v_tab_tag.units[p].object_data = JSON.parse(JSON.stringify(v_return_unit.v_object.data));
								} else if (v_return_unit.v_object.elements) {
									v_tab_tag.units[p].object_data = JSON.parse(JSON.stringify(v_return_unit.v_object.elements));
								} else {
									v_tab_tag.units[p].object_data = JSON.parse(JSON.stringify(v_return_unit.v_object));
								}
							}
							v_unit = v_tab_tag.units[p];
							break;
						}
					}

					try {
						// Chart unit
						if (
							v_return_unit.v_type == "timeseries" ||
							v_return_unit.v_type == "chart" ||
							v_return_unit.v_type == "chart_append"
						) {
							v_unit.div_loading.style.display = "none";

							v_return_unit.type = "chart";
							v_unit.div_error.innerHTML = "";

							if (v_return_unit.v_error) {
								v_unit.div_error.textContent = v_return_unit.v_message;
								v_unit.error = true;
								//v_unit.object = null;
								//v_unit.div_content.innerHTML = '';
							}
							// New chart
							else if (v_unit.object == null) {
								v_unit.div_content.innerHTML = "";

								var canvas = document.createElement("canvas");
								canvas.style.height = "250px";
								canvas.style.width = v_unit.div_content.offsetWidth;
								v_unit.div_content.appendChild(canvas);

								var ctx = canvas.getContext("2d");
								var v_show_legend = false;
								try {
									v_return_unit.v_object.options.responsive = true;
									v_return_unit.v_object.options.maintainAspectRatio = false;
									if (v_return_unit.v_object.options.plugins == null) {
										v_return_unit.v_object.options.plugins = {};
									}
									if (v_return_unit.v_object.options.plugins.legend == null) {
										v_return_unit.v_object.options.plugins.legend = {
											display: false,
										};
										v_show_legend = true;
									} else {
										if (v_return_unit.v_object.options.plugins.legend.display == true) v_show_legend = true;
										v_return_unit.v_object.options.plugins.legend.display = false;
									}
								} catch (err) {}
								var v_chart = new Chart(ctx, v_return_unit.v_object);
								adjustChartTheme(v_chart);
								if (v_show_legend) {
									renderChartLegend(v_unit.div_label, v_chart);
								}

								v_unit.object = v_chart;
							}
							// Update existing chart
							else {
								//Don't append, simply update labels and datasets
								if (v_return_unit.v_type == "chart") {
									//checking labels
									var v_need_rebuild_legend = false;

									//foreach dataset in existing chart, check if it still exists, if not, remove it
									for (var j = v_unit.object.data.datasets.length - 1; j >= 0; j--) {
										var dataset = v_unit.object.data.datasets[j];

										var v_found = false;
										for (var k = 0; k < v_return_unit.v_object.datasets.length; k++) {
											var return_dataset = v_return_unit.v_object.datasets[k];
											if (return_dataset.label == dataset.label) {
												v_found = true;
												break;
											}
										}
										//dataset doesn't exist, remove it
										if (!v_found) {
											v_need_rebuild_legend = true;
											v_unit.object.data.datasets.splice(j, 1);
										}
									}

									//foreach label in existing chart, check if it still exists, if not, legend needs to be rebuilt
									for (var j = v_unit.object.data.labels.length - 1; j >= 0; j--) {
										var v_found = false;
										for (var k = 0; k < v_return_unit.v_object.labels.length; k++) {
											if (
												JSON.stringify(v_return_unit.v_object.labels[k]) ==
												JSON.stringify(v_unit.object.data.labels[j])
											) {
												v_found = true;
												break;
											}
										}
										if (!v_found) {
											v_need_rebuild_legend = true;
										}
									}

									//foreach dataset in returning data, find corresponding dataset in existing chart
									for (var j = 0; j < v_return_unit.v_object.datasets.length; j++) {
										var return_dataset = v_return_unit.v_object.datasets[j];

										//checking datasets
										var v_found = false;
										for (var k = 0; k < v_unit.object.data.datasets.length; k++) {
											var dataset = v_unit.object.data.datasets[k];
											//Dataset exists, update data and adjust colors
											if (return_dataset.label == dataset.label) {
												var new_dataset = dataset;

												//rebuild color list if it exists
												if (return_dataset.backgroundColor && return_dataset.backgroundColor.length) {
													var v_color_list = [];
													for (var l = 0; l < v_return_unit.v_object.labels.length; l++) {
														var v_found_label = false;
														for (var m = 0; m < v_unit.object.data.labels.length; m++) {
															if (
																JSON.stringify(v_return_unit.v_object.labels[l]) ==
																JSON.stringify(v_unit.object.data.labels[m])
															) {
																v_color_list.push(dataset.backgroundColor[m]);
																v_found_label = true;
																break;
															}
														}

														if (!v_found_label) {
															v_need_rebuild_legend = true;
															v_color_list.push(return_dataset.backgroundColor[l]);
														}
													}
													new_dataset.backgroundColor = v_color_list;
												}
												new_dataset.data = return_dataset.data;

												dataset = new_dataset;

												v_found = true;
												break;
											}
										}
										//dataset doesn't exist, create it
										if (!v_found) {
											v_need_rebuild_legend = true;
											v_unit.object.data.datasets.push(return_dataset);
										}
									}

									v_unit.object.data.labels = v_return_unit.v_object.labels;

									//update title
									if (v_return_unit.v_object.title && v_unit.object.options && v_unit.object.options.plugins && v_unit.object.options.plugins.title) {
										v_unit.object.options.plugins.title.text = v_return_unit.v_object.title;
									}

									try {
										v_unit.object.update();
										if (v_need_rebuild_legend) {
											//rebuild labels
											renderChartLegend(v_unit.div_label, v_unit.object);
										}
									} catch (err) {}
								}
								// Append data
								else {
									var v_need_rebuild_legend = false;
									//adding new label in X axis
									v_unit.object.data.labels.push(v_return_unit.v_object.labels[0]);
									var v_shift = false;
									if (v_unit.object.data.labels.length > 100) {
										v_unit.object.data.labels.shift();
										v_shift = true;
									}

									//foreach dataset in existing chart, find corresponding dataset in returning data
									for (var j = v_unit.object.data.datasets.length - 1; j >= 0; j--) {
										var dataset = v_unit.object.data.datasets[j];
										dataset.data.push(null);
										if (v_shift) dataset.data.shift();
									}

									//foreach dataset in returning data, find corresponding dataset in existing chart
									for (var j = 0; j < v_return_unit.v_object.datasets.length; j++) {
										var return_dataset = v_return_unit.v_object.datasets[j];

										var v_found = false;
										for (var k = 0; k < v_unit.object.data.datasets.length; k++) {
											var dataset = v_unit.object.data.datasets[k];
											//Dataset exists, update data
											if (return_dataset.label == dataset.label) {
												var new_dataset = dataset;
												new_dataset.data[new_dataset.data.length - 1] = return_dataset.data[0];
												dataset = new_dataset;

												v_found = true;
												break;
											}
										}
										//dataset doesn't exist, create it
										if (!v_found) {
											v_need_rebuild_legend = true;
											//populate dataset with empty data prior to newest value
											for (var k = 0; k < v_unit.object.data.labels.length - 1; k++) {
												return_dataset.data.unshift(null);
											}
											v_unit.object.data.datasets.push(return_dataset);
										}
									}

									//update title
									if (v_return_unit.v_object.title && v_unit.object.options && v_unit.object.options.plugins && v_unit.object.options.plugins.title) {
										v_unit.object.options.plugins.title.text = v_return_unit.v_object.title;
									}

									try {
										v_unit.object.update();
										if (v_need_rebuild_legend) {
											//rebuild labels
											renderChartLegend(v_unit.div_label, v_unit.object);
										}
									} catch (err) {}
								}
							}
						}
						// Grid unit
						else if (v_return_unit.v_type == "grid") {
							v_unit.div_error.innerHTML = "";
							v_unit.div_details.innerHTML = "";

							v_unit.div_loading.style.display = "none";

							v_return_unit.type = "grid";

							if (v_return_unit.v_error) {
								v_unit.div_error.textContent = v_return_unit.v_message;
								v_unit.error = true;
								//v_unit.object = null;
								//v_unit.div_content.innerHTML = '';
							}
							// New grid
							else if (v_unit.object == null) {
								v_unit.div_content.classList.add("unit_grid");
								v_unit.div_content.innerHTML = "";

								var columnProperties = [];

								for (var j = 0; j < v_return_unit.v_object.columns.length; j++) {
									/** @type {any} */
									var col = {};
									col.readOnly = true;
									col.title = v_return_unit.v_object.columns[j];
									columnProperties.push(col);
								}

								v_unit.div_details.innerHTML = v_return_unit.v_object.data.length + " rows";

								var v_grid = new Handsontable(v_unit.div_content, {
									licenseKey: "non-commercial-and-evaluation",
									data: v_return_unit.v_object.data,
									columns: columnProperties,
									colHeaders: true,
									rowHeaders: true,
									//copyRowsLimit : 1000000000,
									//copyColsLimit : 1000000000,
									copyPaste: { pasteMode: "", rowsLimit: 1000000000, columnsLimit: 1000000000 },
									manualColumnResize: true,
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
												this.selectCell(
													options[0].start.row,
													options[0].start.col,
													options[0].end.row,
													options[0].end.col,
												);
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
										return cellProperties;
									},
								});

								v_unit.object = v_grid;
							}
							// Existing grid
							else {
								v_unit.div_details.innerHTML = v_return_unit.v_object.data.length + " rows";

								v_unit.object.loadData(v_return_unit.v_object.data);
							}
						}

						// Graph unit
						else if (v_return_unit.v_type == "graph") {
							v_unit.div_error.innerHTML = "";
							v_unit.div_details.innerHTML = "";

							v_unit.div_loading.style.display = "none";

							v_return_unit.type = "graph";

							if (v_return_unit.v_error) {
								v_unit.div_error.textContent = v_return_unit.v_message;
								v_unit.error = true;
								//v_unit.object = null;
								//v_unit.div_content.innerHTML = '';
							}
							// New graph
							else if (v_unit.object == null) {
								v_unit.div_content.classList.add("unit_graph");
								v_unit.div_content.innerHTML = "";

								v_return_unit.v_object.container = v_unit.div_content;
								v_unit.object = cytoscape(v_return_unit.v_object);
								adjustGraphTheme(v_unit.object);
							}
							// Existing graph
							else {
								var v_existing_nodes = v_unit.object.nodes();
								var v_existing_edges = v_unit.object.edges();

								var v_new_objects = [];

								//Updating existing nodes and adding new ones
								for (var j = 0; j < v_return_unit.v_object.nodes.length; j++) {
									var v_found_node = false;
									var node = v_return_unit.v_object.nodes[j];
									for (var k = 0; k < v_existing_nodes.length; k++) {
										//New node already exists, update data
										if (v_existing_nodes[k].data("id") == node.data["id"]) {
											v_found_node = true;
											for (var property in node.data) {
												if (node.data.hasOwnProperty(property)) {
													v_existing_nodes[k].data(property, node.data[property]);
												}
											}
											break;
										}
									}
									if (!v_found_node) {
										node["group"] = "nodes";
										v_new_objects.push(node);
									}
								}

								//Updating existing edges and adding new ones
								for (var j = 0; j < v_return_unit.v_object.edges.length; j++) {
									var v_found_edge = false;
									var edge = v_return_unit.v_object.edges[j];
									for (var k = 0; k < v_existing_edges.length; k++) {
										//New edge already exists, update data
										if (v_existing_edges[k].data("id") == edge.data["id"]) {
											v_found_edge = true;
											for (var property in edge.data) {
												if (edge.data.hasOwnProperty(property)) {
													v_existing_edges[k].data(property, edge.data[property]);
												}
											}
											break;
										}
									}
									if (!v_found_edge) {
										edge["group"] = "edges";
										v_new_objects.push(edge);
									}
								}
								//Removing edges that doesn't exist anymore
								for (var k = 0; k < v_existing_edges.length; k++) {
									var v_found_edge = false;
									for (var j = 0; j < v_return_unit.v_object.edges.length; j++) {
										var edge = v_return_unit.v_object.edges[j];
										if (v_existing_edges[k].data("id") == edge.data["id"]) {
											v_found_edge = true;
											break;
										}
									}
									//Not found, remove it
									if (!v_found_edge) {
										v_existing_edges[k].remove();
									}
								}
								//Removing nodes that doesn't exist anymore
								for (var k = 0; k < v_existing_nodes.length; k++) {
									var v_found_node = false;
									for (var j = 0; j < v_return_unit.v_object.nodes.length; j++) {
										var node = v_return_unit.v_object.nodes[j];
										if (v_existing_nodes[k].data("id") == node.data["id"]) {
											v_found_node = true;
											break;
										}
									}
									//Not found, remove it
									if (!v_found_node) {
										v_existing_nodes[k].remove();
									}
								}

								//Adding new objects and rendering graph again
								if (v_new_objects.length > 0) {
									v_unit.object.add(v_new_objects);
									v_unit.object.layout();
								}
							}
						}
					} catch (err) {
						v_unit.div_error.textContent = String(err);
						v_unit.error = true;
						v_unit.object = null;
						v_unit.div_content.innerHTML = "";
					}

					//Adding timeout to get data again if tab is still active
					if (v_tab_tag.tab_active && v_unit.active) {
						v_unit.timeout_object = setTimeout(
							(function (p_div) {
								return function () {
									refreshMonitorDashboard(false, v_tab_tag, p_div);
								};
							})(v_unit.div),
							v_unit.input_interval.value * 1000,
						);
					}
				}
			},
			function (p_return) {
				if (p_return.v_data.password_timeout) {
					showPasswordPrompt(
						v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
						function () {
							refreshMonitorDashboard(true, v_tab_tag);
						},
						null,
						p_return.v_data.message,
					);
				} else {
					showError(p_return.v_data);
				}
			},
			"box",
			false,
		);
	}
}

export function cancelMonitorUnits(p_tab_tag) {
	var v_tab_tag = p_tab_tag;
	for (var i = 0; i < v_tab_tag.units.length; i++) {
		var v_unit = v_tab_tag.units[i];
		clearTimeout(v_unit.timeout_object);
		if (v_unit.type == "graph" && v_unit.object != null) {
			v_unit.object.destroy();
		}
	}
}
