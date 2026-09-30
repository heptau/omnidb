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

import { t } from "../i18n.js";
import { execAjax } from "../ajax_control_bridge.js";
import { deliverExportFile } from "../export_file.js";
import { customMenu } from "../custom_menu.js";
import { createLegere } from "../lib/omnis_legere/omnis-legere.js";
import { showAlert, showConfirm, showConfirm3, showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { clearProperties, getProperties } from "../properties.js";
import { escapeHtml, querySQL, v_queryState } from "../query.js";
import { refreshConnectedUsers } from "../panel_functions/outer_connected_users_panel.js";
import { switchSection } from "../section_switcher.js";
import { createTabControl } from "../tabs.js";
import {
	checkBeforeChangeDatabase,
	drawGraph,
	refreshHeights,
	removeTab,
	renameTab,
	renameTabConfirm,
	showMenuNewTab,
	toggleConnectionAutocomplete,
} from "../workspace.js";
import { v_startEditData } from "./edit_data.js";

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var i, j, tmp, v_disconsiderSchemas, v_list, v_node, v_options, v_publications, v_tables;


export function tabSQLTemplate(p_tab_name, p_template, p_showTip = true) {
	v_connTabControl.tag.createQueryTab(p_tab_name);
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_template);
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
	v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
}

/// <summary>
/// Retrieving tree.
/// </summary>
export function getTreePostgresql(p_div) {
	var context_menu = {
		cm_server: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
			],
		},
		cm_databases: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_database"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_database"), node.tree.tag.create_database);
					},
				},
				{
					text: t("tree.doc_databases"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_databases") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/managing-databases.html",
						);
					},
				},
			],
		},
		cm_database: {
			elements: [
				{
					text: t("tree.alter_database"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_database"), node.tree.tag.alter_database.replace("#database_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_database"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_database"), node.tree.tag.drop_database.replace("#database_name#", node.text));
					},
				},
				{
					text: t("tree.export_dbml"),
					icon: "fas cm-all fa-file-export",
					action: function (node) {
						exportDBMLPostgresql(node);
					},
				},
			],
		},
		cm_tablespaces: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_tablespace"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_tablespace"), node.tree.tag.create_tablespace);
					},
				},
				{
					text: t("tree.doc_tablespaces"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_tablespaces") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/manage-ag-tablespaces.html",
						);
					},
				},
			],
		},
		cm_tablespace: {
			elements: [
				{
					text: t("tree.alter_tablespace"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_tablespace"), node.tree.tag.alter_tablespace.replace("#tablespace_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_tablespace"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_tablespace"), node.tree.tag.drop_tablespace.replace("#tablespace_name#", node.text));
					},
				},
			],
		},
		cm_roles: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_role"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_role"), node.tree.tag.create_role);
					},
				},
				{
					text: t("tree.doc_roles"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_roles") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/user-manag.html",
						);
					},
				},
			],
		},
		cm_role: {
			elements: [
				{
					text: t("tree.change_password"),
					icon: "fas cm-all fa-key",
					action: function (node) {
						// Built as real DOM nodes, not an HTML string —
						// showConfirm's content div only renders plain text
						// (see notification_control.js).
						function buildPasswordField(p_label_text, p_input_id, p_placeholder) {
							var v_col = document.createElement("div");
							v_col.className = "col-md-12 mb-3";

							var v_label = document.createElement("label");
							v_label.setAttribute("for", p_input_id);
							v_label.textContent = p_label_text;

							var v_input = document.createElement("input");
							v_input.type = "password";
							v_input.id = p_input_id;
							v_input.className = "form-control";
							v_input.placeholder = p_placeholder;

							v_col.appendChild(v_label);
							v_col.appendChild(v_input);
							return v_col;
						}

						showConfirm(
							"",
							function (p_node) {
								var v_password = /** @type {HTMLInputElement} */ (document.getElementById("change_pwd_role")).value;
								var v_password_confirm = /** @type {HTMLInputElement} */ (
									document.getElementById("change_pwd_role_confirm")
								).value;

								if (v_password == "") {
									showAlert(t("tree.password_empty"));
									return;
								}

								if (v_password_confirm == "") {
									showAlert(t("tree.password_confirmation_empty"));
									return;
								}

								if (v_password != v_password_confirm) {
									showAlert(t("tree.passwords_do_not_match"));
									return;
								}

								execAjax(
									"/change_role_password_postgresql/",
									JSON.stringify({
										p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
										p_tab_id: v_connTabControl.selectedTab.id,
										p_role: p_node.text,
										p_password: v_password,
									}),
									function (p_return) {
										showAlert(t("tree.password_changed_successfully"));
									},
									function (p_return) {
										showAlert(p_return.v_data.message);
									},
									"box",
									false,
								);
							}.bind(null, node),
							null,
							function () {
								var v_row = document.createElement("div");
								v_row.className = "form-row";
								v_row.appendChild(buildPasswordField(t("common.password"), "change_pwd_role", t("common.password")));
								v_row.appendChild(buildPasswordField(t("tree.password_confirmation"), "change_pwd_role_confirm", t("tree.password_confirmation")));
								/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).appendChild(v_row);
							},
						);
					},
				},
				{
					text: t("tree.alter_role"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_role"), node.tree.tag.alter_role.replace("#role_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_role"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_role"), node.tree.tag.drop_role.replace("#role_name#", node.text));
					},
				},
			],
		},
		cm_extensions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_extension"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_extension"), node.tree.tag.create_extension);
					},
				},
				{
					text: t("tree.doc_extensions"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_extensions") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/extend-extensions.html",
						);
					},
				},
			],
		},
		cm_extension: {
			elements: [
				{
					text: t("tree.alter_extension"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_extension"), node.tree.tag.alter_extension.replace("#extension_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_extension"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_role"), node.tree.tag.drop_extension.replace("#extension_name#", node.text));
					},
				},
			],
		},
		cm_schemas: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_schema"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_schema"), node.tree.tag.create_schema);
					},
				},
				{
					text: t("tree.doc_schemas"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_schemas") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-schemas.html",
						);
					},
				},
			],
		},
		cm_schema: {
			elements: [
				{
					text: t("tree.render_graph"),
					icon: "fab cm-all fa-hubspot",
					action: function (node) {},
					submenu: {
						elements: [
							{
								text: t("tree.simple_graph"),
								icon: "fab cm-all fa-hubspot",
								action: function (node) {
									v_connTabControl.tag.createGraphTab(node.text);
									drawGraph(false, node.text);
								},
							},
							{
								text: t("tree.complete_graph"),
								icon: "fab cm-all fa-hubspot",
								action: function (node) {
									v_connTabControl.tag.createGraphTab(node.text);
									drawGraph(true, node.text);
								},
							},
						],
					},
				},
				{
					text: t("tree.alter_schema"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_schema"), node.tree.tag.alter_schema.replace("#schema_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_schema"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_schema"), node.tree.tag.drop_schema.replace("#schema_name#", node.text));
					},
				},
			],
		},
		cm_tables: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_table"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_table"), node.tree.tag.create_table.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_basics"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_table_basics") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-basics.html",
						);
					},
				},
				{
					text: t("tree.doc_constraints"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_table_constraints") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-constraints.html",
						);
					},
				},
				{
					text: t("tree.doc_modifying"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_modifying_tables") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-alter.html",
						);
					},
				},
			],
		},
		cm_table: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.data_actions"),
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: t("tree.query_data"),
								icon: "fas cm-all fa-search",
								action: function (node) {
									TemplateSelectPostgresql(node.tag.schema, node.text, "t");
								},
							},
							{
								text: t("tree.edit_data"),
								icon: "fas cm-all fa-table",
								action: function (node) {
									v_startEditData(node.text, node.tag.schema);
								},
							},
							{
								text: t("tree.insert_record"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateInsertPostgresql(node.tag.schema, node.text);
								},
							},
							{
								text: t("tree.update_records"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateUpdatePostgresql(node.tag.schema, node.text);
								},
							},
							{
								text: t("tree.delete_records"),
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(t("tree.delete_records"),
										node.tree.tag.delete.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.truncate_table"),
								icon: "fas cm-all fa-cut",
								action: function (node) {
									tabSQLTemplate(t("tree.truncate_table"),
										node.tree.tag.truncate.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
						],
					},
				},
				{
					text: t("tree.table_actions"),
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: t("tree.vacuum_table"),
								icon: "fas cm-all fa-broom",
								action: function (node) {
									tabSQLTemplate(t("tree.vacuum_table"),
										node.tree.tag.vacuum_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.analyze_table"),
								icon: "fas cm-all fa-search-plus",
								action: function (node) {
									tabSQLTemplate(t("tree.analyze_table"),
										node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.alter_table"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									tabSQLTemplate(t("tree.alter_table"),
										node.tree.tag.alter_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.edit_comment"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									getObjectDescriptionPostgresql(node);
								},
							},
							{
								text: t("tree.drop_table"),
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(t("tree.drop_table"),
										node.tree.tag.drop_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
						],
					},
				},
			],
		},
		cm_inherited_tables: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.doc_inheritance"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_table_inheritance") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/tutorial-inheritance.html",
						);
					},
				},
			],
		},
		cm_partitioned_tables: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.doc_partitioning"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_table_partitioning") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-partitioning.html.html",
						);
					},
				},
			],
		},
		cm_columns: {
			elements: [
				{
					text: t("tree.create_column"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_column"),
							node.tree.tag.create_column.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_column: {
			elements: [
				{
					text: t("tree.alter_column"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_column"),
							node.tree.tag.alter_column
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_column"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_column"),
							node.tree.tag.drop_column
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
			],
		},
		cm_pks: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_primary_key"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_primary_key"),
							node.tree.tag.create_primarykey.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_pk: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_primary_key"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_primary_key"),
							node.tree.tag.drop_primarykey
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_fks: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_foreign_key"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_foreign_key"),
							node.tree.tag.create_foreignkey.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_fk: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_foreign_key"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_foreign_key"),
							node.tree.tag.drop_foreignkey
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_uniques: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_unique"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_unique"),
							node.tree.tag.create_unique.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_unique: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_unique"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_unique"),
							node.tree.tag.drop_unique
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_indexes: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_index"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_index"),
							node.tree.tag.create_index.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_indexes"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_indexes") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/indexes.html",
						);
					},
				},
			],
		},
		cm_index: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.alter_index"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_index"),
							node.tree.tag.alter_index.replace(
								"#index_name#",
								node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", ""),
							),
						);
					},
				},
				{
					text: t("tree.reindex"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.reindex"),
							node.tree.tag.reindex.replace(
								"#index_name#",
								node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", ""),
							),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_index"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_index"),
							node.tree.tag.drop_index.replace(
								"#index_name#",
								node.tag.schema + "." + node.text.replace(" (Unique)", "").replace(" (Non Unique)", ""),
							),
						);
					},
				},
			],
		},
		cm_checks: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_check"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_check"),
							node.tree.tag.create_check.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_check: {
			elements: [
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_check"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_check"),
							node.tree.tag.drop_check
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_excludes: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_exclude"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_exclude"),
							node.tree.tag.create_exclude.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_exclude: {
			elements: [
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_exclude"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_exclude"),
							node.tree.tag.drop_exclude
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#constraint_name#", node.text),
						);
					},
				},
			],
		},
		cm_rules: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_rule"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_rule"),
							node.tree.tag.create_rule.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_rules"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_rules") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/rules.html",
						);
					},
				},
			],
		},
		cm_rule: {
			elements: [
				{
					text: t("tree.alter_rule"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_rule"),
							node.tree.tag.alter_rule
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#rule_name#", node.text),
						);
					},
				},
				{
					text: t("tree.edit_rule"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getRuleDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_rule"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_rule"),
							node.tree.tag.drop_rule
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#rule_name#", node.text),
						);
					},
				},
			],
		},
		cm_triggers: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_trigger"),
							node.tree.tag.create_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_triggers"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_triggers") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/trigger-definition.html",
						);
					},
				},
			],
		},
		cm_view_triggers: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_trigger"),
							node.tree.tag.create_view_trigger.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_triggers"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_triggers") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/trigger-definition.html",
						);
					},
				},
			],
		},
		cm_trigger: {
			elements: [
				{
					text: t("tree.alter_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_trigger"),
							node.tree.tag.alter_trigger
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#trigger_name#", node.text),
						);
					},
				},
				{
					text: t("tree.enable_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.enable_trigger"),
							node.tree.tag.enable_trigger
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#trigger_name#", node.text),
						);
					},
				},
				{
					text: t("tree.disable_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.disable_trigger"),
							node.tree.tag.disable_trigger
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#trigger_name#", node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_trigger"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_trigger"),
							node.tree.tag.drop_trigger
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#trigger_name#", node.text),
						);
					},
				},
			],
		},
		cm_eventtriggers: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_event_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_event_trigger"), node.tree.tag.create_eventtrigger);
					},
				},
				{
					text: t("tree.doc_event_triggers"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_event_triggers") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/event-triggers.html",
						);
					},
				},
			],
		},
		cm_eventtrigger: {
			elements: [
				{
					text: t("tree.alter_event_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_trigger"), node.tree.tag.alter_eventtrigger.replace("#trigger_name#", node.text));
					},
				},
				{
					text: t("tree.enable_event_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.enable_event_trigger"),
							node.tree.tag.enable_eventtrigger.replace("#trigger_name#", node.text),
						);
					},
				},
				{
					text: t("tree.disable_event_trigger"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.disable_event_trigger"),
							node.tree.tag.disable_eventtrigger.replace("#trigger_name#", node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_event_trigger"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_event_trigger"), node.tree.tag.drop_eventtrigger.replace("#trigger_name#", node.text));
					},
				},
			],
		},
		cm_inheriteds: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_inherited"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_inherited"),
							node.tree.tag.create_inherited.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_partitioning"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_partitioning") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-partitioning.html",
						);
					},
				},
			],
		},
		cm_inherited: {
			elements: [
				{
					text: t("tree.no_inherit_table"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.no_inherit_partition"),
							node.tree.tag.noinherit_partition
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#partition_name#", node.text),
						);
					},
				},
				{
					text: t("tree.drop_inherited"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_partition"), node.tree.tag.drop_partition.replace("#partition_name#", node.text));
					},
				},
			],
		},
		cm_partitions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_partition"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_partition"),
							node.tree.tag.create_partition.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
				{
					text: t("tree.doc_partitioning"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_partitioning") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/ddl-partitioning.html",
						);
					},
				},
			],
		},
		cm_partition: {
			elements: [
				{
					text: t("tree.detach_partition"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.detach_partition"),
							node.tree.tag.detach_partition
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace("#partition_name#", node.text),
						);
					},
				},
				{
					text: t("tree.drop_partition"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_partition"), node.tree.tag.drop_partition.replace("#partition_name#", node.text));
					},
				},
			],
		},
		cm_statistics: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_statistics"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_statistics"),
							node.tree.tag.create_statistics
								.replace("#table_name#", node.tag.schema + "." + node.parent.text)
								.replace("#schema_name#", node.tag.schema),
						);
					},
				},
				{
					text: t("tree.doc_statistics"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_statistics") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/planner-stats.html",
						);
					},
				},
			],
		},
		cm_statistic: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.alter_statistics"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_statistics"), node.tree.tag.alter_statistics.replace("#statistics_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_statistics"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_statistics"), node.tree.tag.drop_statistics.replace("#statistics_name#", node.text));
					},
				},
			],
		},
		cm_functions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_function"), node.tree.tag.create_function.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_functions"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_functions") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createfunction.html",
						);
					},
				},
			],
		},
		cm_function: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.select_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						TemplateSelectFunctionPostgresql(node.tag.schema, node.text, node.tag.id);
					},
				},
				{
					text: t("tree.edit_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getFunctionDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_function"), node.tree.tag.alter_function.replace("#function_name#", node.tag.id));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_function"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_function"), node.tree.tag.drop_function.replace("#function_name#", node.tag.id));
					},
				},
			],
		},
		cm_procedures: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_procedure"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_procedure"), node.tree.tag.create_procedure.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_procedures"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_procedures") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createprocedure.html",
						);
					},
				},
			],
		},
		cm_procedure: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.call_procedure"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						TemplateCallProcedurePostgresql(node.tag.schema, node.text, node.tag.id);
					},
				},
				{
					text: t("tree.edit_procedure"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getProcedureDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_procedure"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_procedure"), node.tree.tag.alter_procedure.replace("#procedure_name#", node.tag.id));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_procedure"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_procedure"), node.tree.tag.drop_procedure.replace("#procedure_name#", node.tag.id));
					},
				},
			],
		},
		cm_triggerfunctions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_trigger_function"),
							node.tree.tag.create_triggerfunction.replace("#schema_name#", node.tag.schema),
						);
					},
				},
				{
					text: t("tree.doc_trigger_functions"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_trigger_functions") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/plpgsql-trigger.html",
						);
					},
				},
			],
		},
		cm_triggerfunction: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getTriggerFunctionDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_trigger_function"),
							node.tree.tag.alter_triggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_trigger_function"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_trigger_function"),
							node.tree.tag.drop_triggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
			],
		},
		cm_direct_triggerfunction: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getTriggerFunctionDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_trigger_function"),
							node.tree.tag.alter_triggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_trigger_function"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_trigger_function"),
							node.tree.tag.drop_triggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
			],
		},
		cm_eventtriggerfunctions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_event_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_event_trigger_function"),
							node.tree.tag.create_eventtriggerfunction.replace("#schema_name#", node.tag.schema),
						);
					},
				},
				{
					text: t("tree.doc_event_trigger_functions"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_event_trigger_functions") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/functions-event-triggers.html",
						);
					},
				},
			],
		},
		cm_eventtriggerfunction: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_event_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getEventTriggerFunctionDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_event_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_event_trigger_function"),
							node.tree.tag.alter_eventtriggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_event_trigger_function"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_event_trigger_function"),
							node.tree.tag.drop_eventtriggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
			],
		},
		cm_direct_eventtriggerfunction: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.edit_event_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getEventTriggerFunctionDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_event_trigger_function"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_event_trigger_function"),
							node.tree.tag.alter_eventtriggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_event_trigger_function"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_event_trigger_function"),
							node.tree.tag.drop_eventtriggerfunction.replace("#function_name#", node.tag.id),
						);
					},
				},
			],
		},
		cm_aggregates: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) {
							refreshTreePostgresql(node);
						} else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_aggregate"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_aggregate"), node.tree.tag.create_aggregate.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_aggregates"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_aggregates") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createaggregate.html",
						);
					},
				},
			],
		},
		cm_aggregate: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) {
							refreshTreePostgresql(node);
						} else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.alter_aggregate"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_aggregate"), node.tree.tag.alter_aggregate.replace("#aggregate_name#", node.tag.id));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_aggregate"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_aggregate"), node.tree.tag.drop_aggregate.replace("#aggregate_name#", node.tag.id));
					},
				},
			],
		},
		cm_sequences: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_sequence"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_sequence"), node.tree.tag.create_sequence.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_sequences"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_sequences") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createsequence.html",
						);
					},
				},
			],
		},
		cm_sequence: {
			elements: [
				{
					text: t("tree.alter_sequence"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_sequence"),
							node.tree.tag.alter_sequence.replace("#sequence_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_sequence"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_sequence"),
							node.tree.tag.drop_sequence.replace("#sequence_name#", node.parent.parent.text + "." + node.text),
						);
					},
				},
			],
		},
		cm_views: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_view"), node.tree.tag.create_view.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_views"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_views") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createview.html",
						);
					},
				},
			],
		},
		cm_view: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.query_data"),
					icon: "fas cm-all fa-search",
					action: function (node) {
						TemplateSelectPostgresql(node.parent.parent.text, node.text, "v");
					},
				},
				{
					text: t("tree.edit_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getViewDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_view"),
							node.tree.tag.alter_view.replace(/#view_name#/g, node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_view"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_view"),
							node.tree.tag.drop_view.replace("#view_name#", node.tag.schema + "." + node.text),
						);
					},
				},
			],
		},
		cm_mviews: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_mat_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							t("tree.create_materialized_view"),
							node.tree.tag.create_mview.replace("#schema_name#", node.tag.schema),
						);
					},
				},
				{
					text: t("tree.doc_mat_views"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_materialized_views") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-creatematerializedview.html",
						);
					},
				},
			],
		},
		cm_mview: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.query_data"),
					icon: "fas cm-all fa-search",
					action: function (node) {
						TemplateSelectPostgresql(node.tag.schema, node.text, "m");
					},
				},
				{
					text: t("tree.edit_mat_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						v_connTabControl.tag.createQueryTab(node.text);
						getMaterializedViewDefinitionPostgresql(node);
					},
				},
				{
					text: t("tree.alter_mat_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							t("tree.alter_materialized_view"),
							node.tree.tag.alter_mview.replace("#view_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.refresh_mat_view"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(
							t("tree.refresh_materialized_view"),
							node.tree.tag.refresh_mview.replace("#view_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.analyze_mat_view"),
					icon: "fas cm-all fa-search-plus",
					action: function (node) {
						tabSQLTemplate(t("tree.analyze_mat_view"),
							node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_mat_view"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							t("tree.drop_materialized_view"),
							node.tree.tag.drop_mview.replace("#view_name#", node.tag.schema + "." + node.text),
						);
					},
				},
			],
		},
		cm_physicalreplicationslots: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_slot"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_physical_replication_slot"), node.tree.tag.create_physicalreplicationslot);
					},
				},
				{
					text: t("tree.doc_replication_slots"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_physical_replication_slots") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/warm-standby.html#streaming-replication-slots",
						);
					},
				},
			],
		},
		cm_physicalreplicationslot: {
			elements: [
				{
					text: t("tree.drop_slot"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							t("tree.drop_physical_replication_slot"),
							node.tree.tag.drop_physicalreplicationslot.replace("#slot_name#", node.text),
						);
					},
				},
			],
		},
		cm_logicalreplicationslots: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_slot"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_logical_replication_slot"), node.tree.tag.create_logicalreplicationslot);
					},
				},
				{
					text: t("tree.doc_replication_slots"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_logical_replication_slots") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/logicaldecoding-explanation.html#logicaldecoding-replication-slots",
						);
					},
				},
			],
		},
		cm_logicalreplicationslot: {
			elements: [
				{
					text: t("tree.drop_slot"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(
							t("tree.drop_logical_replication_slot"),
							node.tree.tag.drop_logicalreplicationslot.replace("#slot_name#", node.text),
						);
					},
				},
			],
		},
		cm_publications: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_publication"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_publication"), node.tree.tag.create_publication);
					},
				},
				{
					text: t("tree.doc_publications"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_publications") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/logical-replication-publication.html",
						);
					},
				},
			],
		},
		cm_publication: {
			elements: [
				{
					text: t("tree.alter_publication"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_publication"), node.tree.tag.alter_publication.replace("#pub_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_publication"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_publication"), node.tree.tag.drop_publication.replace("#pub_name#", node.text));
					},
				},
			],
		},
		cm_pubtables: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.add_table"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.add_table"), node.tree.tag.add_pubtable.replace("#pub_name#", node.parent.text));
					},
				},
			],
		},
		cm_pubtable: {
			elements: [
				{
					text: t("tree.drop_table"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_table"),
							node.tree.tag.drop_pubtable
								.replace("#pub_name#", node.parent.parent.text)
								.replace("#table_name#", node.text),
						);
					},
				},
			],
		},
		cm_subscriptions: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_subscription"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_subscription"), node.tree.tag.create_subscription);
					},
				},
				{
					text: t("tree.doc_subscriptions"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_subscriptions") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/logical-replication-subscription.html",
						);
					},
				},
			],
		},
		cm_subscription: {
			elements: [
				{
					text: t("tree.alter_subscription"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_subscription"), node.tree.tag.alter_subscription.replace("#sub_name#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_subscription"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_subscription"), node.tree.tag.drop_subscription.replace("#sub_name#", node.text));
					},
				},
			],
		},
		cm_fdws: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_foreign_data_wrapper"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_foreign_data_wrapper"), node.tree.tag.create_fdw);
					},
				},
				{
					text: t("tree.doc_foreign_data_wrappers"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_foreign_data_wrappers") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/postgres-fdw.html",
						);
					},
				},
			],
		},
		cm_fdw: {
			elements: [
				{
					text: t("tree.alter_foreign_data_wrapper"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_foreign_data_wrapper"), node.tree.tag.alter_fdw.replace("#fdwname#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_foreign_data_wrapper"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_foreign_data_wrapper"), node.tree.tag.drop_fdw.replace("#fdwname#", node.text));
					},
				},
			],
		},
		cm_foreign_servers: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_foreign_server"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_foreign_server"),
							node.tree.tag.create_foreign_server.replace("#fdwname#", node.parent.text),
						);
					},
				},
			],
		},
		cm_foreign_server: {
			elements: [
				{
					text: t("tree.alter_foreign_server"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_foreign_server"), node.tree.tag.alter_foreign_server.replace("#srvname#", node.text));
					},
				},
				{
					text: t("tree.import_foreign_schema"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.import_foreign_schema"), node.tree.tag.import_foreign_schema.replace("#srvname#", node.text));
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_foreign_server"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_foreign_server"), node.tree.tag.drop_foreign_server.replace("#srvname#", node.text));
					},
				},
			],
		},
		cm_user_mappings: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_user_mapping"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_user_mapping"),
							node.tree.tag.create_user_mapping.replace("#srvname#", node.parent.text),
						);
					},
				},
			],
		},
		cm_user_mapping: {
			elements: [
				{
					text: t("tree.alter_user_mapping"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_user_mapping"),
							node.tree.tag.alter_user_mapping
								.replace("#user_name#", node.text)
								.replace("#srvname#", node.parent.parent.text),
						);
					},
				},
				{
					text: t("tree.drop_user_mapping"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_user_mapping"),
							node.tree.tag.drop_user_mapping
								.replace("#user_name#", node.text)
								.replace("#srvname#", node.parent.parent.text),
						);
					},
				},
			],
		},
		cm_foreign_tables: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_foreign_table"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_foreign_table"),
							node.tree.tag.create_foreign_table.replace("#schema_name#", node.tag.schema),
						);
					},
				},
			],
		},
		cm_foreign_table: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.data_actions"),
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: t("tree.query_data"),
								icon: "fas cm-all fa-search",
								action: function (node) {
									TemplateSelectPostgresql(node.tag.schema, node.text, "f");
								},
							},
							{
								text: t("tree.edit_data"),
								icon: "fas cm-all fa-table",
								action: function (node) {
									v_startEditData(node.text, node.tag.schema);
								},
							},
							{
								text: t("tree.insert_record"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateInsertPostgresql(node.tag.schema, node.text);
								},
							},
							{
								text: t("tree.update_records"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									TemplateUpdatePostgresql(node.tag.schema, node.text);
								},
							},
							{
								text: t("tree.delete_records"),
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(t("tree.delete_records"),
										node.tree.tag.delete.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
						],
					},
				},
				{
					text: t("tree.table_actions"),
					icon: "fas cm-all fa-list",
					submenu: {
						elements: [
							{
								text: t("tree.analyze_foreign_table"),
								icon: "fas cm-all fa-table",
								action: function (node) {
									tabSQLTemplate(t("tree.analyze_foreign_table"),
										node.tree.tag.analyze_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.alter_foreign_table"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									tabSQLTemplate(t("tree.alter_foreign_table"),
										node.tree.tag.alter_foreign_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
							{
								text: t("tree.edit_comment"),
								icon: "fas cm-all fa-edit",
								action: function (node) {
									getObjectDescriptionPostgresql(node);
								},
							},
							{
								text: t("tree.drop_foreign_table"),
								icon: "fas cm-all fa-times",
								action: function (node) {
									tabSQLTemplate(t("tree.drop_foreign_table"),
										node.tree.tag.drop_foreign_table.replace("#table_name#", node.tag.schema + "." + node.text),
									);
								},
							},
						],
					},
				},
			],
		},
		cm_foreign_columns: {
			elements: [
				{
					text: t("tree.create_foreign_column"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_foreign_column"),
							node.tree.tag.create_foreign_column.replace("#table_name#", node.tag.schema + "." + node.parent.text),
						);
					},
				},
			],
		},
		cm_foreign_column: {
			elements: [
				{
					text: t("tree.alter_foreign_column"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_foreign_column"),
							node.tree.tag.alter_foreign_column
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
				{
					text: t("tree.drop_foreign_column"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_foreign_column"),
							node.tree.tag.drop_foreign_column
								.replace("#table_name#", node.tag.schema + "." + node.parent.parent.text)
								.replace(/#column_name#/g, node.text),
						);
					},
				},
			],
		},
		cm_types: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_type"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_type"), node.tree.tag.create_type.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_types"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_types") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createtype.html",
						);
					},
				},
			],
		},
		cm_type: {
			elements: [
				{
					text: t("tree.alter_type"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_type"),
							node.tree.tag.alter_type.replace("#type_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_type"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_type"),
							node.tree.tag.drop_type.replace("#type_name#", node.tag.schema + "." + node.text),
						);
					},
				},
			],
		},
		cm_domains: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
				{
					text: t("tree.create_domain"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.create_domain"), node.tree.tag.create_domain.replace("#schema_name#", node.tag.schema));
					},
				},
				{
					text: t("tree.doc_domains"),
					icon: "fas cm-all fa-globe-americas",
					action: function (node) {
						v_connTabControl.tag.createWebsiteTab(
							t("tree.documentation_title", { name: t("tree.topic_domains") }),
							"https://www.postgresql.org/docs/" +
								getMajorVersionPostgresql(node.tree.tag.version) +
								"/static/sql-createdomain.html",
						);
					},
				},
			],
		},
		cm_domain: {
			elements: [
				{
					text: t("tree.alter_domain"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						tabSQLTemplate(t("tree.alter_domain"),
							node.tree.tag.alter_domain.replace("#domain_name#", node.tag.schema + "." + node.text),
						);
					},
				},
				{
					text: t("tree.edit_comment"),
					icon: "fas cm-all fa-edit",
					action: function (node) {
						getObjectDescriptionPostgresql(node);
					},
				},
				{
					text: t("tree.drop_domain"),
					icon: "fas cm-all fa-times",
					action: function (node) {
						tabSQLTemplate(t("tree.drop_domain"),
							node.tree.tag.drop_domain.replace("#domain_name#", node.tag.schema + "." + node.text),
						);
					},
				},
			],
		},
		cm_partitioned_parent: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
			],
		},
		cm_inherited_parent: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
						else {
							node.collapseNode();
							node.expandNode();
						}
					},
				},
			],
		},
		cm_refresh: {
			elements: [
				{
					text: t("tree.refresh"),
					icon: "fas cm-all fa-sync-alt",
					action: function (node) {
						if (node.childNodes == 0) refreshTreePostgresql(node);
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
		'<div class="omnidb__switch omnidb__switch--sm float-end" title="Toggle autocomplete.\nSwitch OFF disables the autocomplete on the inner tabs for this connection.">' +
		'<input type="checkbox" ' +
		v_autocomplete_switch_status +
		' id="autocomplete_toggler_' +
		v_connTabControl.selectedTab.tag.tab_id +
		'" class="omnidb__switch--input">' +
		'<label for="autocomplete_toggler_' +
		v_connTabControl.selectedTab.tag.tab_id +
		'" class="omnidb__switch--label"><span><i class="fas fa-spell-check"></i></span></label>' +
		"</div>";

	// Binding for the autocomplete switch just built above, replacing the
	// onchange attribute that spliced the element's own id into itself as a string
	// literal -- see dom_event_bindings.js and README.md.
	/** @type {HTMLElement} */ (
		document.getElementById("autocomplete_toggler_" + v_connTabControl.selectedTab.tag.tab_id)
	).addEventListener("change", (event) => toggleConnectionAutocomplete(/** @type {HTMLElement} */ (event.target).id));

	tree.nodeAfterOpenEvent = function (node) {
		refreshTreePostgresql(node);
		// Adjusting scroll position of tree
		try {
			let v_first_child_toggle = node.elementUl.childNodes[0].childNodes[0].childNodes[0].childNodes[0];
			let pos_x = v_first_child_toggle.offsetLeft - 24;
			let pos_y = v_first_child_toggle.offsetTop - 64;
			v_connTabControl.selectedTab.tag.divTree.scroll(pos_x, pos_y);
		} catch (e) {}
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
			getPropertiesPostgresql(node);
		} else {
			// Do nothing
		}
	};

	tree.beforeContextMenuEvent = function (node, callback) {
		var v_elements = [];
		//Hooks
		if (v_connTabControl.tag.hooks.postgresqlTreeContextMenu.length > 0) {
			for (var i = 0; i < v_connTabControl.tag.hooks.postgresqlTreeContextMenu.length; i++)
				v_elements = v_elements.concat(v_connTabControl.tag.hooks.postgresqlTreeContextMenu[i](node));
		}

		var v_customCallback = function () {
			callback(v_elements);
		};
		checkCurrentDatabase(node, false, v_customCallback);
	};

	var node_server = tree.createNode(
		"PostgreSQL",
		false,
		"node-postgresql",
		null,
		{
			type: "server",
		},
		"cm_server",
	);
	node_server.createChildNode("", true, "node-spin", null, null);
	tree.drawTree();
}

export function checkCurrentDatabase(p_node, p_complete_check, p_callback_continue, p_callback_stop) {
	if (
		p_node.tag != null &&
		p_node.tag.database != null &&
		p_node.tag.database != v_connTabControl.selectedTab.tag.selectedDatabase &&
		(p_complete_check || (!p_complete_check && p_node.tag.type != "database"))
	) {
		// Tracks whether Yes/No actually ran, so the fallback below (dialog
		// dismissed via the X button, Escape or a backdrop click - none of
		// which invoke either callback) still resolves the node instead of
		// leaving it expanded with its spinner stuck forever.
		var v_choice_made = false;

		showConfirm3(
			"",
			function () {
				v_choice_made = true;
				var v_call_back_continue = p_callback_continue;
				var v_call_back_stop = p_callback_stop;

				checkBeforeChangeDatabase(
					function () {
						if (p_callback_stop) p_callback_stop();
					},
					function () {
						execAjax(
							"/change_active_database/",
							JSON.stringify({
								p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
								p_tab_id: v_connTabControl.selectedTab.id,
								p_database: p_node.tag.database,
							}),
							function (p_return) {
								(function () {
									var v_det = v_connTabControl.selectedTab.tag.divDetails;
									v_det.innerHTML = "Active database: <b></b>";
									v_det.querySelector("b").textContent = p_node.tag.database;
								})();

								// selectedDatabaseNode can still be unset here (e.g. the
								// initial database list never found a match to bold - see
								// getTreeDetailsPostgresql's selectedDatabase sync for the
								// root-cause fix); guard instead of throwing, which used to
								// abort this whole callback before p_callback_continue ran,
								// leaving the node's spinner stuck forever.
								if (v_connTabControl.selectedTab.tag.selectedDatabaseNode) {
									v_connTabControl.selectedTab.tag.selectedDatabaseNode.clearNodeBold();
								}
								//searching new selected database node
								var v_list_database_nodes = p_node.tree.childNodes[0].childNodes[0].childNodes;
								for (var i = 0; i < v_list_database_nodes.length; i++) {
									if (p_node.tag.database == v_list_database_nodes[i].text.replace(/"/g, "")) {
										v_list_database_nodes[i].setNodeBold();
										v_connTabControl.selectedTab.tag.selectedDatabase = p_node.tag.database;
										v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_list_database_nodes[i];

										(function () {
											var v_tag = v_connTabControl.selectedTab.tag;
											// The DBMS icon already lives in the tab's own icon slot; only the text changes.
											v_tag.tabTitle.innerHTML = "";
											var v_text = v_tag.selectedTitle
												? " " + v_tag.selectedTitle + " - " + v_tag.selectedDatabase
												: " " + v_tag.selectedDatabase;
											v_tag.tabTitle.appendChild(document.createTextNode(v_text));
										})();
									}
								}
								if (p_callback_continue) p_callback_continue();
							},
							function (p_return) {
								nodeOpenErrorPostgresql(p_return, p_node);
							},
							"box",
						);
					},
				);
			},
			function () {
				v_choice_made = true;
				if (p_callback_stop) p_callback_stop();
			},
		);

		// Bootstrap dispatches "hidden.bs.modal" as a real DOM event, no jQuery needed to listen for it.
		/** @type {HTMLElement} */ (document.getElementById("modal_message")).addEventListener(
			"hidden.bs.modal",
			function () {
				if (!v_choice_made && p_callback_stop) p_callback_stop();
			},
			{ once: true },
		);

		// Built as DOM nodes, not an HTML string — showConfirm3's content div
		// only renders plain text (see notification_control.js). Safe to
		// append right after the call above: showConfirm3 sets the (empty)
		// content synchronously before this line runs, and nothing else
		// touches modal_message_content before the modal is actually shown.
		var v_content_div = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
		v_content_div.appendChild(document.createTextNode(t("tree.confirm_switch_database_prefix")));
		var v_bold = document.createElement("b");
		v_bold.textContent = p_node.tag.database;
		v_content_div.appendChild(v_bold);
		v_content_div.appendChild(document.createTextNode(t("tree.confirm_switch_database_suffix")));
	} else p_callback_continue();
}

/**
 * Get comment based on node type and oid.
 * {object} p_node - the node which comment will be fetched
 */
export function getObjectDescriptionPostgresql(p_node) {
	var v_oid = null;
	var v_type = p_node.tag.type;
	/** @type {any} */
	var v_position = null;

	if (v_type == "table_field") {
		v_oid = p_node.parent.parent.tag.oid;
		v_position = p_node.tag.position;
	} else if (
		[
			"function",
			"triggerfunction",
			"direct_triggerfunction",
			"eventtriggerfunction",
			"direct_eventtriggerfunction",
			"procedure",
		].indexOf(v_type) != -1
	) {
		v_oid = p_node.tag.function_oid;
		v_position = 0;
	} else {
		v_oid = p_node.tag.oid;
		v_position = 0;
	}

	execAjax(
		"/get_object_description_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_oid: v_oid,
			p_type: v_type,
			p_position: v_position,
		}),
		function (p_return) {
			v_connTabControl.tag.createQueryTab(p_node.text + " Comment");

			var v_editor = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor;
			v_editor.setValue(p_return.v_data);
			v_editor.clearSelection();
			v_editor.gotoLine(0, 0, true);

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, p_node);
		},
		"box",
		true,
	);
}

