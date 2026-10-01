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

import { autocomplete_start } from "./autocomplete.js";
import { consoleSQL } from "./console.js";
import { startConnectionManagement } from "./connections.js";
import { saveShortcuts } from "./header_actions.js";
import { t } from "./i18n.js";
import { showAlert } from "./notification_control.js";
import { toggleSnippetPanel } from "./panel_functions/outer_snippet_panel.js";
import { isSectionActive, switchSection } from "./section_switcher.js";
import { terminalRun } from "./terminal.js";
import { queryEditData } from "./tree_context_functions/edit_data.js";
import { getExplain } from "./tree_context_functions/tree_postgresql.js";
import { showMenuNewTabOuter, toggleTreeContainer, toggleTreeTabsContainer } from "./workspace.js";

/**
 * Which platform's default shortcut set and key labels to use.
 *
 * Derived at module load rather than on DOM ready, which is where it used to
 * happen: it only reads navigator.appVersion, and being buried in the ready
 * handler is how it stayed an implicit global -- a bare `v_current_os = ...`
 * assignment, which strict mode turns into a ReferenceError that takes the
 * whole handler with it. A const also means nothing can go stale between this
 * value and the copy exposeGlobals puts on `window`.
 */
export const v_current_os = (function () {
	const v = navigator.appVersion;
	if (v.indexOf("Win") != -1) return "windows";
	if (v.indexOf("Mac") != -1) return "macos";
	if (v.indexOf("X11") != -1 || v.indexOf("Linux") != -1) return "linux";
	return "Unknown OS";
})();

/**
 * Parses "Mod+Shift+T" into the flag object the rest of the file (and the
 * app DB) uses. "Mod" is the platform's primary modifier: Cmd on macOS,
 * Ctrl everywhere else -- which is what makes one spec string yield the
 * native convention (Cmd+T / Ctrl+T) on every OS. An empty spec is an
 * unassigned shortcut.
 * @param {string} p_spec
 * @param {string} p_os
 */
function parseCombo(p_spec, p_os) {
	var v_result = { ctrl_pressed: false, shift_pressed: false, alt_pressed: false, meta_pressed: false, shortcut_key: "" };
	if (!p_spec) return v_result;
	var v_parts = p_spec.split("+");
	v_result.shortcut_key = /** @type {string} */ (v_parts.pop()).toUpperCase();
	for (var v_part of v_parts) {
		var v_mod = v_part.toLowerCase();
		if (v_mod == "mod") {
			if (p_os == "macos") v_result.meta_pressed = true;
			else v_result.ctrl_pressed = true;
		} else if (v_mod == "ctrl") v_result.ctrl_pressed = true;
		else if (v_mod == "shift") v_result.shift_pressed = true;
		else if (v_mod == "alt") v_result.alt_pressed = true;
		else if (v_mod == "meta") v_result.meta_pressed = true;
	}
	return v_result;
}

// --- helpers for the actions below ------------------------------------------
//
// Every action used to dereference v_connTabControl.selectedTab.tag... bare,
// which throws when no connection tab is open (e.g. on the Welcome page).

/** The selected connection-level tab, or null. */
function outerTab() {
	return v_connTabControl && v_connTabControl.selectedTab ? v_connTabControl.selectedTab : null;
}

/** Tag of the selected inner tab when a database connection tab is selected. */
function innerTag(p_modes) {
	var v_outer = outerTab();
	if (!v_outer || !v_outer.tag || v_outer.tag.mode != "connection" || !v_outer.tag.tabControl) return null;
	var v_inner = v_outer.tag.tabControl.selectedTab;
	if (!v_inner || !v_inner.tag) return null;
	if (p_modes && p_modes.indexOf(v_inner.tag.mode) == -1) return null;
	return v_inner.tag;
}

function clickIfVisible(p_button) {
	if (p_button && p_button.offsetParent !== null) p_button.click();
}

/** Selects the previous/next tab, wrapping around and skipping the trailing "+" tab. */
function cycleTab(p_tabControl, p_delta) {
	if (!p_tabControl || !p_tabControl.selectedTab) return;
	var v_tabs = p_tabControl.tabList.slice(0, -1);
	if (v_tabs.length < 2) return;
	var v_index = v_tabs.indexOf(p_tabControl.selectedTab);
	if (v_index == -1) return;
	v_tabs[(v_index + p_delta + v_tabs.length) % v_tabs.length].elementA.click();
}

