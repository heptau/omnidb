// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Bookmarks: tables a user pinned for quick access. This file owns pinning
/// (the "Add to bookmarks" entry of a table's context menu in every engine's
/// tree); the Bookmarks section itself is panel_functions/outer_bookmarks_panel.js.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { showAlert } from "./notification_control.js";

/**
 * Pins a table node of the connection tab's tree.
 * @param {any} p_node an aimaraJS tree node: text is the table, tag.schema its schema (engines without schemas leave it unset)
 */
export function addBookmarkFromNode(p_node) {
	execAjax(
		"/add_bookmark/",
		JSON.stringify({
			p_conn_id: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_kind: "table",
			p_schema: (p_node.tag && p_node.tag.schema) || "",
			p_name: p_node.text,
		}),
		function () {
			showAlert(t("bookmarks.added", { name: p_node.text }));
		},
		null,
		"box",
		false,
	);
}

/**
 * Adds "Add to bookmarks" to the table menu of an engine's tree menus; call it
 * on the context_menu object before createTree().
 * @param {any} p_context_menu
 */
export function addBookmarkMenu(p_context_menu) {
	var v_menu = p_context_menu.cm_table;
	if (!v_menu || !v_menu.elements) return;
	v_menu.elements.push({
		text: t("bookmarks.add"),
		icon: "fas cm-all fa-star",
		action: addBookmarkFromNode,
	});
}
