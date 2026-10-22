// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Rename (Shift+F6 or the editor's context menu) for the name under the cursor.
/// An alias or CTE is renamed in the statement at once. A table or column opens a
/// preview first: the ALTER statement is written into a new tab for the user to
/// run -- nothing in the database changes by itself -- and the snippets (and this
/// editor) that mention the old table name can be rewritten alongside.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { resolve, toRange } from "./editor_navigation.js";
import { t } from "./i18n.js";
import { setMessageModalTitle, showAlert, showConfirm } from "./notification_control.js";
import { getAllSnippets } from "./tree_context_functions/tree_snippets.js";
import { tabSQLTemplate } from "./tree_context_functions/tree_postgresql.js";

const NAME_PATTERN = /^[\p{L}_][\p{L}\p{N}_$]{0,99}$/u;

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}

/**
 * Asks for a new name; calls back only with a valid, different one.
 * @param {string} p_oldName
 * @param {(name: string) => void} p_done
 * @param {string} [p_okLabel]
 */
function askNewName(p_oldName, p_done, p_okLabel) {
	const input = /** @type {HTMLInputElement} */ (el("input", "form-control"));
	input.type = "text";
	input.value = p_oldName;
	input.setAttribute("aria-label", t("rename.new_name"));
	const problem = el("div", "text-danger small mt-1");
	showConfirm(
		"",
		function () {
			const name = input.value.trim();
			if (!NAME_PATTERN.test(name)) {
				showAlert(t("rename.invalid"));
				return;
			}
			if (name !== p_oldName) p_done(name);
		},
		null,
		function () {
			setMessageModalTitle(t("rename.prompt_title", { name: p_oldName }));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			content.append(el("label", "form-label", t("rename.new_name")), input, problem);
			input.focus();
			input.select();
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					document.getElementById("modal_message_ok")?.click();
				}
			});
		},
		"form",
		p_okLabel || t("common.ok"),
	);
}

/**
 * @param {any} p_editor
 * @param {{ usages: Array<{ row: number, column: number, end_row: number, end_column: number }>, name: string }} p_info
 */
function renameInEditor(p_editor, p_info) {
	askNewName(p_info.name, (name) => {
		// Back to front, so the positions still to be replaced stay valid.
		const ranges = [...p_info.usages].sort((a, b) => b.row - a.row || b.column - a.column);
		for (const r of ranges) {
			const range = toRange(r);
			const old = p_editor.session.getTextRange(range);
			const quote = old.charAt(0) === '"' || old.charAt(0) === "`" ? old.charAt(0) : "";
			p_editor.session.replace(range, quote + name + quote);
		}
		p_editor.focus();
	});
}

/**
 * @param {any} p_editor
 * @param {string} p_table as written
 * @param {string} p_column "" for the table itself
 * @param {number} p_connId
 * @param {string} p_tabId
 * @param {string} p_oldName
 */
function renameInDatabase(p_editor, p_table, p_column, p_connId, p_tabId, p_oldName) {
	askNewName(
		p_oldName,
		(name) => {
			execAjax(
				"/rename_plan/",
				JSON.stringify({
					p_database_index: p_connId,
					p_tab_id: p_tabId,
					p_table: p_table,
					p_column: p_column,
					p_new_name: name,
					p_text: p_column ? "" : p_editor.getValue(),
				}),
				function (/** @type {{ v_data: any }} */ r) {
					showPlan(p_editor, r.v_data, name);
				},
				function (/** @type {{ v_data: any }} */ r) {
					const v = r.v_data;
					showAlert(typeof v === "string" ? v : (v && v.message) || t("errors.request_error"));
				},
				"box",
				true,
			);
		},
		t("rename.preview"),
	);
}

/**
 * @param {any} p_editor
 * @param {{ sql: string, old_name: string, new_name: string, snippets: any[], editor_text?: string, editor_count?: number }} p_plan
 * @param {string} p_newName
 */
