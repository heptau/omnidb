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
/// Startup function.
/// </summary>

import { endLoading, execAjax, startLoading } from "./ajax_control_bridge.js";
import { checkConsoleStatus } from "./console.js";
import { initCreateTabFunctions } from "./create_tab_functions.js";
import { customMenu } from "./custom_menu.js";
import { createRequest } from "./long_polling.js";
import { startMonitorDashboard } from "./monitoring.js";
import { showAlert, showConfirm } from "./notification_control.js";
import { showPasswordPrompt } from "./passwords.js";
import { checkQueryStatus, escapeHtml, v_queryRequestCodes } from "./query.js";
import { initSectionSwitcher, switchSection } from "./section_switcher.js";
import { refreshOuterConnectionHeights } from "./tab_functions/outer_connection_tab.js";
import { initWelcomeSection } from "./tab_functions/outer_welcome_tab.js";
import { createTabControl } from "./tabs.js";
import { checkEditDataStatus } from "./tree_context_functions/edit_data.js";
import { getTreeMariadb } from "./tree_context_functions/tree_mariadb.js";
import { getTreeMysql, mysqlTerminateBackend } from "./tree_context_functions/tree_mysql.js";
import { getTreeOracle } from "./tree_context_functions/tree_oracle.js";
import { getTreePostgresql, postgresqlTerminateBackend } from "./tree_context_functions/tree_postgresql.js";
import { getAllSnippets } from "./tree_context_functions/tree_snippets.js";
import { getTreeSqlite } from "./tree_context_functions/tree_sqlite.js";
import { startTutorial } from "./tutorial_functions/tutorial.js";

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
/** @type {any[]} */
var v_edges;
/** @type {any[]} */
var v_nodes;
var v_start_height, v_start_width;

function initWorkspace() {
	// Instantiating outer tab component.
	v_connTabControl = createTabControl({
		p_div: "omnidb_main_tablist",
		p_hierarchy: "primary",
	});

	// Objects to control sequential change of active database tabs.
	v_connTabControl.tag.change_active_database_call_list = [];
	v_connTabControl.tag.change_active_database_call_running = false;

	// v_connTabControl now only ever holds DB connection/terminal outer
	// tabs -- Welcome/Connections/Snippets/Database/Settings/About live in
	// the vertical section nav instead (section_switcher.js), and this
	// control renders as a permanent horizontal strip inside the Database
	// section. Hiding its menu once, here, reuses the existing
	// ":not(container--menu-shown)" CSS in _topbar.scss -- which used to be
	// what the (now removed) "Switch menu" toggle switched *to*.
	v_connTabControl.hideTabMenu();

	// Instantiating functions responsible for creating all the different types of tabs.
	initCreateTabFunctions();

	// Creating the welcome section content.
	initWelcomeSection();

	// Creating the snippets section content.
	v_connTabControl.tag.createSnippetPanel();

	// Creating the vertical section nav (Welcome/Connections/Snippets/
	// Database/Settings/About).
	initSectionSwitcher();

	// Showing the Database section *before* getDatabaseList() below
	// restores any previously-open connection tabs -- outer_connection_tab.js
	// and its inner Query/Console tabs size themselves against their own
	// container's real, laid-out dimensions as they're created, which only
	// exist once #omnidb__section_database is the visible (not
	// display:none) section. This whole restore happens synchronously
	// enough that it stays behind the full-page #div_loading overlay
	// (started before this bundle even runs, ended at getDatabaseList's
	// callback below), so there is nothing for the user to see either way.
	switchSection("database");

	// Updating explain component choice.
	updateExplainComponent();

	// Retrieving global snippets
	getAllSnippets();

	// Retrieving database list.
	getDatabaseList(true, function () {
		// Creating `Add` tab in the outer tab list.
		v_connTabControl.createAddTab();

		// Nothing was restored -- land on Welcome instead of an empty
		// Database section.
		if (v_connTabControl.tabList.length === 0) {
			switchSection("welcome");
		}
	});

	// Creating omnis.
	v_omnis.root = document.getElementById("omnidb__main");
	v_omnis.div = document.createElement("div");
	v_omnis.div.setAttribute("id", "omnis");
	v_omnis.div.classList.add("omnis");
	v_omnis.div.style.top = v_omnis.root.getBoundingClientRect().height - 45 + "px";
	v_omnis.div.style.left = v_omnis.root.getBoundingClientRect().width - 45 + "px";
	v_omnis.div.style["z-index"] = "99999999";
	v_omnis.div.innerHTML = v_omnis.template;
	document.body.appendChild(v_omnis.div);
	v_omnis.div.addEventListener("click", function () {
		startTutorial("getting_started");
	});

	refreshBootstrapTooltips();
}
// This creates v_connTabControl itself, so unlike plugin_hook.js's
// initHookRegistry it has nothing to poll for -- every other file's
// deferred init that touches v_connTabControl already guards behind a
// `typeof v_connTabControl !== "undefined"` check for exactly this reason.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initWorkspace);
else setTimeout(initWorkspace, 0);

// getOrCreateInstance is idempotent -- calling this again on an already-
// tooltip'd element just returns its existing instance instead of stacking
// a duplicate, so it's safe to re-run every time a tab is (re)selected.
export function refreshBootstrapTooltips() {
	document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
		bootstrap.Tooltip.getOrCreateInstance(el, { animation: true, html: true });
	});
}

/// <summary>
/// Retrieves database list.
/// </summary>
export function getDatabaseList(p_init, p_callback) {
	execAjax(
		"/get_database_list/",
		JSON.stringify({}),
		function (p_return) {
			v_connTabControl.tag.connections = p_return.v_data.v_connections;

			v_connTabControl.tag.groups = p_return.v_data.v_groups;
			v_connTabControl.tag.remote_terminals = p_return.v_data.v_remote_terminals;

			if (p_init) {
				if (v_connTabControl.tag.connections.length > 0) {
					//Create existing tabs
					var v_current_parent = null;
					var v_has_old_tabs = false;
					if (p_return.v_data.v_existing_tabs.length > 0) {
						v_has_old_tabs = true;
					}

					for (var i = 0; i < p_return.v_data.v_existing_tabs.length; i++) {
						if (v_current_parent == null || v_current_parent != p_return.v_data.v_existing_tabs[i].index) {
							startLoading();

							/** @type {any} */
							let v_conn = false;
							let v_name = "";
							let p_tooltip_name = "";
							for (let k = 0; k < v_connTabControl.tag.connections.length; k++) {
								if (p_return.v_data.v_existing_tabs[i].index === v_connTabControl.tag.connections[k].v_conn_id) {
									v_conn = v_connTabControl.tag.connections[k];
									v_name = v_conn.v_alias ? escapeHtml(v_conn.v_alias) : "";
									if (v_conn.v_alias) {
										p_tooltip_name += '<h5 class="mb-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
									}
									if (v_conn.v_details1) {
										p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
									}
									if (v_conn.v_details2) {
										p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
									}
								}
							}
							if (v_conn !== false) {
								v_connTabControl.tag.createConnTab(
									p_return.v_data.v_existing_tabs[i].index,
									false,
									v_name,
									p_tooltip_name,
								);
								v_connTabControl.tag.createConsoleTab();
							}
						}

						v_current_parent = p_return.v_data.v_existing_tabs[i].index;
						v_connTabControl.tag.createQueryTab(
							p_return.v_data.v_existing_tabs[i].title,
							p_return.v_data.v_existing_tabs[i].tab_db_id,
						);
						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.setValue(
							p_return.v_data.v_existing_tabs[i].snippet,
						);
						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.clearSelection();
						v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);
					}

					if (!v_has_old_tabs) {
						//startLoading();
						//v_connTabControl.tag.createConnTab(v_connTabControl.tag.connections[0].v_conn_id);
					}
				} else {
					// When there are no connections, default initial screen is now a welcome tab with tutorials.
				}
			}
			if (p_callback) {
				p_callback();
			}
			endLoading();
		},
		null,
		"box",
	);
}