/**
 * Exports the whole database as a DBML document (pg_dbml's introspection
 * query, see go-server/postgresql_export_dbml.sql) and hands the result to
 * the same native-save-dialog flow the query-export toolbar uses (see
 * inner_query_tab.js's v_export_data) -- reused as-is rather than
 * reinvented, via the existing /export_save_dialog/ endpoint. In browser
 * mode (no native dialog available), asks Download/Cancel instead of just
 * dropping a link in an alert -- Cancel discards the generated temp file via
 * /discard_export_file/ rather than leaving it for cleanTempFolder's 24h
 * sweep.
 *
 * Sends p_node.tag.database explicitly (rather than letting the backend
 * fall back to the tab's "active database") -- checkCurrentDatabase is a
 * no-op for a database-type node when called non-strictly, so simply
 * right-clicking a sibling database never switches the tab's active one;
 * without this the export could silently target the wrong database (or, if
 * the tab never had one switched to at all, produce an empty ".dbml"
 * download name).
 * @param {any} p_node
 */
export function exportDBMLPostgresql(p_node) {
	execAjax(
		"/export_dbml_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_database: p_node.tag.database,
		}),
		function (p_return) {
			deliverExportFile(p_return.v_data);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, p_node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Refreshing tree node.
/// </summary>
/// <param name="node">Node object.</param>
export function refreshTreePostgresql(p_node) {
	checkCurrentDatabase(
		p_node,
		true,
		function () {
			refreshTreePostgresqlConfirm(p_node);
		},
		function () {
			p_node.collapseNode();
		},
	);
}

/// <summary>
/// Refreshing tree node.
/// </summary>
/// <param name="node">Node object.</param>
export function getPropertiesPostgresql(p_node) {
	checkCurrentDatabase(p_node, false, function () {
		getPropertiesPostgresqlConfirm(p_node);
	});
}

/// <summary>
/// Retrieving properties.
/// </summary>
/// <param name="node">Node object.</param>
export function getPropertiesPostgresqlConfirm(node) {
	if (node.tag != undefined) {
		if (node.tag.type == "role") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "tablespace") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "database") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "extension") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "schema") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "table") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "table_field") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "sequence") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "view") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "mview") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "function") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "procedure") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "trigger") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "eventtrigger") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "triggerfunction") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "direct_triggerfunction") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "eventtriggerfunction") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "direct_eventtriggerfunction") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "index") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "pk") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "foreign_key") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "unique") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "check") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "exclude") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "rule") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: node.parent.parent.text,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "foreign_table") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "user_mapping") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.foreign_server,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "foreign_server") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "fdw") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "type") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "domain") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "publication") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "subscription") {
			getProperties("/get_properties_postgresql/", {
				p_schema: null,
				p_table: null,
				p_object: node.text,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "statistic") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.statistics,
				p_type: node.tag.type,
			});
		} else if (node.tag.type == "aggregate") {
			getProperties("/get_properties_postgresql/", {
				p_schema: node.tag.schema,
				p_table: null,
				p_object: node.tag.id,
				p_type: node.tag.type,
			});
		} else {
			clearProperties();
		}
	}

	//Hooks
	if (v_connTabControl.tag.hooks.postgresqlTreeNodeClick.length > 0) {
		for (var i = 0; i < v_connTabControl.tag.hooks.postgresqlTreeNodeClick.length; i++)
			v_connTabControl.tag.hooks.postgresqlTreeNodeClick[i](node);
	}
}

