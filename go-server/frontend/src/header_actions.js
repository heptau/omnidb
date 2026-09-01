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
/// Opens OmniDB about window.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { showAlert, showConfirm } from "./notification_control.js";
import { switchSection } from "./section_switcher.js";
import { v_current_os } from "./shortcuts.js";
import { refreshHeights } from "./workspace.js";

export function showAbout() {
	bootstrap.Modal.getOrCreateInstance(/** @type {HTMLElement} */ (document.getElementById("modal_about"))).show();
}
/*
export var v_light_terminal_theme = {
	background: '#f4f4f4',
	brightBlue: '#006de2',
	brightGreen: '#4b9800',
	foreground: '#353535',
	cursor: '#353535',
	cursorAccent: '#353535',
	selection: '#00000030'
}
*/
export var v_light_terminal_theme = {
	background: "#f4f4f4",
	brightBlue: "#006de2",
	brightGreen: "#4b9800",
	foreground: "#454545",
	cursor: "#454545",
	cursorAccent: "#454545",
	selection: "#00000030",
};

export var v_dark_terminal_theme = {
	background: "#1a1a1d",
};

export var v_current_terminal_theme;

/// <summary>
/// Startup function.
/// </summary>
function initHeaderActions() {
	//setting font size of body
	document.getElementsByTagName("html")[0].style["font-size"] = v_font_size + "px";

	// Always default to auto/OS theme
	changeTheme("auto");

	// Listen for system theme changes
	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
		changeTheme("auto");
	});
}
// changeTheme() itself guards every v_connTabControl access behind a
// `typeof v_connTabControl !== "undefined"` check, so unlike plugin_hook.js's
// initHookRegistry this doesn't need to poll for it -- a single deferred
// tick (matching jQuery's always-async $(fn)) is enough.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHeaderActions);
else setTimeout(initHeaderActions, 0);

export function adjustChartTheme(p_chart) {
	var v_chart_font_color = "#666666";
	var v_chart_grid_color = "rgba(0, 0, 0, 0.1)";

	if (v_theme == "light") {
		v_chart_font_color = "#666666";
		v_chart_grid_color = "rgba(0, 0, 0, 0.1)";
	} else {
		v_chart_font_color = "#DCDDDE";
		v_chart_grid_color = "rgba(100, 100, 100, 0.3)";
	}

	try {
		p_chart.options.plugins.legend.labels.color = v_chart_font_color;
		p_chart.options.plugins.title.color = v_chart_font_color;
		p_chart.options.scales.y.grid.color = v_chart_grid_color;
		p_chart.options.scales.x.grid.color = v_chart_grid_color;
		p_chart.options.scales.y.ticks.color = v_chart_font_color;
		p_chart.options.scales.y.title.color = v_chart_font_color;
		p_chart.options.scales.x.ticks.color = v_chart_font_color;
		p_chart.options.scales.x.title.color = v_chart_font_color;
	} catch (err) {}
	p_chart.update();
}

export function adjustGraphTheme(p_graph) {
	var v_font_color = "#666666";

	if (v_theme == "light") {
		v_font_color = "#666666";
	} else {
		v_font_color = "#DCDDDE";
	}

	try {
		p_graph.style().selector("node").style("color", v_font_color);
		p_graph.style().selector("edge").style("color", v_font_color);
		p_graph.nodes().updateStyle();
		p_graph.edges().updateStyle();
	} catch (err) {}
}

