// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Search Everywhere: a palette (opened with a double Shift) that finds
/// sections, connections, bookmarks, snippets and the tables of the selected
/// connection in one box, and jumps to the pick.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { getSectionEntries, switchSection } from "./section_switcher.js";
import { flattenSnippets } from "./snippet_tree.js";
import { startEditSnippetText } from "./tree_context_functions/tree_snippets.js";
import { v_startEditData } from "./tree_context_functions/edit_data.js";

/**
 * @typedef {{ kind: string, icon: string, label: string, detail?: string, run: () => void }} SearchEntry
 */

const MAX_SHOWN = 40;
const DOUBLE_SHIFT_MS = 400;

/**
 * How well a label matches the typed text: 0 when it starts with it, 1 when a
 * word of it does, 2 when it merely contains it, -1 for no match. Empty text
 * matches everything equally.
 *
 * @param {string} label
 * @param {string} query
 * @returns {number}
 */
export function matchRank(label, query) {
	const fold = (/** @type {string} */ text) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
	const q = fold(query.trim());
	if (!q) return 0;
	const l = fold(label).replace(/"/g, "");
	const index = l.indexOf(q);
	if (index < 0) return -1;
	if (index === 0) return 0;
	return /[\s._\-/]/.test(l[index - 1]) ? 1 : 2;
}

/**
 * Entries matching the query, best matches first (stable within a rank).
 *
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @returns {SearchEntry[]}
 */
export function rankEntries(entries, query) {
	return entries
		.map((entry, order) => ({ entry, order, rank: matchRank(entry.label, query) }))
		.filter((x) => x.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.order - b.order)
		.map((x) => x.entry);
}

/** @type {HTMLElement | null} */
let overlay = null;
/** @type {SearchEntry[]} */
let staticEntries = [];
/** @type {SearchEntry[]} */
let tableEntries = [];
/** @type {SearchEntry[]} */
let shown = [];
let selected = 0;
let tableTimer = 0;
let tableToken = 0;

function openConnection(/** @type {number} */ connId) {
	const tab = v_connTabControl.tabList.find((/** @type {any} */ x) => x.tag && x.tag.selectedDatabaseIndex === connId);
	switchSection("database");
	if (tab) v_connTabControl.selectTab(tab);
	else v_connTabControl.tag.createConnTab(connId);
}

function currentConnectionLabel() {
	const tab = v_connTabControl && v_connTabControl.selectedTab;
	return tab && v_connTabControl.tabList.indexOf(tab) >= 0 && tab.tag && tab.tag.mode === "connection" ? tab : null;
}

/**
 * @param {(entries: SearchEntry[]) => void} done
 */
function collectStaticEntries(done) {
	/** @type {SearchEntry[]} */
	const entries = [];
	for (const section of getSectionEntries()) {
		entries.push({
			kind: t("search.kind_section"),
			icon: "fa-compass",
			label: section.title,
			run: () => switchSection(section.name),
		});
	}
	for (const conn of v_connTabControl.tag.connections || []) {
		const label = conn.v_alias || conn.v_details1 || String(conn.v_conn_id);
		entries.push({
			kind: t("search.kind_connection"),
			icon: "fa-plug",
			label,
			run: () => openConnection(conn.v_conn_id),
		});
	}
	for (const snippet of flattenSnippets(v_connTabControl.tag.globalSnippets)) {
		entries.push({
			kind: t("search.kind_snippet"),
			icon: "fa-scroll",
			label: snippet.name,
			detail: snippet.path,
			run: () => {
				switchSection("snippets");
				startEditSnippetText({ tag: { type: "snippet", id: snippet.id, id_parent: null, name: snippet.name } });
			},
		});
	}
	execAjax(
		"/get_bookmarks/",
		JSON.stringify({}),
		function (/** @type {{ v_data: any[] }} */ r) {
			for (const b of r.v_data) {
				entries.push({
					kind: t("search.kind_bookmark"),
					icon: "fa-star",
					label: (b.schema ? b.schema + "." : "") + b.name,
					detail: b.alias,
					run: () => {
						openConnection(b.conn_id);
						v_startEditData(b.name, b.schema);
					},
				});
			}
			done(entries);
		},
		function () {
			done(entries);
		},
		"box",
		false,
	);
}

function render() {
	if (!overlay) return;
	const input = /** @type {HTMLInputElement} */ (overlay.querySelector("input"));
	const list = /** @type {HTMLElement} */ (overlay.querySelector("[role=listbox]"));
	shown = rankEntries([...staticEntries, ...tableEntries], input.value).slice(0, MAX_SHOWN);
	selected = Math.min(selected, Math.max(shown.length - 1, 0));
	list.innerHTML = "";
	if (shown.length === 0) {
		const empty = document.createElement("div");
		empty.className = "omnidb__search-everywhere__empty";
		empty.textContent = t("search.no_results");
		list.appendChild(empty);
	}
	shown.forEach((entry, i) => {
		const row = document.createElement("div");
		row.className = "omnidb__search-everywhere__row" + (i === selected ? " omnidb__search-everywhere__row--selected" : "");
		row.setAttribute("role", "option");
		row.setAttribute("aria-selected", String(i === selected));
		const icon = document.createElement("i");
		icon.className = "fas " + entry.icon;
		const label = document.createElement("span");
		label.className = "omnidb__search-everywhere__label";
		label.textContent = entry.label;
		const meta = document.createElement("span");
		meta.className = "omnidb__search-everywhere__meta";
		meta.textContent = entry.detail ? entry.kind + " · " + entry.detail : entry.kind;
		row.append(icon, label, meta);
		row.addEventListener("mousedown", (e) => {
			e.preventDefault();
			choose(i);
		});
		list.appendChild(row);
	});
	const active = list.querySelector("[aria-selected=true]");
	if (active) active.scrollIntoView({ block: "nearest" });
}

/** @param {number} index */
function choose(index) {
	const entry = shown[index];
	closeSearchEverywhere();
	if (entry) entry.run();
}

function searchTables() {
	if (!overlay) return;
	const query = /** @type {HTMLInputElement} */ (overlay.querySelector("input")).value.trim();
	const tab = currentConnectionLabel();
	const token = ++tableToken;
	const connection = (v_connTabControl.tag.connections || []).find((/** @type {any} */ c) => tab && c.v_conn_id === tab.tag.selectedDatabaseIndex);
	const alias = connection ? connection.v_alias : undefined;
	if (query.length < 2 || !tab) {
		if (tableEntries.length) {
			tableEntries = [];
			render();
		}
		return;
	}
	execAjax(
		"/search_tables/",
		JSON.stringify({ p_database_index: tab.tag.selectedDatabaseIndex, p_tab_id: tab.id, p_query: query }),
		function (/** @type {{ v_data: Array<{ schema: string, name: string }> }} */ r) {
			if (token !== tableToken || !overlay) return;
			tableEntries = r.v_data.map((hit) => ({
				kind: t("search.kind_table"),
				icon: "fa-table",
				label: (hit.schema ? hit.schema + "." : "") + hit.name,
				detail: alias,
				run: () => {
					switchSection("database");
					v_connTabControl.selectTab(tab);
					v_startEditData(hit.name, hit.schema);
				},
			}));
			render();
		},
		null,
		"box",
		false,
	);
}

export function closeSearchEverywhere() {
	if (!overlay) return;
	overlay.remove();
	overlay = null;
	tableToken++;
	clearTimeout(tableTimer);
}

export function openSearchEverywhere() {
	if (overlay) return;
	staticEntries = [];
	tableEntries = [];
	selected = 0;

	overlay = document.createElement("div");
	overlay.className = "omnidb__search-everywhere";
	const box = document.createElement("div");
	box.className = "omnidb__search-everywhere__box";
	box.setAttribute("role", "dialog");
	box.setAttribute("aria-label", t("search.title"));
	const input = document.createElement("input");
	input.type = "text";
	input.className = "form-control";
	input.placeholder = t("search.placeholder");
	input.setAttribute("role", "combobox");
	input.setAttribute("aria-expanded", "true");
	input.setAttribute("aria-label", t("search.title"));
	input.autocomplete = "off";
	input.spellcheck = false;
	const list = document.createElement("div");
	list.setAttribute("role", "listbox");
	list.className = "omnidb__search-everywhere__list";
	box.append(input, list);
	overlay.appendChild(box);
	document.body.appendChild(overlay);

	overlay.addEventListener("mousedown", (e) => {
		if (e.target === overlay) closeSearchEverywhere();
	});
	input.addEventListener("input", () => {
		selected = 0;
		render();
		clearTimeout(tableTimer);
		tableTimer = window.setTimeout(searchTables, 200);
	});
	input.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			closeSearchEverywhere();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			selected = Math.min(selected + 1, shown.length - 1);
			render();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
			render();
		} else if (e.key === "Enter") {
			e.preventDefault();
			choose(selected);
		}
	});
	input.focus();
	render();
	collectStaticEntries((entries) => {
		if (!overlay) return;
		staticEntries = entries;
		render();
	});
}

/**
 * Opens the palette on a double press of Shift (two presses within 400 ms with
 * no other key in between), the way JetBrains IDEs do.
 */
export function initSearchEverywhere() {
	let lastShift = 0;
	let otherKey = false;
	document.addEventListener(
		"keydown",
		(e) => {
			if (e.key !== "Shift") {
				otherKey = true;
				return;
			}
			if (e.repeat) return;
			const now = Date.now();
			if (!otherKey && now - lastShift < DOUBLE_SHIFT_MS) {
				lastShift = 0;
				if (overlay) closeSearchEverywhere();
				else openSearchEverywhere();
			} else {
				lastShift = now;
			}
			otherKey = false;
		},
		true,
	);
}