function snippetsActive() {
	return isSectionActive("snippets") && !!v_connTabControl && !!v_connTabControl.snippet_tag;
}

/**
 * Closes a tab through its own closeFunction. The {clientX:0, clientY:0}
 * "click" is what makes beforeCloseTab show its plain Yes/No dialog rather
 * than a menu anchored to a click position (a keyboard press has none).
 */
function closeWithConfirm(p_tab) {
	if (p_tab && p_tab.closeFunction) p_tab.closeFunction({ clientX: 0, clientY: 0 }, p_tab);
}

/** Only meaningful while the Database section (the connection tab strip) is visible. */
function databaseActive() {
	return isSectionActive("database");
}

function gotoSection(p_name) {
	return function () {
		if (p_name == "connections") startConnectionManagement();
		else if (p_name == "snippets") toggleSnippetPanel();
		else switchSection(p_name);
	};
}

/**
 * Single source of truth for every configurable shortcut: its Settings
 * section, label, per-platform default and action. `keys` is a spec string
 * (see parseCombo), an object with a `macos` and an `other` spec, or "" for
 * "not assigned by default".
 *
 * Defaults follow what each function is conventionally bound to: browser/
 * editor-style tab handling (Mod+T/W, Mod+Shift+T/W for the connection
 * tabs), DBeaver/DataGrip-style Mod+Enter to run, pgAdmin's F7 for Explain.
 *
 * @type {{code: string, section: string, label: string, labelVars?: Object, keys: string | {macos: string, other: string}, action: (e: KeyboardEvent) => void}[]}
 */
