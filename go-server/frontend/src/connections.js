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

import { execAjax } from "./ajax_control_bridge.js";
import { showAlert, showConfirm, showError } from "./notification_control.js";
import { escapeHtml } from "./query.js";
import { switchSection } from "./section_switcher.js";
import { getDatabaseList } from "./workspace.js";

// The connection-management markup is always present in workspace.html, so
// these ids are guaranteed to resolve -- this just gets that past tsc
// without a cast at every call site. `any` rather than HTMLElement because
// callers read .value/.checked/.files as well as generic DOM properties.
/** @param {string} id @returns {any} */
function el(id) {
	return document.getElementById(id);
}

// Declared here because these were implicit globals: assigned without
// `var` anywhere in this file, so they leaked onto `window` and were
// shared with every other file in the bundle. They are scratch values
// used and re-read inside a single function each, so a file-level
// declaration keeps the behaviour identical while taking them off the
// global object -- which is what still forces the bundle out of strict
// mode.
var v_conn_data, v_conn_div, v_conn_obj;

function initConnections() {
	v_connections_data = new Object();
	v_connections_data.technologies = null;
	v_connections_data.list_items = [];
	v_connections_data.current_id = -1;
	v_connections_data.current_obj = null;
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initConnections);
else setTimeout(initConnections, 0);

export function startConnectionManagement() {
	getDatabaseList();
	getGroups();
	showConnectionList(true, true);
}

/**
 * Rebuilds the sidebar list of saved connections.
 *
 * @param {boolean} p_show_section
 * @param {boolean} p_change_group
 * @param {() => void} [p_callback] Runs once the sidebar has re-rendered --
 * used by saveConnection to re-select the just-saved connection, which needs
 * the fresh list_items entries this function produces to exist first.
 */
export function showConnectionList(p_show_section, p_change_group, p_callback) {
	var v_conn_id_list = [];
	var v_total_public_conn = 0;

	for (var i = 0; i < v_connTabControl.tabList.length; i++) {
		var v_tab = v_connTabControl.tabList[i];
		if (v_tab.tag && v_tab.tag.mode == "connection") v_conn_id_list.push(v_tab.tag.selectedDatabaseIndex);
		else if (v_tab.tag && v_tab.tag.mode == "outer_terminal" && v_tab.tag.connId != null)
			v_conn_id_list.push(v_tab.tag.connId);
	}

	var input = JSON.stringify({ p_conn_id_list: v_conn_id_list });

	execAjax(
		"/get_connections/",
		input,
		function (p_return) {
			v_connections_data.list_items = [];
			v_connections_data.technologies = p_return.v_data.v_technologies;

			var v_target_div = el("connection_card_list");
			v_target_div.innerHTML =
				'<div id="connections_management_empty_all" class="omnidb__connections__empty" style="display:none;">' +
				"<i class=\"fas fa-plug\"></i>" +
				'<h6>No connections available.</h6>' +
				'<button id="bt_empty_all_new_connection" type="button" class="btn btn-sm omnidb__theme__btn--primary">New Connection</button>' +
				"</div>" +
				'<div id="connections_management_empty_with_public" class="omnidb__connections__empty" style="display:none;">' +
				'<i class="fas fa-arrow-up text-info"></i>' +
				'<h6>No connections yet, but public connections are available.</h6>' +
				'<button id="bt_empty_public_new_connection" type="button" class="btn btn-sm omnidb__theme__btn--primary">New Connection</button>' +
				"</div>" +
				'<div id="connections_management_empty_group" class="omnidb__connections__empty" style="display:none;">' +
				'<h6>No connections assigned to this group yet.</h6>' +
				'<button id="bt_empty_group_manage_groups" type="button" class="btn btn-sm omnidb__theme__btn--primary">Manage Groups</button>' +
				"</div>";

			// Bindings for the three empty-state buttons just built above,
			// replacing the on*= attributes they carried -- see dom_event_bindings.js
			// and README.md.
			/** @type {HTMLElement} */ (v_target_div.querySelector("#bt_empty_all_new_connection")).addEventListener("click", () =>
				newConnection(),
			);
			/** @type {HTMLElement} */ (v_target_div.querySelector("#bt_empty_public_new_connection")).addEventListener("click", () =>
				newConnection(),
			);
			/** @type {HTMLElement} */ (v_target_div.querySelector("#bt_empty_group_manage_groups")).addEventListener("click", () =>
				manageGroup(),
			);

			for (var i = 0; i < p_return.v_data.v_conn_list.length; i++) {
				var v_conn_obj = p_return.v_data.v_conn_list[i];

				var v_item_div = document.createElement("div");
				v_item_div.className = "omnidb__connections__list-item";
				v_target_div.appendChild(v_item_div);

				var v_icon_html;
				var v_title;
				var v_subtitle;

				if (v_conn_obj.technology == "terminal") {
					v_icon_html = '<i class="fas fa-terminal"></i>';
					v_title = v_conn_obj.alias && v_conn_obj.alias !== "" ? v_conn_obj.alias : "Terminal";
					v_subtitle =
						v_conn_obj.tunnel.user + "@" + v_conn_obj.tunnel.server + ":" + v_conn_obj.tunnel.port;
				} else {
					v_icon_html = '<i class="technology-icon node-' + escapeHtml(v_conn_obj.technology) + '"></i>';
					v_title = v_conn_obj.alias;
					if (v_conn_obj.conn_string && v_conn_obj.conn_string != "") {
						v_subtitle = v_conn_obj.conn_string;
					} else {
						v_subtitle = (v_conn_obj.user ? v_conn_obj.user + "@" : "") + v_conn_obj.server + ":" + v_conn_obj.port;
					}
				}

				var v_env_meta = ENVIRONMENT_META[v_conn_obj.environment];

				v_item_div.innerHTML =
					'<span class="omnidb__connections__list-item-icon">' +
					v_icon_html +
					"</span>" +
					(v_env_meta
						? '<span class="omnidb__connections__list-item-env ' + v_env_meta.dotClass + '" title="' + v_env_meta.label + '"></span>'
						: "") +
					'<span class="omnidb__connections__list-item-text">' +
					'<span class="omnidb__connections__list-item-title">' +
					escapeHtml(v_title) +
					"</span>" +
					'<span class="omnidb__connections__list-item-subtitle">' +
					escapeHtml(v_subtitle) +
					"</span>" +
					"</span>" +
					(v_conn_obj.tunnel && v_conn_obj.tunnel.enabled
						? '<i class="fas fa-lock omnidb__connections__list-item-tunnel" title="Uses a SSH tunnel"></i>'
						: "");

				var v_checkbox = document.createElement("input");
				v_checkbox.className = "connection-card-checkbox";
				v_checkbox.id = "connection_item_input_" + i;
				v_checkbox.type = "checkbox";
				v_item_div.appendChild(v_checkbox);

				var v_cover_div = document.createElement("label");
				v_cover_div.className = "connection-card-cover m-0";
				v_cover_div.setAttribute("for", "connection_item_input_" + i);
				v_cover_div.innerHTML =
					'<svg class="connection-card-svg" width="42" height="42" viewBox="0 0 42 42" xmlns="http://www.w3.org/2000/svg">' +
					'<path d="M 6 18 L 15 32 L 34 13" stroke-width="4" stroke="#4a81d4" fill="transparent"></path>' +
					'<circle r="19" cx="21" cy="21" stroke-width="2" stroke="#b2b2b2" fill="transparent"></circle>' +
					"</svg>";
				v_item_div.appendChild(v_cover_div);

				v_item_div.addEventListener(
					"click",
					(function (p_conn_obj) {
						return function () {
							// While assigning connections to a group (see manageGroup),
							// a row click should only toggle its checkbox -- via the
							// connection-card-cover label above -- not also open the
							// connection in the detail pane.
							if (v_target_div.classList.contains("omnidb__connections__list--connection-management")) return;
							editConnection(p_conn_obj);
						};
					})(v_conn_obj),
				);

				// Adding public visuals. Mirrors the old card grid's fade
				// in/out toggle (see toggleConnectionsPublic) -- a public
				// connection starts hidden unless it's already shown, or it's
				// the current user's own.
				if (v_conn_obj.public) {
					v_total_public_conn += 1;
					v_item_div.classList.add("omnidb__connections__list-item--public");
					v_item_div.classList.add("fade");
					if (v_connections_data.show_public || v_conn_obj.is_mine) {
						v_item_div.classList.add("show");
					} else {
						v_item_div.classList.add("d-none");
					}
				}

				v_connections_data.list_items.push({
					data: v_conn_obj,
					item_div: v_item_div,
					checkbox: v_checkbox,
				});
			}

			if (p_show_section) {
				switchSection("connections");
			}

			if (p_change_group) {
				groupChange(el("group_selector").value);
			}

			// Updating total public connections counter.
			el("conn_list_public_counter").innerHTML = v_total_public_conn;

			updateConnectionsTitleInfo();
			updateConnectionSelectionHighlight();

			if (p_callback) p_callback();
		},
		null,
		"box",
		true,
	);
}

