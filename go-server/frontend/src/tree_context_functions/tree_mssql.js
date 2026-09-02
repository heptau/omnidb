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
/// Retrieving tree — SQL Server (mssql).
/// </summary>
//
// Structural note (read this before touching schema/p_schema anywhere below):
//
// Every other engine's tree in this codebase has a "browse schemas" level
// somewhere -- Postgres/mssql-in-theory would list schemas, MySQL/MariaDB
// list databases (which double as MySQL's "schema"), and Oracle collapses
// that level away entirely because Oracle's schema *is* the connected user
// (ALL_TABLES scoped to `v_username`, no picker needed). This Go backend's
// mssql port (mssql_handlers.go / mssql_treeinfo.go) follows Oracle's
// flat shape -- there is no /get_schemas_mssql/ route and no Schemas tree
// node -- but SQL Server's schema is *not* the connected login the way
// Oracle's is: you can connect as `sa` and still want to browse `dbo`, or
// any other schema, with no way to ask the backend "what should I browse"
// (mssqlTreeInfo, see mssql_treeinfo.go, hands back `v_username` which is
// literally just the login name from ConnectionInfo -- using that as
// `p_schema` would browse a schema named "sa" on most servers, which
// usually doesn't exist and never has any of the user's own tables).
//
// So this file hardcodes the pragmatic default every SQL Server database
// ships with: `dbo`. That is a real simplification versus a full
// schema-tree-node (a user whose tables live in a non-dbo schema won't see
// them), consistent with this phase's scope (mssql tree goes only as deep
// as Oracle's: Tables/Views/Functions/Procedures, no Schemas level) and not
// meant to be a general mssql schema browser. Every `p_schema` sent below,
// and every schema.table reference built for a snippet, uses this same
// constant -- there is nowhere else in the tree a different schema could
// come from in this phase.