const SHORTCUT_DEFS = [
	// --- global ---
	{
		code: "shortcut_new_conn_tab",
		section: "global",
		label: "settings.shortcuts.new_conn_tab",
		keys: "Mod+Shift+T",
		action() {
			if (!databaseActive()) switchSection("database");
			var v_list = v_connTabControl.tabList;
			var v_plus = v_list[v_list.length - 1];
			var v_rect = (v_plus.elementA || v_plus.elementLi).getBoundingClientRect();
			showMenuNewTabOuter({ clientX: v_rect.left, clientY: v_rect.bottom });
		},
	},
	{
		code: "shortcut_close_conn_tab",
		section: "global",
		label: "settings.shortcuts.close_conn_tab",
		keys: "Mod+Shift+W",
		action() {
			if (databaseActive()) closeWithConfirm(outerTab());
		},
	},
	{
		code: "shortcut_prev_conn_tab",
		section: "global",
		label: "settings.shortcuts.prev_conn_tab",
		keys: "Ctrl+Shift+Tab",
		action() {
			if (databaseActive()) cycleTab(v_connTabControl, -1);
		},
	},
	{
		code: "shortcut_next_conn_tab",
		section: "global",
		label: "settings.shortcuts.next_conn_tab",
		keys: "Ctrl+Tab",
		action() {
			if (databaseActive()) cycleTab(v_connTabControl, 1);
		},
	},
	{
		code: "shortcut_toggle_tree",
		section: "global",
		label: "settings.shortcuts.toggle_tree",
		keys: "Mod+B",
		action() {
			toggleTreeContainer();
		},
	},
	{
		code: "shortcut_toggle_props",
		section: "global",
		label: "settings.shortcuts.toggle_props",
		keys: "Mod+Shift+B",
		action() {
			var v_outer = outerTab();
			if (v_outer) toggleTreeTabsContainer("tree_tabs_parent_" + v_outer.id);
		},
	},
	{ code: "shortcut_goto_welcome", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.welcome" }, keys: "Mod+Shift+H", action: gotoSection("welcome") },
	{ code: "shortcut_goto_connections", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.connections" }, keys: "Mod+Shift+C", action: gotoSection("connections") },
	{ code: "shortcut_goto_database", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "tree.databases_section" }, keys: "Mod+Shift+D", action: gotoSection("database") },
	{ code: "shortcut_goto_monitoring", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.monitoring" }, keys: "Mod+Shift+M", action: gotoSection("monitoring") },
	{ code: "shortcut_goto_notify", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.notify" }, keys: "Mod+Shift+N", action: gotoSection("notify") },
	{ code: "shortcut_goto_permissions", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.permissions" }, keys: "Mod+Shift+P", action: gotoSection("permissions") },
	{ code: "shortcut_goto_connected_users", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "nav.connected_users" }, keys: "Mod+Shift+U", action: gotoSection("connected_users") },
	{ code: "shortcut_goto_snippets", section: "global", label: "settings.shortcuts.goto", labelVars: { nameKey: "tree.snippets_section" }, keys: "Mod+Shift+S", action: gotoSection("snippets") },

	// --- inner tabs ---
	{
		code: "shortcut_new_inner_tab",
		section: "tabs",
		label: "settings.shortcuts.new_inner_tab",
		keys: "Mod+T",
		action() {
			if (snippetsActive()) v_connTabControl.tag.createSnippetTextTab();
			else if (databaseActive() && outerTab() && outerTab().tag.mode == "connection") v_connTabControl.tag.createQueryTab();
		},
	},
	{
		code: "shortcut_remove_inner_tab",
		section: "tabs",
		label: "settings.shortcuts.remove_inner_tab",
		keys: "Mod+W",
		action() {
			if (snippetsActive()) {
				closeWithConfirm(v_connTabControl.snippet_tag.tabControl.selectedTab);
				return;
			}
			var v_outer = outerTab();
			if (!databaseActive() || !v_outer || v_outer.tag.mode != "connection") return;
			var v_tab = v_outer.tag.tabControl.selectedTab;
			if (!v_tab) return;
			if (v_tab.closeFunction) v_tab.closeFunction(null, v_tab);
			else v_outer.tag.tabControl.removeTab(v_tab);
		},
	},
	{
		code: "shortcut_left_inner_tab",
		section: "tabs",
		label: "settings.shortcuts.left_inner_tab",
		keys: { macos: "Meta+Alt+ArrowLeft", other: "Ctrl+PageUp" },
		action() {
			if (snippetsActive()) cycleTab(v_connTabControl.snippet_tag.tabControl, -1);
			else if (databaseActive() && outerTab() && outerTab().tag.mode == "connection") cycleTab(outerTab().tag.tabControl, -1);
		},
	},
	{
		code: "shortcut_right_inner_tab",
		section: "tabs",
		label: "settings.shortcuts.right_inner_tab",
		keys: { macos: "Meta+Alt+ArrowRight", other: "Ctrl+PageDown" },
		action() {
			if (snippetsActive()) cycleTab(v_connTabControl.snippet_tag.tabControl, 1);
			else if (databaseActive() && outerTab() && outerTab().tag.mode == "connection") cycleTab(outerTab().tag.tabControl, 1);
		},
	},

	// --- query editor ---
	{
		code: "shortcut_run_query",
		section: "query",
		label: "settings.shortcuts.run_query",
		keys: "Mod+Enter",
		action() {
			var v_outer = outerTab();
			if (!v_outer) return;
			if (v_outer.tag.mode == "outer_terminal") {
				terminalRun();
				return;
			}
			var v_tag = innerTag(["query", "console", "edit"]);
			if (!v_tag) return;
			if (v_tag.mode == "query") v_tag.bt_start.click();
			else if (v_tag.mode == "console") consoleSQL(false);
			else queryEditData();
		},
	},
	{
		code: "shortcut_run_statement",
		section: "query",
		label: "settings.shortcuts.run_statement",
		keys: "Mod+Shift+Enter",
		action() {
			var v_tag = innerTag(["query"]);
			if (v_tag) v_tag.bt_start_stmt.click();
		},
	},
	{
		code: "shortcut_cancel_query",
		section: "query",
		label: "settings.shortcuts.cancel_query",
		keys: "Mod+.",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) clickIfVisible(v_tag.bt_cancel);
		},
	},
	{
		code: "shortcut_explain",
		section: "query",
		label: "settings.shortcuts.run_explain",
		keys: "F7",
		action() {
			if (innerTag(["query"])) getExplain(0);
		},
	},
	{
		code: "shortcut_explain_analyze",
		section: "query",
		label: "settings.shortcuts.run_explain_analyze",
		keys: "Shift+F7",
		action() {
			if (innerTag(["query"])) getExplain(1);
		},
	},
	{
		code: "shortcut_indent",
		section: "query",
		label: "common.indent",
		keys: "Mod+Shift+F",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) v_tag.bt_indent.click();
		},
	},
	{
		code: "shortcut_autocomplete",
		section: "query",
		label: "settings.category.autocomplete",
		keys: { macos: "Alt+Space", other: "Ctrl+Space" },
		action(e) {
			var v_tag = innerTag(["query", "console"]);
			if (!v_tag) return;
			if (v_tag.mode == "query") autocomplete_start(v_tag.editor, 0, e, true);
			else autocomplete_start(v_tag.editor_input, 1, e, true);
		},
	},
	{
		code: "shortcut_history",
		section: "query",
		label: "settings.shortcuts.history",
		keys: "Mod+Shift+Y",
		action() {
			var v_tag = innerTag(["query"]);
			if (v_tag) v_tag.bt_history.click();
		},
	},
	{
		code: "shortcut_export",
		section: "query",
		label: "settings.shortcuts.export",
		keys: "Mod+Shift+E",
		action() {
			var v_tag = innerTag(["query"]);
			if (v_tag) clickIfVisible(v_tag.bt_export);
		},
	},
	{
		code: "shortcut_fetch_more",
		section: "query",
		label: "settings.shortcuts.fetch_more",
		keys: "",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) clickIfVisible(v_tag.bt_fetch_more);
		},
	},
	{
		code: "shortcut_fetch_all",
		section: "query",
		label: "settings.shortcuts.fetch_all",
		keys: "",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) clickIfVisible(v_tag.bt_fetch_all);
		},
	},
	{
		code: "shortcut_commit",
		section: "query",
		label: "settings.shortcuts.commit",
		keys: "",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) clickIfVisible(v_tag.bt_commit);
		},
	},
	{
		code: "shortcut_rollback",
		section: "query",
		label: "settings.shortcuts.rollback",
		keys: "",
		action() {
			var v_tag = innerTag(["query", "console"]);
			if (v_tag) clickIfVisible(v_tag.bt_rollback);
		},
	},

	// --- snippets ---
	{
		code: "shortcut_save_snippet",
		section: "snippets",
		label: "settings.shortcuts.save_snippet",
		keys: "Mod+S",
		action() {
			if (!snippetsActive()) return;
			var v_tab = v_connTabControl.snippet_tag.tabControl.selectedTab;
			if (v_tab && v_tab.tag && v_tab.tag.bt_save) v_tab.tag.bt_save.click();
		},
	},
];

