// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// "Go to definition" (Ctrl/Cmd+click, Ctrl/Cmd+B or the editor's context menu) and
/// "Find usages" (Alt+F7 or the context menu) for the name under the cursor in a
/// SQL editor. An alias or CTE jumps to where it is defined and its mentions are
/// selected; a table, view or column opens its definition (DDL) in a new tab; the
/// usages of a table are listed from this editor, the snippets and the history.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { showAlert } from "./notification_control.js";
import { switchSection } from "./section_switcher.js";
import { startEditSnippetText } from "./tree_context_functions/tree_snippets.js";
import { tabSQLTemplate } from "./tree_context_functions/tree_postgresql.js";

/** @typedef {{ row: number, column: number, end_row: number, end_column: number }} SymbolRange */
/** @typedef {{ kind: string, name: string, table: string, definition?: SymbolRange, usages: SymbolRange[] }} SymbolInfo */

/**
 * @param {{ v_data: any }} r
 * @returns {string}
 */
function errorText(r) {
	const v = r.v_data;
	return typeof v === "string" ? v : (v && v.message) || t("errors.request_error");
}

/**
 * Asks the server what the name at a position stands for.
 * @param {any} p_editor
 * @param {{ row: number, column: number }} p_pos
 * @param {(info: SymbolInfo) => void} p_done
 */
function resolve(p_editor, p_pos, p_done) {
	execAjax(
		"/resolve_symbol/",
		JSON.stringify({ p_sql: p_editor.getValue(), p_pos: p_editor.session.doc.positionToIndex(p_pos) }),
		function (/** @type {{ v_data: SymbolInfo }} */ r) {
			p_done(r.v_data);
		},
		function () {},
		"box",
		false,
	);
}

/** @param {SymbolRange} r */
function toRange(r) {
	return new (ace.require("ace/range").Range)(r.row, r.column, r.end_row, r.end_column);
}

/**
 * @param {{ row: number, column: number }} p_pos
 * @param {SymbolRange} r
 */
function contains(p_pos, r) {
	return toRange(r).contains(p_pos.row, p_pos.column) || (p_pos.row === r.end_row && p_pos.column === r.end_column);
}

/**
 * @param {string} p_table
 * @param {number} p_connId
 * @param {string} p_tabId
 */