export function groupChange(p_value) {
	var v_empty_group_div = el("connections_management_empty_group");

	if (p_value != -1) {
		el("button_group_actions").style.display = "";

		// Filtering group items
		/** @type {any} */
		var v_group_obj = { conn_list: [] };

		// Finding the selected group object
		for (var i = 0; i < v_connections_data.v_group_list.length; i++) {
			if (p_value == v_connections_data.v_group_list[i].id) {
				v_group_obj = v_connections_data.v_group_list[i];
				break;
			}
		}

		var v_group_valid_conn = 0;

		// Going over the list items and adjusting visibility
		for (var i = 0; i < v_connections_data.list_items.length; i++) {
			var v_conn_obj = v_connections_data.list_items[i];

			// Check the div if it belongs to the currently selected group
			if (v_group_obj.conn_list.includes(v_conn_obj.data.id)) {
				v_conn_obj.item_div.style.display = "";
				v_group_valid_conn++;
			} else {
				v_conn_obj.item_div.style.display = "none";
			}
		}

		// Updating visibility of empty group.
		if (v_empty_group_div) {
			if (v_group_valid_conn === 0) {
				v_empty_group_div.style.display = "";
			} else {
				v_empty_group_div.style.display = "none";
			}
		}
	} else {
		// Updating visibility of empty group.
		if (v_empty_group_div) {
			v_empty_group_div.style.display = "none";
		}
		el("button_group_actions").style.display = "none";
		el("group_selector").value = -1;

		// Going over the list items and adjusting visibility
		for (var i = 0; i < v_connections_data.list_items.length; i++) {
			var v_conn_obj = v_connections_data.list_items[i];
			v_conn_obj.item_div.style.display = "";
		}
	}

	updateConnectionsTitleInfo();
}

export function manageGroup() {
	el("group_actions_1").style.display = "none";
	el("group_actions_2").style.display = "";
	el("button_new_connection").setAttribute("disabled", true);
	el("group_selector").setAttribute("disabled", true);
	el("button_new_group").setAttribute("disabled", true);
	el("button_group_actions").setAttribute("disabled", true);

	var v_empty_group_div = el("connections_management_empty_group");
	if (v_empty_group_div) {
		v_empty_group_div.style.display = "none";
	}

	document.querySelectorAll(".omnidb__connections__list").forEach((v_list_el) => {
		v_list_el.classList.add("omnidb__connections__list--connection-management");
	});

	var v_current_group_id = el("group_selector").value;
	/** @type {any} */
	var v_group_obj = null;

	// Finding the selected group object
	for (var i = 0; i < v_connections_data.v_group_list.length; i++) {
		if (v_current_group_id == v_connections_data.v_group_list[i].id) {
			v_group_obj = v_connections_data.v_group_list[i];
			break;
		}
	}

	// Going over the list items and adjusting visibility and checkbox
	for (var i = 0; i < v_connections_data.list_items.length; i++) {
		var v_conn_obj = v_connections_data.list_items[i];
		v_conn_obj.item_div.style.display = "";

		// Check the item if it belongs to the currently selected group
		if (v_group_obj.conn_list.includes(v_conn_obj.data.id)) {
			v_conn_obj.checkbox.checked = true;
		}
	}

	updateConnectionsTitleInfo();
}