export function queueChangeActiveDatabaseThreadSafe(p_data) {
	v_connTabControl.tag.change_active_database_call_list.push(p_data);
	if (!v_connTabControl.tag.change_active_database_call_running) {
		changeActiveDatabaseThreadSafe(v_connTabControl.tag.change_active_database_call_list.pop());
	}
}

export function changeActiveDatabaseThreadSafe(p_data) {
	v_connTabControl.tag.change_active_database_call_running = true;
	execAjax(
		"/change_active_database/",
		JSON.stringify(p_data),
		function (p_return) {
			v_connTabControl.tag.change_active_database_call_running = false;
			if (v_connTabControl.tag.change_active_database_call_list.length > 0)
				changeActiveDatabaseThreadSafe(v_connTabControl.tag.change_active_database_call_list.pop());
		},
		null,
		"box",
	);
}

/// <summary>
/// Changing database in the current connection tab.
/// </summary>
export function changeDatabase(p_value) {
	// Emptying the details of the connected db.
	v_connTabControl.selectedTab.tag.divDetails.innerHTML = "";

	// Finding the connection object.
	/** @type {any} */
	var v_conn_object = null;
	for (var i = 0; i < v_connTabControl.tag.connections.length; i++) {
		if (p_value == v_connTabControl.tag.connections[i].v_conn_id) {
			v_conn_object = v_connTabControl.tag.connections[i];
			break;
		}
	}
	// Selecting the first connection when none is found.
	if (!v_conn_object) {
		v_conn_object = v_connTabControl.tag.connections[0];
	}

	v_connTabControl.selectedTab.tag.selectedDatabaseIndex = parseInt(p_value);
	v_connTabControl.selectedTab.tag.selectedDBMS = v_conn_object.v_db_type;
	v_connTabControl.selectedTab.tag.consoleHelp = v_conn_object.v_console_help;
	v_connTabControl.selectedTab.tag.selectedDatabase = v_conn_object.v_database;
	v_connTabControl.selectedTab.tag.selectedTitle = v_conn_object.v_alias;

	queueChangeActiveDatabaseThreadSafe({
		p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
		p_tab_id: v_connTabControl.selectedTab.id,
		p_database: v_connTabControl.selectedTab.tag.selectedDatabase,
	});

	if (v_conn_object.v_db_type == "postgresql") {
		getTreePostgresql(v_connTabControl.selectedTab.tag.divTree.id);
	} else if (v_conn_object.v_db_type == "oracle") {
		getTreeOracle(v_connTabControl.selectedTab.tag.divTree.id);
	} else if (v_conn_object.v_db_type == "mysql") {
		getTreeMysql(v_connTabControl.selectedTab.tag.divTree.id);
	} else if (v_conn_object.v_db_type == "mariadb") {
		getTreeMariadb(v_connTabControl.selectedTab.tag.divTree.id);
	} else if (v_conn_object.v_db_type == "sqlite") {
		getTreeSqlite(v_connTabControl.selectedTab.tag.divTree.id);
	}
}

/// <summary>
/// Check if there are troublesome tabs
/// </summary>
/// <param name="p_cancel_function">Ok function.</param>
/// <param name="p_ok_function">Cancel function.</param>
export function checkBeforeChangeDatabase(p_cancel_function, p_ok_function) {
	for (var i = 0; i < v_connTabControl.selectedTab.tag.tabControl.tabList.length; i++) {
		var v_tab = v_connTabControl.selectedTab.tag.tabControl.tabList[i];
		if (v_tab.tag != null) {
			if (
				v_tab.tag.mode == "edit" ||
				v_tab.tag.mode == "alter" ||
				v_tab.tag.mode == "monitor_dashboard" ||
				v_tab.tag.mode == "data_mining"
			) {
				showAlert(
					"Before changing connection please close any tab that belongs to the following types: <br/><br/><b>Edit Data<br/><br/>Alter Table<br/><br/>Monitoring Dashboard<br/><br/>Advanced Object Search",
					null,
					null,
					true,
				);
				//v_connTabControl.selectedTab.tag.dd_object.set("selectedIndex",v_connTabControl.selectedTab.tag.dd_selected_index);
				if (p_cancel_function != null) {
					p_cancel_function();
				}
				return null;
			}
		}
	}
	if (p_ok_function != null) {
		p_ok_function();
	}
}

export function adjustQueryTabObjects(p_all_tabs) {
	var v_dbms = v_connTabControl.selectedTab.tag.selectedDBMS;

	var v_target_div = p_all_tabs
		? v_connTabControl.selectedTab.elementDiv
		: v_connTabControl.selectedTab.tag.tabControl.selectedTab.elementDiv;

	v_target_div.querySelectorAll(".dbms_object").forEach(function (el) {
		el.style.display = "none";
	});

	v_target_div.querySelectorAll("." + v_dbms + "_object").forEach(function (el) {
		if (!el.classList.contains("dbms_object_hidden")) {
			el.style.display = "inline-block";
		}
	});
}