export function changeTheme(p_option) {
	// Always auto
	v_theme = "auto";
	var v_actual_theme = "light";

	if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
		v_actual_theme = "dark";
	}

	if (v_actual_theme == "dark") {
		v_theme = "dark";
		v_editor_theme = "sqlserver_dark";
		v_current_terminal_theme = v_dark_terminal_theme;
		document.body.classList.remove("omnidb--theme-light");
		document.body.classList.add("omnidb--theme-dark");
	} else {
		v_theme = "light";
		v_editor_theme = "sqlserver";
		v_current_terminal_theme = v_light_terminal_theme;
		document.body.classList.remove("omnidb--theme-dark");
		document.body.classList.add("omnidb--theme-light");
	}
	// Updating theme of all consoles.
	try {
		for (let i = 0; i < v_connTabControl.tabList.length; i++) {
			var v_outer_tab = v_connTabControl.tabList[i];
			if (v_outer_tab.tag) {
				if (v_outer_tab.tag.tabControl) {
					if (v_outer_tab.tag.tabControl.tabList) {
						for (let j = 0; j < v_outer_tab.tag.tabControl.tabList.length; j++) {
							var v_inner_tab_tag = v_outer_tab.tag.tabControl.tabList[j].tag;
							if (v_inner_tab_tag.editor) {
								v_inner_tab_tag.editor.setTheme("ace/theme/" + v_editor_theme);
							} else if (v_inner_tab_tag.editor_console) {
								v_inner_tab_tag.editor_console.setOption("theme", v_current_terminal_theme);
							}
						}
					}
				}
			}
		}
	} catch (e) {
		console.warn(e);
	}

	var els = document.getElementsByClassName("ace_editor");

	Array.prototype.forEach.call(els, function (el) {
		ace.edit(el).setTheme("ace/theme/" + v_editor_theme);
	});

	if (typeof Chart !== "undefined") {
		// Chart.js v3+ dropped Chart.helpers.each as a general iterator, and
		// Chart.instances is keyed by chart.id -> the chart instance itself
		// directly (v2's `.chart` wrapper is gone too).
		Object.values(Chart.instances).forEach(function (instance) {
			adjustChartTheme(instance);
		});
	}

	//Adjusting terminal themes
	if (typeof v_connTabControl !== "undefined") {
		for (var i = 0; i < v_connTabControl.tabList.length; i++) {
			var v_tab = v_connTabControl.tabList[i];
			if (v_tab.tag != null) {
				if (v_tab.tag.mode == "outer_terminal") {
					v_tab.tag.editor_console.setOption("theme", v_current_terminal_theme);
				}
			}
		}

		//Adjusting graph themes
		for (var i = 0; i < v_connTabControl.tabList.length; i++) {
			var v_tab = v_connTabControl.tabList[i];
			if (v_tab.tag != null) {
				if (v_tab.tag.mode == "connection") {
					for (var j = 0; j < v_tab.tag.tabControl.tabList.length; j++) {
						var v_inner_tab = v_tab.tag.tabControl.tabList[j];
						if (v_inner_tab.tag != null) {
							if (v_inner_tab.tag.mode == "monitor_dashboard") {
								for (var k = 0; k < v_inner_tab.tag.units.length; k++) {
									if (v_inner_tab.tag.units[k].type == "graph") adjustGraphTheme(v_inner_tab.tag.units[k].object);
								}
							}
						}
					}
				}
			}
		}

		//Hooks
		if (v_connTabControl.tag.hooks.changeTheme.length > 0) {
			for (var i = 0; i < v_connTabControl.tag.hooks.changeTheme.length; i++)
				v_connTabControl.tag.hooks.changeTheme[i](null, v_theme);
		}
	}
}

export function changeFontSize(p_option) {
	var els = document.getElementsByClassName("ace_editor");
	v_font_size = p_option;

	//Adjusting terminal themes
	for (var i = 0; i < v_connTabControl.tabList.length; i++) {
		var v_tab = v_connTabControl.tabList[i];
		if (v_tab.tag != null) {
			if (v_tab.tag.mode == "outer_terminal") {
				v_tab.tag.editor_console.setOption("fontSize", p_option);
				v_tab.tag.editor_console.fit();
			}
		}
	}

	Array.prototype.forEach.call(els, function (el) {
		// Do stuff here
		ace.edit(el).setFontSize(Number(p_option));
	});
}

export function changeInterfaceFontSize(p_option) {
	v_font_size = p_option;
	document.getElementsByTagName("html")[0].style["font-size"] = v_font_size + "px";
	document.querySelectorAll(".ace_editor").forEach(function (el) {
		let editor = ace.edit(el);
		editor.setFontSize(v_font_size + "px");
	});
	var v_outer_tab_list = v_connTabControl.tabList;
	for (let i = 0; i < v_outer_tab_list.length; i++) {
		var v_outer_tab_tag = v_outer_tab_list[i].tag;
		if (v_outer_tab_tag) {
			var v_outer_tab_tag_inner_tab_control = v_outer_tab_tag.tabControl;
			if (v_outer_tab_tag_inner_tab_control) {
				var v_outer_tab_tag_inner_tab_list = v_outer_tab_tag_inner_tab_control.tabList;
				for (let j = 0; j < v_outer_tab_tag_inner_tab_list.length; j++) {
					var v_inner_tab_tag = v_outer_tab_tag_inner_tab_list[j].tag;
					if (v_inner_tab_tag) {
						if (v_inner_tab_tag.editor_console) {
							v_inner_tab_tag.editor_console.setOption("fontSize", Number(v_font_size));
						}
					}
				}
			}
		}
	}

	refreshHeights();
}