export function manageGroupSave() {
	el("group_actions_1").style.display = "";
	el("group_actions_2").style.display = "none";

	el("button_new_connection").removeAttribute("disabled");
	el("group_selector").removeAttribute("disabled");
	el("button_new_group").removeAttribute("disabled");
	el("button_group_actions").removeAttribute("disabled");

	document.querySelectorAll(".omnidb__connections__list").forEach((v_list_el) => {
		v_list_el.classList.remove("omnidb__connections__list--connection-management");
	});

	v_conn_data = [];

	// Going over the list items and adjusting checkbox
	for (var i = 0; i < v_connections_data.list_items.length; i++) {
		var v_conn_obj = v_connections_data.list_items[i];
		v_conn_data.push({
			id: v_conn_obj.data.id,
			selected: v_conn_obj.checkbox.checked,
		});
		v_conn_obj.checkbox.checked = false;
	}

	execAjax(
		"/save_group_connections/",
		JSON.stringify({
			// parseInt because a <select>'s value is a string and the backend
			// unmarshals this into an integer, which rejects "1" outright and
			// fails the whole request. See flexInt in go-server/flex_int.go.
			p_group: parseInt(el("group_selector").value, 10),
			p_conn_data_list: v_conn_data,
		}),
		function (p_return) {
			getDatabaseList();
			getGroups();
		},
		null,
		"box",
	);
}

export function newGroupConfirm(p_name) {
	execAjax(
		"/new_group/",
		JSON.stringify({ p_name: p_name }),
		function (p_return) {
			getDatabaseList();
			getGroups();
		},
		null,
		"box",
	);
}

export function renameGroupConfirm(p_id, p_name) {
	execAjax(
		"/edit_group/",
		JSON.stringify({ p_id: p_id, p_name: p_name }),
		function (p_return) {
			getDatabaseList();
			getGroups();
		},
		null,
		"box",
	);
}

export function deleteGroup() {
	// parseInt: see the comment in manageGroupSave.
	var v_group_id = parseInt(el("group_selector").value, 10);

	showConfirm("Are you sure you want to delete the current group?", function () {
		deleteGroupConfirm(v_group_id);
	});
}

export function deleteGroupConfirm(p_group_id) {
	execAjax(
		"/delete_group/",
		JSON.stringify({ p_id: p_group_id }),
		function (p_return) {
			getDatabaseList();
			getGroups();
		},
		null,
		"box",
	);
}

export function newGroup() {
	showConfirm("", function () {
		newGroupConfirm(el("group_name_input").value);
	});

	// showConfirm's content div only renders plain text (see
	// notification_control.js), so the input has to be built as a real DOM
	// node here instead of passed in as an HTML string.
	var v_input = document.createElement("input");
	v_input.id = "group_name_input";
	v_input.className = "form-control";
	v_input.placeholder = "Group Name";
	v_input.style.width = "100%";
	el("modal_message_content").appendChild(v_input);

	v_input.onkeydown = function () {
		if (/** @type {any} */ (event).keyCode == 13) {
			el("modal_message_ok").click();
		} else if (/** @type {any} */ (event).keyCode == 27) {
			el("modal_message_cancel").click();
		}
	};
	setTimeout(function () {
		v_input.focus();
	}, 500);
}

export function renameGroup() {
	var v_select = el("group_selector");
	showConfirm("", function () {
		// parseInt: see the comment in manageGroupSave.
		renameGroupConfirm(parseInt(el("group_selector").value, 10), el("group_name_input").value);
	});

	// See newGroup's comment above — built as a real DOM node, not an HTML
	// string, so showConfirm's plain-text content div actually renders it.
	var v_input = document.createElement("input");
	v_input.id = "group_name_input";
	v_input.className = "form-control";
	v_input.placeholder = "Group Name";
	v_input.style.width = "100%";
	v_input.value = v_select.options[v_select.selectedIndex].text;
	el("modal_message_content").appendChild(v_input);

	v_input.onkeydown = function () {
		if (/** @type {any} */ (event).keyCode == 13) {
			el("modal_message_ok").click();
		} else if (/** @type {any} */ (event).keyCode == 27) {
			el("modal_message_cancel").click();
		}
	};
	setTimeout(function () {
		v_input.focus();
		v_input.selectionStart = v_input.selectionEnd = 10000;
	}, 500);
}

export function getGroups() {
	execAjax(
		"/get_groups/",
		JSON.stringify({}),
		function (p_return) {
			v_connections_data.v_group_list = p_return.v_data;
			var select = el("group_selector");
			var current_value = select.value;
			select.innerHTML = "";
			var option = document.createElement("option");
			option.value = "-1";
			option.textContent = "All Connections";
			select.appendChild(option);
			var found = false;
			for (var i = 0; i < p_return.v_data.length; i++) {
				option = document.createElement("option");
				option.value = p_return.v_data[i].id;
				option.textContent = p_return.v_data[i].name;
				if (option.value == current_value) {
					option.selected = true;
					found = true;
				}
				select.appendChild(option);
			}
			if (!found && current_value != -1) {
				groupChange(-1);
			} else {
				groupChange(el("group_selector").value);
			}
		},
		null,
		"box",
	);
}