/// <summary>
/// Draws graph.
/// </summary>
export function drawGraph(p_all, p_schema) {
	execAjax(
		"/draw_graph/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_complete: p_all,
			p_schema: p_schema,
		}),
		function (p_return) {
			v_nodes = [];
			v_edges = [];

			for (var i = 0; i < p_return.v_data.v_nodes.length; i++) {
				/** @type {any} */
				var v_node_object = {};
				v_node_object.data = {};
				v_node_object.position = {};
				v_node_object.data.id = p_return.v_data.v_nodes[i].id;
				v_node_object.data.label = p_return.v_data.v_nodes[i].label;
				v_node_object.classes = "group" + p_return.v_data.v_nodes[i].group;

				v_nodes.push(v_node_object);
			}

			for (var i = 0; i < p_return.v_data.v_edges.length; i++) {
				/** @type {any} */
				var v_edge_object = {};
				v_edge_object.data = {};
				v_edge_object.data.source = p_return.v_data.v_edges[i].from;
				v_edge_object.data.target = p_return.v_data.v_edges[i].to;
				v_edge_object.data.label = p_return.v_data.v_edges[i].label;
				v_edge_object.data.faveColor = "#9dbaea";
				v_edge_object.data.arrowColor = "#9dbaea";
				v_edges.push(v_edge_object);
			}

			v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.network = window.cy = cytoscape({
				container: v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.graph_div,
				boxSelectionEnabled: false,
				autounselectify: true,
				layout: {
					name: "spread",
					idealEdgeLength: 100,
					nodeOverlap: 20,
				},
				style: [
					{
						selector: "node",
						style: {
							content: "data(label)",
							"text-opacity": 0.5,
							"text-valign": "top",
							"text-halign": "right",
							"background-color": "#11479e",
							"text-wrap": "wrap",
						},
					},
					{
						selector: "node.group0",
						style: {
							"background-color": "slategrey",
							shape: "square",
						},
					},
					{
						selector: "node.group1",
						style: {
							"background-color": "blue",
						},
					},
					{
						selector: "node.group2",
						style: {
							"background-color": "cyan",
						},
					},
					{
						selector: "node.group3",
						style: {
							"background-color": "lightgreen",
						},
					},
					{
						selector: "node.group4",
						style: {
							"background-color": "yellow",
						},
					},
					{
						selector: "node.group5",
						style: {
							"background-color": "orange",
						},
					},
					{
						selector: "node.group6",
						style: {
							"background-color": "red",
						},
					},

					{
						selector: "edge",
						style: {
							"curve-style": "bezier",
							"target-arrow-shape": "triangle",
							"target-arrow-color": "data(faveColor)",
							"line-color": "data(arrowColor)",
							"text-opacity": 0.75,
							width: 2,
							"control-point-distances": 50,
							content: "data(label)",
							"text-wrap": "wrap",
							"edge-text-rotation": "autorotate",
							"line-style": "solid",
						},
					},
				],

				elements: {
					nodes: v_nodes,
					edges: v_edges,
				},
			});
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						drawGraph(p_all, p_schema);
					},
					null,
					p_return.v_data.message,
				);
			}
		},
		"box",
	);
}

/// <summary>
/// Rename tab.
/// </summary>
export function renameTab(p_tab) {
	showConfirm(
		"",
		function () {
			renameTabConfirm(p_tab, /** @type {HTMLInputElement} */ (document.getElementById("tab_name")).value);
		},
		null,
		function () {
			// Built as a real DOM node, not an HTML string — showConfirm's
			// content div only renders plain text (see notification_control.js).
			var v_input = document.createElement("input");
			v_input.id = "tab_name";
			v_input.className = "form-control";
			v_input.style.width = "100%";
			/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).appendChild(v_input);

			v_input.value = p_tab.tag.tab_title_span.textContent;
			v_input.onkeydown = function () {
				if (/** @type {any} */ (event).keyCode == 13) {
					/** @type {HTMLElement} */ (document.getElementById("modal_message_ok")).click();
				} else if (/** @type {any} */ (event).keyCode == 27) {
					/** @type {HTMLElement} */ (document.getElementById("modal_message_cancel")).click();
				}
			};
			v_input.focus();
			v_input.selectionStart = 0;
			v_input.selectionEnd = 10000;
		},
	);
}

/// <summary>
/// Renames tab.
/// </summary>
export function renameTabConfirm(p_tab, p_name) {
	p_tab.tag.tab_title_span.textContent = p_name;
}

/// <summary>
/// Removes tab.
/// </summary>
export function removeTab(p_tab) {
	if (p_tab.tag.ht != null) {
		p_tab.tag.ht.destroy();
		p_tab.tag.div_result.innerHTML = "";
	}

	if (p_tab.tag.editor != null) p_tab.tag.editor.destroy();

	if (
		p_tab.tag.mode == "query" ||
		p_tab.tag.mode == "edit" ||
		p_tab.tag.mode == "console" ||
		p_tab.tag.mode == "outer_terminal"
	) {
		var v_message_data = { tab_id: p_tab.tag.tab_id, tab_db_id: null };
		if (p_tab.tag.mode == "query") {
			v_message_data.tab_db_id = p_tab.tag.tab_db_id;
		}

		createRequest(v_queryRequestCodes.CloseTab, [v_message_data]);
	}
	p_tab.removeTab();
}

/// <summary>
/// Resizes the snippets section's tree/editor split. Snippets is a
/// full-screen section now (see section_switcher.js), not a slide-in
/// overlay, so this only sizes the tree/editor divs to fill it -- no more
/// computing how far to peek above the underlying connection view.
/// </summary>
/** @param {number|false} [p_left_pos_x] */
export var resizeSnippetPanel = async function (p_left_pos_x = false) {
	if (v_connTabControl.snippet_tag === undefined) return;

	var v_snippet_tag = v_connTabControl.snippet_tag;
	var v_section = document.getElementById("omnidb__section_snippets");
	if (!v_section || !v_section.classList.contains("omnidb__section--active")) return;

	var v_inner_snippet_tag = v_snippet_tag.tabControl.selectedTab.tag;

	var updateOuterSnippetLayout = new Promise((resolve) => {
		setTimeout(function () {
			var v_totalWidth = v_snippet_tag.divLayoutGrid.getBoundingClientRect().width;
			var v_max_allowed_left_width = v_totalWidth - 50;
			var v_div_left = v_snippet_tag.divLeft;

			let v_left_pos_x = v_div_left.getBoundingClientRect().width;
			if (p_left_pos_x) {
				var v_div_left_offset = v_div_left.getBoundingClientRect().left;
				v_left_pos_x = p_left_pos_x - v_div_left_offset;
			}

			var v_pixel_value = v_left_pos_x > 50 && v_left_pos_x < v_max_allowed_left_width ? v_left_pos_x : 120;

			var v_left_width_value = v_pixel_value + "px";

			v_div_left.style["max-width"] = v_left_width_value;
			v_div_left.style["flex"] = "0 0 " + v_left_width_value;

			var v_div_left_width = v_snippet_tag.divLeft.getBoundingClientRect().width;

			var v_div_right = v_snippet_tag.divRight;
			var v_right_width_value = v_totalWidth - v_div_left_width + "px";

			v_div_right.style["max-width"] = v_right_width_value;
			v_div_right.style["flex"] = "0 0 " + v_right_width_value;

			var v_panel_height = /** @type {HTMLElement} */ (v_section).getBoundingClientRect().height;

			resolve(v_panel_height);
		}, 0);
	});

	await updateOuterSnippetLayout.then(function (v_panel_height) {
		if (v_inner_snippet_tag.editor !== undefined) {
			v_snippet_tag.divTree.style.height = v_panel_height + "px";
			v_inner_snippet_tag.editorDiv.style.height = v_panel_height - 7 * v_font_size + "px";
			v_inner_snippet_tag.editor.resize();
		}
	});
};