const SECTION_LABELS = {
	global: "settings.shortcuts.section.global",
	tabs: "settings.shortcuts.section.tabs",
	query: "settings.shortcuts.section.query",
	snippets: "settings.shortcuts.section.snippets",
};

/**
 * Shortcuts that shipped with different defaults before this scheme. Older
 * versions persisted the *whole* set (defaults included) the first time any
 * shortcut was edited, so a stored row equal to one of these is an
 * untouched old default rather than a user choice -- it is dropped on load
 * so the new platform-conventional default applies.
 */
const LEGACY_DEFAULTS = {
	shortcut_run_query: { other: "Alt+Q", macos: "Ctrl+Q" },
	shortcut_cancel_query: { other: "Alt+C", macos: "Ctrl+C" },
	shortcut_indent: { other: "Alt+S", macos: "Ctrl+S" },
	shortcut_new_inner_tab: { other: "Alt+I", macos: "Ctrl+I" },
	shortcut_remove_inner_tab: { other: "Alt+Shift+Q", macos: "Ctrl+Shift+Q" },
	shortcut_left_inner_tab: { other: "Alt+O", macos: "Ctrl+O" },
	shortcut_right_inner_tab: { other: "Alt+P", macos: "Ctrl+P" },
	shortcut_explain: { other: "Alt+W", macos: "Ctrl+W" },
	shortcut_explain_analyze: { other: "Alt+E", macos: "Ctrl+E" },
};

/** Default {windows, linux, macos} entry per code, same shape as always. */
export var v_default_shortcuts = (function () {
	var v_result = {};
	for (var v_def of SHORTCUT_DEFS) {
		var v_spec = (os) => (typeof v_def.keys == "string" ? v_def.keys : os == "macos" ? v_def.keys.macos : v_def.keys.other);
		v_result[v_def.code] = {
			windows: parseCombo(v_spec("windows"), "windows"),
			linux: parseCombo(v_spec("linux"), "linux"),
			macos: parseCombo(v_spec("macos"), "macos"),
		};
	}
	return v_result;
})();

function currentDefault(p_code) {
	var v_by_os = v_default_shortcuts[p_code];
	return v_by_os[v_current_os in v_by_os ? v_current_os : "linux"];
}

