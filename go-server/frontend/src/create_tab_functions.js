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

import { customMenu } from "./custom_menu.js";
import { showConfirm } from "./notification_control.js";
import { v_createSnippetPanelFunction } from "./panel_functions/outer_snippet_panel.js";
import { v_createConsoleTabFunction } from "./tab_functions/inner_console_tab.js";
import { v_createEditDataTabFunction } from "./tab_functions/inner_edit_data_tab.js";
import { v_createGraphTabFunction } from "./tab_functions/inner_graph_tab.js";
import { v_createMonitorDashboardTabFunction, v_createNewMonitorUnitTabFunction } from "./tab_functions/inner_monitoring_dashboard_tab.js";
import { v_createMonitoringTabFunction } from "./tab_functions/inner_monitoring_tab.js";
import { v_createQueryTabFunction } from "./tab_functions/inner_query_tab.js";
import { v_createSnippetTextTabFunction } from "./tab_functions/inner_snippet_tab.js";
import { v_createConnTabFunction } from "./tab_functions/outer_connection_tab.js";
import { v_createOuterTerminalTabFunction } from "./tab_functions/outer_terminal_tab.js";
import { v_createWebsiteOuterTabFunction, v_createWebsiteTabFunction } from "./tab_functions/website_tab.js";
import { showMenuNewTabOuter } from "./workspace.js";


export function initCreateTabFunctions() {
	// Functions to create a default `add` tab -- compact (icon only, tooltip
	// carries the label) so it doesn't read as just another connection tab.
	v_connTabControl.createAddTab = function () {
		var v_tab = v_connTabControl.createTab({
			p_icon: '<i class="fas fa-plus"></i>',
			p_close: false,
			p_selectable: false,
			p_clickFunction: function (e) {
				showMenuNewTabOuter(e);
			},
			p_omnidb_tooltip_name: '<h5 class="my-1">Add Connection</h5>',
		});
		v_tab.elementA.classList.add("omnidb__tab-menu__link--compact");
		// Every connection/terminal/website tab created afterwards gets
		// inserted before this one instead of appended past it -- otherwise
		// it stays wherever it happened to land at startup while the strip
		// fills in around it.
		v_connTabControl.setTrailingTab(v_tab);
	};

	// Functions to create tabs globally
	v_connTabControl.tag.createConnTab = v_createConnTabFunction;
	//v_connTabControl.tag.createChatTab = v_createChatTabFunction;
	//v_connTabControl.tag.createServerMonitoringTab = v_createServerMonitoringTabFunction;

	// Functions to create snippet panel globally
	v_connTabControl.tag.createSnippetPanel = v_createSnippetPanelFunction;

	// Functions to create tabs inside snippet panel
	v_connTabControl.tag.createSnippetTextTab = v_createSnippetTextTabFunction;

	// Functions to create tabs inside a connection tab
	v_connTabControl.tag.createQueryTab = v_createQueryTabFunction;
	v_connTabControl.tag.createConsoleTab = v_createConsoleTabFunction;
	v_connTabControl.tag.createWebsiteTab = v_createWebsiteTabFunction;
	v_connTabControl.tag.createWebsiteOuterTab = v_createWebsiteOuterTabFunction;
	v_connTabControl.tag.createNewMonitorUnitTab = v_createNewMonitorUnitTabFunction;
	v_connTabControl.tag.createMonitorDashboardTab = v_createMonitorDashboardTabFunction;

	v_connTabControl.tag.createEditDataTab = v_createEditDataTabFunction;
	v_connTabControl.tag.createGraphTab = v_createGraphTabFunction;
	v_connTabControl.tag.createMonitoringTab = v_createMonitoringTabFunction;
	v_connTabControl.tag.createOuterTerminalTab = v_createOuterTerminalTabFunction;

	// Functions to create tabs inside monitor tab
	//v_connTabControl.tag.createNewMonitorNodeTab = v_createNewMonitorNodeTabFunction;
}

export function beforeCloseTab(e, p_confirm_function) {
	if (e) {
		if (e.clientX == 0 && e.clientY == 0)
			showConfirm("Are you sure you want to remove this tab?", function () {
				p_confirm_function();
			});
		else {
			customMenu(
				{
					x: e.clientX + 5,
					y: e.clientY + 5,
				},
				[
					{
						text: "Confirm",
						icon: "fas cm-all fa-check",
						action: function () {
							p_confirm_function();
						},
					},
					{
						text: "Cancel",
						icon: "fas cm-all fa-times",
						action: function () {},
					},
				],
				null,
			);
		}
	} else {
		p_confirm_function();
	}
}