/// <summary>
/// Tests specific connection.
/// </summary>
export function testConnection(p_password = null) {
	var input = JSON.stringify({
		id: v_connections_data.current_id,
		type: el("conn_form_type").value,
		connstring: el("conn_form_connstring").value,
		server: el("conn_form_server").value,
		port: el("conn_form_port").value,
		database: el("conn_form_database").value,
		user: el("conn_form_user").value,
		password: el("conn_form_user_pass").value,
		temp_password: p_password,
		tunnel: {
			enabled: el("conn_form_use_tunnel").checked,
			server: el("conn_form_ssh_server").value,
			port: el("conn_form_ssh_port").value,
			user: el("conn_form_ssh_user").value,
			password: el("conn_form_ssh_password").value,
			key: el("conn_form_ssh_key").value,
		},
	});

	execAjax(
		"/test_connection/",
		input,
		function (p_return) {
			if (p_return.v_data == "Connection successful.") showAlert(p_return.v_data);
			else showError(p_return.v_data);
		},
		function (p_return) {
			showConfirm(
				"",
				function () {
					testConnection(el("txt_test_password_prompt").value);
				},
				null,
				function () {
					// Built as real DOM nodes, not an HTML string — showConfirm's
					// content div only renders plain text (see notification_control.js).
					var v_content_div = el("modal_message_content");
					v_content_div.appendChild(document.createTextNode(p_return.v_data));

					var v_input = document.createElement("input");
					v_input.id = "txt_test_password_prompt";
					v_input.className = "form-control";
					v_input.type = "password";
					v_input.placeholder = "Password";
					v_input.style.marginBottom = "20px";
					v_input.style.marginTop = "20px";
					v_input.style.textAlign = "center";
					v_content_div.appendChild(v_input);

					v_input.onkeydown = function () {
						if (/** @type {any} */ (event).keyCode == 13) el("modal_message_ok").click();
						else if (/** @type {any} */ (event).keyCode == 27) el("modal_message_cancel").click();
					};
					v_input.focus();
				},
			);
		},
		"box",
		true,
		true,
	);
}

export function saveConnection() {
	var v_was_new = v_connections_data.current_id === -1;
	var v_saved_id = v_connections_data.current_id;

	var input = JSON.stringify({
		id: v_connections_data.current_id,
		type: el("conn_form_type").value,
		public: el("conn_form_public").checked,
		environment: el("conn_form_environment").value,
		connstring: el("conn_form_connstring").value,
		server: el("conn_form_server").value,
		port: el("conn_form_port").value,
		database: el("conn_form_database").value,
		user: el("conn_form_user").value,
		password: el("conn_form_user_pass").value,
		title: el("conn_form_title").value,
		tunnel: {
			enabled: el("conn_form_use_tunnel").checked,
			server: el("conn_form_ssh_server").value,
			port: el("conn_form_ssh_port").value,
			user: el("conn_form_ssh_user").value,
			password: el("conn_form_ssh_password").value,
			key: el("conn_form_ssh_key").value,
		},
	});

	execAjax(
		"/save_connection/",
		input,
		function (p_return) {
			getDatabaseList();
			if (v_was_new) {
				// No id comes back from the server for a freshly created
				// connection, so there's nothing to re-select -- back to the
				// empty state, same as after a delete.
				clearConnectionDetail();
				showConnectionList(false, true);
			} else {
				showConnectionList(false, true, function () {
					reselectConnection(v_saved_id);
				});
			}
		},
		null,
		"box",
	);
}

export function deleteConnection(p_conn_obj) {
	var v_name = p_conn_obj.alias && p_conn_obj.alias !== "" ? p_conn_obj.alias : "Terminal";
	showConfirm(
		'Are you sure you want to delete the connection "' + v_name + '"?',
		function () {
			var input = JSON.stringify({
				id: p_conn_obj.id,
			});

			execAjax(
				"/delete_connection/",
				input,
				function (p_return) {
					getDatabaseList();
					if (v_connections_data.current_id === p_conn_obj.id) {
						clearConnectionDetail();
					}
					showConnectionList(false, true);
				},
				null,
				"box",
			);
		},
		null,
		null,
		null,
		"Delete",
	);
}

// The technology list itself (v_connections_data.technologies) comes from
// OmniDB_app_technology's raw `name` column -- lowercase, connection-string
// style identifiers (see appDBBootstrapTechnologies in appdb_bootstrap.go).
// Those are what's stored/sent to the backend and what drives the
// `node-<technology>` icon classes, so they stay as option values; only the
// visible label goes through this map for a properly capitalized name.
var TECHNOLOGY_DISPLAY_NAMES = {
	postgresql: "PostgreSQL",
	mysql: "MySQL",
	mariadb: "MariaDB",
	oracle: "Oracle",
	sqlite: "SQLite",
	terminal: "Terminal",
};

// Purely a client-side presentation tag -- the server stores and returns
// whatever string conn_form_environment last held (see appdb_connections.go's
// Environment field doc), so this is also the whitelist: an unrecognized
// value (e.g. from a public connection saved by an older client, or one that
// only ever set it to "") simply renders no dot/accent, never a raw,
// unescaped string. Exported so the open-tab modules (outer_connection_tab.js,
// outer_terminal_tab.js) can look up the same tabClass without duplicating
// the color choices.
export var ENVIRONMENT_META = {
	production: { label: "Production", dotClass: "omnidb__env-dot--production", tabClass: "omnidb__tab--env-production" },
	uat: { label: "UAT", dotClass: "omnidb__env-dot--uat", tabClass: "omnidb__tab--env-uat" },
	development: { label: "Development", dotClass: "omnidb__env-dot--development", tabClass: "omnidb__tab--env-development" },
	archive: { label: "Archive", dotClass: "omnidb__env-dot--archive", tabClass: "omnidb__tab--env-archive" },
};

