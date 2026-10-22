// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// "Generate" on a table's context menu: SQL written for the table (a SELECT
/// joining the tables its foreign keys reference, a CRUD script with :named
/// parameters), opened in a new query tab.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { deliverExportFile } from "./export_file.js";
import { showAlert } from "./notification_control.js";
import { tabSQLTemplate } from "./tree_context_functions/tree_postgresql.js";

/**
 * @param {"select_joins" | "crud"} p_kind
 * @param {any} p_node an aimaraJS tree node (text = table, tag.schema = schema)
 */
function generate(p_kind, p_node) {
	execAjax(
		"/generate_sql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: (p_node.tag && p_node.tag.schema) || "",
			p_table: p_node.text,
			p_kind: p_kind,
		}),
		function (/** @type {{ v_data: string }} */ r) {
			tabSQLTemplate(t(p_kind === "crud" ? "generate.tab_crud" : "generate.tab_select_joins", { table: p_node.text }), r.v_data);
		},
		function (/** @type {{ v_data: any }} */ r) {
			var v_data = r.v_data;
			showAlert(typeof v_data === "string" ? v_data : (v_data && v_data.message) || t("errors.request_error"));
		},
		"box",
		false,
	);
}

/**
 * Writes the table's DDL (and, with data, its rows as INSERTs) to a file and offers it for saving.
 * @param {boolean} p_with_data
 * @param {any} p_node
 */
function dump(p_with_data, p_node) {
	execAjax(
		"/dump_table/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: (p_node.tag && p_node.tag.schema) || "",
			p_table: p_node.text,
			p_with_data: p_with_data,
		}),
		function (/** @type {{ v_data: any }} */ r) {
			deliverExportFile(r.v_data);
		},
		function (/** @type {{ v_data: any }} */ r) {
			var v_data = r.v_data;
			showAlert(typeof v_data === "string" ? v_data : (v_data && v_data.message) || t("errors.request_error"));
		},
		"box",
		true,
	);
}

/**
 * Adds a "Generate" submenu to the table menu of an engine's tree menus; call
 * it on the context_menu object before createTree().
 * @param {any} p_context_menu
 */
export function addGenerateMenu(p_context_menu) {
	var v_menu = p_context_menu.cm_table;
	if (!v_menu || !v_menu.elements) return;
	v_menu.elements.push({
		text: t("generate.menu"),
		icon: "fas cm-all fa-magic",
		submenu: {
			elements: [
				{
					text: t("generate.select_joins"),
					icon: "fas cm-all fa-search",
					action: function (/** @type {any} */ node) {
						generate("select_joins", node);
					},
				},
				{
					text: t("generate.crud"),
					icon: "fas cm-all fa-list-alt",
					action: function (/** @type {any} */ node) {
						generate("crud", node);
					},
				},
				{
					text: t("generate.dump_with_data"),
					icon: "fas cm-all fa-file-export",
					action: function (/** @type {any} */ node) {
						dump(true, node);
					},
				},
				{
					text: t("generate.dump_structure"),
					icon: "fas cm-all fa-file-export",
					action: function (/** @type {any} */ node) {
						dump(false, node);
					},
				},
			],
		},
	});
}