/// <summary>
/// Refreshing tree node confirm.
/// </summary>
/// <param name="node">Node object.</param>
export function refreshTreePostgresqlConfirm(node) {
	if (node.tag != undefined)
		if (node.tag.type == "schema_list") {
			getSchemasPostgresql(node);
		} else if (node.tag.type == "table_list") {
			getTablesPostgresql(node);
		} else if (node.tag.type == "table") {
			getColumnsPostgresql(node);
		} else if (node.tag.type == "primary_key") {
			getPKPostgresql(node);
		} else if (node.tag.type == "pk") {
			getPKColumnsPostgresql(node);
		} else if (node.tag.type == "uniques") {
			getUniquesPostgresql(node);
		} else if (node.tag.type == "unique") {
			getUniquesColumnsPostgresql(node);
		} else if (node.tag.type == "foreign_keys") {
			getFKsPostgresql(node);
		} else if (node.tag.type == "foreign_key") {
			getFKsColumnsPostgresql(node);
		} else if (node.tag.type == "view_list") {
			getViewsPostgresql(node);
		} else if (node.tag.type == "view") {
			getViewsColumnsPostgresql(node);
		} else if (node.tag.type == "mview_list") {
			getMaterializedViewsPostgresql(node);
		} else if (node.tag.type == "mview") {
			getMaterializedViewsColumnsPostgresql(node);
		} else if (node.tag.type == "indexes") {
			getIndexesPostgresql(node);
		} else if (node.tag.type == "index") {
			getIndexesColumnsPostgresql(node);
		} else if (node.tag.type == "function_list") {
			getFunctionsPostgresql(node);
		} else if (node.tag.type == "function") {
			getFunctionFieldsPostgresql(node);
		} else if (node.tag.type == "procedure_list") {
			getProceduresPostgresql(node);
		} else if (node.tag.type == "procedure") {
			getProcedureFieldsPostgresql(node);
		} else if (node.tag.type == "sequence_list") {
			getSequencesPostgresql(node);
		} else if (node.tag.type == "database_list") {
			getDatabasesPostgresql(node);
		} else if (node.tag.type == "database") {
			getDatabaseObjectsPostgresql(node);
		} else if (node.tag.type == "tablespace_list") {
			getTablespacesPostgresql(node);
		} else if (node.tag.type == "role_list") {
			getRolesPostgresql(node);
		} else if (node.tag.type == "extension_list") {
			getExtensionsPostgresql(node);
		} else if (node.tag.type == "check_list") {
			getChecksPostgresql(node);
		} else if (node.tag.type == "exclude_list") {
			getExcludesPostgresql(node);
		} else if (node.tag.type == "rule_list") {
			getRulesPostgresql(node);
		} else if (node.tag.type == "trigger_list") {
			getTriggersPostgresql(node);
		} else if (node.tag.type == "eventtrigger_list") {
			getEventTriggersPostgresql(node);
		} else if (node.tag.type == "triggerfunction_list") {
			getTriggerFunctionsPostgresql(node);
		} else if (node.tag.type == "eventtriggerfunction_list") {
			getEventTriggerFunctionsPostgresql(node);
		} else if (node.tag.type == "inherited_list") {
			getInheritedsPostgresql(node);
		} else if (node.tag.type == "partition_list") {
			getPartitionsPostgresql(node);
		} else if (node.tag.type == "server") {
			getTreeDetailsPostgresql(node);
		} else if (node.tag.type == "physicalreplicationslot_list") {
			getPhysicalReplicationSlotsPostgresql(node);
		} else if (node.tag.type == "logicalreplicationslot_list") {
			getLogicalReplicationSlotsPostgresql(node);
		} else if (node.tag.type == "publication_list") {
			getPublicationsPostgresql(node);
		} else if (node.tag.type == "subscription_list") {
			getSubscriptionsPostgresql(node);
		} else if (node.tag.type == "publication_table_list") {
			getPublicationTablesPostgresql(node);
		} else if (node.tag.type == "subscription_table_list") {
			getSubscriptionTablesPostgresql(node);
		} else if (node.tag.type == "fdw_list") {
			getForeignDataWrappersPostgresql(node);
		} else if (node.tag.type == "foreign_server_list") {
			getForeignServersPostgresql(node);
		} else if (node.tag.type == "user_mapping_list") {
			getUserMappingsPostgresql(node);
		} else if (node.tag.type == "foreign_table_list") {
			getForeignTablesPostgresql(node);
		} else if (node.tag.type == "foreign_table") {
			getForeignColumnsPostgresql(node);
		} else if (node.tag.type == "type_list") {
			getTypesPostgresql(node);
		} else if (node.tag.type == "domain_list") {
			getDomainsPostgresql(node);
		} else if (node.tag.type == "partitioned_table_list") {
			getPartitionedParentsPostgresql(node);
		} else if (node.tag.type == "inherited_table_list") {
			getInheritedsParentsPostgresql(node);
		} else if (node.tag.type == "partitioned_parent") {
			getPartitionedChildrenPostgresql(node);
		} else if (node.tag.type == "inherited_parent") {
			getInheritedsChildrenPostgresql(node);
		} else if (node.tag.type == "statistics_list") {
			getStatisticsPostgresql(node);
		} else if (node.tag.type == "statistic") {
			getStatisticsColumnsPostgresql(node);
		} else if (node.tag.type == "aggregate_list") {
			getAggregatesPostgresql(node);
		} else if (node.tag.type == "aggregate") {
			getFunctionFieldsPostgresql(node);
		} else {
			afterNodeOpenedCallbackPostgreSQL(node);
		}
}