// No "Select Type" placeholder option: newConnection() always preselects
// postgresql and editConnection() always sets the saved connection's real
// technology, so the select never actually needs an empty/unset state.
export function adjustTechSelector() {
	var select = el("conn_form_type");
	select.innerHTML = "";
	for (var i = 0; i < v_connections_data.technologies.length; i++) {
		var v_tech = v_connections_data.technologies[i];
		var option = document.createElement("option");
		option.value = v_tech;
		option.textContent = TECHNOLOGY_DISPLAY_NAMES[v_tech] || v_tech;
		select.appendChild(option);
	}
}

/**
 * Shows the detail pane -- either a saved connection's own form (populated
 * by editConnection) or a blank one for a connection that doesn't exist yet
 * (newConnection). Connect/Delete only make sense once the connection has
 * actually been saved, so newConnection hides them.
 *
 * @param {any} p_conn_obj
 * @param {boolean} p_is_new
 */
function showConnectionDetail(p_conn_obj, p_is_new) {
	el("omnidb__connections__detail_empty").style.display = "none";
	el("omnidb__connections__detail_form").classList.add("omnidb__connections__detail-form--active");

	el("conn_detail_icon").innerHTML =
		p_is_new
			? '<i class="fas fa-plug"></i>'
			: p_conn_obj.technology === "terminal"
				? '<i class="fas fa-terminal"></i>'
				: '<i class="technology-icon node-' + escapeHtml(p_conn_obj.technology) + '"></i>';

	el("conn_form_button_connect").style.display = p_is_new ? "none" : "";

	updateDeleteButtonState(p_conn_obj);
	updateConnectionSelectionHighlight();
}

// The "-" half of the sidebar's add/remove control (see workspace.html) acts
// on whatever connection is currently loaded, same as Connect/Save -- there's
// nothing to delete for a brand new, unsaved one, and locked connections
// can't be deleted at all (see the "locked" flag from get_connections).
function updateDeleteButtonState(p_conn_obj) {
	var v_btn = el("button_delete_connection");
	if (!p_conn_obj || p_conn_obj.locked === true) {
		v_btn.setAttribute("disabled", "disabled");
	} else {
		v_btn.removeAttribute("disabled");
	}
}

function clearConnectionDetail() {
	v_connections_data.current_id = -1;
	v_connections_data.current_obj = null;
	el("omnidb__connections__detail_form").classList.remove("omnidb__connections__detail-form--active");
	el("omnidb__connections__detail_empty").style.display = "";
	updateDeleteButtonState(null);
	updateConnectionSelectionHighlight();
}

function updateConnectionSelectionHighlight() {
	if (!v_connections_data.list_items) return;
	for (var i = 0; i < v_connections_data.list_items.length; i++) {
		var v_item = v_connections_data.list_items[i];
		v_item.item_div.classList.toggle(
			"omnidb__connections__list-item--selected",
			v_connections_data.current_id !== -1 && v_item.data.id === v_connections_data.current_id,
		);
	}
}

function reselectConnection(p_id) {
	for (var i = 0; i < v_connections_data.list_items.length; i++) {
		if (v_connections_data.list_items[i].data.id === p_id) {
			editConnection(v_connections_data.list_items[i].data);
			return;
		}
	}
	clearConnectionDetail();
}