/// <summary>
/// Opens user config window.
/// </summary>
export function updateIndentUnit() {
	var charEl = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="indent_char"]:checked'));
	var sizeEl = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="indent_size"]:checked'));
	if (charEl) v_indent_char = charEl.value;
	if (sizeEl) v_indent_size = parseInt(sizeEl.value);
	if (v_indent_char === 'tab') {
		v_indent_unit = '\t';
	} else {
		v_indent_unit = '';
		for (var i = 0; i < v_indent_size; i++) v_indent_unit += ' ';
	}
}

export function applyEditorTabSize() {
	document.querySelectorAll(".ace_editor").forEach(function (el) {
		let editor = ace.edit(el);
		editor.session.setTabSize(v_indent_size || 4);
		editor.session.setUseSoftTabs(v_indent_char !== 'tab');
	});
}

export function showConfigUser() {
	/** @type {HTMLInputElement} */ (document.getElementById("sel_interface_font_size")).value = String(v_font_size);
	// document.getElementById('sel_editor_theme').value = v_theme;

	/** @type {HTMLInputElement} */ (document.getElementById("txt_confirm_new_pwd")).value = "";
	/** @type {HTMLInputElement} */ (document.getElementById("txt_new_pwd")).value = "";

	/** @type {HTMLInputElement} */ (document.getElementById("sel_csv_encoding")).value = v_csv_encoding;
	/** @type {HTMLInputElement} */ (document.getElementById("txt_csv_delimiter")).value = v_csv_delimiter;

	// Set formatting radio buttons from globals
	var charRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("indent_char"));
	for (var i = 0; i < charRadios.length; i++) {
		if (charRadios[i].value === v_indent_char) {
			charRadios[i].checked = true;
			break;
		}
	}
	var sizeRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("indent_size"));
	for (var i = 0; i < sizeRadios.length; i++) {
		if (sizeRadios[i].value === String(v_indent_size)) {
			sizeRadios[i].checked = true;
			break;
		}
	}
	var commaRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("comma_style"));
	for (var i = 0; i < commaRadios.length; i++) {
		if (commaRadios[i].value === v_comma_style) {
			commaRadios[i].checked = true;
			break;
		}
	}
	var caseRadios = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("keyword_case"));
	for (var i = 0; i < caseRadios.length; i++) {
		if (caseRadios[i].value === v_keyword_case) {
			caseRadios[i].checked = true;
			break;
		}
	}

	var v_disabled_autocomplete_types = v_autocomplete_disabled_types.split(",");
	var typeCheckboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("autocomplete_type"));
	for (var i = 0; i < typeCheckboxes.length; i++) {
		typeCheckboxes[i].checked = v_disabled_autocomplete_types.indexOf(typeCheckboxes[i].value) === -1;
	}

	switchSection("settings");
}

/// <summary>
/// Go to connections.
/// </summary>
export function goToConnections() {
	showConfirm("You will lose existing changes. Would you like to continue?", function () {
		window.open("../connections", "_self");
	});
}

/// <summary>
/// Go to connections.
/// </summary>
export function confirmSignout() {
	showConfirm("Are you sure you want to sign out?", function () {
		window.open("../logout", "_self");
	});
}

/// <summary>
/// Shows website in outer tab.
/// </summary>
export function showWebsite(p_name, p_url) {
	if (v_connTabControl) {
		bootstrap.Modal.getOrCreateInstance(/** @type {HTMLElement} */ (document.getElementById("modal_about"))).hide();
		switchSection("database");
	}
	v_connTabControl.tag.createWebsiteOuterTab(p_name, p_url);
}

/// <summary>
/// Checks or unchecks every autocomplete category checkbox in the Options tab.
/// </summary>
export function setAllAutocompleteTypeCheckboxes(p_checked) {
	var typeCheckboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("autocomplete_type"));
	for (var i = 0; i < typeCheckboxes.length; i++) {
		typeCheckboxes[i].checked = p_checked;
	}
}

