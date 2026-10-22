// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Compare: the schema (tables, columns, types) or the rows of a table of the
/// current connection with another connection's, and a script that makes the
/// other one match. The script is opened on the target connection for the user to
/// read and run -- nothing is changed by comparing.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { setMessageModalTitle, showAlert, showConfirm } from "./notification_control.js";
import { switchSection } from "./section_switcher.js";
import { tabSQLTemplate } from "./tree_context_functions/tree_postgresql.js";

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

/** @param {number} connId */
function openConnectionTab(connId) {
	const tab = v_connTabControl.tabList.find((/** @type {any} */ x) => x.tag && x.tag.selectedDatabaseIndex === connId);
	switchSection("database");
	if (tab) v_connTabControl.selectTab(tab);
	else v_connTabControl.tag.createConnTab(connId);
}

/**
 * @param {{ v_data: any }} r
 * @returns {string}
 */
function errorText(r) {
	const v = r.v_data;
	return typeof v === "string" ? v : (v && v.message) || t("errors.request_error");
}

/**
 * @param {string} title
 * @param {string} sql
 * @param {number} targetConn
 */
function openScript(title, sql, targetConn) {
	openConnectionTab(targetConn);
	tabSQLTemplate(title, sql);
}

/**
 * @param {any} result
 * @param {"schema" | "data"} kind
 * @param {number} targetConn
 * @param {string} targetLabel
 */
function showResult(result, kind, targetConn, targetLabel) {
	showConfirm(
		"",
		function () {
			openScript(t(kind === "schema" ? "compare.script_tab_schema" : "compare.script_tab_data", { target: targetLabel }), result.script, targetConn);
		},
		null,
		function () {
			setMessageModalTitle(t("compare.result_title"));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";

			const lines = [];
			if (kind === "schema") {
				lines.push(
					t("compare.sum_missing_tables", { count: (result.missing_tables || []).length }),
					t("compare.sum_extra_tables", { count: (result.extra_tables || []).length }),
					t("compare.sum_added_columns", { count: (result.added_columns || []).length }),
					t("compare.sum_removed_columns", { count: (result.removed_columns || []).length }),
					t("compare.sum_type_changes", { count: (result.type_changes || []).length }),
				);
			} else {
				lines.push(t("compare.sum_rows", { inserts: result.inserts, updates: result.updates, deletes: result.deletes }));
			}
			const summary = el("ul", "mb-2");
			for (const line of lines) summary.appendChild(el("li", undefined, line));
			content.appendChild(summary);

			if (kind === "data" && (result.samples || []).length > 0) {
				const sample = el("pre", "p-2 small mb-2");
				sample.style.cssText = "max-height:20vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
				sample.textContent = result.samples.join("\n") + (result.inserts + result.updates + result.deletes > result.samples.length ? "\n…" : "");
				content.appendChild(sample);
			}
			const pre = el("pre", "p-2 small mb-2", result.script);
			pre.style.cssText = "max-height:30vh;overflow:auto;white-space:pre-wrap;border:1px solid var(--border-color);";
			content.append(pre, el("div", "small text-muted", t("compare.script_hint", { target: targetLabel })));
		},
		true,
		t("compare.open_script"),
	);
}

/**
 * Opens the compare dialog for the current connection tab.
 */
export function openCompareDialog() {
	const tab = v_connTabControl.selectedTab;
	if (!tab || !tab.tag || tab.tag.selectedDatabaseIndex === undefined) {
		showAlert(t("compare.no_connection"));
		return;
	}
	const sourceConn = tab.tag.selectedDatabaseIndex;
	/** @type {Array<{ v_conn_id: number, v_alias: string, v_details1: string }>} */
	const connections = (v_connTabControl.tag.connections || []).filter((/** @type {any} */ c) => c.v_db_type !== "terminal");
	const label = (/** @type {any} */ c) => c.v_alias || c.v_details1 || String(c.v_conn_id);
	const sourceLabel = (connections.find((c) => c.v_conn_id === sourceConn) || { v_alias: "", v_details1: "" });

	const field = (/** @type {string} */ key, /** @type {HTMLElement} */ control) => {
		const w = el("div", "mb-2");
		w.append(el("label", "form-label small mb-1", t(key)), control);
		return w;
	};
	const kindSelect = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	for (const [value, key] of [
		["schema", "compare.kind_schema"],
		["data", "compare.kind_data"],
	]) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, t(key)));
		o.value = value;
		kindSelect.appendChild(o);
	}
	const targetSelect = /** @type {HTMLSelectElement} */ (el("select", "form-select form-select-sm"));
	for (const c of connections) {
		const o = /** @type {HTMLOptionElement} */ (el("option", undefined, label(c)));
		o.value = String(c.v_conn_id);
		targetSelect.appendChild(o);
	}
	const input = (/** @type {string} */ placeholderKey) => {
		const i = /** @type {HTMLInputElement} */ (el("input", "form-control form-control-sm"));
		i.type = "text";
		i.placeholder = t(placeholderKey);
		return i;
	};
	const sourceSchema = input("compare.schema_placeholder");
	const targetSchema = input("compare.schema_placeholder");
	const table = input("compare.table_placeholder");
	const targetTable = input("compare.target_table_placeholder");
	const deletes = /** @type {HTMLInputElement} */ (el("input", "form-check-input"));
	deletes.type = "checkbox";
	deletes.id = "compare_deletes";
	const deletesWrap = el("div", "form-check mb-2");
	const deletesLabel = /** @type {HTMLLabelElement} */ (el("label", "form-check-label", t("compare.include_deletes")));
	deletesLabel.htmlFor = deletes.id;
	deletesWrap.append(deletes, deletesLabel);
	const dataOnly = el("div");
	dataOnly.append(field("compare.table", table), field("compare.target_table", targetTable), deletesWrap);
	const sync = () => {
		dataOnly.style.display = kindSelect.value === "data" ? "" : "none";
	};
	kindSelect.addEventListener("change", sync);
	sync();

	showConfirm(
		"",
		function () {
			const kind = /** @type {"schema" | "data"} */ (kindSelect.value);
			if (kind === "data" && !table.value.trim()) {
				showAlert(t("compare.need_table"));
				return;
			}
			const targetConn = Number(targetSelect.value);
			const targetLabel = label(connections.find((c) => c.v_conn_id === targetConn) || { v_conn_id: targetConn, v_alias: "", v_details1: "" });
			execAjax(
				"/compare/",
				JSON.stringify({
					p_database_index: sourceConn,
					p_tab_id: tab.id,
					p_kind: kind,
					p_source_schema: sourceSchema.value.trim(),
					p_target_conn: String(targetConn),
					p_target_schema: targetSchema.value.trim(),
					p_table: table.value.trim(),
					p_target_table: targetTable.value.trim(),
					p_include_deletes: deletes.checked,
				}),
				function (/** @type {{ v_data: any }} */ r) {
					showResult(r.v_data, kind, targetConn, targetLabel);
				},
				function (/** @type {{ v_data: any }} */ r) {
					showAlert(errorText(r));
				},
				"box",
				true,
			);
		},
		null,
		function () {
			setMessageModalTitle(t("compare.title"));
			const content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			content.style.whiteSpace = "normal";
			content.innerHTML = "";
			const source = el("div", "mb-2 fw-bold", t("compare.source", { name: label(sourceLabel) }));
			content.append(field("compare.what", kindSelect), source, field("compare.source_schema", sourceSchema), field("compare.target", targetSelect), field("compare.target_schema", targetSchema), dataOnly);
		},
		"form",
		t("compare.run"),
	);
}