function sameCombo(a, b) {
	return (
		!!a.ctrl_pressed == !!b.ctrl_pressed &&
		!!a.shift_pressed == !!b.shift_pressed &&
		!!a.alt_pressed == !!b.alt_pressed &&
		!!a.meta_pressed == !!b.meta_pressed &&
		String(a.shortcut_key).toUpperCase() == String(b.shortcut_key).toUpperCase()
	);
}

function withCode(p_code, p_combo) {
	return Object.assign({}, p_combo, { shortcut_code: p_code });
}

/**
 * The entries worth persisting: only those that differ from the default, so
 * a later change to a default reaches everyone who never customised it.
 */
export function shortcutsToPersist() {
	var v_list = [];
	for (var v_def of SHORTCUT_DEFS) {
		var v_current = v_shortcut_object.shortcuts[v_def.code];
		if (v_current && !sameCombo(v_current, currentDefault(v_def.code))) v_list.push(v_current);
	}
	return v_list;
}

//Initializing shortcut buttons
function initShortcuts() {
	v_shortcut_object.actions = {};
	for (var v_def of SHORTCUT_DEFS) v_shortcut_object.actions[v_def.code] = v_def.action;

	// Effective set = defaults overlaid with the user's stored rows for this OS.
	var v_stored = v_shortcut_object.shortcuts || {};
	var v_effective = {};
	for (var v_def of SHORTCUT_DEFS) {
		var v_row = v_stored[v_def.code];
		var v_use_stored = !!v_row && v_row.os == v_current_os;
		if (v_use_stored) {
			var v_legacy = LEGACY_DEFAULTS[v_def.code];
			if (v_legacy) {
				var v_legacy_combo = parseCombo(v_current_os == "macos" ? v_legacy.macos : v_legacy.other, v_current_os);
				if (sameCombo(v_row, v_legacy_combo)) v_use_stored = false;
			}
		}
		v_effective[v_def.code] = withCode(v_def.code, v_use_stored ? v_row : currentDefault(v_def.code));
	}
	v_shortcut_object.shortcuts = v_effective;

	buildShortcutSettings();
}

function sectionTitle(p_text) {
	var v_h = document.createElement("h6");
	v_h.className = "omnidb__settings__subsection-header";
	v_h.textContent = p_text;
	return v_h;
}

/** Renders the Settings > Shortcuts rows, grouped by section. */
function buildShortcutSettings() {
	var v_host = document.getElementById("shortcuts_list");
	if (!v_host) return;
	v_host.innerHTML = "";

	var v_last_section = "";
	for (const v_def of SHORTCUT_DEFS) {
		if (v_def.section != v_last_section) {
			v_last_section = v_def.section;
			v_host.appendChild(sectionTitle(t(SECTION_LABELS[v_def.section])));
		}

		var v_row = document.createElement("div");
		v_row.className = "form-group row";

		var v_label = document.createElement("label");
		v_label.className = "col-sm-5 col-form-label";
		v_label.htmlFor = v_def.code;
		v_label.textContent = shortcutLabel(v_def);

		var v_cell = document.createElement("div");
		v_cell.className = "col-sm-5";
		const v_button = document.createElement("button");
		v_button.id = v_def.code;
		v_button.className = "btn omnidb__theme__btn--secondary btn-sm btn-block";
		v_button.addEventListener("click", () => startSetShortcut(v_button));
		buildButtonText(v_shortcut_object.shortcuts[v_def.code], v_button);
		v_cell.appendChild(v_button);

		var v_reset_cell = document.createElement("div");
		v_reset_cell.className = "col-sm-2";
		var v_reset = document.createElement("button");
		v_reset.className = "btn omnidb__theme__btn--secondary btn-sm btn-block";
		v_reset.textContent = "↺";
		v_reset.title = t("settings.shortcuts.reset");
		v_reset.id = "reset_" + v_def.code;
		v_reset.addEventListener("click", () => resetShortcut(v_def.code));
		v_reset_cell.appendChild(v_reset);

		v_row.append(v_label, v_cell, v_reset_cell);
		v_host.appendChild(v_row);
		updateResetVisibility(v_def.code);
	}

	var v_reset_all = document.createElement("button");
	v_reset_all.className = "btn omnidb__theme__btn--secondary btn-sm mt-3";
	v_reset_all.textContent = t("settings.shortcuts.reset_all");
	v_reset_all.addEventListener("click", resetAllShortcuts);
	v_host.appendChild(v_reset_all);
}