/// <summary>
/// Resize SQL editor and result div.
/// </summary>
export function resizeTreeVertical(event) {
	var v_verticalLine = document.createElement("div");
	v_verticalLine.id = "vertical-resize-line";
	v_connTabControl.selectedTab.tag.divLeft.appendChild(v_verticalLine);

	document.body.addEventListener("mousemove", getVerticalLinePosition);

	v_start_height = event.screenY;
	document.body.addEventListener("mouseup", resizeTreeVerticalEnd);
}

/// <summary>
/// Resize SQL editor and result div.
/// </summary>
export function resizeTreeVerticalEnd(event) {
	document.body.removeEventListener("mouseup", resizeTreeVerticalEnd);
	/** @type {HTMLElement} */ (document.getElementById("vertical-resize-line")).remove();

	document.body.removeEventListener("mousemove", getVerticalLinePosition);

	var v_height_diff = event.screenY - v_start_height;

	var v_tag = v_connTabControl.selectedTab.tag;

	var v_tree_div = v_tag.divTree;
	/** @type {any} */
	var v_result_div = null;

	var v_tree_tabs_div = v_tag.divTreeTabs;

	var v_tree_tabs_height = v_tag.divLeft.clientHeight - 14 - event.pageY;
	v_tree_tabs_div.style.flexBasis = v_tree_tabs_height + "px";

	var v_inner_height = v_tree_tabs_height - 49 + "px";

	if (v_tag.currTreeTab == "properties") {
		v_result_div = v_tag.divProperties;
	} else if (v_tag.currTreeTab == "ddl") {
		v_result_div = v_tag.divDDL;
	}

	v_tree_div.style.height = parseInt(v_tree_div.clientHeight, 10) + v_height_diff + "px";
	v_result_div.style.height = v_inner_height;

	if (v_tag.currTreeTab == "properties") {
		v_tag.gridProperties.render();
	} else if (v_tag.currTreeTab == "ddl") {
		v_tag.ddlEditor.resize();
	}
}

/// <summary>
/// Redefines horizontal resize line position.
/// </summary>
export function horizontalLinePosition(p_event) {
	/** @type {HTMLElement} */ (document.getElementById("horizontal-resize-line")).style.left = p_event.pageX + "px";
}

/// <summary>
/// Resize Snippet panel editor horizontally.
/// </summary>
export function resizeConnectionHorizontal(event) {
	event.preventDefault();
	var v_horizontalLine = document.createElement("div");
	v_horizontalLine.id = "horizontal-resize-line";
	v_connTabControl.selectedDiv.appendChild(v_horizontalLine);

	document.body.addEventListener("mousemove", horizontalLinePosition);

	v_start_width = event.x;
	document.body.addEventListener("mouseup", resizeConnectionHorizontalEnd);
}

/// <summary>
/// Resize Connection tab horizontally.
/// </summary>
export function resizeConnectionHorizontalEnd(event) {
	document.body.removeEventListener("mouseup", resizeConnectionHorizontalEnd);
	var v_horizontal_line = document.getElementById("horizontal-resize-line");
	if (v_horizontal_line) {
		v_horizontal_line.remove();
	}

	document.body.removeEventListener("mousemove", horizontalLinePosition);

	var v_div_left = v_connTabControl.selectedTab.tag.divLeft;
	var v_totalWidth = v_connTabControl.selectedDiv.getBoundingClientRect().width;

	var v_paddingCompensation = 8;
	var v_offsetLeft = v_div_left.getBoundingClientRect().left;
	var v_mousePosX = event.x;

	var v_pixel_value = v_mousePosX > v_offsetLeft ? v_paddingCompensation + v_mousePosX - v_offsetLeft : 0;

	var v_left_width_value = v_pixel_value + "px";

	v_div_left.style["max-width"] = v_left_width_value;
	v_div_left.style["width"] = v_left_width_value;

	var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

	refreshHeights();
}

/// <summary>
/// Resize Snippet panel editor horizontally.
/// </summary>
export function resizeSnippetHorizontal(event) {
	event.preventDefault();
	var v_horizontalLine = document.createElement("div");
	v_horizontalLine.id = "horizontal-resize-line";
	v_connTabControl.snippet_tag.divPanel.appendChild(v_horizontalLine);

	document.body.addEventListener("mousemove", horizontalLinePosition);

	v_start_width = event.x;
	document.body.addEventListener("mouseup", resizeSnippetHorizontalEnd);
}

/// <summary>
/// Resize Snippet panel editor horizontally.
/// </summary>
export function resizeSnippetHorizontalEnd(event) {
	document.body.removeEventListener("mouseup", resizeSnippetHorizontalEnd);
	/** @type {HTMLElement} */ (document.getElementById("horizontal-resize-line")).remove();

	document.body.removeEventListener("mousemove", horizontalLinePosition);

	var v_mousePosX = event.x;

	resizeSnippetPanel(v_mousePosX);
}

/// <summary>
/// Resize SQL editor and result div.
/// </summary>
export function resizeVertical(event) {
	event.preventDefault();
	var v_verticalLine = document.createElement("div");
	v_verticalLine.id = "vertical-resize-line";
	v_connTabControl.selectedTab.tag.divRight.appendChild(v_verticalLine);

	document.body.addEventListener("mousemove", getVerticalLinePosition);

	v_start_height = event.screenY;
	document.body.addEventListener("mouseup", resizeVerticalEnd);
}

/// <summary>
/// Resize SQL editor and result div.
/// </summary>
export function resizeVerticalEnd(event) {
	document.body.removeEventListener("mouseup", resizeVerticalEnd);
	/** @type {HTMLElement} */ (document.getElementById("vertical-resize-line")).remove();

	document.body.removeEventListener("mousemove", getVerticalLinePosition);

	var v_height_diff = event.screenY - v_start_height;

	var v_editor_div = /** @type {HTMLElement} */ (
		document.getElementById(v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editorDivId)
	);
	var v_result_div = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;

	if (v_height_diff < 0) {
		if (Math.abs(v_height_diff) > parseInt(v_editor_div.style.height, 10))
			v_height_diff = parseInt(v_editor_div.style.height, 10) * -1 + 10;
	} else {
		if (Math.abs(v_height_diff) > parseInt(v_result_div.style.height, 10))
			v_height_diff = parseInt(v_result_div.style.height, 10) - 10;
	}
	v_editor_div.style.height = parseInt(v_editor_div.style.height, 10) + v_height_diff + "px";
	v_result_div.style.height = parseInt(v_result_div.style.height, 10) - v_height_diff + "px";

	refreshHeights();
}

export function resizeWindow() {
	refreshHeights(true);
}

export var resizeTimeout;
window.addEventListener("resize", function () {
	clearTimeout(resizeTimeout);
	resizeTimeout = setTimeout(resizeWindow, 200);
});