export function editConnection(p_conn_obj) {
	v_connections_data.current_id = p_conn_obj.id;
	v_connections_data.current_obj = p_conn_obj;
	adjustTechSelector();

	el("conn_form_type").value = p_conn_obj.technology;
	el("conn_form_title").value = p_conn_obj.alias;
	el("conn_form_environment").value = p_conn_obj.environment || "";
	el("conn_form_connstring").value = p_conn_obj.conn_string;
	el("conn_form_server").value = p_conn_obj.server;
	el("conn_form_port").value = p_conn_obj.port;
	el("conn_form_database").value = p_conn_obj.service;
	el("conn_form_user").value = p_conn_obj.user;
	el("conn_form_user_pass").value = "";
	el("conn_form_use_tunnel").checked = p_conn_obj.tunnel.enabled;
	el("conn_form_ssh_server").value = p_conn_obj.tunnel.server;
	el("conn_form_ssh_port").value = p_conn_obj.tunnel.port;
	el("conn_form_ssh_user").value = p_conn_obj.tunnel.user;
	el("conn_form_ssh_password").value = "";
	el("conn_form_ssh_key").value = "";
	el("conn_form_public").checked = p_conn_obj.public;

	let v_enable_list = [];
	let v_disable_list = [];

	if (p_conn_obj.password && p_conn_obj.password !== null && p_conn_obj.password !== "") {
		if (!el("conn_form_user_pass_check_icon")) {
			el("conn_form_user_pass").previousElementSibling.insertAdjacentHTML(
				"beforeend",
				'<i id="conn_form_user_pass_check_icon" class="fas fa-check text-success ml-2"></i>',
			);
		}
	} else {
		el("conn_form_user_pass_check_icon")?.remove();
	}

	if (p_conn_obj.tunnel.password && p_conn_obj.tunnel.password !== null && p_conn_obj.tunnel.password !== "") {
		if (!el("conn_form_ssh_password_check_icon")) {
			el("conn_form_ssh_password").previousElementSibling.insertAdjacentHTML(
				"beforeend",
				'<i id="conn_form_ssh_password_check_icon" class="fas fa-check text-success ml-2"></i>',
			);
		}
	} else {
		el("conn_form_ssh_password_check_icon")?.remove();
	}

	if (p_conn_obj.tunnel.key && p_conn_obj.tunnel.key !== null && p_conn_obj.tunnel.key !== "") {
		if (!el("conn_form_ssh_key_check_icon")) {
			el("conn_form_ssh_key").previousElementSibling.insertAdjacentHTML(
				"beforeend",
				'<i id="conn_form_ssh_key_check_icon" class="fas fa-check text-success ml-2"></i>',
			);
		}
	} else {
		el("conn_form_ssh_key_check_icon")?.remove();
	}

	if (p_conn_obj.technology === "terminal") {
		v_disable_list = [
			"conn_form_connstring",
			"conn_form_server",
			"conn_form_port",
			"conn_form_database",
			"conn_form_user",
			"conn_form_user_pass",
		];
		v_enable_list = [
			"conn_form_ssh_server",
			"conn_form_ssh_port",
			"conn_form_ssh_user",
			"conn_form_ssh_password",
			"conn_form_ssh_key",
			"conn_form_ssh_key_input",
		];
		el("conn_form_use_tunnel").checked = true;
		el("conn_form_use_tunnel").setAttribute("disabled", true);
	} else if (p_conn_obj.technology === "sqlite") {
		v_disable_list = ["conn_form_connstring", "conn_form_server", "conn_form_port", "conn_form_user", "conn_form_user_pass"];
		v_enable_list = ["conn_form_database"];
		if (p_conn_obj.tunnel.enabled) {
			v_enable_list = v_enable_list.concat([
				"conn_form_ssh_server",
				"conn_form_ssh_port",
				"conn_form_ssh_user",
				"conn_form_ssh_password",
				"conn_form_ssh_key",
				"conn_form_ssh_key_input",
			]);
		} else {
			v_disable_list = v_disable_list.concat([
				"conn_form_ssh_server",
				"conn_form_ssh_port",
				"conn_form_ssh_user",
				"conn_form_ssh_password",
				"conn_form_ssh_key",
				"conn_form_ssh_key_input",
			]);
		}
	} else {
		// Has connection string.
		if (p_conn_obj.conn_string.trim() !== "" && p_conn_obj.conn_string.trim() !== null) {
			v_disable_list = ["conn_form_server", "conn_form_port", "conn_form_database", "conn_form_user", "conn_form_user_pass"];
			v_enable_list = ["conn_form_connstring"];
		}
		// Has server config per input.
		else if (p_conn_obj.server.trim() !== "" && p_conn_obj.server.trim() !== null) {
			v_disable_list = ["conn_form_connstring"];
			v_enable_list = ["conn_form_server", "conn_form_port", "conn_form_database", "conn_form_user", "conn_form_user_pass"];
		}
		if (p_conn_obj.tunnel.enabled) {
			v_enable_list = v_enable_list.concat([
				"conn_form_ssh_server",
				"conn_form_ssh_port",
				"conn_form_ssh_user",
				"conn_form_ssh_password",
				"conn_form_ssh_key",
				"conn_form_ssh_key_input",
			]);
		} else {
			v_disable_list = v_disable_list.concat([
				"conn_form_ssh_server",
				"conn_form_ssh_port",
				"conn_form_ssh_user",
				"conn_form_ssh_password",
				"conn_form_ssh_key",
				"conn_form_ssh_key_input",
			]);
		}
	}

	// Updating the fields.
	updateModalEditConnectionFields(v_disable_list, v_enable_list);

	showConnectionDetail(p_conn_obj, false);
}

export function newConnection() {
	v_connections_data.current_id = -1;
	v_connections_data.current_obj = null;
	adjustTechSelector();

	el("conn_form_button_test_connection").setAttribute("disabled", true);
	el("conn_form_button_save_connection").setAttribute("disabled", true);
	el("conn_form_type").value = "postgresql";
	el("conn_form_title").value = "";
	el("conn_form_environment").value = "";
	el("conn_form_public").checked = false;
	el("conn_form_connstring").value = "";
	el("conn_form_server").value = "";
	el("conn_form_port").value = "";
	el("conn_form_database").value = "";
	el("conn_form_user").value = "";
	el("conn_form_user_pass").value = "";
	el("conn_form_use_tunnel").checked = false;
	el("conn_form_ssh_server").value = "";
	el("conn_form_ssh_port").value = "22";
	el("conn_form_ssh_user").value = "";
	el("conn_form_ssh_password").value = "";
	el("conn_form_ssh_key").value = "";
	el("conn_form_ssh_key_input").value = null;
	el("conn_form_ssh_key_input_label").innerHTML = "Click to select";

	el("conn_form_user_pass_check_icon")?.remove();
	el("conn_form_ssh_password_check_icon")?.remove();
	el("conn_form_ssh_key_check_icon")?.remove();

	// Enables/disables the right fields for the default "postgresql" type and
	// marks the still-empty required ones -- same as if the user had just
	// picked it from the Connection Type select themselves.
	updateModalEditConnectionState({ target: el("conn_form_type") });

	showConnectionDetail(null, true);
}

export function selectConnection(p_conn_obj) {
	switchSection("database");
	if (p_conn_obj.technology === "terminal") {
		v_connTabControl.tag.createOuterTerminalTab(
			p_conn_obj.id,
			p_conn_obj.alias,
			p_conn_obj.tunnel.user + "@" + p_conn_obj.tunnel.server + ":" + p_conn_obj.tunnel.port,
			p_conn_obj.environment,
		);
	} else {
		v_connTabControl.tag.createConnTab(p_conn_obj.id);
	}
}

// Wired to the detail pane's Connect/Delete buttons, which act on whichever
// connection is currently loaded into the form (v_connections_data.current_obj)
// rather than taking one as an argument -- see workspace.html.
export function connectSelectedConnection() {
	if (v_connections_data.current_obj) selectConnection(v_connections_data.current_obj);
}

export function deleteSelectedConnection() {
	if (v_connections_data.current_obj) deleteConnection(v_connections_data.current_obj);
}

