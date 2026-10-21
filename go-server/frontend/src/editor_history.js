// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Local history of a query editor: snapshots of what was typed on a
/// connection (taken after a pause in typing and when the editor loses focus),
/// a dialog listing them with a diff against the current text, and restore.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { setMessageModalTitle, showConfirm } from "./notification_control.js";
import { collapseUnchanged, diffLines, hasChanges } from "./text_diff.js";

const IDLE_MS = 8000;
const CONTEXT_LINES = 3;

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
 * Starts recording snapshots for an editor and wires the history button.
 *
 * @param {any} p_editor an Ace editor
 * @param {() => number} p_getConnId the connection the editor currently runs against
 * @param {HTMLElement} p_button
 */
export function installEditorHistory(p_editor, p_getConnId, p_button) {
	let lastSaved = "";
	let timer = 0;

	/** Stores a snapshot of the current text unless it is already the latest one this page saved. */
	const snapshot = () => {
		clearTimeout(timer);
		const text = p_editor.getValue();
		if (!text.trim() || text === lastSaved) return;
		lastSaved = text;
		execAjax(
			"/save_editor_version/",
			JSON.stringify({ p_conn_id: p_getConnId(), p_text: text }),
			null,
			// A snapshot that cannot be saved (too large, connection gone) is not worth a dialog.
			function () {
				lastSaved = "";
			},
			"box",
			false,
		);
	};

	p_editor.on("change", () => {
		clearTimeout(timer);
		timer = window.setTimeout(snapshot, IDLE_MS);
	});
	p_editor.on("blur", snapshot);
	p_button.addEventListener("click", () => openHistory(p_editor, p_getConnId(), snapshot));
}

/**
 * @param {any} p_editor
 * @param {number} p_connId
 * @param {() => void} p_snapshot saves the editor's current text as a version
 */
function openHistory(p_editor, p_connId, p_snapshot) {
	/** @type {number | null} */
	let selectedId = null;
	/** @type {string | null} */
	let selectedText = null;

	const list = el("div", "list-group");
	list.style.cssText = "width:16rem;flex:none;max-height:60vh;overflow:auto;";
	const diff = el("pre", "m-0 p-2");
	diff.style.cssText = "flex:1;min-width:0;max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:12px;border:1px solid var(--border-color);";
	const hint = el("div", "mb-2 text-muted", t("history.diff_hint"));

	/** @param {string} versionText */
	const showDiff = (versionText) => {
		diff.innerHTML = "";
		const lines = diffLines(p_editor.getValue(), versionText);
		if (!hasChanges(lines)) {
			diff.textContent = t("history.no_changes");
			return;
		}
		for (const item of collapseUnchanged(lines, CONTEXT_LINES)) {
			const row = el("div");
			if (item.type === "gap") {
				row.className = "text-muted fst-italic";
				row.textContent = "… " + t("history.unchanged_lines", { count: item.count });
			} else {
				row.textContent = item.type + " " + item.text;
				if (item.type === "+") row.style.cssText = "background:rgba(40,167,69,.25);";
				if (item.type === "-") row.style.cssText = "background:rgba(220,53,69,.25);";
			}
			diff.appendChild(row);
		}
	};

	/**
	 * @param {{ id: number, date: string, size: number, preview: string }} version
	 * @param {HTMLElement} row
	 */
	const select = (version, row) => {
		list.querySelectorAll(".active").forEach((x) => x.classList.remove("active"));
		row.classList.add("active");
		selectedId = version.id;
		selectedText = null;
		diff.textContent = "";
		execAjax(
			"/get_editor_version/",
			JSON.stringify({ p_id: version.id }),
			function (/** @type {{ v_data: string }} */ r) {
				if (selectedId !== version.id) return;
				selectedText = r.v_data;
				showDiff(r.v_data);
			},
			null,
			"box",
			false,
		);
	};

	showConfirm(
		"",
		function () {
			if (selectedText === null) return;
			// Keep what is being replaced, so a restore can itself be undone from the history.
			p_snapshot();
			p_editor.setValue(selectedText, -1);
			p_editor.focus();
		},
		null,
		function () {
			setMessageModalTitle(t("history.title"), "fas node-all fa-code-branch");
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			const body = el("div", "d-flex gap-3");
			const right = el("div");
			right.style.cssText = "flex:1;min-width:0;";
			right.append(hint, diff);
			body.append(list, right);
			content.appendChild(body);

			execAjax(
				"/get_editor_versions/",
				JSON.stringify({ p_conn_id: p_connId }),
				function (/** @type {{ v_data: Array<{ id: number, date: string, size: number, preview: string }> }} */ r) {
					if (r.v_data.length === 0) {
						body.replaceChildren(el("div", "text-muted", t("history.empty")));
						return;
					}
					r.v_data.forEach((version, index) => {
						const row = el("button", "list-group-item list-group-item-action text-start");
						row.setAttribute("type", "button");
						const when = el("div", "fw-bold small", new Date(version.date).toLocaleString());
						const preview = el("div", "small text-truncate", version.preview || "—");
						row.append(when, preview);
						row.addEventListener("click", () => select(version, row));
						list.appendChild(row);
						if (index === 0) select(version, row);
					});
				},
				null,
				"box",
				false,
			);
		},
		true,
		t("history.restore"),
	);
}