function openDefinition(p_table, p_connId, p_tabId) {
	execAjax(
		"/table_ddl/",
		JSON.stringify({ p_database_index: p_connId, p_tab_id: p_tabId, p_table: p_table }),
		function (/** @type {{ v_data: string }} */ r) {
			tabSQLTemplate(t("navigate.ddl_tab", { table: p_table }), r.v_data);
		},
		function (/** @type {{ v_data: any }} */ r) {
			showAlert(errorText(r));
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_editor
 * @param {{ row: number, column: number }} p_pos
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function goToDefinition(p_editor, p_pos, p_getConnId, p_getTabId) {
	resolve(p_editor, p_pos, (info) => {
		if (info.kind === "alias" || info.kind === "cte") {
			const onDefinition = info.definition && contains(p_pos, info.definition);
			if (info.definition && !onDefinition) {
				p_editor.selection.setSelectionRange(toRange(info.definition));
				p_editor.centerSelection();
				p_editor.focus();
				return;
			}
			if (info.kind === "alias" && info.table) openDefinition(info.table, p_getConnId(), p_getTabId());
			return;
		}
		if ((info.kind === "table" || info.kind === "column") && info.table) {
			openDefinition(info.table, p_getConnId(), p_getTabId());
		}
	});
}

/**
 * Plain mentions of a name in the editor text, as ranges.
 * @param {any} p_editor
 * @param {string} p_name
 * @returns {Array<{ row: number, column: number, text: string }>}
 */
function mentionsInEditor(p_editor, p_name) {
	const re = new RegExp("(^|[^\\w$])[\"`]?(" + p_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")[\"`]?(?![\\w$])", "gi");
	/** @type {Array<{ row: number, column: number, text: string }>} */
	const out = [];
	p_editor
		.getValue()
		.split("\n")
		.forEach((/** @type {string} */ line, /** @type {number} */ row) => {
			re.lastIndex = 0;
			let m;
			while ((m = re.exec(line)) !== null) {
				const column = m.index + m[1].length + (line[m.index + m[1].length] === '"' || line[m.index + m[1].length] === "`" ? 1 : 0);
				if (out.length === 0 || out[out.length - 1].row !== row || out[out.length - 1].column !== column) {
					out.push({ row, column, text: line.trim().slice(0, 160) });
				}
			}
		});
	return out;
}

/**
 * @param {any} p_editor
 * @param {string} p_name
 * @param {Array<any>} p_hits server hits (snippets, history)
 */
function showUsagesDialog(p_editor, p_name, p_hits) {
	const here = mentionsInEditor(p_editor, p_name);
	showAlert('<div id="usages_root"></div>', null, true, true);
	const root = /** @type {HTMLElement} */ (document.getElementById("usages_root"));
	/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).style.whiteSpace = "normal";
	const modal = () => document.getElementById("modal_message_ok")?.click();

	/**
	 * @param {string} title
	 * @param {Array<{ label: string, text: string, onClick: () => void }>} items
	 */
	const section = (title, items) => {
		if (items.length === 0) return;
		const h = document.createElement("h6");
		h.className = "mt-3 mb-1";
		h.textContent = title + " (" + items.length + ")";
		root.appendChild(h);
		const group = document.createElement("div");
		group.className = "list-group";
		for (const item of items) {
			const row = document.createElement("button");
			row.type = "button";
			row.className = "list-group-item list-group-item-action text-start";
			const label = document.createElement("div");
			label.className = "small fw-bold";
			label.textContent = item.label;
			const text = document.createElement("div");
			text.className = "small text-truncate";
			text.textContent = item.text;
			row.append(label, text);
			row.addEventListener("click", () => {
				modal();
				item.onClick();
			});
			group.appendChild(row);
		}
		root.appendChild(group);
	};

	section(
		t("navigate.usages_editor"),
		here.map((m) => ({
			label: t("navigate.line", { line: m.row + 1 }),
			text: m.text,
			onClick: () => {
				p_editor.gotoLine(m.row + 1, m.column, true);
				p_editor.focus();
			},
		})),
	);
	section(
		t("navigate.usages_snippets"),
		p_hits
			.filter((h) => h.source === "snippet")
			.map((h) => ({
				label: h.title,
				text: t("navigate.line", { line: h.line }) + ": " + h.text,
				onClick: () => {
					switchSection("snippets");
					startEditSnippetText({ tag: { type: "snippet", id: h.id, id_parent: null, name: h.title } });
				},
			})),
	);
	section(
		t("navigate.usages_history"),
		p_hits
			.filter((h) => h.source === "history")
			.map((h) => ({
				label: new Date(h.title).toLocaleString(),
				text: h.text,
				onClick: () => tabSQLTemplate(t("navigate.history_tab"), h.full || h.text),
			})),
	);
	if (!root.hasChildNodes()) root.textContent = t("navigate.no_usages", { name: p_name });
}

/**
 * @param {any} p_editor
 * @param {{ row: number, column: number }} p_pos
 */
export function findUsages(p_editor, p_pos) {
	resolve(p_editor, p_pos, (info) => {
		if ((info.kind === "alias" || info.kind === "cte") && info.usages.length > 0) {
			// Every mention in the statement, selected at once (and so highlighted).
			p_editor.selection.clearSelection();
			info.usages.forEach((u, i) => {
				const range = toRange(u);
				if (i === 0) p_editor.selection.setSelectionRange(range);
				else p_editor.selection.addRange(range);
			});
			p_editor.focus();
			return;
		}
		const name = info.table || (info.kind === "column" ? info.name : "");
		if (!name) return;
		const searched = name.split(".").pop() || name;
		execAjax(
			"/find_usages/",
			JSON.stringify({ p_name: searched }),
			function (/** @type {{ v_data: any[] }} */ r) {
				showUsagesDialog(p_editor, searched.replace(/^["`]|["`]$/g, ""), r.v_data);
			},
			function (/** @type {{ v_data: any }} */ r) {
				showAlert(errorText(r));
			},
			"box",
			true,
		);
	});
}

/**
 * Wires the gestures of one editor.
 * @param {any} p_editor an Ace editor
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function installEditorNavigation(p_editor, p_getConnId, p_getTabId) {
	p_editor.on("mousedown", (/** @type {any} */ e) => {
		const ev = e.domEvent;
		if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey || ev.button !== 0) return;
		const pos = e.getDocumentPosition();
		const line = p_editor.session.getLine(pos.row);
		if (!/[\w"`$]/.test(line.charAt(pos.column) || line.charAt(pos.column - 1))) return;
		// Keep Ctrl/Cmd+click on a name from adding a text cursor.
		e.stop();
		goToDefinition(p_editor, pos, p_getConnId, p_getTabId);
	});
	p_editor.commands.addCommand({
		name: "omnidbGoToDefinition",
		bindKey: { win: "Ctrl-B", mac: "Command-B" },
		exec: () => goToDefinition(p_editor, p_editor.getCursorPosition(), p_getConnId, p_getTabId),
	});
	p_editor.commands.addCommand({
		name: "omnidbFindUsages",
		bindKey: { win: "Alt-F7", mac: "Alt-F7" },
		exec: () => findUsages(p_editor, p_editor.getCursorPosition()),
	});
}

/**
 * The editor's context-menu entries for a click at the given screen position.
 * @param {any} p_editor
 * @param {number} p_clientX
 * @param {number} p_clientY
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function navigationMenuEntries(p_editor, p_clientX, p_clientY, p_getConnId, p_getTabId) {
	const coords = p_editor.renderer.screenToTextCoordinates(p_clientX, p_clientY);
	const pos = { row: coords.row, column: coords.column };
	return [
		{
			text: t("navigate.go_to_definition"),
			icon: "fas cm-all fa-link",
			action: () => goToDefinition(p_editor, pos, p_getConnId, p_getTabId),
		},
		{
			text: t("navigate.find_usages"),
			icon: "fas cm-all fa-search",
			action: () => findUsages(p_editor, pos),
		},
	];
}