/// <summary>
/// Refresh divs sizes and components of the currently selected tab
/// </summary>
export function refreshHeights(p_all) {
	setTimeout(function () {
		//Adjusting tree height
		// if (p_all) {
		//   refreshTreeHeight();
		// }

		// No open connection/terminal tab (e.g. the Database section is
		// empty, or another section is active) -- nothing below this point
		// applies.
		if (!v_connTabControl.selectedTab) return;

		if (v_connections_data && v_connections_data.v_active) {
			v_connections_data.ht.render();
		}

		if (v_connTabControl.selectedTab.tag.mode == "monitor_all") {
			v_connTabControl.selectedTab.tag.tabControlDiv.style.height =
				window.innerHeight -
				(v_connTabControl.selectedTab.tag.tabControlDiv.getBoundingClientRect().top + window.scrollY) -
				1.5 * v_font_size +
				"px";
		}
		if (v_connTabControl.selectedTab.tag.mode == "connection") {
			refreshOuterConnectionHeights();
		} else if (v_connTabControl.selectedTab.tag.mode == "outer_terminal") {
			v_connTabControl.selectedTab.tag.div_console.style.height =
				window.innerHeight -
				(v_connTabControl.selectedTab.tag.div_console.getBoundingClientRect().top + window.scrollY) -
				1.25 * v_font_size +
				"px";
			v_connTabControl.selectedTab.tag.editor_console.fit();
		}

		//If inner tab exists
		if (v_connTabControl.selectedTab.tag.tabControl != null && v_connTabControl.selectedTab.tag.tabControl.selectedTab) {
			var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;

			if (
				v_tab_tag.mode == "console" ||
				v_tab_tag.mode == "edit" ||
				v_tab_tag.mode == "graph" ||
				v_tab_tag.mode == "monitor_dashboard" ||
				v_tab_tag.mode == "monitor_grid" ||
				v_tab_tag.mode == "monitor_unit" ||
				v_tab_tag.mode == "query" ||
				v_tab_tag.mode == "website" ||
				v_tab_tag.mode == "website_outer"
			) {
				v_tab_tag.resize();
			}
			else if (v_tab_tag.mode == "alter") {
				if (v_tab_tag.alterTableObject.window == "columns") {
					var v_height = window.innerHeight - (v_tab_tag.htDivColumns.getBoundingClientRect().top + window.scrollY) - 45;
					v_tab_tag.htDivColumns.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htColumns != null) {
						v_tab_tag.alterTableObject.htColumns.render();
					}
				} else if (v_tab_tag.alterTableObject.window == "constraints") {
					var v_height =
						window.innerHeight - (v_tab_tag.htDivConstraints.getBoundingClientRect().top + window.scrollY) - 45;
					v_tab_tag.htDivConstraints.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htConstraints != null) {
						v_tab_tag.alterTableObject.htConstraints.render();
					}
				} else {
					var v_height = window.innerHeight - (v_tab_tag.htDivIndexes.getBoundingClientRect().top + window.scrollY) - 45;
					v_tab_tag.htDivIndexes.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htIndexes != null) {
						v_tab_tag.alterTableObject.htIndexes.render();
					}
				}
			} else if (v_tab_tag.mode == "data_mining") {
				if (v_tab_tag.currQueryTab == "data") {
					v_tab_tag.div_result.style.height =
						window.innerHeight -
						(v_tab_tag.div_result.getBoundingClientRect().top + window.scrollY) -
						1.25 * v_font_size +
						"px";
				}
			}
		}

		// Updating tree sizes
		refreshTreeHeight();

		// Hooks
		if (v_connTabControl.tag.hooks.windowResize.length > 0) {
			for (var i = 0; i < v_connTabControl.tag.hooks.windowResize.length; i++) v_connTabControl.tag.hooks.windowResize[i]();
		}

		// Snippet panel
		resizeSnippetPanel();

		// Updating position of omnis.
		if (v_omnis) {
			if (v_omnis.omnis_ui_assistant) {
				v_omnis.omnis_ui_assistant.goToStep(v_omnis.omnis_ui_assistant.stepSelected);
			} else if (v_omnis.div) {
				v_omnis.div.style.top = v_omnis.root.getBoundingClientRect().height - 45 + "px";
				v_omnis.div.style.left = v_omnis.root.getBoundingClientRect().width - 45 + "px";
			}
		}
	}, 351);
}

export function refreshTreeHeight() {
	var v_tag = v_connTabControl.selectedTab.tag;

	if (v_tag.currTreeTab == "properties") {
		var v_height = window.innerHeight - (v_tag.divProperties.getBoundingClientRect().top + window.scrollY) - 15;
		v_tag.divProperties.style.height = v_height + "px";
		v_tag.gridProperties.render();
	} else if (v_tag.currTreeTab == "ddl") {
		var v_height = window.innerHeight - (v_tag.divDDL.getBoundingClientRect().top + window.scrollY) - 15;
		v_tag.divDDL.style.height = v_height + "px";
		v_tag.ddlEditor.resize();
	}
}

export function checkTabStatus(v_tab) {
	if (v_tab.tag.tabControl.selectedTab.tag.mode == "query") checkQueryStatus(v_tab.tag.tabControl.selectedTab);
	else if (v_tab.tag.tabControl.selectedTab.tag.mode == "edit") checkEditDataStatus(v_tab.tag.tabControl.selectedTab);
	else if (v_tab.tag.tabControl.selectedTab.tag.mode == "console") checkConsoleStatus(v_tab.tag.tabControl.selectedTab);
}

/// <summary>
/// Indent SQL.
/// </summary>
/** @param {string|false} [p_mode] */
export function indentSQL(p_mode = false) {
	/** @type {any} */
	var v_tab_tag = null;
	/** @type {any} */
	var v_editor = null;
	let v_mode = p_mode;

	if (v_mode == "snippet") {
		v_tab_tag = v_connTabControl.snippet_tag.tabControl.selectedTab.tag;
		v_editor = v_tab_tag.editor;
	} else {
		if (v_connTabControl.selectedTab.tag.tabControl) {
			v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
			v_mode = v_tab_tag.mode;

			if (v_mode == "query") {
				v_editor = v_tab_tag.editor;
			} else if (v_mode == "console") {
				v_editor = v_tab_tag.editor_input;
			}
		}
	}

	if (v_mode) {
		var v_sql_value = v_editor.getValue();

		if (v_sql_value.trim() == "") {
			showAlert("Please provide a string.");
		} else {
			execAjax(
				"/indent_sql/",
				JSON.stringify({
					p_sql: v_sql_value,
					p_indent_char: v_indent_char || 'space',
					p_indent_size: v_indent_size || 4,
					p_comma_style: v_comma_style || 'leading',
					p_keyword_case: v_keyword_case || 'preserve',
				}),
				function (p_return) {
					v_editor.setValue(p_return.v_data);
					v_editor.clearSelection();
					v_editor.gotoLine(0, 0, true);
				},
				null,
				"box",
			);
		}
	}
}