import { execAjax } from "../ajax_control_bridge.js";
import { showConfirm, showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { clearProperties, getProperties } from "../properties.js";
import { escapeHtml, querySQL } from "../query.js";
import { refreshMonitoring } from "../tab_functions/inner_monitoring_tab.js";
import { renameTabConfirm, toggleConnectionAutocomplete } from "../workspace.js";
import { v_startEditData } from "./edit_data.js";
import { tabSQLTemplate } from "./tree_postgresql.js";

const MSSQL_DEFAULT_SCHEMA = "dbo";

// Declared here because these were implicit globals in every other
// tree_*.js file this one is modeled on (tree_oracle.js/tree_mysql.js):
// scratch values used and re-read inside a single function each, kept off
// the global object.
var i, v_list, v_node;

export function getTreeMssql(p_div) {
	var context_menu = {
		cm_server: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
			],
		},
		cm_tables: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Table",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate("Create Table", node.tree.tag.create_table.replace("#schema_name#", MSSQL_DEFAULT_SCHEMA));
					},
				},
			],
		},
		cm_table: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Data Actions",
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: "Query Data",
								icon: "fas cm-all fa-search",
								action: function (node) {
									TemplateSelectMssql(MSSQL_DEFAULT_SCHEMA, node.text);
								},
							},
							{
								text: "Edit Data",
								icon: "fas cm-all fa-table",
								action: function (node) {
									v_startEditData(node.text, MSSQL_DEFAULT_SCHEMA);
								},
							},
							{
								text: "Insert Record",
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateInsertMssql(MSSQL_DEFAULT_SCHEMA, node.text);
								},
							},
							{
								text: "Update Records",
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateUpdateMssql(MSSQL_DEFAULT_SCHEMA, node.text);
								},
							},
							{
								text: "Delete Records",
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(
										"Delete Records",
										node.tree.tag.delete.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.text),
									);
								},
							},
						],
					},
				},
				{
					text: "Table Actions",
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: "Alter Table (SQL)",
								icon: "fas cm-all fa-edit",
								action: function (node) {
									tabSQLTemplate(
										"Alter Table",
										node.tree.tag.alter_table.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.text),
									);
								},
							},
							{
								text: "Drop Table",
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(
										"Drop Table",
										node.tree.tag.drop_table.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.text),
									);
								},
							},
						],
					},
				},
			],
		},
		cm_columns: {
			elements: [
				{
					text: "Create Column",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Field",
							node.tree.tag.create_column.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_column: {
			elements: [
				{
					text: "Alter Column",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Alter Column",
							node.tree.tag.alter_column
								.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
				{
					text: "Drop Column",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop Column",
							node.tree.tag.drop_column
								.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
			],
		},
		cm_pks: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Primary Key",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Primary Key",
							node.tree.tag.create_primarykey.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_pk: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Drop Primary Key",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop Primary Key",
							node.tree.tag.drop_primarykey
								.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_fks: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Foreign Key",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Foreign Key",
							node.tree.tag.create_foreignkey.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_fk: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Drop Foreign Key",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop Foreign Key",
							node.tree.tag.drop_foreignkey
								.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_uniques: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Unique",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Unique",
							node.tree.tag.create_unique.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_unique: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Drop Unique",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop Unique",
							node.tree.tag.drop_unique
								.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_indexes: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Index",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Index",
							node.tree.tag.create_index.replace("#table_name#", MSSQL_DEFAULT_SCHEMA + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_index: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Alter Index",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Alter Index",
							node.tree.tag.alter_index.replace(
								"#index_name#",
								MSSQL_DEFAULT_SCHEMA + "." + node.text.replace(" (UNIQUE)", "").replace(" (NONUNIQUE)", ""),
							),
						);
					},
				},
				{
					text: "Drop Index",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop Index",
							node.tree.tag.drop_index.replace(
								"#index_name#",
								MSSQL_DEFAULT_SCHEMA + "." + node.text.replace(" (UNIQUE)", "").replace(" (NONUNIQUE)", ""),
							),
						);
					},
				},
			],
		},
		cm_views: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create View",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate("Create View", node.tree.tag.create_view.replace("#schema_name#", MSSQL_DEFAULT_SCHEMA));
					},
				},
			],
		},
		cm_view: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Query Data",
					icon: "fas cm-all fa-search",
					action: function (node) {
						var v_table_name = MSSQL_DEFAULT_SCHEMA + "." + node.text;

						v_connTabControl.tag.createQueryTab(node.text);

						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(
							"-- Querying Data\nselect t.*\nfrom " + v_table_name + " t",
						);
						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
						renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

						querySQL(0);
					},
				},
				{
					text: "Edit View",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getViewDefinitionMssql(node);
					},
				},
				{
					text: "Drop View",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							"Drop View",
							node.tree.tag.drop_view.replace("#view_name#", MSSQL_DEFAULT_SCHEMA + "." + node.text),
						);
					},
				},
			],
		},
		cm_functions: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Function",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Function",
							node.tree.tag.create_function.replace("#schema_name#", MSSQL_DEFAULT_SCHEMA),
						);
					},
				},
			],
		},
		cm_function: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Edit Function",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getFunctionDefinitionMssql(node);
					},
				},
				{
					text: "Drop Function",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate("Drop Function", node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
					},
				},
			],
		},
		cm_procedures: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Create Procedure",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							"Create Procedure",
							node.tree.tag.create_procedure.replace("#schema_name#", MSSQL_DEFAULT_SCHEMA),
						);
					},
				},
			],
		},
		cm_procedure: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: "Edit Procedure",
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getProcedureDefinitionMssql(node);
					},
				},
				{
					text: "Drop Procedure",
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate("Drop Procedure", node.tree.tag.drop_procedure.replace("#function_name#", node.tag.id));
					},
				},
			],
		},
		cm_refresh: {
			elements: [
				{
					text: "Refresh",
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreeMssql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
			],
		},
	};
	var tree = createTree(p_div, "#fcfdfd", context_menu);
	v_connTabControl.selectedTab.tag.tree = tree;
	let v_autocomplete_switch_status = v_connTabControl.selectedTab.tag.enable_autocomplete !== false ? " checked " : "";
	v_connTabControl.selectedTab.tag.divDetails.innerHTML =
		'<i class="fas fa-server me-1"></i>selected DB: ' +
		"<b>" +
		escapeHtml(v_connTabControl.selectedTab.tag.selectedDatabase) +
		"</b>" +
		'<div class="omnidb__switch omnidb__switch--sm float-end" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-html="true" title="" data-bs-original-title="<h5>Toggle autocomplete.</h5><div>Switch OFF <b>disables the autocomplete</b> on the inner tabs for this connection.</div>">' +
		'<input type="checkbox" ' +
		v_autocomplete_switch_status +
		' id="autocomplete_toggler_' +
		v_connTabControl.selectedTab.tag.tab_id +
		'" class="omnidb__switch--input">' +
		'<label for="autocomplete_toggler_' +
		v_connTabControl.selectedTab.tag.tab_id +
		'" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label>' +
		"</div>";

	// Binding for the autocomplete switch just built above -- see the matching
	// comment in tree_oracle.js/dom_event_bindings.js.
	/** @type {HTMLElement} */ (
		document.getElementById("autocomplete_toggler_" + v_connTabControl.selectedTab.tag.tab_id)
	).addEventListener("change", (event) => toggleConnectionAutocomplete(/** @type {HTMLElement} */ (event.target).id));

	tree.nodeAfterOpenEvent = function (node) {
		refreshTreeMssql(node);
	};

	tree.clickNodeEvent = function (node) {
		// Error nodes (see nodeOpenError* below) carry their message on the
		// tag, because the label itself is plain text — Aimara escapes node
		// labels, so an error node cannot render its own "detail" link.
		if (node.tag && node.tag.type === "error") {
			showError(node.tag.message);
			return;
		}
		if (v_connTabControl.selectedTab.tag.treeTabsVisible) {
			getPropertiesMssql(node);
		} else {
			// Do nothing
		}
	};

	tree.beforeContextMenuEvent = function (node, callback) {
		var v_elements = [];
		//Hooks
		if (v_connTabControl.tag.hooks.mssqlTreeContextMenu.length > 0) {
			for (var i = 0; i < v_connTabControl.tag.hooks.mssqlTreeContextMenu.length; i++)
				v_elements = v_elements.concat(v_connTabControl.tag.hooks.mssqlTreeContextMenu[i](node));
		}

		var v_customCallback = function () {
			callback(v_elements);
		};
		v_customCallback();
	};

	var node_server = tree.createNode(
		"MS SQL Server",
		false,
		"node-mssql",
		null,
		{
			type: "server",
		},
		"cm_server",
	);
	node_server.createChildNode("", true, "node-spin", null, null);
	tree.drawTree();
}