/// <summary>
/// Saves user config to OmniDB database.
/// </summary>
export function saveConfigUser() {
	v_font_size = Number(/** @type {HTMLInputElement} */ (document.getElementById("sel_interface_font_size")).value);
	// v_theme_id = document.getElementById('sel_editor_theme').value.split('/')[0];

	var v_confirm_pwd = /** @type {HTMLInputElement} */ (document.getElementById("txt_confirm_new_pwd"));
	var v_pwd = /** @type {HTMLInputElement} */ (document.getElementById("txt_new_pwd"));

	v_csv_encoding = /** @type {HTMLInputElement} */ (document.getElementById("sel_csv_encoding")).value;
	v_csv_delimiter = /** @type {HTMLInputElement} */ (document.getElementById("txt_csv_delimiter")).value;

	var v_disabled_types = [];
	var typeCheckboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.getElementsByName("autocomplete_type"));
	for (var i = 0; i < typeCheckboxes.length; i++) {
		if (!typeCheckboxes[i].checked) v_disabled_types.push(typeCheckboxes[i].value);
	}
	v_autocomplete_disabled_types = v_disabled_types.join(",");

	if ((v_confirm_pwd.value != "" || v_pwd.value != "") && v_pwd.value != v_confirm_pwd.value)
		showAlert("New Password and Confirm New Password fields do not match.");
	else {
		var input = JSON.stringify({
			p_font_size: v_font_size,
			p_pwd: v_pwd.value,
			p_csv_encoding: v_csv_encoding,
			p_csv_delimiter: v_csv_delimiter,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
			p_comma_style: v_comma_style,
			p_keyword_case: v_keyword_case,
			p_autocomplete_disabled_types: v_autocomplete_disabled_types,
		});

		execAjax("/save_config_user/", input, function (p_return) {
			showAlert("Configuration saved.");
			applyEditorTabSize();
		});
	}
}

/// <summary>
/// Saves shortcuts to OmniDB database.
/// </summary>
export function saveShortcuts() {
	var v_shortcut_list = [];

	for (var property in v_shortcut_object.shortcuts) {
		if (v_shortcut_object.shortcuts.hasOwnProperty(property)) {
			v_shortcut_list.push(v_shortcut_object.shortcuts[property]);
		}
	}

	var input = JSON.stringify({
		p_shortcuts: v_shortcut_list,
		p_current_os: v_current_os,
	});

	execAjax("/save_shortcuts/", input, function (p_return) {
		showAlert("Shortcuts saved.");
	});
}

// aceModeForDataType maps a database column type name (e.g. "json",
// "jsonb", "xml" — case-insensitive, as returned by the various engines'
// v_col_types/v_type) to the Ace editor mode that gives it syntax
// highlighting in the edit-cell/view-cell dialog. Anything else (including
// an unknown or missing type) falls back to plain text, same as before
// this distinction existed.
function aceModeForDataType(p_data_type) {
	if (!p_data_type) return "ace/mode/text";
	var v_type = String(p_data_type).toLowerCase();
	if (v_type === "json" || v_type === "jsonb") return "ace/mode/json";
	if (v_type === "xml") return "ace/mode/xml";
	return "ace/mode/text";
}