function showPlan(p_editor, p_plan, p_newName) {
	/** @type {Map<number, HTMLInputElement>} */
	const snippetBoxes = new Map();
	const editorBox = /** @type {HTMLInputElement} */ (el("input", "form-check-input"));
	editorBox.type = "checkbox";
	editorBox.checked = true;

	showConfirm(
		"",
		function () {
			const ids = [...snippetBoxes.entries()].filter(([, box]) => box.checked).map(([id]) => id);
			if (p_plan.editor_text !== undefined && p_plan.editor_count && editorBox.checked) {
				p_editor.setValue(p_plan.editor_text, -1);
			}
			if (ids.length > 0) {
				execAjax(
					"/apply_snippet_rename/",
					JSON.stringify({ p_old: p_plan.old_name, p_new: p_plan.new_name, p_ids: ids }),
					function () {
						getAllSnippets();
					},
					function () {},
					"box",
					false,
				);
			}
			tabSQLTemplate(t("rename.script_tab", { old: p_plan.old_name }), p_plan.sql);
		},
		null,
		function () {
			setMessageModalTitle(t("rename.plan_title", { old: p_plan.old_name, new: p_newName }));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			const pre = el("pre", "p-2 mb-2", p_plan.sql);
			pre.style.cssText = "white-space:pre-wrap;border:1px solid var(--border-color);";
			content.append(pre, el("div", "small text-muted mb-2", t("rename.script_hint")));

			if (p_plan.editor_count) {
				const wrap = el("div", "form-check mb-2");
				editorBox.id = "rename_editor_box";
				const label = /** @type {HTMLLabelElement} */ (el("label", "form-check-label", t("rename.editor_mentions", { count: p_plan.editor_count })));
				label.htmlFor = editorBox.id;
				wrap.append(editorBox, label);
				content.appendChild(wrap);
			}
			if (p_plan.snippets.length > 0) {
				content.appendChild(el("h6", "mt-3", t("rename.snippets", { name: p_plan.old_name })));
				const list = el("div");
				list.style.cssText = "max-height:30vh;overflow:auto;";
				for (const s of p_plan.snippets) {
					const wrap = el("div", "form-check mb-2");
					const box = /** @type {HTMLInputElement} */ (el("input", "form-check-input"));
					box.type = "checkbox";
					box.checked = true;
					box.id = "rename_snippet_" + s.id;
					snippetBoxes.set(s.id, box);
					const label = /** @type {HTMLLabelElement} */ (el("label", "form-check-label", s.title));
					label.htmlFor = box.id;
					wrap.append(box, label);
					for (const l of s.lines) {
						const line = el("div", "small");
						line.style.cssText = "font-family:monospace;white-space:pre-wrap;";
						line.append(el("span", "text-danger", "- " + l.before), document.createElement("br"), el("span", "text-success", "+ " + l.after));
						wrap.appendChild(line);
					}
					list.appendChild(wrap);
				}
				content.appendChild(list);
			}
		},
		true,
		t("rename.open_script"),
	);
}

/**
 * @param {any} p_editor
 * @param {{ row: number, column: number }} p_pos
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function renameSymbol(p_editor, p_pos, p_getConnId, p_getTabId) {
	resolve(p_editor, p_pos, (info) => {
		if ((info.kind === "alias" || info.kind === "cte") && info.usages.length > 0) {
			renameInEditor(p_editor, info);
		} else if (info.kind === "table" && info.table) {
			renameInDatabase(p_editor, info.table, "", p_getConnId(), p_getTabId(), (info.table.split(".").pop() || info.table).replace(/^["`]|["`]$/g, ""));
		} else if (info.kind === "column" && info.table) {
			renameInDatabase(p_editor, info.table, info.name, p_getConnId(), p_getTabId(), info.name);
		}
	});
}

/**
 * Wires Shift+F6 to an editor.
 * @param {any} p_editor
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function installEditorRename(p_editor, p_getConnId, p_getTabId) {
	p_editor.commands.addCommand({
		name: "omnidbRename",
		bindKey: { win: "Shift-F6", mac: "Shift-F6" },
		exec: () => renameSymbol(p_editor, p_editor.getCursorPosition(), p_getConnId, p_getTabId),
	});
}

/**
 * The context-menu entry for a click at the given screen position.
 * @param {any} p_editor
 * @param {number} p_clientX
 * @param {number} p_clientY
 * @param {() => number} p_getConnId
 * @param {() => string} p_getTabId
 */
export function renameMenuEntry(p_editor, p_clientX, p_clientY, p_getConnId, p_getTabId) {
	const coords = p_editor.renderer.screenToTextCoordinates(p_clientX, p_clientY);
	return {
		text: t("rename.menu"),
		icon: "fas cm-all fa-edit",
		action: () => renameSymbol(p_editor, { row: coords.row, column: coords.column }, p_getConnId, p_getTabId),
	};
}