/// <summary>
/// Retrieving properties.
/// </summary>
/// <param name="node">Node object.</param>
export function getPropertiesMssql(node) {
	if (node.tag != undefined)
		if (node.tag.type == "table") {
			getProperties("/get_properties_mssql/", {
				p_schema: MSSQL_DEFAULT_SCHEMA,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "view") {
			getProperties("/get_properties_mssql/", {
				p_schema: MSSQL_DEFAULT_SCHEMA,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "function") {
			getProperties("/get_properties_mssql/", {
				p_schema: MSSQL_DEFAULT_SCHEMA,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "procedure") {
			getProperties("/get_properties_mssql/", {
				p_schema: MSSQL_DEFAULT_SCHEMA,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else {
			clearProperties();
		}

	//Hooks
	if (v_connTabControl.tag.hooks.mssqlTreeNodeClick.length > 0) {
		for (var i = 0; i < v_connTabControl.tag.hooks.mssqlTreeNodeClick.length; i++)
			v_connTabControl.tag.hooks.mssqlTreeNodeClick[i](node);
	}
}

/// <summary>
/// Refreshing tree node.
/// </summary>
/// <param name="node">Node object.</param>
export function refreshTreeMssql(node) {
	if (node.tag != undefined)
		if (node.tag.type == "table_list") {
			getTablesMssql(node);
		} else if (node.tag.type == "table") {
			getColumnsMssql(node);
		} else if (node.tag.type == "primary_key") {
			getPKMssql(node);
		} else if (node.tag.type == "pk") {
			getPKColumnsMssql(node);
		} else if (node.tag.type == "uniques") {
			getUniquesMssql(node);
		} else if (node.tag.type == "unique") {
			getUniquesColumnsMssql(node);
		} else if (node.tag.type == "foreign_keys") {
			getFKsMssql(node);
		} else if (node.tag.type == "foreign_key") {
			getFKsColumnsMssql(node);
		} else if (node.tag.type == "view_list") {
			getViewsMssql(node);
		} else if (node.tag.type == "view") {
			getViewsColumnsMssql(node);
		} else if (node.tag.type == "indexes") {
			getIndexesMssql(node);
		} else if (node.tag.type == "index") {
			getIndexesColumnsMssql(node);
		} else if (node.tag.type == "function_list") {
			getFunctionsMssql(node);
		} else if (node.tag.type == "function") {
			getFunctionFieldsMssql(node);
		} else if (node.tag.type == "procedure_list") {
			getProceduresMssql(node);
		} else if (node.tag.type == "procedure") {
			getProcedureFieldsMssql(node);
		} else if (node.tag.type == "server") {
			getTreeDetailsMssql(node);
		} else {
			afterNodeOpenedCallbackMssql(node);
		}
}

export function afterNodeOpenedCallbackMssql(node) {
	//Hooks
	if (v_connTabControl.tag.hooks.mssqlTreeNodeOpen.length > 0) {
		for (var i = 0; i < v_connTabControl.tag.hooks.mssqlTreeNodeOpen.length; i++)
			v_connTabControl.tag.hooks.mssqlTreeNodeOpen[i](node);
	}
}

/// <summary>
/// Retrieving tree details.
/// </summary>
/// <param name="node">Node object.</param>
export function getTreeDetailsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_tree_info_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			node.tree.contextMenu.cm_server.elements = [];
			node.tree.contextMenu.cm_server.elements.push({
				text: "Refresh",
				icon: "fas cm-all fa-sync-alt",
				action: function (node) {
					if (node.childNodes == 0) refreshTreeMssql(node);
					else {
						node.collapseNode();
						node.expandNode();
					}
				},
			});

			if (node.childNodes.length > 0) node.removeChildNodes();

			// Only the keys tree_mssql.js actually reads -- mirrors
			// mssqlTreeInfo's map shape (mssql_treeinfo.go) exactly, minus the
			// role/tablespace/sequence keys that map has no frontend consumer
			// for in this phase (see mssql_treeinfo.go's own comment).
			node.tree.tag = {
				v_database: p_return.v_data.v_database_return.v_database,
				version: p_return.v_data.v_database_return.version,
				v_username: p_return.v_data.v_database_return.v_username,
				superuser: p_return.v_data.v_database_return.superuser,
				create_function: p_return.v_data.v_database_return.create_function,
				drop_function: p_return.v_data.v_database_return.drop_function,
				create_procedure: p_return.v_data.v_database_return.create_procedure,
				drop_procedure: p_return.v_data.v_database_return.drop_procedure,
				create_view: p_return.v_data.v_database_return.create_view,
				drop_view: p_return.v_data.v_database_return.drop_view,
				create_table: p_return.v_data.v_database_return.create_table,
				alter_table: p_return.v_data.v_database_return.alter_table,
				drop_table: p_return.v_data.v_database_return.drop_table,
				create_column: p_return.v_data.v_database_return.create_column,
				alter_column: p_return.v_data.v_database_return.alter_column,
				drop_column: p_return.v_data.v_database_return.drop_column,
				create_primarykey: p_return.v_data.v_database_return.create_primarykey,
				drop_primarykey: p_return.v_data.v_database_return.drop_primarykey,
				create_unique: p_return.v_data.v_database_return.create_unique,
				drop_unique: p_return.v_data.v_database_return.drop_unique,
				create_foreignkey: p_return.v_data.v_database_return.create_foreignkey,
				drop_foreignkey: p_return.v_data.v_database_return.drop_foreignkey,
				create_index: p_return.v_data.v_database_return.create_index,
				alter_index: p_return.v_data.v_database_return.alter_index,
				drop_index: p_return.v_data.v_database_return.drop_index,
				delete: p_return.v_data.v_database_return.delete,
			};

			if (node.tree.tag.superuser) {
				node.tree.contextMenu.cm_server.elements.push({
					text: "Monitoring",
					icon: "fas cm-all fa-chart-line",
					action: function (node) {},
					submenu: {
						elements: [
							{
								text: "Sessions",
								icon: "fas cm-all fa-chart-line",
								action: function (node) {
									v_connTabControl.tag.createMonitoringTab(
										"Sessions",
										"select session_id, login_name, host_name, program_name, status from sys.dm_exec_sessions where is_user_process = 1",
										[
											{
												icon: "fas cm-all fa-times",
												title: "Terminate",
												action: "mssqlTerminateBackend",
											},
										],
									);
								},
							},
						],
					},
				});
			}

			node.setText(p_return.v_data.v_database_return.version);

			// No Schemas/Tablespaces/Roles/Sequences level here -- see the
			// file-header comment. Tables/Views/Functions/Procedures hang
			// directly off the server node, all scoped to MSSQL_DEFAULT_SCHEMA.
			var node_tables = node.createChildNode(
				"Tables",
				false,
				"fas node-all fa-th node-table-list",
				{
					type: "table_list",
					num_tables: 0,
				},
				"cm_tables",
			);
			node_tables.createChildNode("", true, "node-spin", null, null);

			var node_views = node.createChildNode(
				"Views",
				false,
				"fas node-all fa-eye node-view-list",
				{
					type: "view_list",
					num_views: 0,
				},
				"cm_views",
			);
			node_views.createChildNode("", true, "node-spin", null, null);

			var node_functions = node.createChildNode(
				"Functions",
				false,
				"fas node-all fa-cog node-function-list",
				{
					type: "function_list",
					num_functions: 0,
				},
				"cm_functions",
			);
			node_functions.createChildNode("", true, "node-spin", null, null);

			var node_procedures = node.createChildNode(
				"Procedures",
				false,
				"fas node-all fa-cog node-procedure-list",
				{
					type: "procedure_list",
					num_functions: 0,
				},
				"cm_procedures",
			);
			node_procedures.createChildNode("", true, "node-spin", null, null);

			if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
				v_connTabControl.selectedTab.tag.firstTimeOpen = false;
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getTablesMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_tables_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText("Tables (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-table",
					{
						type: "table",
						has_primary_keys: p_return.v_data[i].v_has_primary_keys,
						has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
						has_uniques: p_return.v_data[i].v_has_uniques,
						has_indexes: p_return.v_data[i].v_has_indexes,
					},
					"cm_table",
					null,
					false,
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "table_field",
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving views.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_views_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText("Views (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-eye node-view",
					{
						type: "view",
					},
					"cm_view",
					null,
					false,
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "view_field",
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving View Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewsColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_views_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				"Columns (" + p_return.v_data.length + ")",
				false,
				"fas node-all fa-columns node-column",
				null,
				null,
				null,
				false,
			);

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = v_list.createChildNode(
					p_return.v_data[i].v_column_name,
					false,
					"fas node-all fa-columns node-column",
					{
						type: "table_field",
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Type: " + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving view definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewDefinitionMssql(node) {
	execAjax(
		"/get_view_definition_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_view: node.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				"Columns (" + p_return.v_data.length + ")",
				false,
				"fas node-all fa-columns node-column",
				{
					type: "column_list",
				},
				"cm_columns",
				null,
				false,
			);

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = v_list.createChildNode(
					p_return.v_data[i].v_column_name,
					false,
					"fas node-all fa-columns node-column",
					{
						type: "table_field",
					},
					"cm_column",
					null,
					false,
				);
				v_node.createChildNode(
					"Type: " + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Nullable: " + p_return.v_data[i].v_nullable,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			// v_has_checks/v_has_excludes/v_has_rules/v_has_triggers/
			// v_has_partitions/v_has_statistics are always false in
			// handleGetTablesMSSQL (see mssql_handlers.go) -- this phase's
			// mssql tree has no nodes for any of those, unlike Oracle, so
			// there is nothing to conditionally build for them here.
			if (node.tag.has_primary_keys) {
				v_node = node.createChildNode(
					"Primary Key",
					false,
					"fas node-all fa-key node-pkey",
					{
						type: "primary_key",
					},
					"cm_pks",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_foreign_keys) {
				v_node = node.createChildNode(
					"Foreign Keys",
					false,
					"fas node-all fa-key node-fkey",
					{
						type: "foreign_keys",
					},
					"cm_fks",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_uniques) {
				v_node = node.createChildNode(
					"Uniques",
					false,
					"fas node-all fa-key node-unique",
					{
						type: "uniques",
					},
					"cm_uniques",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_indexes) {
				v_node = node.createChildNode(
					"Indexes",
					false,
					"fas node-all fa-thumbtack node-index",
					{
						type: "indexes",
					},
					"cm_indexes",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving PKs.
/// </summary>
/// <param name="node">Node object.</param>
export function getPKMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_pk_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			node.setText("Primary Key (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) {
				node.removeChildNodes();
			}

			if (p_return.v_data.length > 0) {
				v_node = node.createChildNode(
					p_return.v_data[0][0],
					false,
					"fas node-all fa-key node-pkey",
					{
						type: "pk",
					},
					"cm_pk",
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "pk_field",
					},
					null,
				);
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving PKs Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getPKColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_pk_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_key: node.text,
			p_table: node.parent.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node.createChildNode(
					p_return.v_data[i][0],
					false,
					"fas node-all fa-columns node-column",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Uniques.
/// </summary>
/// <param name="node">Node object.</param>
export function getUniquesMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_uniques_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			node.setText("Uniques (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-key node-unique",
						{
							type: "unique",
						},
						"cm_unique",
						null,
						false,
					);

					v_node.createChildNode(
						"",
						false,
						"node-spin",
						{
							type: "unique_field",
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Uniques Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getUniquesColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_uniques_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_unique: node.text,
			p_table: node.parent.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-columns node-column",
						null,
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Indexes.
/// </summary>
/// <param name="node">Node object.</param>
export function getIndexesMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_indexes_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			node.setText("Indexes (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0] + " (" + p_return.v_data[i][1] + ")",
						false,
						"fas node-all fa-thumbtack node-index",
						{
							type: "index",
						},
						"cm_index",
						null,
						false,
					);

					v_node.createChildNode(
						"",
						false,
						"node-spin",
						{
							type: "index_field",
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Indexes Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getIndexesColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_indexes_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_index: node.text.replace(" (NONUNIQUE)", "").replace(" (UNIQUE)", ""),
			p_table: node.parent.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-columns node-column",
						null,
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving FKs.
/// </summary>
/// <param name="node">Node object.</param>
export function getFKsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_fks_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			node.setText("Foreign Keys (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i][0],
					false,
					"fas node-all fa-key node-fkey",
					{
						type: "foreign_key",
					},
					"cm_fk",
					null,
					false,
				);
				v_node.createChildNode(
					"Referenced Table: " + p_return.v_data[i][1],
					false,
					"fas node-all fa-table node-table",
					null,
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Delete Rule: " + p_return.v_data[i][2],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Update Rule: " + p_return.v_data[i][3],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving FKs Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getFKsColumnsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_fks_columns_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_fkey: node.text,
			p_table: node.parent.parent.text,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			// handleGetFKsColumnsMSSQL (mssql_handlers.go) returns one row per
			// FK column, each carrying the same referenced-table/delete/update
			// header info repeated -- unlike Oracle's fks_columns route, which
			// returns that header only once alongside a per-column list. Show
			// the header from the first row, then every column mapping.
			if (p_return.v_data.length > 0) {
				node.createChildNode(
					"Referenced Table: " + p_return.v_data[0][0],
					false,
					"fas node-all fa-table node-table",
					null,
					null,
					null,
					false,
				);
				node.createChildNode(
					"Delete Rule: " + p_return.v_data[0][1],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
				node.createChildNode(
					"Update Rule: " + p_return.v_data[0][2],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			for (i = 0; i < p_return.v_data.length; i++) {
				node.createChildNode(
					p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
					false,
					"fas node-all fa-columns node-column",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving functions.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_functions_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText("Functions (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-function",
					{
						type: "function",
						id: p_return.v_data[i].v_id,
					},
					"cm_function",
					null,
					false,
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "function_field",
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving function fields.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionFieldsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_function_fields_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tag.num_tables = p_return.v_data.length;

			// Unlike ALL_ARGUMENTS (Oracle), sys.parameters carries no IN/OUT/
			// return-value marker -- mssqlFunctionFields/mssqlProcedureFields
			// (mssql_routines.go) put the parameter's *data type* in v_type,
			// not a direction letter. So there is no O/I-direction icon switch
			// to mirror from tree_oracle.js here; each parameter just gets a
			// "Type: ..." child the same way a table column does.
			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-exchange-alt node-function-field",
					null,
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Type: " + p_return.v_data[i].v_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving function definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionDefinitionMssql(node) {
	execAjax(
		"/get_function_definition_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving procedures.
/// </summary>
/// <param name="node">Node object.</param>
export function getProceduresMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_procedures_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText("Procedures (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-procedure",
					{
						type: "procedure",
						id: p_return.v_data[i].v_id,
					},
					"cm_procedure",
					null,
					false,
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "procedure_field",
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving procedure fields.
/// </summary>
/// <param name="node">Node object.</param>
export function getProcedureFieldsMssql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_procedure_fields_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_procedure: node.tag.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tag.num_tables = p_return.v_data.length;

			// See getFunctionFieldsMssql above -- v_type is a data type here,
			// not an Oracle-style I/O direction letter.
			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-exchange-alt node-function-field",
					null,
					null,
					null,
					false,
				);
				v_node.createChildNode(
					"Type: " + p_return.v_data[i].v_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					null,
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackMssql(node);
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving procedure definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getProcedureDefinitionMssql(node) {
	execAjax(
		"/get_procedure_definition_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_procedure: node.tag.id,
			p_schema: MSSQL_DEFAULT_SCHEMA,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorMssql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving SELECT SQL template.
/// </summary>
export function TemplateSelectMssql(p_schema, p_table) {
	execAjax(
		"/template_select_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			v_connTabControl.tag.createQueryTab(p_schema + "." + p_table);

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data.v_template);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, p_schema + "." + p_table);

			querySQL(0);
		},
		function (p_return) {
			showError(p_return.v_data);
			return "";
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving INSERT SQL template.
/// </summary>
export function TemplateInsertMssql(p_schema, p_table) {
	execAjax(
		"/template_insert_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate("Insert " + p_schema + "." + p_table, p_return.v_data.v_template);
		},
		function (p_return) {
			showError(p_return.v_data);
			return "";
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving UPDATE SQL template.
/// </summary>
export function TemplateUpdateMssql(p_schema, p_table) {
	execAjax(
		"/template_update_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate("Update " + p_schema + "." + p_table, p_return.v_data.v_template);
		},
		function (p_return) {
			showError(p_return.v_data);
			return "";
		},
		"box",
		true,
	);
}

export function nodeOpenErrorMssql(p_return, p_node) {
	if (p_return.v_data.password_timeout) {
		p_node.collapseNode();
		showPasswordPrompt(
			v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			function () {
				p_node.expandNode();
			},
			null,
			p_return.v_data.message,
		);
	} else {
		if (p_node.childNodes.length > 0) p_node.removeChildNodes();

		v_node = p_node.createChildNode(
			// Plain text, not markup -- see the matching comment in
			// nodeOpenErrorOracle (tree_oracle.js): node labels are escaped, so
			// the message rides on the node's tag and clickNodeEvent opens it.
			"Error - click for detail",
			false,
			"fas fa-times node-error",
			{
				type: "error",
				message: p_return.v_data,
			},
			null,
		);
	}
}

export function mssqlTerminateBackendConfirm(p_pid) {
	execAjax(
		"/kill_backend_mssql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_pid: p_pid,
		}),
		function (p_return) {
			refreshMonitoring();
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						mssqlTerminateBackendConfirm(p_pid);
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
		true,
	);
}

export function mssqlTerminateBackend(p_row) {
	var v_pid = p_row[0];

	showConfirm("Are you sure you want to terminate session " + v_pid + "?", function () {
		mssqlTerminateBackendConfirm(v_pid);
	});
}