function shortcutLabel(p_def) {
	if (!p_def.labelVars) return t(p_def.label);
	return t(p_def.label, { name: t(p_def.labelVars.nameKey) });
}

function refreshShortcutButton(p_code) {
	var v_button = document.getElementById(p_code);
	if (v_button) buildButtonText(v_shortcut_object.shortcuts[p_code], v_button);
	updateResetVisibility(p_code);
}

/** The reset button only shows while the shortcut differs from its default (the cell keeps its width). */
function updateResetVisibility(p_code) {
	var v_reset = document.getElementById("reset_" + p_code);
	if (v_reset) v_reset.style.visibility = sameCombo(v_shortcut_object.shortcuts[p_code], currentDefault(p_code)) ? "hidden" : "visible";
}

export function resetShortcut(p_code) {
	var v_default = currentDefault(p_code);
	var v_clash = findConflict(p_code, v_default);
	if (v_clash) {
		reportConflict(v_clash);
		return;
	}
	v_shortcut_object.shortcuts[p_code] = withCode(p_code, v_default);
	refreshShortcutButton(p_code);
	saveShortcuts();
}

export function resetAllShortcuts() {
	for (var v_def of SHORTCUT_DEFS) {
		v_shortcut_object.shortcuts[v_def.code] = withCode(v_def.code, currentDefault(v_def.code));
		refreshShortcutButton(v_def.code);
	}
	saveShortcuts();
}

/** The definition of another shortcut already using this combination, if any. */
function findConflict(p_code, p_combo) {
	if (!p_combo.shortcut_key) return null;
	for (var v_def of SHORTCUT_DEFS) {
		if (v_def.code == p_code) continue;
		var v_other = v_shortcut_object.shortcuts[v_def.code];
		if (v_other && sameCombo(v_other, p_combo)) return v_def;
	}
	return null;
}

function reportConflict(p_def) {
	showAlert(t("settings.shortcuts.conflict", { name: shortcutLabel(p_def) }));
}

const KEY_LABELS = {
	ARROWLEFT: "←",
	ARROWRIGHT: "→",
	ARROWUP: "↑",
	ARROWDOWN: "↓",
	PAGEUP: "PgUp",
	PAGEDOWN: "PgDn",
	ENTER: "Enter",
	SPACE: "Space",
	TAB: "Tab",
};

export function buildButtonText(p_shortcut_object, p_button) {
	if (!p_shortcut_object.shortcut_key) {
		p_button.textContent = t("settings.shortcuts.not_set");
		return;
	}
	var v_mac = v_current_os == "macos";
	var v_text = "";
	if (p_shortcut_object.ctrl_pressed) v_text += "Ctrl+";
	if (v_mac) {
		if (p_shortcut_object.alt_pressed) v_text += "Option+";
		if (p_shortcut_object.shift_pressed) v_text += "Shift+";
		if (p_shortcut_object.meta_pressed) v_text += "Cmd+";
	} else {
		if (p_shortcut_object.alt_pressed) v_text += "Alt+";
		if (p_shortcut_object.shift_pressed) v_text += "Shift+";
		if (p_shortcut_object.meta_pressed) v_text += v_current_os == "windows" ? "Win+" : "Super+";
	}
	var v_key = p_shortcut_object.shortcut_key;
	p_button.textContent = v_text + (KEY_LABELS[v_key] || v_key);
}

/**
 * Layout-independent key name for an event: letters and digits come from
 * `code` (so Option+Q on a Mac, which types a symbol, and the Czech number
 * row, which types accented letters unshifted, still resolve to Q / 1);
 * everything else from `key`.
 * @param {KeyboardEvent} p_event
 */
function eventKeyName(p_event) {
	var v_code = p_event.code || "";
	var v_match = /^Key([A-Z])$/.exec(v_code) || /^Digit(\d)$/.exec(v_code);
	if (v_match) return v_match[1];
	if (v_code == "Space" || p_event.key == " ") return "SPACE";
	return (p_event.key || "").toUpperCase();
}

const MODIFIER_KEYS = ["SHIFT", "CONTROL", "ALT", "META", "ALTGRAPH", "OS"];