export function toggleConnectionsPublic() {
	updateConnectionsTitleInfo();
	var v_public = el("conn_list_public").checked;
	if (v_public) {
		v_connections_data.show_public = true;
		document.querySelectorAll(".omnidb__connections__list-item--public").forEach((v_item_el) => {
			v_item_el.classList.remove("d-none");
			v_item_el.classList.add("show");
		});
	} else {
		v_connections_data.show_public = false;
		for (let i = 0; i < v_connections_data.list_items.length; i++) {
			v_conn_div = v_connections_data.list_items[i].item_div;
			v_conn_obj = v_connections_data.list_items[i].data;
			if (v_conn_obj.public) {
				if (!v_conn_obj.is_mine) {
					v_conn_div.classList.remove("show");
					v_conn_div.classList.add("d-none");
				}
			}
		}
	}
}

/**
 * ## updateModalEditConnectionState
 * @desc Constructs a set of string arrays containing connection inputs that should be validated, enabled and disabled.
 * These arrays are constructed based on a set of rules, ex:
 * - conn_form_type as 'Terminal' makes:
 * 	- required: 'conn_form_server', 'conn_form_port', 'conn_form_database'
 *  - enabled: 'conn_form_ssh_server', 'conn_form_ssh_port', 'conn_form_ssh_database', 'conn_form_ssh_password', 'conn_form_ssh_key', 'conn_form_ssh_key_input'
 *  - disabled: 'conn_form_server', 'conn_form_port', 'conn_form_database', 'conn_form_password', 'conn_form_key', 'conn_form_ssh_input'
 *
 * @param  {Object} e Event.
 */
export function updateModalEditConnectionState(e) {
	let v_e_target = e.target;
	let v_e_target_id = v_e_target.getAttribute("id");
	let v_e_value = e.target.value;
	// IDs of elements that should be disabled.
	let v_disable_list = [];
	// IDs of elements that should be enabled.
	let v_enable_list = [];
	// IDs of elements that should be required.
	let v_form_cases = ["conn_form_type"];
	let v_technology = el("conn_form_type").value;
	let v_allow_tunnel = el("conn_form_use_tunnel").checked;
	let v_use_connection_string = el("conn_form_connstring").value;
	let v_has_ssh_key_file = el("conn_form_ssh_key_input").value;

	// Case where technology is terminal.
	if (v_technology === "terminal") {
		v_allow_tunnel = true;
		el("conn_form_use_tunnel").checked = true;
		el("conn_form_use_tunnel").setAttribute("disabled", true);
	} else {
		el("conn_form_use_tunnel").removeAttribute("disabled");
	}

	// Checking connection string.
	if (typeof v_use_connection_string === "string") {
		v_use_connection_string = v_use_connection_string.trim();
	}
	// Case where technology is terminal.
	if (v_technology === "terminal") {
		v_disable_list.push("conn_form_connstring");
		v_disable_list.push("conn_form_server");
		v_disable_list.push("conn_form_port");
		v_disable_list.push("conn_form_database");
		v_disable_list.push("conn_form_user");
		v_disable_list.push("conn_form_user_pass");
	}
	// Case where technology is sqlite.
	else if (v_technology === "sqlite") {
		// Disabled fields
		v_disable_list.push("conn_form_connstring");
		v_disable_list.push("conn_form_server");
		v_disable_list.push("conn_form_port");
		v_disable_list.push("conn_form_user");
		v_disable_list.push("conn_form_user_pass");
		// Enabled fields
		v_enable_list.push("conn_form_database");
		// Form cases will check for database.
		v_form_cases.push("conn_form_database");
	}
	// Case where connection string has value.
	else if (v_use_connection_string !== "" && v_use_connection_string !== null) {
		v_disable_list.push("conn_form_server");
		v_disable_list.push("conn_form_port");
		v_disable_list.push("conn_form_database");
		v_disable_list.push("conn_form_user");
		v_disable_list.push("conn_form_user_pass");
		// Form cases will check the connection string.
		v_form_cases.push("conn_form_connstring");
	}
	// Case where connection string is empty.
	else {
		v_enable_list.push("conn_form_server");
		v_enable_list.push("conn_form_port");
		v_enable_list.push("conn_form_database");
		v_enable_list.push("conn_form_user");
		v_enable_list.push("conn_form_user_pass");
		// Form cases will check for single connection inputs, except password.
		v_form_cases.push("conn_form_server");
		v_form_cases.push("conn_form_port");
		v_form_cases.push("conn_form_database");
		v_form_cases.push("conn_form_user");

		let v_block_conn_string = false;
		let v_check_inputs = [
			"conn_form_server",
			"conn_form_port",
			"conn_form_database",
			"conn_form_user",
			"conn_form_user_pass",
		];
		let v_check_inputs_empty = true;
		for (let i = 0; i < v_check_inputs.length; i++) {
			var v_check_input_value = el(v_check_inputs[i]).value;
			if (typeof v_check_input_value === "string") {
				v_check_input_value = v_check_input_value.trim();
			}
			if (v_check_input_value !== "" && v_check_input_value !== null) {
				v_check_inputs_empty = false;
			}
		}
		// Case where at least one server single input is being type.
		if (!v_check_inputs_empty) {
			v_block_conn_string = true;
		}
		if (v_block_conn_string) {
			v_disable_list.push("conn_form_connstring");
		}
		// Case where connection string is avaiable.
		else {
			v_enable_list.push("conn_form_connstring");
			// Form cases will check the connection string.
			v_form_cases.push("conn_form_connstring");
		}
	}

	if (v_allow_tunnel) {
		v_enable_list.push("conn_form_ssh_server");
		v_enable_list.push("conn_form_ssh_port");
		v_enable_list.push("conn_form_ssh_user");
		v_enable_list.push("conn_form_ssh_password");
		v_enable_list.push("conn_form_ssh_key");
		v_enable_list.push("conn_form_ssh_key_input");
		v_form_cases.push("conn_form_ssh_server");
		v_form_cases.push("conn_form_ssh_port");
		v_form_cases.push("conn_form_ssh_user");
	} else {
		v_disable_list.push("conn_form_ssh_server");
		v_disable_list.push("conn_form_ssh_port");
		v_disable_list.push("conn_form_ssh_user");
		v_disable_list.push("conn_form_ssh_password");
		v_disable_list.push("conn_form_ssh_key");
		v_disable_list.push("conn_form_ssh_key_input");
	}

	if (v_e_target_id === "conn_form_type") {
		// Case where the user picked a terminal needs to lock all server config inputs.
		if (v_e_value === "terminal") {
			v_disable_list = [
				"conn_form_connstring",
				"conn_form_server",
				"conn_form_port",
				"conn_form_database",
				"conn_form_user",
				"conn_form_user_pass",
			];
			v_enable_list = [
				"conn_form_ssh_server",
				"conn_form_ssh_port",
				"conn_form_ssh_user",
				"conn_form_ssh_password",
				"conn_form_ssh_key",
				"conn_form_ssh_key_input",
			];
			el("conn_form_use_tunnel").checked = true;
			el("conn_form_use_tunnel").setAttribute("disabled", true);
			v_form_cases.push("conn_form_ssh_server");
			v_form_cases.push("conn_form_ssh_port");
			v_form_cases.push("conn_form_ssh_user");
		}
	}

	// Updating the fields.
	updateModalEditConnectionFields(v_disable_list, v_enable_list, v_form_cases);
}