export function afterNodeOpenedCallbackPostgreSQL(node) {
	//Hooks
	if (v_connTabControl.tag.hooks.postgresqlTreeNodeOpen.length > 0) {
		for (var i = 0; i < v_connTabControl.tag.hooks.postgresqlTreeNodeOpen.length; i++)
			v_connTabControl.tag.hooks.postgresqlTreeNodeOpen[i](node);
	}
}

/// <summary>
/// Retrieving tree details.
/// </summary>
/// <param name="node">Node object.</param>
export function getTreeDetailsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_tree_info_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			// Authoritative source for "which database is this tab actually
			// connected to" — current_database(), queried live by the backend
			// for this exact tab/connection. selectedDatabase otherwise starts
			// out as whatever the saved connection's Database field says
			// (workspace.js's changeDatabase()), which can drift from the live
			// name (left blank for connection-string-only connections, a typo,
			// a renamed database, ...). Left out of sync, the database node
			// that's actually active never matches on expand, checkCurrentDatabase
			// wrongly treats it as a different database, and switching to
			// "itself" never converges since nothing ever changes the value it's
			// being compared against.
			v_connTabControl.selectedTab.tag.selectedDatabase = p_return.v_data.v_database_return.v_database;

			node.tree.contextMenu.cm_server.elements = [];
			node.tree.contextMenu.cm_server.elements.push({
				text: t("tree.refresh"),
				icon: "fas cm-all fa-sync-alt",
				action: function (node) {
					if (node.childNodes == 0) refreshTreePostgresql(node);
					else {
						node.collapseNode();
						node.expandNode();
					}
				},
			});
			node.tree.contextMenu.cm_server.elements.push({
				text: t("tree.monitoring"),
				icon: "fas cm-all fa-chart-line",
				action: function (node) {},
				submenu: {
					elements: [
						{
							text: t("tree.dashboard"),
							icon: "fas cm-all fa-chart-line",
							action: function (node) {
								switchSection("monitoring");
							},
						},
					],
				},
			});
			node.tree.contextMenu.cm_server.elements.push({
				text: t("tree.doc_postgresql"),
				icon: "fas cm-all fa-globe-americas",
				action: function (node) {
					v_connTabControl.tag.createWebsiteTab(
						t("tree.documentation_title", { name: t("tree.topic_postgresql") }),
						"https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/",
					);
				},
			});
			node.tree.contextMenu.cm_server.elements.push({
				text: t("tree.doc_sql_language"),
				icon: "fas cm-all fa-globe-americas",
				action: function (node) {
					v_connTabControl.tag.createWebsiteTab(
						t("tree.documentation_title", { name: t("tree.topic_sql_language") }),
						"https://www.postgresql.org/docs/" + getMajorVersionPostgresql(node.tree.tag.version) + "/static/sql.html",
					);
				},
			});
			node.tree.contextMenu.cm_server.elements.push({
				text: t("tree.doc_sql_commands"),
				icon: "fas cm-all fa-globe-americas",
				action: function (node) {
					v_connTabControl.tag.createWebsiteTab(
						t("tree.documentation_title", { name: t("tree.topic_sql_commands") }),
						"https://www.postgresql.org/docs/" +
							getMajorVersionPostgresql(node.tree.tag.version) +
							"/static/sql-commands.html",
					);
				},
			});

			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tree.tag = {
				version: p_return.v_data.v_database_return.version,
				//superuser: p_return.v_data.v_database_return.superuser,
				create_role: p_return.v_data.v_database_return.create_role,
				alter_role: p_return.v_data.v_database_return.alter_role,
				drop_role: p_return.v_data.v_database_return.drop_role,
				create_tablespace: p_return.v_data.v_database_return.create_tablespace,
				alter_tablespace: p_return.v_data.v_database_return.alter_tablespace,
				drop_tablespace: p_return.v_data.v_database_return.drop_tablespace,
				create_database: p_return.v_data.v_database_return.create_database,
				alter_database: p_return.v_data.v_database_return.alter_database,
				drop_database: p_return.v_data.v_database_return.drop_database,
				create_extension: p_return.v_data.v_database_return.create_extension,
				alter_extension: p_return.v_data.v_database_return.alter_extension,
				drop_extension: p_return.v_data.v_database_return.drop_extension,
				create_schema: p_return.v_data.v_database_return.create_schema,
				alter_schema: p_return.v_data.v_database_return.alter_schema,
				drop_schema: p_return.v_data.v_database_return.drop_schema,
				create_sequence: p_return.v_data.v_database_return.create_sequence,
				alter_sequence: p_return.v_data.v_database_return.alter_sequence,
				drop_sequence: p_return.v_data.v_database_return.drop_sequence,
				create_function: p_return.v_data.v_database_return.create_function,
				alter_function: p_return.v_data.v_database_return.alter_function,
				drop_function: p_return.v_data.v_database_return.drop_function,
				create_procedure: p_return.v_data.v_database_return.create_procedure,
				alter_procedure: p_return.v_data.v_database_return.alter_procedure,
				drop_procedure: p_return.v_data.v_database_return.drop_procedure,
				create_triggerfunction: p_return.v_data.v_database_return.create_triggerfunction,
				alter_triggerfunction: p_return.v_data.v_database_return.alter_triggerfunction,
				drop_triggerfunction: p_return.v_data.v_database_return.drop_triggerfunction,
				create_eventtriggerfunction: p_return.v_data.v_database_return.create_eventtriggerfunction,
				alter_eventtriggerfunction: p_return.v_data.v_database_return.drop_eventtriggerfunction,
				drop_eventtriggerfunction: p_return.v_data.v_database_return.drop_eventtriggerfunction,
				create_aggregate: p_return.v_data.v_database_return.create_aggregate,
				alter_aggregate: p_return.v_data.v_database_return.alter_aggregate,
				drop_aggregate: p_return.v_data.v_database_return.drop_aggregate,
				create_view: p_return.v_data.v_database_return.create_view,
				alter_view: p_return.v_data.v_database_return.alter_view,
				drop_view: p_return.v_data.v_database_return.drop_view,
				create_mview: p_return.v_data.v_database_return.create_mview,
				refresh_mview: p_return.v_data.v_database_return.refresh_mview,
				alter_mview: p_return.v_data.v_database_return.alter_mview,
				drop_mview: p_return.v_data.v_database_return.drop_mview,
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
				reindex: p_return.v_data.v_database_return.reindex,
				drop_index: p_return.v_data.v_database_return.drop_index,
				create_check: p_return.v_data.v_database_return.create_check,
				drop_check: p_return.v_data.v_database_return.drop_check,
				create_exclude: p_return.v_data.v_database_return.create_exclude,
				drop_exclude: p_return.v_data.v_database_return.drop_exclude,
				create_rule: p_return.v_data.v_database_return.create_rule,
				alter_rule: p_return.v_data.v_database_return.alter_rule,
				drop_rule: p_return.v_data.v_database_return.drop_rule,
				create_trigger: p_return.v_data.v_database_return.create_trigger,
				create_view_trigger: p_return.v_data.v_database_return.create_view_trigger,
				alter_trigger: p_return.v_data.v_database_return.alter_trigger,
				enable_trigger: p_return.v_data.v_database_return.enable_trigger,
				disable_trigger: p_return.v_data.v_database_return.disable_trigger,
				drop_trigger: p_return.v_data.v_database_return.drop_trigger,
				create_eventtrigger: p_return.v_data.v_database_return.create_eventtrigger,
				alter_eventtrigger: p_return.v_data.v_database_return.alter_eventtrigger,
				enable_eventtrigger: p_return.v_data.v_database_return.enable_eventtrigger,
				disable_eventtrigger: p_return.v_data.v_database_return.disable_eventtrigger,
				drop_eventtrigger: p_return.v_data.v_database_return.drop_eventtrigger,
				create_inherited: p_return.v_data.v_database_return.create_inherited,
				noinherit_partition: p_return.v_data.v_database_return.noinherit_partition,
				create_partition: p_return.v_data.v_database_return.create_partition,
				detach_partition: p_return.v_data.v_database_return.detach_partition,
				drop_partition: p_return.v_data.v_database_return.drop_partition,
				vacuum: p_return.v_data.v_database_return.vacuum,
				vacuum_table: p_return.v_data.v_database_return.vacuum_table,
				analyze: p_return.v_data.v_database_return.analyze,
				analyze_table: p_return.v_data.v_database_return.analyze_table,
				delete: p_return.v_data.v_database_return.delete,
				truncate: p_return.v_data.v_database_return.truncate,
				create_physicalreplicationslot: p_return.v_data.v_database_return.create_physicalreplicationslot,
				drop_physicalreplicationslot: p_return.v_data.v_database_return.drop_physicalreplicationslot,
				create_logicalreplicationslot: p_return.v_data.v_database_return.create_logicalreplicationslot,
				drop_logicalreplicationslot: p_return.v_data.v_database_return.drop_logicalreplicationslot,
				create_publication: p_return.v_data.v_database_return.create_publication,
				alter_publication: p_return.v_data.v_database_return.alter_publication,
				drop_publication: p_return.v_data.v_database_return.drop_publication,
				add_pubtable: p_return.v_data.v_database_return.add_pubtable,
				drop_pubtable: p_return.v_data.v_database_return.drop_pubtable,
				create_subscription: p_return.v_data.v_database_return.create_subscription,
				alter_subscription: p_return.v_data.v_database_return.alter_subscription,
				drop_subscription: p_return.v_data.v_database_return.drop_subscription,
				create_fdw: p_return.v_data.v_database_return.create_fdw,
				alter_fdw: p_return.v_data.v_database_return.alter_fdw,
				drop_fdw: p_return.v_data.v_database_return.drop_fdw,
				create_foreign_server: p_return.v_data.v_database_return.create_foreign_server,
				alter_foreign_server: p_return.v_data.v_database_return.alter_foreign_server,
				import_foreign_schema: p_return.v_data.v_database_return.import_foreign_schema,
				drop_foreign_server: p_return.v_data.v_database_return.drop_foreign_server,
				create_foreign_table: p_return.v_data.v_database_return.create_foreign_table,
				alter_foreign_table: p_return.v_data.v_database_return.alter_foreign_table,
				drop_foreign_table: p_return.v_data.v_database_return.drop_foreign_table,
				create_foreign_column: p_return.v_data.v_database_return.create_foreign_column,
				alter_foreign_column: p_return.v_data.v_database_return.alter_foreign_column,
				drop_foreign_column: p_return.v_data.v_database_return.drop_foreign_column,
				create_user_mapping: p_return.v_data.v_database_return.create_user_mapping,
				alter_user_mapping: p_return.v_data.v_database_return.alter_user_mapping,
				drop_user_mapping: p_return.v_data.v_database_return.drop_user_mapping,
				create_type: p_return.v_data.v_database_return.create_type,
				alter_type: p_return.v_data.v_database_return.alter_type,
				drop_type: p_return.v_data.v_database_return.drop_type,
				create_domain: p_return.v_data.v_database_return.create_domain,
				alter_domain: p_return.v_data.v_database_return.alter_domain,
				drop_domain: p_return.v_data.v_database_return.drop_domain,
				create_statistics: p_return.v_data.v_database_return.create_statistics,
				alter_statistics: p_return.v_data.v_database_return.alter_statistics,
				drop_statistics: p_return.v_data.v_database_return.drop_statistics,
			};

			node.setText(p_return.v_data.v_database_return.version);

			var node_databases = node.createChildNode(t("tree.databases"),
				false,
				"fas node-all fa-database node-database-list",
				{
					type: "database_list",
					num_databases: 0,
				},
				"cm_databases",
			);
			node_databases.createChildNode("", true, "node-spin", null, null);
			var node_tablespaces = node.createChildNode(t("tree.tablespaces"),
				false,
				"fas node-all fa-folder-open node-tablespace-list",
				{
					type: "tablespace_list",
					num_tablespaces: 0,
				},
				"cm_tablespaces",
			);
			node_tablespaces.createChildNode("", true, "node-spin", null, null);
			var node_roles = node.createChildNode(t("tree.roles"),
				false,
				"fas node-all fa-users node-user-list",
				{
					type: "role_list",
					num_roles: 0,
				},
				"cm_roles",
			);
			node_roles.createChildNode("", true, "node-spin", null, null);
			if (parseFloat(getMajorVersionPostgresql(node.tree.tag.version)) >= 9.4) {
				var node_replication = node.createChildNode(t("tree.replication_slots"),
					false,
					"fas node-all fa-sitemap node-repslot-list",
					{
						type: "replication",
					},
					null,
				);
				var node_phyrepslots = node_replication.createChildNode(t("tree.topic_physical_replication_slots"),
					false,
					"fas node-all fa-sitemap node-repslot-list",
					{
						type: "physicalreplicationslot_list",
						num_repslots: 0,
					},
					"cm_physicalreplicationslots",
				);
				node_phyrepslots.createChildNode("", true, "node-spin", null, null);
				var node_logrepslots = node_replication.createChildNode(t("tree.topic_logical_replication_slots"),
					false,
					"fas node-all fa-sitemap node-repslot-list",
					{
						type: "logicalreplicationslot_list",
						num_repslots: 0,
					},
					"cm_logicalreplicationslots",
				);
				node_logrepslots.createChildNode("", true, "node-spin", null, null);
			}

			if (v_connTabControl.selectedTab.tag.firstTimeOpen) {
				v_connTabControl.selectedTab.tag.firstTimeOpen = false;
				//v_connTabControl.tag.createMonitorDashboardTab();
				//startMonitorDashboard();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving database objects.
/// </summary>
/// <param name="node">Node object.</param>
export function getDatabaseObjectsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_database_objects_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tag.database_data = p_return.v_data;

			var node_schemas = node.createChildNode(t("tree.schemas"),
				false,
				"fas node-all fa-layer-group node-schema-list",
				{
					type: "schema_list",
					num_schemas: 0,
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
				},
				"cm_schemas",
			);
			node_schemas.createChildNode("", true, "node-spin", null, null);
			var node_extensions = node.createChildNode(t("tree.extensions"),
				false,
				"fas node-all fa-cubes node-extension-list",
				{
					type: "extension_list",
					num_extensions: 0,
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
				},
				"cm_extensions",
			);
			node_extensions.createChildNode("", true, "node-spin", null, null);
			var node_fdws = node.createChildNode(t("tree.topic_foreign_data_wrappers"),
				false,
				"fas node-all fa-cube node-fdw-list",
				{
					type: "fdw_list",
					num_fdws: 0,
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
				},
				"cm_fdws",
			);
			node_fdws.createChildNode("", true, "node-spin", null, null);
			var node_eventtriggers = node.createChildNode(t("tree.topic_event_triggers"),
				false,
				"fas node-all fa-bolt node-eventtrigger",
				{
					type: "eventtrigger_list",
					num_eventtriggers: 0,
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
				},
				"cm_eventtriggers",
			);
			node_eventtriggers.createChildNode("", true, "node-spin", null, null);
			if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
				var node_replication = node.createChildNode(t("tree.logical_replication"),
					false,
					"fas node-all fa-sitemap node-logrep",
					{
						type: "replication",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
				);
				var node_publications = node_replication.createChildNode(t("tree.topic_publications"),
					false,
					"fas node-all fa-arrow-alt-circle-down node-publication-list",
					{
						type: "publication_list",
						num_pubs: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_publications",
				);
				node_publications.createChildNode("", true, "node-spin", null, null);
				var node_subscriptions = node_replication.createChildNode(t("tree.topic_subscriptions"),
					false,
					"fas node-all fa-arrow-alt-circle-up node-subscription-list",
					{
						type: "subscription_list",
						num_subs: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_subscriptions",
				);
				node_subscriptions.createChildNode("", true, "node-spin", null, null);
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving databases.
/// </summary>
/// <param name="node">Node object.</param>
export function getDatabasesPostgresql(node) {
	//node.removeChildNodes();
	//node.createChildNode('', false, 'node-spin', null,
	//    null);

	execAjax(
		"/get_databases_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.databases") + " (" + p_return.v_data.length + ")");

			node.tag.num_databases = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-database node-database",
					{
						type: "database",
						database: p_return.v_data[i].v_name.replace(/"/g, ""),
						oid: p_return.v_data[i].v_oid,
					},
					"cm_database",
					null,
					false,
				);

				if (v_connTabControl.selectedTab.tag.selectedDatabase == p_return.v_data[i].v_name.replace(/"/g, "")) {
					v_node.setNodeBold();
					v_connTabControl.selectedTab.tag.selectedDatabaseNode = v_node;
				}

				v_node.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving tablespaces.
/// </summary>
/// <param name="node">Node object.</param>
export function getTablespacesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_tablespaces_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.tablespaces") + " (" + p_return.v_data.length + ")");

			node.tag.num_tablespaces = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-folder node-tablespace",
					{
						type: "tablespace",
						oid: p_return.v_data[i].v_oid,
					},
					"cm_tablespace",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving roles.
/// </summary>
/// <param name="node">Node object.</param>
export function getRolesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_roles_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.roles") + " (" + p_return.v_data.length + ")");

			node.tag.num_tablespaces = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				var v_role_icon = p_return.v_data[i].v_can_login
					? "fas node-all fa-user node-user"
					: "fas node-all fa-user-friends node-user-group";
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					v_role_icon,
					{
						type: "role",
						oid: p_return.v_data[i].v_oid,
						can_login: p_return.v_data[i].v_can_login,
					},
					"cm_role",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving roles.
/// </summary>
/// <param name="node">Node object.</param>
export function getExtensionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_extensions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.extensions") + " (" + p_return.v_data.length + ")");

			node.tag.num_tablespaces = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cubes node-extension",
					{
						type: "extension",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_extension",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving schemas.
/// </summary>
/// <param name="node">Node object.</param>
export function getSchemasPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_schemas_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.schemas") + " (" + p_return.v_data.length + ")");

			node.tag.num_schemas = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-layer-group node-schema",
					{
						type: "schema",
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: p_return.v_data[i].v_name,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_schema",
					null,
					false,
				);

				var node_tables = v_node.createChildNode(t("tree.tables"),
					false,
					"fas node-all fa-th node-table-list",
					{
						type: "table_list",
						schema: p_return.v_data[i].v_name,
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_tables",
					null,
					false,
				);
				node_tables.createChildNode("", true, "node-spin", null, null, null, false);

				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
					var node_ptables = v_node.createChildNode(t("tree.partitioned_tables"),
						false,
						"fas node-all fa-th node-ptable-list",
						{
							type: "partitioned_table_list",
							schema: p_return.v_data[i].v_name,
							num_tables: 0,
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						"cm_partitioned_tables",
						null,
						false,
					);
					node_ptables.createChildNode("", true, "node-spin", null, null, null, false);
				}

				var node_itables = v_node.createChildNode(t("tree.inheritance_tables"),
					false,
					"fas node-all fa-th node-itable-list",
					{
						type: "inherited_table_list",
						schema: p_return.v_data[i].v_name,
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_inherited_tables",
					null,
					false,
				);
				node_itables.createChildNode("", true, "node-spin", null, null, null, false);

				var node_foreign_tables = v_node.createChildNode(t("tree.foreign_tables"),
					false,
					"fas node-all fa-th node-ftable-list",
					{
						type: "foreign_table_list",
						schema: p_return.v_data[i].v_name,
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_foreign_tables",
					null,
					false,
				);
				node_foreign_tables.createChildNode("", true, "node-spin", null, null, null, false);

				var node_sequences = v_node.createChildNode(t("tree.topic_sequences"),
					false,
					"fas node-all fa-sort-numeric-down node-sequence-list",
					{
						type: "sequence_list",
						schema: p_return.v_data[i].v_name,
						num_sequences: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_sequences",
					null,
					false,
				);
				node_sequences.createChildNode("", true, "node-spin", null, null, null, false);

				var node_views = v_node.createChildNode(t("tree.views"),
					false,
					"fas node-all fa-eye node-view-list",
					{
						type: "view_list",
						schema: p_return.v_data[i].v_name,
						num_views: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_views",
					null,
					false,
				);
				node_views.createChildNode("", true, "node-spin", null, null, null, false);

				if (parseFloat(getMajorVersionPostgresql(node.tree.tag.version)) >= 9.3) {
					var node_views = v_node.createChildNode(t("tree.topic_materialized_views"),
						false,
						"fas node-all fa-eye node-mview-list",
						{
							type: "mview_list",
							schema: p_return.v_data[i].v_name,
							num_views: 0,
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						"cm_mviews",
						null,
						false,
					);
					node_views.createChildNode("", true, "node-spin", null, null, null, false);
				}

				var node_functions = v_node.createChildNode(t("tree.functions"),
					false,
					"fas node-all fa-cog node-function-list",
					{
						type: "function_list",
						schema: p_return.v_data[i].v_name,
						num_functions: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_functions",
					null,
					false,
				);
				node_functions.createChildNode("", true, "node-spin", null, null, null, false);

				var node_triggerfunctions = v_node.createChildNode(t("tree.topic_trigger_functions"),
					false,
					"fas node-all fa-cog node-tfunction-list",
					{
						type: "triggerfunction_list",
						schema: p_return.v_data[i].v_name,
						num_triggerfunctions: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_triggerfunctions",
					null,
					false,
				);
				node_triggerfunctions.createChildNode("", true, "node-spin", null, null, null, false);

				var node_eventtriggerfunctions = v_node.createChildNode(t("tree.topic_event_trigger_functions"),
					false,
					"fas node-all fa-cog node-etfunction-list",
					{
						type: "eventtriggerfunction_list",
						schema: p_return.v_data[i].v_name,
						num_triggerfunctions: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_eventtriggerfunctions",
					null,
					false,
				);
				node_eventtriggerfunctions.createChildNode("", true, "node-spin", null, null, null, false);

				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 11) {
					var node_procedures = v_node.createChildNode(t("tree.topic_procedures"),
						false,
						"fas node-all fa-cog node-procedure-list",
						{
							type: "procedure_list",
							schema: p_return.v_data[i].v_name,
							num_procedures: 0,
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						"cm_procedures",
						null,
						false,
					);
					node_procedures.createChildNode("", true, "node-spin", null, null, null, false);
				}

				var node_aggregates = v_node.createChildNode(t("tree.topic_aggregates"),
					false,
					"fas node-all fa-cog node-aggregate-list",
					{
						type: "aggregate_list",
						schema: p_return.v_data[i].v_name,
						num_aggregates: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_aggregates",
					null,
					false,
				);

				node_aggregates.createChildNode("", true, "node-spin", null, null, null, false);

				var node_types = v_node.createChildNode(t("tree.topic_types"),
					false,
					"fas node-all fa-square node-type-list",
					{
						type: "type_list",
						schema: p_return.v_data[i].v_name,
						num_types: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_types",
					null,
					false,
				);
				node_types.createChildNode("", true, "node-spin", null, null, null, false);

				var node_domains = v_node.createChildNode(t("tree.topic_domains"),
					false,
					"fas node-all fa-square node-domain-list",
					{
						type: "domain_list",
						schema: p_return.v_data[i].v_name,
						num_domains: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_domains",
					null,
					false,
				);
				node_domains.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getTablesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_tables_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.tables") + " (" + p_return.v_data.length + ")");

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
						has_checks: p_return.v_data[i].v_has_checks,
						has_excludes: p_return.v_data[i].v_has_excludes,
						has_rules: p_return.v_data[i].v_has_rules,
						has_triggers: p_return.v_data[i].v_has_triggers,
						has_partitions: p_return.v_data[i].v_has_partitions,
						has_statistics: p_return.v_data[i].v_has_statistics,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving sequences.
/// </summary>
/// <param name="node">Node object.</param>
export function getSequencesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_sequences_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_sequences") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_sequence_name,
					false,
					"fas node-all fa-sort-numeric-down node-sequence",
					{
						type: "sequence",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_sequence",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving views.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_views_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.views") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-eye node-view",
					{
						type: "view",
						has_rules: p_return.v_data[i].v_has_rules,
						has_triggers: p_return.v_data[i].v_has_triggers,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving View Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewsColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_views_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				t("tree.columns_count", { n: p_return.v_data.length }),
				false,
				"fas node-all fa-columns node-column",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
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
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_type") + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			if (node.tag.has_rules) {
				v_node = node.createChildNode(t("tree.topic_rules"),
					false,
					"fas node-all fa-lightbulb node-rule",
					{
						type: "rule_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_rules",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_triggers) {
				v_node = node.createChildNode(t("tree.topic_triggers"),
					false,
					"fas node-all fa-bolt node-trigger",
					{
						type: "trigger_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_view_triggers",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving view definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getViewDefinitionPostgresql(node) {
	execAjax(
		"/get_view_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_view: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving materialized views.
/// </summary>
/// <param name="node">Node object.</param>
export function getMaterializedViewsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_mviews_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_materialized_views") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-eye node-mview",
					{
						type: "mview",
						has_indexes: p_return.v_data[i].v_has_indexes,
						has_statistics: p_return.v_data[i].v_has_statistics,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_mview",
					null,
					false,
				);
				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "mview_field",
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Materialized View Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getMaterializedViewsColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_mviews_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				t("tree.columns_count", { n: p_return.v_data.length }),
				false,
				"fas node-all fa-columns node-column",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
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
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_type") + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			if (node.tag.has_indexes) {
				v_node = node.createChildNode(t("tree.indexes"),
					false,
					"fas node-all fa-thumbtack node-index",
					{
						type: "indexes",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_indexes",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_statistics) {
				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
					v_node = node.createChildNode(t("tree.topic_statistics"),
						false,
						"fas node-all fa-chart-bar node-statistics",
						{
							type: "statistics_list",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_statistics",
						null,
						false,
					);

					v_node.createChildNode("", false, "node-spin", null, null, null, false);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving materialized view definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getMaterializedViewDefinitionPostgresql(node) {
	execAjax(
		"/get_mview_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_view: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				t("tree.columns_count", { n: p_return.v_data.length }),
				false,
				"fas node-all fa-columns node-column",
				{
					type: "column_list",
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
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
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						position: p_return.v_data[i].v_position,
					},
					"cm_column",
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_type") + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_nullable") + p_return.v_data[i].v_nullable,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			if (node.tag.has_primary_keys) {
				v_node = node.createChildNode(t("tree.primary_key"),
					false,
					"fas node-all fa-key node-pkey",
					{
						type: "primary_key",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_pks",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_foreign_keys) {
				v_node = node.createChildNode(t("tree.foreign_keys"),
					false,
					"fas node-all fa-key node-fkey",
					{
						type: "foreign_keys",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_fks",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_uniques) {
				v_node = node.createChildNode(t("tree.uniques"),
					false,
					"fas node-all fa-key node-unique",
					{
						type: "uniques",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_uniques",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_checks) {
				v_node = node.createChildNode(t("tree.checks"),
					false,
					"fas node-all fa-check-square node-check",
					{
						type: "check_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_checks",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_excludes) {
				v_node = node.createChildNode(t("tree.excludes"),
					false,
					"fas node-all fa-times-circle node-exclude",
					{
						type: "exclude_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_excludes",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_indexes) {
				v_node = node.createChildNode(t("tree.indexes"),
					false,
					"fas node-all fa-thumbtack node-index",
					{
						type: "indexes",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_indexes",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_rules) {
				v_node = node.createChildNode(t("tree.topic_rules"),
					false,
					"fas node-all fa-lightbulb node-rule",
					{
						type: "rule_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_rules",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_triggers) {
				v_node = node.createChildNode(t("tree.topic_triggers"),
					false,
					"fas node-all fa-bolt node-trigger",
					{
						type: "trigger_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_triggers",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);
			}

			if (node.tag.has_partitions) {
				v_node = node.createChildNode(t("tree.inherited_tables"),
					false,
					"fas node-all fa-table node-inherited",
					{
						type: "inherited_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_inheriteds",
					null,
					false,
				);
				v_node.createChildNode("", false, "node-spin", null, null, null, false);

				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
					v_node = node.createChildNode(t("tree.partitions"),
						false,
						"fas node-all fa-table node-partition",
						{
							type: "partition_list",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_partitions",
						null,
						false,
					);
					v_node.createChildNode("", false, "node-spin", null, null, null, false);
				}
			}

			if (node.tag.has_statistics) {
				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
					v_node = node.createChildNode(t("tree.topic_statistics"),
						false,
						"fas node-all fa-chart-bar node-statistics",
						{
							type: "statistics_list",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_statistics",
						null,
						false,
					);

					v_node.createChildNode("", false, "node-spin", null, null, null, false);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving PKs.
/// </summary>
/// <param name="node">Node object.</param>
export function getPKPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_pk_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.primary_key") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) {
				node.removeChildNodes();
				//node.contextMenu = 'cm_refresh'
			} else {
				//node.contextMenu = 'cm_pks'
			}

			if (p_return.v_data.length > 0) {
				v_node = node.createChildNode(
					p_return.v_data[0][0],
					false,
					"fas node-all fa-key node-pkey",
					{
						type: "pk",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[0][1],
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

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving PKs Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getPKColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_pk_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_key: node.text,
			p_table: node.parent.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node.createChildNode(
					p_return.v_data[i][0],
					false,
					"fas node-all fa-columns node-column",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Uniques.
/// </summary>
/// <param name="node">Node object.</param>
export function getUniquesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_uniques_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.uniques") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-key node-unique",
						{
							type: "unique",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i][1],
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
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Uniques Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getUniquesColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_uniques_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_unique: node.text,
			p_table: node.parent.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-columns node-column",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Indexes.
/// </summary>
/// <param name="node">Node object.</param>
export function getIndexesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_indexes_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.indexes") + " (" + p_return.v_data.length + ")");

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
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i][2],
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
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Indexes Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getIndexesColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_indexes_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_index: node.text.replace(" (Non Unique)", "").replace(" (Unique)", ""),
			p_table: node.parent.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-columns node-column",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving FKs.
/// </summary>
/// <param name="node">Node object.</param>
export function getFKsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_fks_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.foreign_keys") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i][0],
					false,
					"fas node-all fa-key node-fkey",
					{
						type: "foreign_key",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i][4],
					},
					"cm_fk",
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_referenced_table") + p_return.v_data[i][1],
					false,
					"fas node-all fa-table node-table",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_delete_rule") + p_return.v_data[i][2],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_update_rule") + p_return.v_data[i][3],
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);

			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving FKs Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getFKsColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_fks_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_fkey: node.text,
			p_table: node.parent.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.createChildNode(t("tree.prop_referenced_table") + p_return.v_data[0][0],
				false,
				"fas node-all fa-table node-table",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				null,
				null,
				false,
			);
			node.createChildNode(t("tree.prop_delete_rule") + p_return.v_data[0][1],
				false,
				"fas node-all fa-ellipsis-h node-bullet",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				null,
				null,
				false,
			);
			node.createChildNode(t("tree.prop_update_rule") + p_return.v_data[0][2],
				false,
				"fas node-all fa-ellipsis-h node-bullet",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				null,
				null,
				false,
			);

			for (i = 0; i < p_return.v_data.length; i++) {
				node.createChildNode(
					p_return.v_data[i][3] + " <i class='fas node-all fa-arrow-right'></i> " + p_return.v_data[i][4],
					false,
					"fas node-all fa-columns node-column",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Checks.
/// </summary>
/// <param name="node">Node object.</param>
export function getChecksPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_checks_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.checks") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-check-square node-check",
						{
							type: "check",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i][2],
						},
						"cm_check",
						null,
						false,
					);
					v_node.createChildNode(
						p_return.v_data[i][1],
						false,
						"fas node-all fa-edit node-check-value",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Excludes.
/// </summary>
/// <param name="node">Node object.</param>
export function getExcludesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_excludes_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.excludes") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-times-circle node-exclude",
						{
							type: "exclude",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i][3],
						},
						"cm_exclude",
						null,
						false,
					);
					v_node.createChildNode(t("tree.prop_attributes") + p_return.v_data[i][1],
						false,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
					v_node.createChildNode(t("tree.prop_operators") + p_return.v_data[i][2],
						false,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Rules.
/// </summary>
/// <param name="node">Node object.</param>
export function getRulesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_rules_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_rules") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-lightbulb node-rule",
						{
							type: "rule",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i][1],
						},
						"cm_rule",
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving rule definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getRuleDefinitionPostgresql(node) {
	execAjax(
		"/get_rule_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_rule: node.text,
			p_table: node.parent.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving Triggers.
/// </summary>
/// <param name="node">Node object.</param>
export function getTriggersPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_triggers_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_triggers") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					var v_node = node.createChildNode(
						p_return.v_data[i].v_name,
						false,
						"fas node-all fa-bolt node-trigger",
						{
							type: "trigger",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							oid: p_return.v_data[i].v_oid,
						},
						"cm_trigger",
						null,
						true,
					);
					v_node.createChildNode(t("tree.prop_enabled") + p_return.v_data[i].v_enabled,
						false,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);

					v_node.createChildNode(
						p_return.v_data[i].v_function,
						false,
						"fas node-all fa-cog node-tfunction",
						{
							type: "direct_triggerfunction",
							id: p_return.v_data[i].v_id,
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
							function_oid: p_return.v_data[i].v_function_oid,
						},
						"cm_direct_triggerfunction",
						null,
						true,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Event Triggers.
/// </summary>
/// <param name="node">Node object.</param>
export function getEventTriggersPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_eventtriggers_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			node.setText(t("tree.topic_event_triggers") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					var v_node = node.createChildNode(
						p_return.v_data[i].v_name,
						false,
						"fas node-all fa-bolt node-eventtrigger",
						{
							type: "eventtrigger",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							oid: p_return.v_data[i].v_oid,
						},
						"cm_eventtrigger",
						null,
						true,
					);
					v_node.createChildNode(t("tree.prop_enabled") + p_return.v_data[i].v_enabled,
						false,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						null,
						null,
						false,
					);
					v_node.createChildNode(t("tree.prop_event") + p_return.v_data[i].v_event,
						false,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						null,
						null,
						false,
					);

					v_node.createChildNode(
						p_return.v_data[i].v_function,
						false,
						"fas node-all fa-cog node-etfunction",
						{
							type: "direct_eventtriggerfunction",
							id: p_return.v_data[i].v_id,
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							function_oid: p_return.v_data[i].v_function_oid,
						},
						"cm_direct_eventtriggerfunction",
						null,
						true,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Partitions.
/// </summary>
/// <param name="node">Node object.</param>
export function getInheritedsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_inheriteds_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.inherited_tables") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-table node-inherited",
						{
							type: "inherit",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_inherit",
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Partitions.
/// </summary>
/// <param name="node">Node object.</param>
export function getPartitionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_partitions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.partitions") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) node.removeChildNodes();

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][0],
						false,
						"fas node-all fa-table node-partition",
						{
							type: "partition",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_partition",
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Statistics.
/// </summary>
/// <param name="node">Node object.</param>
export function getStatisticsPostgresql(node) {
	node.removeChildNodes();

	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_statistics_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.parent.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_statistics") + " (" + p_return.v_data.length + ")");

			if (node.childNodes.length > 0) {
				node.removeChildNodes();
			}

			var v_node;

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					v_node = node.createChildNode(
						p_return.v_data[i][1] + "." + p_return.v_data[i][0],
						false,
						"fas node-all fa-chart-bar node-statistic",
						{
							type: "statistic",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: p_return.v_data[i][1],
							statistics: p_return.v_data[i][0],
							oid: p_return.v_data[i][2],
						},
						"cm_statistic",
						null,
						false,
					);

					v_node.createChildNode("", true, "node-spin", null, null, null, false);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Statistics Columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getStatisticsColumnsPostgresql(node) {
	node.removeChildNodes();

	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_statistics_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_statistics: node.tag.statistics,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) {
				node.removeChildNodes();
			}

			if (p_return.v_data.length > 0) {
				for (i = 0; i < p_return.v_data.length; i++) {
					node.createChildNode(
						p_return.v_data[i]["v_column_name"],
						false,
						"fas node-all fa-columns node-column",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				}

				node.drawChildNodes();
			}

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving functions.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_functions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.functions") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-function",
					{
						type: "function",
						id: p_return.v_data[i].v_id,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						function_oid: p_return.v_data[i].v_function_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving function fields.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionFieldsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_function_fields_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				if (p_return.v_data[i].v_type == "O")
					v_node = node.createChildNode(
						p_return.v_data[i].v_name,
						false,
						"fas node-all fa-arrow-right node-function-field",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				else {
					if (p_return.v_data[i].v_type == "I")
						v_node = node.createChildNode(
							p_return.v_data[i].v_name,
							false,
							"fas node-all fa-arrow-left node-function-field",
							{
								database: v_connTabControl.selectedTab.tag.selectedDatabase,
								schema: node.tag.schema,
							},
							null,
							null,
							false,
						);
					else
						v_node = node.createChildNode(
							p_return.v_data[i].v_name,
							false,
							"fas node-all fa-exchange-alt node-function-field",
							{
								database: v_connTabControl.selectedTab.tag.selectedDatabase,
								schema: node.tag.schema,
							},
							null,
							null,
							false,
						);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving function definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getFunctionDefinitionPostgresql(node) {
	execAjax(
		"/get_function_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving procedures.
/// </summary>
/// <param name="node">Node object.</param>
export function getProceduresPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_procedures_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_procedures") + " (" + p_return.v_data.length + ")");

			node.tag.num_procedures = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-procedure",
					{
						type: "procedure",
						id: p_return.v_data[i].v_id,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						function_oid: p_return.v_data[i].v_function_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving procedure fields.
/// </summary>
/// <param name="node">Node object.</param>
export function getProcedureFieldsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_procedure_fields_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_procedure: node.tag.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.tag.num_fields = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				if (p_return.v_data[i].v_type == "O")
					v_node = node.createChildNode(
						p_return.v_data[i].v_name,
						false,
						"fas node-all fa-arrow-right node-function-field",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						null,
						null,
						false,
					);
				else {
					if (p_return.v_data[i].v_type == "I")
						v_node = node.createChildNode(
							p_return.v_data[i].v_name,
							false,
							"fas node-all fa-arrow-left node-function-field",
							{
								database: v_connTabControl.selectedTab.tag.selectedDatabase,
								schema: node.tag.schema,
							},
							null,
							null,
							false,
						);
					else
						v_node = node.createChildNode(
							p_return.v_data[i].v_name,
							false,
							"fas node-all fa-exchange-alt node-function-field",
							{
								database: v_connTabControl.selectedTab.tag.selectedDatabase,
								schema: node.tag.schema,
							},
							null,
							null,
							false,
						);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving procedure definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getProcedureDefinitionPostgresql(node) {
	execAjax(
		"/get_procedure_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_procedure: node.tag.id,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving trigger functions.
/// </summary>
/// <param name="node">Node object.</param>
export function getTriggerFunctionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_triggerfunctions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_trigger_functions") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-tfunction",
					{
						type: "triggerfunction",
						id: p_return.v_data[i].v_id,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						function_oid: p_return.v_data[i].v_function_oid,
					},
					"cm_triggerfunction",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving trigger function definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getTriggerFunctionDefinitionPostgresql(node) {
	execAjax(
		"/get_triggerfunction_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving event trigger functions.
/// </summary>
/// <param name="node">Node object.</param>
export function getEventTriggerFunctionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_eventtriggerfunctions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_event_trigger_functions") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-etfunction",
					{
						type: "eventtriggerfunction",
						id: p_return.v_data[i].v_id,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						function_oid: p_return.v_data[i].v_function_oid,
					},
					"cm_eventtriggerfunction",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving event trigger function definition.
/// </summary>
/// <param name="node">Node object.</param>
export function getEventTriggerFunctionDefinitionPostgresql(node) {
	execAjax(
		"/get_eventtriggerfunction_definition_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: node.tag.id,
		}),
		function (p_return) {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(p_return.v_data);
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
			//v_connTabControl.selectedTab.tag.tabControl.selectedTab.renameTab(node.text);
			renameTabConfirm(v_connTabControl.selectedTab.tag.tabControl.selectedTab, node.text);

			var v_div_result = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

			if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht != null) {
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.destroy();
				v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht = null;
			}

			v_div_result.innerHTML = "";
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		true,
	);
}

/// <summary>
/// Retrieving aggregates.
/// </summary>
/// <param name="node">Node object.</param>
export function getAggregatesPostgresql(node) {
	node.removeChildNodes();

	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_aggregates_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) {
				node.removeChildNodes();
			}

			node.setText(t("tree.topic_aggregates") + " (" + p_return.v_data.length + ")");
			node.tag.num_aggregates = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cog node-aggregate",
					{
						type: "aggregate",
						id: p_return.v_data[i].v_id,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_aggregate",
					null,
					false,
				);

				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "aggregate_field",
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Physical Replication Slots.
/// </summary>
/// <param name="node">Node object.</param>
export function getPhysicalReplicationSlotsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_physicalreplicationslots_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_physical_replication_slots") + " (" + p_return.v_data.length + ")");

			node.tag.num_repslots = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-sitemap node-repslot",
					{
						type: "physicalreplicationslot",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_physicalreplicationslot",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Logical Replication Slots.
/// </summary>
/// <param name="node">Node object.</param>
export function getLogicalReplicationSlotsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_logicalreplicationslots_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_logical_replication_slots") + " (" + p_return.v_data.length + ")");

			node.tag.num_repslots = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-sitemap node-repslot",
					{
						type: "logicalreplicationslot",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_logicalreplicationslot",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Publications.
/// </summary>
/// <param name="node">Node object.</param>
export function getPublicationsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_publications_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_publications") + " (" + p_return.v_data.length + ")");

			node.tag.num_pubs = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-arrow-alt-circle-down node-publication",
					{
						type: "publication",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_publication",
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_all_tables") + p_return.v_data[i].v_alltables,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_insert") + p_return.v_data[i].v_insert,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_update") + p_return.v_data[i].v_update,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_delete") + p_return.v_data[i].v_delete,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_truncate") + p_return.v_data[i].v_truncate,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				if (!p_return.v_data[i].v_alltables) {
					v_tables = v_node.createChildNode(t("tree.tables"),
						false,
						"fas node-all fa-th node-table-list",
						{
							type: "publication_table_list",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						"cm_pubtables",
						null,
						false,
					);
					v_tables.createChildNode("", true, "node-spin", null, null, null, false);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Publication Tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getPublicationTablesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_publication_tables_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_pub: node.parent.text,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.tables") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-table",
					{
						type: "pubtable",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_pubtable",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Subscriptions.
/// </summary>
/// <param name="node">Node object.</param>
export function getSubscriptionsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_subscriptions_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_subscriptions") + " (" + p_return.v_data.length + ")");

			node.tag.num_subs = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-arrow-alt-circle-up node-subscription",
					{
						type: "subscription",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_subscription",
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_enabled") + p_return.v_data[i].v_enabled,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_conninfo") + p_return.v_data[i].v_conninfo,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_publications = v_node.createChildNode(t("tree.referenced_publications"),
					false,
					"fas node-all fa-arrow-alt-circle-down node-publication",
					{
						type: "subpubs",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				tmp = p_return.v_data[i].v_publications.split(",");
				for (j = 0; j < tmp.length; j++) {
					v_publications.createChildNode(
						tmp[j],
						false,
						"fas node-all fa-arrow-alt-circle-down node-publication",
						{
							type: "subpub",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						null,
						null,
						false,
					);
				}
				v_tables = v_node.createChildNode(t("tree.tables"),
					false,
					"fas node-all fa-th node-table-list",
					{
						type: "subscription_table_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
				v_tables.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Subscription Tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getSubscriptionTablesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_subscription_tables_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_sub: node.parent.text,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.tables") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-table",
					{
						type: "subtable",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					null,
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Foreign Data Wrappers.
/// </summary>
/// <param name="node">Node object.</param>
export function getForeignDataWrappersPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_foreign_data_wrappers_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.topic_foreign_data_wrappers") + " (" + p_return.v_data.length + ")");

			node.tag.num_fdws = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-cube node-fdw",
					{
						type: "fdw",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_fdw",
					null,
					false,
				);
				v_node = v_node.createChildNode(t("tree.foreign_servers"),
					false,
					"fas node-all fa-server node-server",
					{
						type: "foreign_server_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_foreign_servers",
					null,
					false,
				);
				v_node.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving Foreign Servers.
/// </summary>
/// <param name="node">Node object.</param>
export function getForeignServersPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_foreign_servers_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_fdw: node.parent.text,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.foreign_servers") + " (" + p_return.v_data.length + ")");

			node.tag.num_foreign_servers = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-server node-server",
					{
						type: "foreign_server",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_foreign_server",
					null,
					false,
				);

				if (p_return.v_data[i].v_type != null) {
					v_node.createChildNode(t("tree.prop_type") + p_return.v_data[i].v_type,
						true,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						null,
						null,
						false,
					);
				}

				if (p_return.v_data[i].v_version != null) {
					v_node.createChildNode(t("tree.prop_version") + p_return.v_data[i].v_version,
						true,
						"fas node-all fa-ellipsis-h node-bullet",
						{
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
						},
						null,
						null,
						false,
					);
				}

				if (p_return.v_data[i].v_options != null) {
					v_options = p_return.v_data[i].v_options.split(",");
					if (v_options[0] != "") {
						for (j = 0; j < v_options.length; j++) {
							v_node.createChildNode(
								v_options[j],
								true,
								"fas node-all fa-ellipsis-h node-bullet",
								{
									database: v_connTabControl.selectedTab.tag.selectedDatabase,
								},
								null,
								null,
								false,
							);
						}
					}
				}

				v_node = v_node.createChildNode(t("tree.user_mappings"),
					false,
					"fas node-all fa-user-friends node-user",
					{
						type: "user_mapping_list",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
					},
					"cm_user_mappings",
					null,
					false,
				);
				v_node.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving User Mappings.
/// </summary>
/// <param name="node">Node object.</param>
export function getUserMappingsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_user_mappings_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_foreign_server: node.parent.text,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.user_mappings") + " (" + p_return.v_data.length + ")");

			node.tag.num_user_mappings = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-user-friends node-user",
					{
						type: "user_mapping",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						foreign_server: p_return.v_data[i].v_foreign_server,
					},
					"cm_user_mapping",
					null,
					false,
				);

				if (p_return.v_data[i].v_options != null) {
					v_options = p_return.v_data[i].v_options.split(",");
					if (v_options[0] != "") {
						for (j = 0; j < v_options.length; j++) {
							v_node.createChildNode(
								v_options[j],
								true,
								"fas node-all fa-ellipsis-h node-bullet",
								{
									database: v_connTabControl.selectedTab.tag.selectedDatabase,
								},
								null,
								null,
								false,
							);
						}
					}
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving foreign tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getForeignTablesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_foreign_tables_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.foreign_tables") + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-ftable",
					{
						type: "foreign_table",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						has_statistics: p_return.v_data[i].v_has_statistics,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_foreign_table",
					null,
					false,
				);

				v_node.createChildNode(
					"",
					false,
					"node-spin",
					{
						type: "foreign_table_field",
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving columns.
/// </summary>
/// <param name="node">Node object.</param>
export function getForeignColumnsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_foreign_columns_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: node.text,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			v_list = node.createChildNode(
				t("tree.columns_count", { n: p_return.v_data.length }),
				false,
				"fas node-all fa-columns node-column",
				{
					type: "foreign_column_list",
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				"cm_foreign_columns",
				null,
				false,
			);

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = v_list.createChildNode(
					p_return.v_data[i].v_column_name,
					false,
					"fas node-all fa-columns node-column",
					{
						type: "foreign_table_field",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_foreign_column",
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_type") + p_return.v_data[i].v_data_type,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
				v_node.createChildNode(t("tree.prop_nullable") + p_return.v_data[i].v_nullable,
					false,
					"fas node-all fa-ellipsis-h node-bullet",
					{
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);

				if (p_return.v_data[i].v_options != null) {
					v_options = p_return.v_data[i].v_options.split(",");
					if (v_options[0] != "") {
						for (j = 0; j < v_options.length; j++) {
							v_node.createChildNode(
								v_options[j],
								true,
								"fas node-all fa-ellipsis-h node-bullet",
								{
									database: v_connTabControl.selectedTab.tag.selectedDatabase,
									schema: node.tag.schema,
								},
								null,
								null,
								false,
							);
						}
					}
				}
			}

			if (p_return.v_data[0].v_tableoptions != null) {
				v_options = p_return.v_data[0].v_tableoptions.split(",");
				if (v_options[0] != "") {
					for (j = 0; j < v_options.length; j++) {
						node.createChildNode(
							v_options[j],
							true,
							"fas node-all fa-ellipsis-h node-bullet",
							{
								database: v_connTabControl.selectedTab.tag.selectedDatabase,
								schema: node.tag.schema,
							},
							null,
							null,
							false,
						);
					}
				}
			}

			node.createChildNode(
				p_return.v_data[0].v_server,
				true,
				"fas node-all fa-server node-server",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				null,
				null,
				false,
			);

			node.createChildNode(
				p_return.v_data[0].v_fdw,
				true,
				"fas node-all fa-cube node-fdw",
				{
					database: v_connTabControl.selectedTab.tag.selectedDatabase,
					schema: node.tag.schema,
				},
				null,
				null,
				false,
			);

			if (node.tag.has_statistics) {
				if (parseInt(getMajorVersionPostgresql(node.tree.tag.version)) >= 10) {
					v_node = node.createChildNode(t("tree.topic_statistics"),
						false,
						"fas node-all fa-chart-bar node-statistics",
						{
							type: "statistics_list",
							database: v_connTabControl.selectedTab.tag.selectedDatabase,
							schema: node.tag.schema,
						},
						"cm_statistics",
						null,
						false,
					);

					v_node.createChildNode("", false, "node-spin", null, null, null, false);
				}
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving types.
/// </summary>
/// <param name="node">Node object.</param>
export function getTypesPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_types_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_types") + " (" + p_return.v_data.length + ")");

			node.tag.num_types = p_return.v_data.length;

			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_type_name,
					false,
					"fas node-all fa-square node-type",
					{
						type: "type",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_type",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving domains.
/// </summary>
/// <param name="node">Node object.</param>
export function getDomainsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_domains_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			node.setText(t("tree.topic_domains") + " (" + p_return.v_data.length + ")");

			node.tag.num_domains = p_return.v_data.length;

			if (node.childNodes.length > 0) node.removeChildNodes();

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_domain_name,
					false,
					"fas node-all fa-square node-domain",
					{
						type: "domain",
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
					},
					"cm_domain",
					null,
					false,
				);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving partitioned parent tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getPartitionedParentsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_partitions_parents_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.partitioned_tables") + " (" + p_return.v_data.length + ")");

			node.tag.num_partitioned = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-layer-group node-ptable",
					{
						type: "partitioned_parent",
						id: p_return.v_data[i].v_name,
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_partitioned_parent",
					null,
					false,
				);

				v_node.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving partitioned children tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getPartitionedChildrenPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_partitions_children_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
			p_table: node.tag.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(node.tag.id + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-ptable",
					{
						type: "table",
						has_primary_keys: p_return.v_data[i].v_has_primary_keys,
						has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
						has_uniques: p_return.v_data[i].v_has_uniques,
						has_indexes: p_return.v_data[i].v_has_indexes,
						has_checks: p_return.v_data[i].v_has_checks,
						has_excludes: p_return.v_data[i].v_has_excludes,
						has_rules: p_return.v_data[i].v_has_rules,
						has_triggers: p_return.v_data[i].v_has_triggers,
						has_partitions: p_return.v_data[i].v_has_partitions,
						has_statistics: p_return.v_data[i].v_has_statistics,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving inheritance parent tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getInheritedsParentsPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_inheriteds_parents_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(t("tree.inheritance_tables") + " (" + p_return.v_data.length + ")");

			node.tag.num_partitioned = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-layer-group node-itable",
					{
						type: "inherited_parent",
						id: p_return.v_data[i].v_name,
						num_tables: 0,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
					},
					"cm_inherited_parent",
					null,
					false,
				);

				v_node.createChildNode("", true, "node-spin", null, null, null, false);
			}

			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving partitioned children tables.
/// </summary>
/// <param name="node">Node object.</param>
export function getInheritedsChildrenPostgresql(node) {
	node.removeChildNodes();
	node.createChildNode("", false, "node-spin", null, null);

	execAjax(
		"/get_inheriteds_children_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_schema: node.tag.schema,
			p_table: node.tag.id,
		}),
		function (p_return) {
			if (node.childNodes.length > 0) node.removeChildNodes();

			node.setText(node.tag.id + " (" + p_return.v_data.length + ")");

			node.tag.num_tables = p_return.v_data.length;

			for (i = 0; i < p_return.v_data.length; i++) {
				v_node = node.createChildNode(
					p_return.v_data[i].v_name,
					false,
					"fas node-all fa-table node-itable",
					{
						type: "table",
						has_primary_keys: p_return.v_data[i].v_has_primary_keys,
						has_foreign_keys: p_return.v_data[i].v_has_foreign_keys,
						has_uniques: p_return.v_data[i].v_has_uniques,
						has_indexes: p_return.v_data[i].v_has_indexes,
						has_checks: p_return.v_data[i].v_has_checks,
						has_excludes: p_return.v_data[i].v_has_excludes,
						has_rules: p_return.v_data[i].v_has_rules,
						has_triggers: p_return.v_data[i].v_has_triggers,
						has_partitions: p_return.v_data[i].v_has_partitions,
						has_statistics: p_return.v_data[i].v_has_statistics,
						database: v_connTabControl.selectedTab.tag.selectedDatabase,
						schema: node.tag.schema,
						oid: p_return.v_data[i].v_oid,
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
						schema: node.tag.schema,
					},
					null,
					null,
					false,
				);
			}
			node.drawChildNodes();

			afterNodeOpenedCallbackPostgreSQL(node);
		},
		function (p_return) {
			nodeOpenErrorPostgresql(p_return, node);
		},
		"box",
		false,
	);
}

/// <summary>
/// Retrieving SELECT SQL template.
/// </summary>
export function TemplateSelectPostgresql(p_schema, p_table, p_kind) {
	execAjax(
		"/template_select_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_kind: p_kind,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			let v_tab_name = p_schema + "." + p_table;
			v_connTabControl.tag.createQueryTab(v_tab_name);

			var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
			v_tab_tag.editor.setValue(p_return.v_data.v_template);
			v_tab_tag.editor.clearSelection();

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
export function TemplateInsertPostgresql(p_schema, p_table) {
	execAjax(
		"/template_insert_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate(t("tree.tab_insert_prefix") + p_schema + "." + p_table, p_return.v_data.v_template);
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
export function TemplateUpdatePostgresql(p_schema, p_table) {
	execAjax(
		"/template_update_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_table: p_table,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate(t("tree.tab_update_prefix") + p_schema + "." + p_table, p_return.v_data.v_template);
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
/// Retrieving SELECT FUNCTION SQL template.
/// </summary>
export function TemplateSelectFunctionPostgresql(p_schema, p_function, p_functionid) {
	execAjax(
		"/template_select_function_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_function: p_function,
			p_functionid: p_functionid,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate(t("tree.tab_select_prefix") + p_schema + "." + p_function, p_return.v_data.v_template);
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
/// Retrieving CALL PROCEDURE SQL template.
/// </summary>
export function TemplateCallProcedurePostgresql(p_schema, p_procedure, p_procedureid) {
	execAjax(
		"/template_call_procedure_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_procedure: p_procedure,
			p_procedureid: p_procedureid,
			p_schema: p_schema,
			p_indent_char: v_indent_char,
			p_indent_size: v_indent_size,
		}),
		function (p_return) {
			tabSQLTemplate(t("tree.tab_call_prefix") + p_schema + "." + p_procedure, p_return.v_data.v_template);
		},
		function (p_return) {
			showError(p_return.v_data);
			return "";
		},
		"box",
		true,
	);
}

export function nodeOpenErrorPostgresql(p_return, p_node) {
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
			// Plain text, not markup. Aimara escapes every node label before
			// it reaches innerHTML (see aimaraEscapeHtml), so the <a
			// onclick='showError(...)'>View Detail</a> this used to build was
			// displayed literally -- there has been no clickable link here
			// since that escaping went in, just a wall of visible tags. The
			// message rides on the node's tag instead, and clickNodeEvent
			// below opens it.
			t("tree.error_click_for_detail"),
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

export function getMajorVersionPostgresql(p_version) {
	var v_version = p_version.split(" (")[0];
	var tmp = v_version.replace("PostgreSQL ", "").replace("beta", ".").replace("rc", ".").split(".");
	tmp.pop();
	return tmp.join(".");
}

export function postgresqlTerminateBackendConfirm(p_pid) {
	execAjax(
		"/kill_backend_postgresql/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_pid: p_pid,
		}),
		function (p_return) {
			refreshConnectedUsers();
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						postgresqlTerminateBackendConfirm(p_pid);
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

export function postgresqlTerminateBackend(p_row) {
	// parseInt because query results cross the wire as [][]string, so the pid
	// arrives quoted, and the backend unmarshals it into an integer -- which
	// rejects "4711" outright and fails the whole request. See flexInt in
	// go-server/flex_int.go.
	var v_pid = parseInt(p_row[2], 10);

	showConfirm(t("tree.confirm_terminate_backend", { pid: v_pid }), function () {
		postgresqlTerminateBackendConfirm(v_pid);
	});
}

export function getExplain(p_mode) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	var v_query;
	var v_selected_text = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getSelectedText();

	if (v_selected_text != "") v_query = v_selected_text;
	else v_query = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.getValue();

	if (v_query.trim() == "") {
		showAlert(t("common.provide_a_string"));
	}
	// else {
	//     if (p_mode == 0)
	//         v_query = 'explain (format json) ' + v_query;
	//     else if (p_mode == 1)
	//         v_query = 'explain (analyze, format json) ' + v_query;
	//
	//     querySQL(0, true, v_query, getExplainReturn, true);
	// }
	else {
		// Component context is unset, defaults to default.
		if (v_explain_control.context === "default") {
			if (p_mode == 0) {
				v_query = "explain " + v_query;
			} else if (p_mode == 1) {
				v_query = "explain (analyze, buffers) " + v_query;
			}

			querySQL(0, true, v_query, getExplainReturn, true);
		} else {
			if (p_mode == 0) {
				v_query = "explain (format json) " + v_query;
			} else if (p_mode == 1) {
				v_query = "explain (analyze, buffers, format json) " + v_query;
			}

			querySQL(0, true, v_query, getExplainReturn, true);
		}
	}
}

export function getExplainReturn(p_data) {
	var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	v_tab_tag.selectExplainTabFunc();

	if (p_data.v_error) {
		var v_expl_err = document.createElement("div");
		v_expl_err.className = "error_text";
		v_expl_err.textContent = p_data.v_data.message;
		v_tab_tag.div_explain_default.innerHTML = "";
		v_tab_tag.div_explain_default.appendChild(v_expl_err.cloneNode(true));
		v_tab_tag.div_explain.innerHTML = "";
		v_tab_tag.div_explain.appendChild(v_expl_err);
	} else {
		// Adjusting data.
		var v_explain_text = "";
		for (var i = 0; i < p_data.v_data.v_data.length; i++) {
			v_explain_text += p_data.v_data.v_data[i] + "\n";
		}

		// Destroy possible legere component.
		if (v_tab_tag.explainControl) {
			v_tab_tag.explainControl.destroy();
		}
		v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.innerHTML = "";

		if (v_explain_control.context === "default") {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.style.display = "block";
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain.style.display = "none";
			// Updating explain default component.
			var resultset = [];
			v_explain_text.split(/\n/).forEach(function (item) {
				item = item.replace(/^"(.*)"$/, "$1"); // remove quotes
				item = item.replace(/^'(.*)'$/, "$1"); // remove single quotes
				if (item.match(/^-*$/)) {
					return;
				} // skip line with dashes (supposedly header separator)
				if (item.match(/^\s*QUERY PLAN\s*$/)) {
					return;
				} // skip header
				resultset.push([item]);
			});

			if (resultset.length > 0) {
				var planNodes = PGPlanNodes(resultset.slice());
				var mountNode = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default;
				var pgplan = React.createElement(
					PGPlan,
					{
						nodes: planNodes,
					},
					null,
				);
				ReactDOM.render(pgplan, mountNode);
			}
		} else {
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain_default.style.display = "none";
			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_explain.style.display = "block";

			var v_legere_options = {
				backgroundColor: v_theme === "dark" ? "#2f3136" : "#e2e2e2",
				target: v_tab_tag.div_explain,
			};

			var v_context = {
				parent: v_tab_tag,
				self: "explainControl",
			};

			v_tab_tag.explainControl = createLegere(v_context, v_legere_options);

			v_tab_tag.explainControl.updatePlanList(JSON.parse(v_explain_text));
		}

		/*

		var resultset = [];
		v_explain_text.split(/\n/).forEach(function(item) {
			item = item.replace(/^"(.*)"$/, '$1'); // remove quotes
			item = item.replace(/^'(.*)'$/, '$1'); // remove single quotes
			if (item.match(/^-*$/)) {
				return;
			} // skip line with dashes (supposedly header separator)
			if (item.match(/^\s*QUERY PLAN\s*$/)) {
				return;
			} // skip header
			resultset.push([item]);
		});

		if (resultset.length > 0) {
			var planNodes = PGPlanNodes(resultset.slice());
			var mountNode = v_connTabControl.selectedTab.tag.tabControl.selectedTab
				.tag.div_explain;
			var pgplan = React.createElement(PGPlan, {
				nodes: planNodes
			}, null);
			ReactDOM.render(pgplan, mountNode);
		}*/
	}

	refreshHeights();
}