/// <summary>
/// Displays edit cell window.
/// </summary>
/// <param name="p_ht">Handsontable object.</param>
/// <param name="p_row">Row number.</param>
/// <param name="p_col">Column number.</param>
/// <param name="p_content">Cell content.</param>
/// <param name="p_can_alter">If ready only or not.</param>
/// <param name="p_data_type">Column's database type (e.g. "json", "jsonb", "xml"), for syntax highlighting. Optional.</param>
export function editCellData(p_ht, p_row, p_col, p_content, p_can_alter, p_data_type) {
	var v_edit_modal = document.getElementById("div_edit_content");
	if (!v_edit_modal) {
		v_edit_modal = document.createElement("div");
		v_edit_modal.setAttribute("id", "div_edit_content");
		v_edit_modal.setAttribute("tabindex", "-1");
		v_edit_modal.setAttribute("role", "dialog");
		v_edit_modal.setAttribute("aria-hidden", "true");
		v_edit_modal.classList = "modal fade";

		document.body.append(v_edit_modal);
	}

	v_canEditContent = p_can_alter;
	var v_save_btn_attr = "";
	if (!v_canEditContent) {
		v_save_btn_attr = ' disabled title="Unable to manually edit data without primary key" ';
	}
	v_edit_modal.innerHTML =
		'<div id="modal_message_dialog" class="modal-dialog" role="document" style="width: 1200px;max-width: 90vw;">' +
		'<div class="modal-content">' +
		'<div class="modal-header">' +
		'<h4 class="mb-0">Edit Data</h4>' +
		'<button id="bt_edit_content_close" type="button" class="close" data-dismiss="modal" aria-label="Close">' +
		'<span aria-hidden="true">&times;</span>' +
		"</button>" +
		"</div>" +
		'<div id="modal_message_content" class="modal-body" style="white-space: pre-line;">' +
		'<div id="txt_edit_content" style="width: 100%; height: 70vh; font-size: 12px; border: 1px solid rgb(195, 195, 195);">' +
		"</div>" +
		"</div>" +
		'<div class="modal-footer">' +
		"<button " +
		v_save_btn_attr +
		' id="bt_edit_content_save" type="button" class="btn omnidb__theme__btn--primary" data-dismiss="modal">Save</button>' +
		'<button id="bt_edit_content_cancel" type="button" class="btn omnidb__theme__btn--secondary" data-dismiss="modal">Cancel</button>' +
		"</div>" +
		"</div>" +
		"</div>";

	// Bindings for the dialog just rebuilt above, replacing the on*= attributes
	// those three buttons carried -- see dom_event_bindings.js and README.md.
	// innerHTML is reassigned on every open, so these are fresh elements each
	// time and the listeners go with them.
	/** @type {HTMLElement} */ (document.getElementById("bt_edit_content_close")).addEventListener("click", () =>
		cancelEditContent(),
	);
	/** @type {HTMLElement} */ (document.getElementById("bt_edit_content_save")).addEventListener("click", () =>
		saveEditContent(),
	);
	/** @type {HTMLElement} */ (document.getElementById("bt_edit_content_cancel")).addEventListener("click", () =>
		cancelEditContent(),
	);

	if (v_editContentObject != null)
		if (v_editContentObject.editor != null) {
			v_editContentObject.editor.destroy();
			/** @type {HTMLElement} */ (document.getElementById("txt_edit_content")).innerHTML = "";
		}

	var langTools = ace.require("ace/ext/language_tools");
	var v_editor = ace.edit("txt_edit_content");
	v_editor.setTheme("ace/theme/" + v_editor_theme);
	v_editor.session.setMode(aceModeForDataType(p_data_type));
	v_editor.$blockScrolling = Infinity;

	v_editor.setFontSize(Number(v_font_size));
	v_editor.session.setTabSize(v_indent_size || 4);
	v_editor.session.setUseSoftTabs(v_indent_char !== 'tab');

	v_editor.setOptions({ enableBasicAutocompletion: true });

	/** @type {HTMLElement} */ (document.getElementById("txt_edit_content")).onclick = function () {
		v_editor.focus();
	};

	if (p_content != null) v_editor.setValue(String(p_content));
	else v_editor.setValue("");

	v_editor.clearSelection();

	if (p_can_alter) v_editor.setReadOnly(false);
	else v_editor.setReadOnly(true);

	//Remove shortcuts from ace in order to avoid conflict with omnidb shortcuts
	v_editor.commands.bindKey("Cmd-,", null);
	v_editor.commands.bindKey("Ctrl-,", null);
	v_editor.commands.bindKey("Cmd-Delete", null);
	v_editor.commands.bindKey("Ctrl-Delete", null);

	v_editContentObject = new Object();
	v_editContentObject.editor = v_editor;
	v_editContentObject.row = p_row;
	v_editContentObject.col = p_col;
	v_editContentObject.ht = p_ht;

	bootstrap.Modal.getOrCreateInstance(v_edit_modal, {
		backdrop: "static",
		keyboard: false,
	}).show();
}

function hideEditContentModal() {
	var v_edit_modal = document.getElementById("div_edit_content");
	if (v_edit_modal) bootstrap.Modal.getOrCreateInstance(v_edit_modal).hide();
}

export function saveEditContent() {
	hideEditContentModal();

	if (v_canEditContent) {
		v_editContentObject.ht.setDataAtCell(
			v_editContentObject.row,
			v_editContentObject.col,
			v_editContentObject.editor.getValue(),
		);
	} else {
		alert("No permissions.");
	}

	v_editContentObject.editor.setValue("");
}

export function cancelEditContent() {
	hideEditContentModal();

	v_editContentObject.editor.setValue("");
}

/// <summary>
/// Hides edit cell window.
/// </summary>
export function hideEditContent() {
	hideEditContentModal();

	if (v_canEditContent)
		v_editContentObject.ht.setDataAtCell(
			v_editContentObject.row,
			v_editContentObject.col,
			v_editContentObject.editor.getValue(),
		);

	v_editContentObject.editor.setValue("");
}