export function showMenuNewTabOuter(e) {
	// Popup listing existing connections/terminals to open as a new tab.
	// Creating a *new* connection is handled by the Connections section now
	// (see section_switcher.js), not from here.
	{
		var v_option_list = [];
		//Hooks
		if (v_connTabControl.tag.hooks.outerTabMenu.length > 0) {
			for (var i = 0; i < v_connTabControl.tag.hooks.outerTabMenu.length; i++) {
				v_option_list = v_option_list.concat(v_connTabControl.tag.hooks.outerTabMenu[i]());
			}
		}

		if (v_show_terminal_option) {
			v_option_list.push({
				text: "Local Terminal",
				icon: "fas cm-all fa-terminal",
				action: function () {
					v_connTabControl.tag.createOuterTerminalTab();
				},
			});
		}

		// Building connection list
		if (v_connTabControl.tag.connections.length > 0) {
			// No custom groups, render all connections in the same list
			if (v_connTabControl.tag.groups.length == 1) {
				var v_submenu_connection_list = [];

				for (var i = 0; i < v_connTabControl.tag.connections.length; i++)
					(function (i) {
						var v_conn = v_connTabControl.tag.connections[i];
						var v_conn_name = "";
						let p_tooltip_name = "";
						let v_name = "";
						if (v_conn.v_public) {
							v_conn_name += '<i class="fas fa-users mr-3" style="color:#c57dd2;"></i>';
						}
						if (v_conn.v_alias && v_conn.v_alias !== "") {
							v_name = escapeHtml(v_conn.v_alias);
							v_conn_name += "(" + escapeHtml(v_conn.v_alias) + ")";
							p_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
						}
						if (v_conn.v_conn_string && v_conn.v_conn_string !== "") {
							v_conn_name += " " + escapeHtml(v_conn.v_conn_string);
							p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_conn_string) + "</div>";
						} else {
							if (v_conn.v_details1) {
								v_conn_name += escapeHtml(v_conn.v_details1);
								p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
							}
							if (v_conn.v_details2) {
								v_conn_name += " - " + escapeHtml(v_conn.v_details2);
								p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
							}
						}
						v_submenu_connection_list.push({
							text: v_conn_name,
							icon: "fas cm-all node-" + v_conn.v_db_type,
							action: function () {
								v_connTabControl.tag.createConnTab(v_conn.v_conn_id, true, v_name, p_tooltip_name);
							},
						});
					})(i);

				// Flattened directly into the menu -- this popup only ever
				// lists connections, so a redundant "Connections" wrapper
				// node around all of them added nothing.
				v_option_list = v_option_list.concat(v_submenu_connection_list);
			}
			//Render connections split in groups
			else {
				var v_group_list = [];

				for (var i = 0; i < v_connTabControl.tag.groups.length; i++)
					(function (i) {
						var v_current_group = v_connTabControl.tag.groups[i];

						var v_group_connections = [];

						//First group, add all connections
						if (i == 0) {
							for (var k = 0; k < v_connTabControl.tag.connections.length; k++)
								(function (k) {
									var v_conn = v_connTabControl.tag.connections[k];
									var v_conn_name = "";
									let p_tooltip_name = "";
									let v_name = "";
									if (v_conn.v_public) {
										v_conn_name += '<i class="fas fa-users mr-3" style="color:#c57dd2;"></i>';
									}
									if (v_conn.v_alias && v_conn.v_alias !== "") {
										v_name = escapeHtml(v_conn.v_alias);
										v_conn_name += "(" + escapeHtml(v_conn.v_alias) + ")";
										p_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
									}
									if (v_conn.v_conn_string && v_conn.v_conn_string !== "") {
										v_conn_name += " " + escapeHtml(v_conn.v_conn_string);
										p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_conn_string) + "</div>";
									} else {
										if (v_conn.v_details1) {
											v_conn_name += escapeHtml(v_conn.v_details1);
											p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
										}
										if (v_conn.v_details2) {
											v_conn_name += " - " + escapeHtml(v_conn.v_details2);
											p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
										}
									}
									v_group_connections.push({
										text: v_conn_name,
										icon: "fas cm-all node-" + v_conn.v_db_type,
										action: function () {
											startLoading();
											setTimeout(function () {
												v_connTabControl.tag.createConnTab(v_conn.v_conn_id, true, v_name, p_tooltip_name);
											}, 0);
										},
									});
								})(k);
						} else {
							for (var j = 0; j < v_current_group.conn_list.length; j++) {
								//Search corresponding connection to use its data
								for (var k = 0; k < v_connTabControl.tag.connections.length; k++)
									(function (k) {
										var v_conn = v_connTabControl.tag.connections[k];
										var v_conn_name = "";
										let p_tooltip_name = "";
										let v_name = "";
										if (v_conn.v_public) {
											v_conn_name += '<i class="fas fa-users mr-3" style="color:#c57dd2;"></i>';
										}
										if (v_conn.v_alias && v_conn.v_alias !== "") {
											v_name = escapeHtml(v_conn.v_alias);
											v_conn_name += "(" + escapeHtml(v_conn.v_alias) + ")";
											p_tooltip_name += '<h5 class="my-1">' + escapeHtml(v_conn.v_alias) + "</h5>";
										}
										if (v_conn.v_conn_string && v_conn.v_conn_string !== "") {
											v_conn_name += " " + escapeHtml(v_conn.v_conn_string);
											p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_conn_string) + "</div>";
										} else {
											if (v_conn.v_details1) {
												v_conn_name += escapeHtml(v_conn.v_details1);
												p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details1) + "</div>";
											}
											if (v_conn.v_details2) {
												v_conn_name += " - " + escapeHtml(v_conn.v_details2);
												p_tooltip_name += '<div class="mb-1">' + escapeHtml(v_conn.v_details2) + "</div>";
											}
										}
										if (v_conn.v_conn_id == v_current_group.conn_list[j]) {
											v_group_connections.push({
												text: v_conn_name,
												icon: "fas cm-all node-" + v_conn.v_db_type,
												action: function () {
													startLoading();
													setTimeout(function () {
														v_connTabControl.tag.createConnTab(v_conn.v_conn_id, true, v_name, p_tooltip_name);
													}, 0);
												},
											});
											return;
										}
									})(k);
							}
						}

						var v_group_data = {
							text: v_current_group.v_name,
							icon: "fas cm-all fa-plug",
							submenu: {
								elements: v_group_connections,
							},
						};

						v_group_list.push(v_group_data);
					})(i);

				// Each group stays its own submenu (the group name is real
				// information), just not additionally nested under a
				// redundant outer "Connections" node.
				v_option_list = v_option_list.concat(v_group_list);
			}
		}

		if (v_connTabControl.tag.remote_terminals.length > 0) {
			var v_submenu_terminal_list = [];

			for (var i = 0; i < v_connTabControl.tag.remote_terminals.length; i++)
				(function (i) {
					var v_term = v_connTabControl.tag.remote_terminals[i];
					var v_name = v_term.v_alias;
					var v_term_name = "";
					if (v_term.v_alias && v_term.v_alias !== "") {
						v_term_name = "(" + v_term.v_alias + ") ";
					}
					if (v_term.v_details) {
						v_term_name += v_term.v_details;
					}
					v_submenu_terminal_list.push({
						text: v_term_name,
						icon: "fas cm-all fa-terminal",
						action: function () {
							v_connTabControl.tag.createOuterTerminalTab(v_term.v_conn_id, v_name, v_term.v_details);
						},
					});
				})(i);

			v_option_list.push({
				text: "SSH Consoles",
				icon: "fas cm-all fa-terminal",
				submenu: {
					elements: v_submenu_terminal_list,
				},
			});
		}

		if (v_option_list.length > 0) {
			customMenu(
				{
					x: e.clientX + 5,
					y: e.clientY + 5,
				},
				v_option_list,
				null,
			);
		} else {
			startLoading();
			setTimeout(function () {
				v_connTabControl.tag.createConnTab();
			}, 0);
		}
	}
}

