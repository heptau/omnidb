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

import { startConnectionManagement } from "../connections.js";
import { showConfigUser } from "../header_actions.js";
import { t } from "../i18n.js";
import { createOmnisUiAssistant } from "../lib/omnis_ui_assistant/omnis-control.js";
import { toggleSnippetPanel } from "../panel_functions/outer_snippet_panel.js";
import { switchSection } from "../section_switcher.js";


/**
 * @param {string | null} [p_tutorial_name]
 * @param {Element} [p_anchor_el] Element to anchor omnis (and its step
 * popup) next to -- the icon/button that triggered this tutorial. Falls
 * back to the bottom-right corner of the main content area when omitted.
 */
export function startTutorial(p_tutorial_name, p_anchor_el) {
	if (v_omnis.omnis_ui_assistant) {
		v_omnis.omnis_ui_assistant.self_destruct();
	}
	// Setting the tutorial to the default example tutorial `main`.
	var v_tutorial_name = p_tutorial_name ? p_tutorial_name : "main";
	if (p_anchor_el) {
		var v_anchor_rect = p_anchor_el.getBoundingClientRect();
		v_omnis.div.style.top = v_anchor_rect.top + "px";
		v_omnis.div.style.left = v_anchor_rect.right + 8 + "px";
	} else {
		v_omnis.div.style.top = v_omnis.root.getBoundingClientRect().height - 45 + "px";
		v_omnis.div.style.left = v_omnis.root.getBoundingClientRect().width - 45 + "px";
	}
	// omnis stays hidden (workspace.js) except while a tutorial is actually
	// walking through steps -- shown here, hidden again in p_callback_end.
	// Every tutorial reachable from the redesigned Getting Started menu
	// (itself, and everything its buttons launch -- utilities_menu,
	// connections_menu, terminal_connection, snippets, selecting_connection,
	// connection_tab) keeps it hidden throughout: their targets are already
	// clearly visible/labeled on screen, so the little circular logo
	// sliding across the page to "point" at each one just adds distracting
	// motion rather than clarity -- only its step card (built below) shows.
	// "main" is the one exception, kept for the original, more elaborate
	// tour (currently unreachable from any button, but harmless to keep
	// working as designed). updateOmnisPosition (omnis-control.js) still
	// positions omnis's div even while hidden, which is fine: the card's
	// own position is computed independently, not derived from omnis's, so
	// hiding it changes nothing else.
	v_omnis.div.style.display = v_tutorial_name === "main" ? "" : "none";
	// Disabling interactions with omnis.
	v_omnis.div.classList.add("omnis--active");
	// Instantiate the component.
	v_omnis.omnis_ui_assistant = createOmnisUiAssistant({
		p_callback_end: function () {
			// Configuring to delete the componente when it's no longer used.
			delete v_omnis.omnis_ui_assistant;
			// Enabling interactions with omnis.
			v_omnis.div.classList.remove("omnis--active");
			v_omnis.div.style.display = "none";
		},
		// Omnis Object
		p_omnis: v_omnis,
	});
	var v_button_inner_query_attr = ` disabled title="${t("tutorial.getting_started.open_connection_first")}" `;
	if (v_connTabControl.selectedTab.tag.tabControl) {
		if (v_connTabControl.selectedTab.tag.tabControl.tabList.length > 0) {
			v_button_inner_query_attr = "";
		}
	}
	var v_button_inner_query =
		'<li class="mb-2">' +
		`<button ` +
		v_button_inner_query_attr +
		` type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="connection_tab">` +
		`<i class="fas fa-list me-2"></i>${t("tutorial.getting_started.connection_tab_button")}` +
		"</button>" +
		"</li>";
	// Configuring the available tutorials.
	var v_tutorials = {
		main: [
			{
				p_message: t("tutorial.main.nav_rail.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.title.navigation_rail"),
			},
			{
				p_callback_end: function () {
					/** @type {HTMLElement} */ (document.getElementById("omnidb_section_nav__account_menu")).classList.remove(
						"omnidb__account-menu--open",
					);
				},
				p_callback_start: function () {
					/** @type {HTMLElement} */ (document.getElementById("omnidb_section_nav__account_menu")).classList.add(
						"omnidb__account-menu--open",
					);
				},
				p_clone_target: true,
				p_message: t("tutorial.main.account.message"),
				p_target: document.getElementById("omnidb_section_nav__account_menu"),
				p_title: t("tutorial.main.account.title"),
				p_update_delay: 350,
			},
		],
		utilities_menu: [
			{
				p_message: t("tutorial.utilities_menu.nav_rail.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.title.navigation_rail"),
			},
			{
				p_callback_start: function () {
					showConfigUser();
				},
				p_clone_target: true,
				p_message: t("tutorial.utilities_menu.settings.message"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById("settings_category_account");
					return v_target;
				},
				p_title: t("tutorial.utilities_menu.settings.title"),
				p_update_delay: 350,
			},
			{
				p_clone_target: true,
				p_message: t("tutorial.utilities_menu.manage_users.message"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById("button_open_users");
					return v_target;
				},
				p_title: t("tutorial.utilities_menu.manage_users.title"),
				p_update_delay: 350,
			},
			{
				p_callback_after_update_start: function () {
					setTimeout(function () {
						if (v_omnis.omnis_ui_assistant.divClonedElement.children[0]) {
							v_omnis.omnis_ui_assistant.divClonedElement.children[0].classList.remove("ms-2");
						}
					}, 50);
				},
				p_clone_target: true,
				p_message: t("tutorial.utilities_menu.add_user.message"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById("omnidb_utilities_menu_btn_new_user");
					return v_target;
				},
				p_title: t("tutorial.utilities_menu.add_user.title"),
				p_update_delay: 1000,
			},
			{
				p_message: t("tutorial.utilities_menu.user_options.message"),
				p_target: function () {
					var v_target = document.getElementById("omnidb_user_content");
					return v_target;
				},
				p_title: t("tutorial.utilities_menu.user_options.title"),
				p_update_delay: 350,
			},
		],
		connections_menu: [
			{
				p_clone_target: true,
				p_message: t("tutorial.connections_menu.nav_rail.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.title.navigation_rail"),
			},
			{
				p_callback_after_update_start: function () {
					setTimeout(function () {
						var v_target = document.getElementById("button_new_connection");
						v_omnis.omnis_ui_assistant.divClonedElement.children[0].classList.remove("ms-2");
					}, 50);
				},
				p_callback_start: function () {
					startConnectionManagement();
				},
				p_clone_target: true,
				p_message: t("tutorial.shared.click_new_connection"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById("button_new_connection");
					return v_target;
				},
				p_title: t("tutorial.title.add_connection"),
				p_update_delay: 1000,
			},
			{
				p_message: t("tutorial.connections_menu.type.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_type");
					return v_target;
				},
				p_title: t("tutorial.title.connection_type"),
				p_update_delay: 300,
			},
			{
				p_message: t("tutorial.connections_menu.title_field.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_title");
					return v_target;
				},
				p_title: t("tutorial.title.title_field"),
			},
			{
				p_message: t("tutorial.connections_menu.server.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_server");
					return v_target;
				},
				p_title: t("tutorial.connections_menu.server.title"),
			},
			{
				p_message: t("tutorial.connections_menu.port.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_port");
					return v_target;
				},
				p_title: t("tutorial.connections_menu.port.title"),
			},
			{
				p_message: t("tutorial.connections_menu.database.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_database");
					return v_target;
				},
				p_title: t("tutorial.connections_menu.database.title"),
			},
			{
				p_message: t("tutorial.connections_menu.user.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_user");
					return v_target;
				},
				p_title: t("tutorial.connections_menu.user.title"),
			},
			{
				p_message: t("tutorial.connections_menu.user_password.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_user_pass");
					return v_target;
				},
				p_title: t("tutorial.connections_menu.user_password.title"),
			},
			{
				p_message: t("tutorial.shared.test_connection_message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_button_test_connection");
					return v_target;
				},
				p_title: t("tutorial.title.test_connection"),
			},
		],
		terminal_connection: [
			{
				p_clone_target: true,
				p_message: t("tutorial.terminal_connection.nav_rail.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.terminal_connection.nav_rail.title"),
			},
			{
				p_callback_after_update_start: function () {
					setTimeout(function () {
						var v_target = document.getElementById("button_new_connection");
						v_omnis.omnis_ui_assistant.divClonedElement.children[0].classList.remove("ms-2");
					}, 50);
				},
				p_callback_start: function () {
					startConnectionManagement();
				},
				p_clone_target: true,
				p_message: t("tutorial.shared.click_new_connection"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById("button_new_connection");
					return v_target;
				},
				p_title: t("tutorial.title.add_connection"),
				p_update_delay: 1000,
			},
			{
				p_message: t("tutorial.terminal_connection.type.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_type");
					return v_target;
				},
				p_title: t("tutorial.title.connection_type"),
				p_update_delay: 300,
			},
			{
				p_message: t("tutorial.terminal_connection.title_field.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_title");
					return v_target;
				},
				p_title: t("tutorial.title.title_field"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_params.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_use_tunnel");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_params.title"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_server.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_ssh_server");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_server.title"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_port.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_ssh_port");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_port.title"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_user.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_ssh_user");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_user.title"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_password.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_ssh_password");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_password.title"),
			},
			{
				p_message: t("tutorial.terminal_connection.ssh_key.message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_ssh_key_input_label");
					return v_target;
				},
				p_title: t("tutorial.terminal_connection.ssh_key.title"),
			},
			{
				p_message: t("tutorial.shared.test_connection_message"),
				p_target: function () {
					var v_target = document.getElementById("conn_form_button_test_connection");
					return v_target;
				},
				p_title: t("tutorial.title.test_connection"),
			},
		],
		snippets: [
			{
				p_clone_target: true,
				p_message: t("tutorial.snippets.panel.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.snippets.panel.title"),
			},
			{
				// p_callback_after_update_start: function() {setTimeout(function(){var v_target = document.getElementById(v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editorDivId);},50);},
				p_callback_start: function () {
					toggleSnippetPanel();
				},
				p_message: t("tutorial.snippets.editor.message"),
				p_next_button: true,
				p_target: function () {
					var v_target = document.getElementById("a_" + v_connTabControl.snippet_tag.tabControl.selectedTab.tag.tab_id);
					return v_target;
				},
				p_title: t("tutorial.snippets.editor.title"),
				p_update_delay: 600,
			},
			{
				p_message: t("tutorial.snippets.indent.message"),
				p_next_button: true,
				p_target: function () {
					var v_target = document.getElementById("a_" + v_connTabControl.snippet_tag.tabControl.selectedTab.tag.tab_id);
					return v_target;
				},
				p_title: t("tutorial.snippets.indent.title"),
			},
			{
				p_message: t("tutorial.snippets.saved.message"),
				p_next_button: false,
				p_target: function () {
					var v_target = document.getElementById(v_connTabControl.snippet_tag.divTree.getAttribute("id"));
					return v_target;
				},
				p_title: t("tutorial.snippets.saved.title"),
				p_update_delay: 600,
			},
		],
		selecting_connection: [
			{
				p_message: t("tutorial.selecting_connection.nav_rail.message"),
				p_target: document.getElementById("omnidb_section_nav"),
				p_title: t("tutorial.title.navigation_rail"),
			},
			{
				p_callback_start: function () {
					switchSection("database");
				},
				p_message: t("tutorial.selecting_connection.select.message"),
				p_position: function () {
					var v_target = v_connTabControl.tabList[v_connTabControl.tabList.length - 1].elementA;
					return { x: v_target.getBoundingClientRect().x + 40, y: v_target.getBoundingClientRect().y };
				},
				p_target: function () {
					var v_target = v_connTabControl.tabList[v_connTabControl.tabList.length - 1].elementA;
					return v_target;
				},
				p_title: t("tutorial.selecting_connection.select.title"),
				p_update_delay: 350,
			},
		],
		connection_tab: [
			{
				p_callback_start: function () {
					switchSection("database");
				},
				p_message: t("tutorial.connection_tab.current.message"),
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.divDetails;
					return v_target;
				},
				p_title: t("tutorial.connection_tab.current.title"),
				p_update_delay: 350,
			},
			{
				p_message: t("tutorial.connection_tab.tree.message"),
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.divTree;
					return v_target;
				},
				p_title: t("tutorial.connection_tab.tree.title"),
			},
			{
				p_message: t("tutorial.connection_tab.properties.message"),
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.divTreeTabs;
					return v_target;
				},
				p_title: t("tutorial.connection_tab.properties.title"),
			},
			{
				p_message: t("tutorial.connection_tab.inner_tabs.message"),
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.tabControl.tabList[0].elementA;
					return v_target;
				},
				p_title: t("tutorial.connection_tab.inner_tabs.title"),
			},
			{
				p_message: t("tutorial.connection_tab.actions.message"),
				p_position: function () {
					var v_target = v_connTabControl.selectedTab.tag.tabControl.selectedTab.elementDiv.querySelector(
						".omnidb__tab-actions",
					);
					return { x: v_target.getBoundingClientRect().x + 40, y: v_target.getBoundingClientRect().y };
				},
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.tabControl.selectedTab.elementDiv.querySelector(
						".omnidb__tab-actions",
					);
					return v_target;
				},
				p_title: t("tutorial.connection_tab.actions.title"),
			},
			{
				p_message: t("tutorial.connection_tab.result.message"),
				p_position: function () {
					var v_target = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result;
					return { x: v_target.getBoundingClientRect().x + 40, y: v_target.getBoundingClientRect().y + 40 };
				},
				p_target: function () {
					var v_target = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.div_result.querySelector(
						".omnidb__tab-actions",
					);
					return v_target;
				},
				p_title: t("tutorial.connection_tab.result.title"),
			},
		],
	};
	// Configuring tutorial getting started, changes based on gv_desktopMode
	let v_tutorial_link_creating_user = gv_desktopMode
		? ""
		: `
	<li class="mb-2">
		<button type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="utilities_menu">
			<i class="fas fa-user-plus me-2"></i>${t("tutorial.getting_started.create_user")}
		</button>
	</li>`;
	v_tutorials.getting_started = [
		{
			p_message:
				'<ol style="padding-left: 1.5rem;">' +
				v_tutorial_link_creating_user +
				`
				<li class="mb-2">
					<button type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="connections_menu">
						<i class="fas fa-plug me-2"></i>${t("tutorial.getting_started.create_connection")}
					</button>
				</li>
				<li class="mb-2">
					<button type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="terminal_connection">
						<i class="fas fa-terminal me-2"></i>${t("tutorial.getting_started.create_terminal")}
					</button>
				</li>
				<li class="mb-2">
					<button type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="snippets">
						<i class="fas fa-scroll me-2"></i>${t("tutorial.getting_started.snippets")}
					</button>
				</li>
				<li class="mb-2">
					<button type="button" class="btn omnidb__theme__btn--primary d-flex align-items-center" data-omnidb-action="start-tutorial" data-omnidb-arg="selecting_connection">
						<i class="fas fa-plus me-2"></i>${t("tutorial.getting_started.using_connection")}
					</button>
				</li>
				` +
				v_button_inner_query +
				"</ol>",
			p_title: `<i class="fas fa-list me-2"></i> ${t("tutorial.getting_started.title")}`,
			// Anchors omnis (and this step's card) next to whatever launched
			// the tutorial -- the rail's lightbulb icon, typically -- instead
			// of the bottom-right corner default that applies when a step
			// has no target and no position override (updateOmnisPosition
			// in omnis-control.js). Falls back to that default (`false`) for
			// callers that don't pass an anchor, e.g. the Welcome section's
			// own "Getting started" button.
			p_position: function () {
				if (!p_anchor_el) return false;
				var v_anchor_rect = p_anchor_el.getBoundingClientRect();
				return { x: v_anchor_rect.right + 8, y: v_anchor_rect.top };
			},
		},
	];

	// Selecting a tutorial
	var v_steps = v_tutorials[v_tutorial_name];
	// Update the step list with the new walkthrough
	v_omnis.omnis_ui_assistant.updateStepList(v_steps);
	// Go to the first step of the walkthrough
	v_omnis.omnis_ui_assistant.goToStep(0);
}
