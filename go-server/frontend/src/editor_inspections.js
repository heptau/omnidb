// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Live inspections of the SQL in a query editor: after a pause in typing, the
/// text is sent to /inspect_sql/ and what it finds is shown as gutter
/// annotations and a dotted underline -- UPDATE / DELETE without WHERE,
/// comparisons with NULL, JOINs with nothing to join on, aliases nobody uses and
/// tables that do not exist.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";

const IDLE_MS = 1200;

/** @typedef {{ code: string, severity: "error" | "warning" | "info", arg: string, row: number, column: number, end_row: number, end_column: number }} Diagnostic */

/**
 * @param {any} p_editor an Ace editor
 * @param {() => number} p_getConnId the connection the editor currently runs against
 * @param {() => string} p_getTabId
 */
export function installEditorInspections(p_editor, p_getConnId, p_getTabId) {
	const Range = ace.require("ace/range").Range;
	let timer = 0;
	let token = 0;
	let lastText = null;
	/** @type {number[]} */
	let markers = [];

	const clear = () => {
		for (const id of markers) p_editor.session.removeMarker(id);
		markers = [];
		p_editor.session.setAnnotations([]);
	};

	/** @param {Diagnostic[]} diagnostics */
	const show = (diagnostics) => {
		clear();
		p_editor.session.setAnnotations(
			diagnostics.map((d) => ({ row: d.row, column: d.column, type: d.severity, text: t("inspect." + d.code, { name: d.arg }) })),
		);
		for (const d of diagnostics) {
			markers.push(p_editor.session.addMarker(new Range(d.row, d.column, d.end_row, d.end_column), "omnidb__inspection omnidb__inspection--" + d.severity, "text"));
		}
	};

	const run = () => {
		const text = p_editor.getValue();
		if (text === lastText) return;
		lastText = text;
		const mine = ++token;
		if (!text.trim()) {
			clear();
			return;
		}
		execAjax(
			"/inspect_sql/",
			JSON.stringify({ p_database_index: p_getConnId(), p_tab_id: p_getTabId(), p_sql: text, p_check_tables: true }),
			function (/** @type {{ v_data: Diagnostic[] }} */ r) {
				// Typed on since the request left: those positions no longer fit.
				if (mine === token && p_editor.getValue() === text) show(r.v_data);
			},
			// A failing check (no connection yet, a password prompt pending) is no reason to bother the user.
			function () {
				lastText = null;
			},
			"box",
			false,
		);
	};

	p_editor.on("change", () => {
		clearTimeout(timer);
		timer = window.setTimeout(run, IDLE_MS);
	});
}