export function showMenuNewTab(e) {
	var v_option_list = [
		{
			text: "Query Tab",
			icon: "fas cm-all fa-search",
			action: function () {
				v_connTabControl.tag.createQueryTab();
			},
		},
		{
			text: "Console Tab",
			icon: "fas cm-all fa-terminal",
			action: function () {
				v_connTabControl.tag.createConsoleTab();
			},
		},
	];

	if (
		v_connTabControl.selectedTab.tag.selectedDBMS == "postgresql" ||
		v_connTabControl.selectedTab.tag.selectedDBMS == "mysql" ||
		v_connTabControl.selectedTab.tag.selectedDBMS == "mariadb"
	) {
		v_option_list.push({
			text: "Monitoring Dashboard",
			icon: "fas cm-all fa-chart-line",
			action: function () {
				v_connTabControl.tag.createMonitorDashboardTab();
				startMonitorDashboard();
			},
		});
	}

	if (v_connTabControl.selectedTab.tag.selectedDBMS == "postgresql") {
		v_option_list.push({
			text: "Backends",
			icon: "fas cm-all fa-tasks",
			action: function () {
				v_connTabControl.tag.createMonitoringTab("Backends", "select * from pg_stat_activity", [
					{
						icon: "fas fa-times action-grid action-close text-danger",
						title: "Terminate",
						action: "postgresqlTerminateBackend",
					},
				]);
			},
		});
	} else if (
		v_connTabControl.selectedTab.tag.selectedDBMS == "mysql" ||
		v_connTabControl.selectedTab.tag.selectedDBMS == "mariadb"
	) {
		v_option_list.push({
			text: "Process List",
			icon: "fas cm-all fa-tasks",
			action: function () {
				v_connTabControl.tag.createMonitoringTab("Process List", "select * from information_schema.processlist", [
					{
						icon: "fas fa-times action-grid action-close text-danger",
						title: "Terminate",
						action: "mysqlTerminateBackend",
					},
				]);
			},
		});
	}

	//Hooks
	if (v_connTabControl.tag.hooks.innerTabMenu.length > 0) {
		for (var i = 0; i < v_connTabControl.tag.hooks.innerTabMenu.length; i++) {
			v_option_list = v_option_list.concat(v_connTabControl.tag.hooks.innerTabMenu[i]());
		}
	}

	customMenu(
		{
			x: e.clientX + 5,
			y: e.clientY + 5,
		},
		v_option_list,
		null,
	);
}

export function toggleTreeContainer() {
	var v_tab_tag = v_connTabControl.selectedTab.tag;
	if (v_tab_tag.divLeft) {
		v_tab_tag.divLeft.classList.toggle("omnidb__workspace__div-left--shrink");
		refreshHeights();
	}
}

export function toggleTreeTabsContainer(p_target_id, p_horizonta_line_id) {
	var v_tab_tag = v_connTabControl.selectedTab.tag;
	var v_target_element = /** @type {HTMLElement} */ (document.getElementById(p_target_id));
	var v_horizontal_line_element = /** @type {HTMLElement} */ (document.getElementById(p_horizonta_line_id));
	if (v_target_element.classList.contains("omnidb__tree-tabs--not-in-view")) {
		v_target_element.classList.remove("omnidb__tree-tabs--not-in-view");
		v_horizontal_line_element.classList.remove("d-none");
		v_tab_tag.treeTabsVisible = true;
		setTimeout(function () {
			refreshTreeHeight();
		}, 360);
	} else {
		v_target_element.classList.add("omnidb__tree-tabs--not-in-view");
		v_horizontal_line_element.classList.add("d-none");
		v_tab_tag.treeTabsVisible = false;
	}
}

export function dragStart(event, gridContainer) {
	try {
		event.dataTransfer.setData("Text", event.target.id);
		event.dataTransfer.effectAllowed = "move";
		gridContainer.classList.add("omnidb__workspace-resize-grid--active");
		event.srcElement.classList.add("omnidb__workspace-resize-grid__draggable--is-dragging");
	} catch (e) {}
}

export function dragEnd(event, grid_container) {
	grid_container.classList.remove("omnidb__workspace-resize-grid--active");
	event.target.classList.remove("omnidb__workspace-resize-grid__draggable--is-dragging");
}

export function dragEnter(event) {
	event.target.classList.add("omnidb__workspace-resize-grid__column--enter");
}

export function dragLeave(event) {
	event.target.classList.remove("omnidb__workspace-resize-grid__column--enter");
}

export function allowDrop(event) {
	event.preventDefault();
}

export function drop(event, grid_container, div_left, div_right) {
	event.preventDefault();
	try {
		var data = event.dataTransfer.getData("Text");
		event.target.appendChild(document.getElementById(data));

		let pos = parseInt(event.srcElement.getBoundingClientRect().left);
		let space = window.innerWidth;
		let cells = Math.round((pos * 12) / space);

		div_left.classList = [" omnidb__workspace__div-left col-md-" + cells];
		div_right.classList = [" omnidb__workspace__div-right col-md-" + (12 - cells)];

		let cols = document.getElementsByClassName("omnidb__workspace-resize-grid__column");
		for (let i = 0; i < cols.length; i++) {
			document
				.getElementsByClassName("omnidb__workspace-resize-grid__column")
				[i].classList.remove("omnidb__workspace-resize-grid__column--enter");
		}
		v_connTabControl.selectedTab.tag.gridProperties.render();
	} catch (e) {}
}

/**
 * ## getVerticalLinePosition
 * @desc Gets the Y position of the pointer event.
 *
 * @param  {Object} p_event UI action pointer event.
 */
export function getVerticalLinePosition(p_event) {
	/** @type {HTMLElement} */ (document.getElementById("vertical-resize-line")).style.top = p_event.pageY + "px";
}