/**
 * ## updateModalEditConnectionFields
 * @desc Verifies a set of arrays to either disable, enable, set as required and clear fields when necessary.
 *
 * @param  {any[]} p_disable_list IDs of elements that should be disabled.
 * @param  {any[]} p_enable_list  IDs of elements that should be enabled.
 * @param  {any[]} [p_form_cases]   IDs of elements that should be required.
 */
export function updateModalEditConnectionFields(p_disable_list, p_enable_list, p_form_cases) {
	// Disabling elements.
	for (let i = 0; i < p_disable_list.length; i++) {
		var v_item = el(p_disable_list[i]);
		v_item.setAttribute("readonly", true);
		v_item.setAttribute("disabled", true);
		v_item.value = null;
	}
	// Enabling elements.
	for (let i = 0; i < p_enable_list.length; i++) {
		var v_item = el(p_enable_list[i]);
		v_item.removeAttribute("readonly");
		v_item.removeAttribute("disabled");
	}
	// Removing 'required' class from elements inside the connection detail form.
	document.querySelectorAll("#omnidb__connections__detail_form .required").forEach((v_required_el) => {
		v_required_el.classList.remove("required");
	});
	let v_has_invalid = false;
	if (p_form_cases) {
		// Adding 'required' class to required elements inside.
		for (let i = 0; i < p_form_cases.length; i++) {
			el(p_form_cases[i]).parentElement.classList.add("required");
		}
		// Validating values of required elements.
		for (let i = 0; i < p_form_cases.length; i++) {
			if (p_form_cases[i] === "conn_form_type") {
				if (el(p_form_cases[i]).value === "-1") {
					v_has_invalid = true;
					break;
				}
			} else {
				let v_value_check = el(p_form_cases[i]).value.trim();
				if (v_value_check === "" || v_value_check === null) {
					v_has_invalid = true;
					break;
				}
			}
		}
	}
	// Enabling or Disabling the test and save buttons based on valid data of required fields.
	if (v_has_invalid) {
		el("conn_form_button_test_connection").setAttribute("disabled", true);
		el("conn_form_button_save_connection").setAttribute("disabled", true);
	} else {
		el("conn_form_button_test_connection").removeAttribute("disabled");
		el("conn_form_button_save_connection").removeAttribute("disabled");
	}
}

export function updateConnectionKey(e) {
	var file = e.target.files ? e.target.files[0] : false;
	var v_input = el("conn_form_ssh_key");
	if (!file) {
		v_input.value = null;
		el("conn_form_ssh_key_input_label").innerHTML = "Click to select";
		updateModalEditConnectionState({ target: el("conn_form_ssh_key_input") });
		return;
	}
	var reader = new FileReader();
	reader.onload = function (e) {
		var v_contents = /** @type {FileReader} */ (e.target).result;
		v_input.value = v_contents;
		el("conn_form_ssh_key_input_label").innerHTML = "Key text loaded";
		updateModalEditConnectionState({ target: el("conn_form_ssh_key_input") });
	};
	reader.readAsText(file);
}

export function updateConnectionsTitleInfo() {
	var v_public = el("conn_list_public").checked;
	var v_group_context = el("group_selector").value;
	var v_connection_owner = false;
	var v_managing_group = v_group_context && el("group_selector").getAttribute("disabled");

	for (var i = 0; i < v_connections_data.list_items.length; i++) {
		var v_conn_obj = v_connections_data.list_items[i].data;

		if (v_conn_obj.is_mine) {
			v_connection_owner = true;
		}
	}

	// Updating empty connections info status.
	var v_empty_cards = el("connections_management_empty_all");
	var v_empty_with_public = el("connections_management_empty_with_public");
	// Updating empty connections info status.
	if (v_empty_cards) {
		if (v_connections_data.list_items.length === 0) {
			v_empty_with_public.style.display = "none";
			v_empty_cards.style.display = "";
		} else if (v_group_context !== "-1") {
			v_empty_cards.style.display = "none";
			v_empty_with_public.style.display = "none";
		} else if (v_public) {
			v_empty_cards.style.display = "none";
			v_empty_with_public.style.display = "none";
		} else if (!v_connection_owner) {
			v_empty_cards.style.display = "none";
			v_empty_with_public.style.display = "";
		}

		if (!v_public && v_managing_group && !v_connection_owner) {
			v_empty_with_public.style.display = "";
		}
	}
}
