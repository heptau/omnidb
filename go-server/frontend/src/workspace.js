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

import { endLoading, execAjax, startLoading } from "./ajax_control.js";
import { startConnectionManagement } from "./connections.js";
import { checkConsoleStatus } from "./console.js";
import { initCreateTabFunctions } from "./create_tab_functions.js";
import { customMenu } from "./custom_menu.js";
import { createRequest } from "./long_polling.js";
import { startMonitorDashboard } from "./monitoring.js";
import { showAlert, showConfirm } from "./notification_control.js";
import { showPasswordPrompt } from "./passwords.js";
import { checkQueryStatus, escapeHtml, v_queryRequestCodes } from "./query.js";
import { refreshOuterConnectionHeights } from "./tab_functions/outer_connection_tab.js";
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
var v_edges, v_nodes, v_start_height, v_start_width;

$(function () {
	// Instantiating outer tab component.
	v_connTabControl = createTabControl({
		p_div: "omnidb_main_tablist",
		p_hierarchy: "primary",
	});

	// Objects to control sequential change of active database tabs.
	v_connTabControl.tag.change_active_database_call_list = [];
	v_connTabControl.tag.change_active_database_call_running = false;

	// Create the branding item for omnidb.
	if (v_connTabControl.tabList.length === 0) {
		// Creating the toggling button.
		v_connTabControl.createTab({
			p_icon: '<i class="fas fa-bars collapse-menu"></i>',
			p_name: "Switch menu",
			p_close: false,
			p_selectable: false,
			p_clickFunction: function (e) {
				v_connTabControl.toggleTabMenu();
				refreshHeights();
			},
		});
	}

	// Instantiating functions responsible for creating all the different types of tabs.
	initCreateTabFunctions();

	if (v_connTabControl.tabList.length === 1) {
		// Creating the welcome tab.
		v_connTabControl.tag.createWelcomeTab();

		// Creating the connections tab.
		v_connTabControl.createTab({
			p_icon: '<i class="fas fa-plug"></i>',
			p_name: "Connections",
			p_close: false,
			p_selectable: false,
			p_omnidb_tooltip_name: '<h5 class="my-1">Manage Connections</h5>',
			p_clickFunction: function (e) {
				return startConnectionManagement();
			},
		});

		// Creating the snippets panel.
		v_connTabControl.tag.createSnippetPanel();
	}

	// Updating explain component choice.
	updateExplainComponent();

	// Retrieving global snippets
	getAllSnippets();

	// Retrieving database list.
	getDatabaseList(true, function () {
		// Creating `Add` tab in the outer tab list.
		v_connTabControl.createAddTab();
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

	// Loads or Updates all tooltips.
	$('[data-bs-toggle="tooltip"]').tooltip({ animation: true, html: true });
});

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

	var v_target_div = null;
	if (!p_all_tabs) {
		v_target_div = v_connTabControl.selectedTab.tag.tabControl.selectedTab.elementDiv;
	} else {
		v_target_div = v_connTabControl.selectedTab.elementDiv;
	}

	var v_objects = $(v_target_div)
		.find(".dbms_object")
		.each(function () {
			$(this).css("display", "none");
		});

	var v_objects = $(v_target_div)
		.find("." + v_dbms + "_object")
		.each(function () {
			if (!$(this).hasClass("dbms_object_hidden")) {
				$(this).css("display", "inline-block");
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
				var v_node_object = new Object();
				v_node_object.data = new Object();
				v_node_object.position = new Object();
				v_node_object.data.id = p_return.v_data.v_nodes[i].id;
				v_node_object.data.label = p_return.v_data.v_nodes[i].label;
				v_node_object.classes = "group" + p_return.v_data.v_nodes[i].group;

				v_nodes.push(v_node_object);
			}

			for (var i = 0; i < p_return.v_data.v_edges.length; i++) {
				var v_edge_object = new Object();
				v_edge_object.data = new Object();
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
			renameTabConfirm(p_tab, document.getElementById("tab_name").value);
		},
		null,
		function () {
			// Built as a real DOM node, not an HTML string — showConfirm's
			// content div only renders plain text (see notification_control.js).
			var v_input = document.createElement("input");
			v_input.id = "tab_name";
			v_input.className = "form-control";
			v_input.style.width = "100%";
			document.getElementById("modal_message_content").appendChild(v_input);

			v_input.value = p_tab.tag.tab_title_span.textContent;
			v_input.onkeydown = function () {
				if (event.keyCode == 13) {
					document.getElementById("modal_message_ok").click();
				} else if (event.keyCode == 27) {
					document.getElementById("modal_message_cancel").click();
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
/// Resize snippet panel and transforms position when its visible.
/// </summary>
export var resizeSnippetPanel = async function (p_left_pos_x = false) {
	if (v_connTabControl.snippet_tag !== undefined) {
		var v_element = $(v_connTabControl.snippet_tag.divPanel);
		var v_snippet_tag = v_connTabControl.snippet_tag;
		if (v_element.hasClass("omnidb__panel--slide-in")) {
			// Getting the selected tab
			var v_selected_tab = v_connTabControl.selectedTab;
			// Setting a default max top position for the toggling event.
			var v_target_tag_div_result_top = 30;
			// Updating the max top position considering if a tab is selected.
			if (v_connTabControl.selectedTab && v_connTabControl.selectedTab !== null) {
				if (v_connTabControl.selectedTab.tag.tabControl) {
					var v_target_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
					if (v_target_tag.div_result) {
						v_target_tag_div_result_top = v_target_tag.div_result.getBoundingClientRect().height - 25;
					} else {
						v_target_tag_div_result_top =
							document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
					}
				} else {
					v_target_tag_div_result_top =
						document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
				}
			} else {
				v_target_tag_div_result_top =
					document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
			}

			v_snippet_tag.isVisible = true;
			v_element.css("transform", "translateY(-" + v_target_tag_div_result_top + "px)");
		} else {
			v_snippet_tag.isVisible = false;
			v_element.css("transform", "translateY(0px)");
		}

		var v_snippet_tag = v_connTabControl.snippet_tag;
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

				let v_target_tag_div_result_top = 100;

				// Updating the max top position considering if a tab is selected.
				if (v_connTabControl.selectedTab && v_connTabControl.selectedTab !== null) {
					if (v_connTabControl.selectedTab.tag.tabControl) {
						var v_target_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
						if (v_target_tag.div_result) {
							v_target_tag_div_result_top = v_target_tag.div_result.getBoundingClientRect().height - 25;
						} else {
							v_target_tag_div_result_top =
								document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
						}
					} else {
						v_target_tag_div_result_top =
							document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
					}
				} else {
					v_target_tag_div_result_top =
						document.getElementsByClassName("omnidb__main")[0].getBoundingClientRect().height - 25;
				}

				// Wait for containers animations.
				setTimeout(function () {
					resolve(v_target_tag_div_result_top);
				}, 10);
			}, 400);
		});

		await updateOuterSnippetLayout.then(function (v_target_tag_div_result_top) {
			// Updating the inner_sinnpet_tag divs size.
			if (v_inner_snippet_tag.editor !== undefined) {
				if (v_snippet_tag.isVisible) {
					v_snippet_tag.divPanel.style.transform = "translateY(-" + v_target_tag_div_result_top + "px)";
				}
				v_snippet_tag.divPanel.style.height = v_target_tag_div_result_top + "px";
				v_snippet_tag.divTree.style.height = v_target_tag_div_result_top + "px";
				v_inner_snippet_tag.editorDiv.style.height = v_target_tag_div_result_top - 7 * v_font_size + "px";
				v_inner_snippet_tag.editor.resize();
			}
		});
	}
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
	document.getElementById("vertical-resize-line").remove();

	document.body.removeEventListener("mousemove", getVerticalLinePosition);

	var v_height_diff = event.screenY - v_start_height;

	var v_tag = v_connTabControl.selectedTab.tag;

	var v_tree_div = v_tag.divTree;
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
	document.getElementById("horizontal-resize-line").style.left = p_event.pageX + "px";
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
		document.getElementById("horizontal-resize-line").remove();
	}

	document.body.removeEventListener("mousemove", horizontalLinePosition);

	var v_div_left = v_connTabControl.selectedTab.tag.divLeft;
	var v_div_right = v_connTabControl.selectedTab.tag.divRight;
	var v_totalWidth = v_connTabControl.selectedDiv.getBoundingClientRect().width;

	var v_paddingCompensation = 8;
	var v_offsetLeft = v_div_left.getBoundingClientRect().left;
	var v_mousePosX = event.x;

	// if (event) {
	//   v_mousePosX = event.x;
	// }
	// else {
	//   v_mousePosX = v_offsetLeft + v_div_left.getBoundingClientRect().width - v_paddingCompensation;
	// }

	var v_pixel_value = v_mousePosX > v_offsetLeft ? v_paddingCompensation + v_mousePosX - v_offsetLeft : 0;

	var v_left_width_value = v_pixel_value + "px";

	v_div_left.style["max-width"] = v_left_width_value;
	v_div_left.style["width"] = v_left_width_value;

	// var v_right_width_value = (v_totalWidth - v_pixel_value) + 'px';
	//
	// v_div_right.style['max-width'] = v_right_width_value;
	// v_div_right.style['flex'] = '0 0 ' + v_right_width_value;

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
	document.getElementById("horizontal-resize-line").remove();

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
	document.getElementById("vertical-resize-line").remove();

	document.body.removeEventListener("mousemove", getVerticalLinePosition);

	var v_height_diff = event.screenY - v_start_height;

	var v_editor_div = document.getElementById(v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.editorDivId);
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
$(window).resize(function () {
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

		if (v_connections_data && v_connections_data.v_active) {
			v_connections_data.ht.render();
		}

		if (v_connTabControl.selectedTab.tag.mode == "monitor_all") {
			v_connTabControl.selectedTab.tag.tabControlDiv.style.height =
				window.innerHeight - $(v_connTabControl.selectedTab.tag.tabControlDiv).offset().top - 1.5 * v_font_size + "px";
		}
		if (v_connTabControl.selectedTab.tag.mode == "connection") {
			refreshOuterConnectionHeights();
		} else if (v_connTabControl.selectedTab.tag.mode == "outer_terminal") {
			v_connTabControl.selectedTab.tag.div_console.style.height =
				window.innerHeight - $(v_connTabControl.selectedTab.tag.div_console).offset().top - 1.25 * v_font_size + "px";
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
			// else if (v_tab_tag.mode=='query_history') {
			//   v_tab_tag.div_result.style.height = window.innerHeight - $(v_tab_tag.div_result).offset().top - (1.75)*v_font_size + 'px';
			//   if (v_tab_tag.ht!=null)
			//   v_tab_tag.ht.render();
			// }
			else if (v_tab_tag.mode == "alter") {
				if (v_tab_tag.alterTableObject.window == "columns") {
					var v_height = window.innerHeight - $(v_tab_tag.htDivColumns).offset().top - 45;
					v_tab_tag.htDivColumns.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htColumns != null) {
						v_tab_tag.alterTableObject.htColumns.render();
					}
				} else if (v_tab_tag.alterTableObject.window == "constraints") {
					var v_height = window.innerHeight - $(v_tab_tag.htDivConstraints).offset().top - 45;
					v_tab_tag.htDivConstraints.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htConstraints != null) {
						v_tab_tag.alterTableObject.htConstraints.render();
					}
				} else {
					var v_height = window.innerHeight - $(v_tab_tag.htDivIndexes).offset().top - 45;
					v_tab_tag.htDivIndexes.style.height = v_height + "px";
					if (v_tab_tag.alterTableObject.htIndexes != null) {
						v_tab_tag.alterTableObject.htIndexes.render();
					}
				}
			} else if (v_tab_tag.mode == "data_mining") {
				if (v_tab_tag.currQueryTab == "data") {
					v_tab_tag.div_result.style.height =
						window.innerHeight - $(v_tab_tag.div_result).offset().top - 1.25 * v_font_size + "px";
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
		var v_height = window.innerHeight - $(v_tag.divProperties).offset().top - 15;
		v_tag.divProperties.style.height = v_height + "px";
		v_tag.gridProperties.render();
	} else if (v_tag.currTreeTab == "ddl") {
		var v_height = window.innerHeight - $(v_tag.divDDL).offset().top - 15;
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
export function indentSQL(p_mode = false) {
	var v_tab_tag = null;
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
	// Opening connections management when there are no configured connections.
	if (!v_connTabControl.tag.connections || v_connTabControl.tag.connections.length === 0) {
		startConnectionManagement();
	}
	// Creating a custom menu for new outter connections.
	else {
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

				v_option_list.push({
					text: "Connections",
					icon: "fas cm-all fa-plug",
					submenu: {
						elements: v_submenu_connection_list,
					},
				});
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

				v_option_list.push({
					text: "Connections",
					icon: "fas cm-all fa-plug",
					submenu: {
						elements: v_group_list,
					},
				});
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
			v_option_list.unshift({
				text: "New Connection",
				icon: "fas cm-all fa-plug",
				action: function () {
					setTimeout(function () {
						startConnectionManagement();
					}, 0);
				},
			});

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
		$(v_tab_tag.divLeft).toggleClass("omnidb__workspace__div-left--shrink");
		refreshHeights();
	}
}

export function toggleTreeTabsContainer(p_target_id, p_horizonta_line_id) {
	var v_tab_tag = v_connTabControl.selectedTab.tag;
	var v_target_element = $("#" + p_target_id);
	if (v_target_element.hasClass("omnidb__tree-tabs--not-in-view")) {
		$("#" + p_target_id).removeClass("omnidb__tree-tabs--not-in-view");
		$("#" + p_horizonta_line_id).removeClass("d-none");
		v_tab_tag.treeTabsVisible = true;
		setTimeout(function () {
			refreshTreeHeight();
		}, 360);
	} else {
		$("#" + p_target_id).addClass("omnidb__tree-tabs--not-in-view");
		$("#" + p_horizonta_line_id).addClass("d-none");
		v_tab_tag.treeTabsVisible = false;
	}
	// $('#' + p_target_id).toggleClass('omnidb__tree-tabs--not-in-view');
	// $('#' + p_horizonta_line_id).toggleClass('d-none');
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
		let space = parseInt(window.innerWidth);
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
 * @return {String}         The Y position of the pointer in pixels.
 */
export function getVerticalLinePosition(p_event) {
	document.getElementById("vertical-resize-line").style.top = p_event.pageY + "px";
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
		$("#omnidb__main").addClass("omnidb__explain--default");
	} else {
		$("#omnidb__main").removeClass("omnidb__explain--default");
	}
}

/**
 * ## getAttributesTooltip
 * @desc Creates and applies tooltip attributes to the target.
 *
 * @param  {string} title   Title string.
 * @param  {string} message Message string, accepts html.
 * @return {string}         HTML string.
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
 * @param  {string} title   Title string.
 * @param  {string} message Message string, accepts html.
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
 * @param  {string} title   Title string.
 * @param  {string} message Message string, accepts html.
 * @return {string}         HTML string.
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
	$(p_target).mouseenter(function (e) {
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
	$(p_target).mouseleave(function (e) {
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
	let checked = document.getElementById(p_toggler_id).checked;
	v_connTabControl.selectedTab.tag.enable_autocomplete = checked;
}