export function toggleExpandToPanelView(p_target_id) {
	let v_target = document.getElementById(p_target_id);
	if (v_target) {
		v_target.classList.toggle("omnidb__panel-view--full");
		setTimeout(function () {
			refreshHeights();
		}, 350);
	}
}

export function toggleExplainContext() {
	if (v_explain_control.context === "default") {
		v_explain_control.context = "legere";
	} else {
		v_explain_control.context = "default";
	}

	updateExplainComponent();
}

export function updateExplainComponent() {
	if (v_explain_control.context === "default") {
		/** @type {HTMLElement} */ (document.getElementById("omnidb__main")).classList.add("omnidb__explain--default");
	} else {
		/** @type {HTMLElement} */ (document.getElementById("omnidb__main")).classList.remove("omnidb__explain--default");
	}
}

/**
 * ## getAttributesTooltip
 * @desc Creates and applies tooltip attributes to the target.
 *
 * @param  {string|null} [p_title]   Title string.
 * @param  {string|null} [p_message] Message string, accepts html.
 * @param {string|false} [p_position]
 */
export function getAttributesTooltip(p_target, p_title, p_message, p_position = false) {
	let v_html = "";
	if (p_message) {
		v_html += p_title != undefined ? "<div>" + p_title + "</div>" : "";
		v_html += p_message != undefined ? "<div>" + p_message + "</div>" : "";
	} else {
		v_html += p_title != undefined ? '<h4 class=\"mb-0\">' + p_title + "</h4>" : "";
	}
	let v_position = p_position ? p_position : "bottom";
	p_target.setAttribute("data-html", true);
	p_target.setAttribute("data-placement", v_position);
	p_target.setAttribute("data-toggle", "tooltip");
	p_target.setAttribute("title", v_html);
}
/**
 * ## getStringTooltip
 * @desc Creates html string that renders as a tooltip.
 *
 * @param  {string|null} [p_title]   Title string.
 * @param  {string|null} [p_message] Message string, accepts html.
 * @return {string}         HTML string.
 */
export function getStringTooltip(p_title, p_message, p_position = false) {
	let v_html = "";
	if (p_message) {
		v_html += p_title != undefined ? "<div>" + p_title + "</div>" : "";
		v_html += p_message != undefined ? "<div>" + p_message + "</div>" : "";
	} else {
		v_html += p_title != undefined ? '<div class=\"mb-0\">' + p_title + "</div>" : "";
	}
	let v_tooltipAttr = "data-toggle=tooltip " + "data-html=true " + 'title="' + v_html + '" ';
	if (p_position) {
		v_tooltipAttr += "data-placement=" + p_position + " ";
	} else {
		v_tooltipAttr += "data-placement=bottom ";
	}
	return v_tooltipAttr;
}

/**
 * ## getAttributesOmniDBTooltip
 * @desc Creates and applies tooltip attributes to the target.
 *
 * @param  {string|null} [p_title]   Title string.
 * @param  {string|null} [p_message] Message string, accepts html.
 * @param {string|false} [p_position]
 */
export function getAttributesOmniDBTooltip(p_target, p_title, p_message, p_position = false) {
	let v_html = '<div class="omnidb__tooltip__inner tooltip-inner"><div class="arrow"></div>';
	if (p_message) {
		v_html += p_title != undefined ? "<div>" + p_title + "</div>" : "";
		v_html += p_message != undefined ? "<div>" + p_message + "</div>" : "";
	} else {
		v_html += p_title != undefined ? '<h4 class=\"mb-0\">' + p_title + "</h4>" : "";
	}
	v_html += "</div>";
	let v_position = p_position ? p_position : "bottom";
	p_target.setAttribute("data-html", true);
	p_target.setAttribute("data-placement", v_position);
	p_target.setAttribute("data-omnidb-toggle", "tooltip");
	p_target.setAttribute("data-title", v_html);
	let v_tooltip_element;
	p_target.addEventListener("mouseenter", function (e) {
		v_tooltip_element = document.createElement("div");
		v_tooltip_element.innerHTML = v_html;
		v_tooltip_element.style.position = "fixed";
		v_tooltip_element.classList = "omnidb__tooltip tooltip bs-tooltip-right fade show";
		let v_pos_diff = window.innerHeight - e.target.getBoundingClientRect().y;
		if (v_pos_diff > 150) {
			v_tooltip_element.style.top = e.target.getBoundingClientRect().y + "px";
		} else {
			v_tooltip_element.style.bottom = v_pos_diff - 27 + "px";
			v_tooltip_element.classList.add("omnidb__tooltip--bottom");
		}
		v_tooltip_element.style.left = e.target.offsetWidth + 5 + "px";
		document.body.appendChild(v_tooltip_element);
	});
	p_target.addEventListener("mouseleave", function (e) {
		if (v_tooltip_element) {
			document.body.removeChild(v_tooltip_element);
		}
	});
}

export var v_monitoring_action_whitelist = {
	postgresqlTerminateBackend: function (p_row) {
		if (typeof postgresqlTerminateBackend === "function") postgresqlTerminateBackend(p_row);
	},
	mysqlTerminateBackend: function (p_row) {
		if (typeof mysqlTerminateBackend === "function") mysqlTerminateBackend(p_row);
	},
};

export function monitoringAction(p_row_index, p_function) {
	var v_fn = v_monitoring_action_whitelist[p_function];
	var v_row_data = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.ht.getDataAtRow(p_row_index);
	v_row_data.shift();
	if (typeof v_fn === "function") {
		v_fn(v_row_data);
	}
}

export function uiCopyTextToClipboard(p_value) {
	var v_escaped = document.createElement("span");
	v_escaped.textContent = p_value;
	var v_safe_html =
		'<b>Text copied:</b><div class="mt-2 p-2 border-1 omnidb__theme-bg--light"><code>' +
		v_escaped.innerHTML +
		"</code></div>";

	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard
			.writeText(p_value)
			.then(function () {
				showAlert(v_safe_html, null, null, true);
			})
			.catch(function () {
				showAlert(v_safe_html, null, null, true);
			});
		return;
	}

	// Fallback for non-secure contexts.
	var v_text_area = document.createElement("textarea");
	v_text_area.style.height = "0px";
	v_text_area.style.overflow = "hidden";
	v_text_area.style.position = "fixed";
	v_text_area.style.opacity = "0";
	document.body.appendChild(v_text_area);
	v_text_area.value = p_value;
	v_text_area.select();
	v_text_area.setSelectionRange(0, 9999999);
	document.execCommand("copy");
	document.body.removeChild(v_text_area);
	showAlert(v_safe_html, null, null, true);
}

export function toggleConnectionAutocomplete(p_toggler_id) {
	let checked = /** @type {HTMLInputElement} */ (document.getElementById(p_toggler_id)).checked;
	v_connTabControl.selectedTab.tag.enable_autocomplete = checked;
}