export function startSetShortcut(p_button) {
	/** @type {HTMLElement} */ (document.getElementById("div_shortcut_background_dark")).style.display = "block";
	p_button.style["z-index"] = 1002;
	v_shortcut_object.button = p_button;

	document.removeEventListener("keydown", v_keyBoardShortcuts, true);
	document.removeEventListener("keydown", setShortcutEvent, true);
	document.addEventListener("keydown", setShortcutEvent, true);
}

export function setShortcutEvent(p_event) {
	p_event.preventDefault();
	p_event.stopPropagation();

	if (p_event.key == "Escape") {
		finishSetShortcut();
		return;
	}

	var v_key = eventKeyName(p_event);
	if (MODIFIER_KEYS.indexOf(v_key) != -1) return;

	var v_code = v_shortcut_object.button.id;
	var v_def = SHORTCUT_DEFS.find((d) => d.code == v_code);
	if (!v_def) {
		finishSetShortcut();
		return;
	}

	var v_any_modifier = p_event.ctrlKey || p_event.altKey || p_event.metaKey;
	var v_new;
	// Backspace/Delete on their own unassign the shortcut.
	if (!v_any_modifier && !p_event.shiftKey && (v_key == "BACKSPACE" || v_key == "DELETE")) {
		v_new = parseCombo("", v_current_os);
	} else {
		// A bare printable key would hijack typing in every editor and input.
		var v_function_key = /^F\d{1,2}$/.test(v_key);
		if (!v_any_modifier && !v_function_key) {
			showAlert(t("settings.shortcuts.need_modifier"));
			finishSetShortcut();
			return;
		}
		v_new = {
			ctrl_pressed: p_event.ctrlKey,
			shift_pressed: p_event.shiftKey,
			alt_pressed: p_event.altKey,
			meta_pressed: p_event.metaKey,
			shortcut_key: v_key,
		};
		var v_clash = findConflict(v_code, v_new);
		if (v_clash) {
			finishSetShortcut();
			reportConflict(v_clash);
			return;
		}
	}

	v_shortcut_object.shortcuts[v_code] = withCode(v_code, v_new);
	buildButtonText(v_shortcut_object.shortcuts[v_code], v_shortcut_object.button);
	updateResetVisibility(v_code);
	saveShortcuts();
	finishSetShortcut();
}

export function finishSetShortcut() {
	v_shortcut_object.button.style["z-index"] = 0;
	v_shortcut_object.button = null;
	/** @type {HTMLElement} */ (document.getElementById("div_shortcut_background_dark")).style.display = "none";

	document.removeEventListener("keydown", setShortcutEvent, true);
	document.addEventListener("keydown", v_keyBoardShortcuts, true);
}

export function checkShortcutPressed(p_event, p_shortcut_element) {
	if (!p_shortcut_element.shortcut_key) return false;
	if (p_event.ctrlKey != !!p_shortcut_element.ctrl_pressed) return false;
	if (p_event.shiftKey != !!p_shortcut_element.shift_pressed) return false;
	if (p_event.altKey != !!p_shortcut_element.alt_pressed) return false;
	if (p_event.metaKey != !!p_shortcut_element.meta_pressed) return false;
	return eventKeyName(p_event) == String(p_shortcut_element.shortcut_key).toUpperCase();
}

export var v_keyBoardShortcuts = function (p_event) {
	if (!v_shortcut_object.actions) return;
	if (MODIFIER_KEYS.indexOf((p_event.key || "").toUpperCase()) != -1) return;

	for (var property in v_shortcut_object.shortcuts) {
		if (!Object.prototype.hasOwnProperty.call(v_shortcut_object.shortcuts, property)) continue;
		if (!checkShortcutPressed(p_event, v_shortcut_object.shortcuts[property])) continue;
		var v_action = v_shortcut_object.actions[property];
		if (!v_action) continue;
		p_event.preventDefault();
		p_event.stopPropagation();
		v_action(p_event);
		return;
	}
};

// jQuery's $(fn) always defers to a fresh task even when the document is
// already ready (it never calls fn synchronously inline) -- match that here,
// since other module-level code later in this same bundle depends on
// running before this fires.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initShortcuts);
else setTimeout(initShortcuts, 0);

// Capture phase on purpose: the Ace editors bind plenty of Ctrl/Cmd combos
// of their own (Ctrl+T transposes letters, Ctrl+Shift+D duplicates a line,
// ...) and would swallow the event before a bubbling listener saw it. A
// configured shortcut should win wherever the focus is.
document.addEventListener("keydown", v_keyBoardShortcuts, true);
