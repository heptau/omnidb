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
import { v_createWelcomeTabFunction } from "./tab_functions/outer_welcome_tab.js";
import { v_createWebsiteOuterTabFunction, v_createWebsiteTabFunction } from "./tab_functions/website_tab.js";
import { showMenuNewTabOuter } from "./workspace.js";


export function initCreateTabFunctions() {
	// var v_createAlterTableTabFunction = function(p_table) {
	//
	// 	v_connTabControl.selectedTab.tag.tabControl.removeTabIndex(v_connTabControl.selectedTab.tag.tabControl.tabList.length-1);
	// 	var v_tab = v_connTabControl.selectedTab.tag.tabControl.createTab(
	//           '<i class="fas fa-table icon-tab-title"></i><span id="tab_title"> ' + p_table + '</span><i title="Close" id="tab_close" class="fas fa-times tab-icon icon-close"></i></span>',
	//           false,
	//           null,
	//           null,
	//           null,
	//           removeTab,
	//           true,
	//           function() {
	//             if(this.tag != null) {
	//               refreshHeights();
	//             }
	//           }
	//       );
	// 	var v_tab_title_span = document.getElementById('tab_title');
	// 	v_tab_title_span.id = 'tab_title_' + v_tab.id;
	// 	var v_tab_close_span = document.getElementById('tab_close');
	// 	v_tab_close_span.id = 'tab_close_' + v_tab.id;
	// 	v_tab_close_span.onclick = function(e) {
	//     var v_current_tab = v_tab;
	//     beforeCloseTab(e,
	//       function() {
	//         removeTab(v_current_tab);
	//       });
	// 	};
	// 	v_connTabControl.selectedTab.tag.tabControl.selectTab(v_tab);
	//
	// 	var v_html = "<span class='query_info' style='margin-left: 10px;'>Table Name: </span><input type='text' id='txt_tableNameAlterTable_" + v_tab.id + "' onchange='changeTableName()' style='margin: 10px;'/>" +
	// 	"<button id='bt_saveAlterTable_" + v_tab.id + "' onclick='saveAlterTable()' style='visibility: hidden;'>Save Changes</button>" +
	//       "        <div id='alter_tabs_" + v_tab.id + "' style='margin-left: 10px; margin-right: 10px; margin-bottom: 10px;'>" +
	//     "            <ul>" +
	//     "            <li id='alter_tabs_" + v_tab.id + "_tab1'>Columns</li>" +
	//     "            <li id='alter_tabs_" + v_tab.id + "_tab2'>Constraints</li>" +
	//     "            <li id='alter_tabs_" + v_tab.id + "_tab3'>Indexes</li>" +
	//   	"			</ul>" +
	//   	"			<div id='div_alter_tabs_" + v_tab.id + "_tab1'>" +
	//   	"				<div style='padding: 20px;'>" +
	// 	"                	<div id='div_alter_table_data_" + v_tab.id + "' style='height: 400px; overflow: hidden;'></div>" +
	// 	"                </div>" +
	//   	"			</div>" +
	//   	"			<div id='div_alter_tabs_" + v_tab.id + "_tab2'>" +
	//   	"				<button id='bt_newConstraintAlterTable_" + v_tab.id + "' onclick='newConstraintAlterTable()' style='margin-left: 20px; margin-top: 20px;'>New Constraint</button>" +
	//   	"				<div style='padding: 20px;'>" +
	//   	"					<div id='div_alter_constraint_data_" + v_tab.id + "' style='width: 100%; height: 400px; overflow: hidden;'></div>" +
	//   	"				</div>" +
	//   	"			</div>" +
	//   	"			<div id='div_alter_tabs_" + v_tab.id + "_tab3'>" +
	//   	"				<button id='bt_newIndexAlterTable_" + v_tab.id + "' onclick='newIndexAlterTable()' style='display: block; margin-left: 20px; margin-top: 20px;'>New Index</button>" +
	//   	"				<div style='padding: 20px;'>" +
	//   	"					<div id='div_alter_index_data_" + v_tab.id + "' style='width: 100%; height: 400px; overflow: hidden;'></div>" +
	//   	"				</div>" +
	//   	"			</div>" +
	// 		"		</div>";
	//
	// 	var v_div = document.getElementById('div_' + v_tab.id);
	// 	v_div.innerHTML = v_html;
	//
	// 	var v_curr_tabs = createTabControl('alter_tabs_' + v_tab.id,0,null);
	//
	//
	// 	var v_tag = {
	// 		mode: 'alter',
	// 		txtTableName: document.getElementById('txt_tableNameAlterTable_' + v_tab.id),
	// 		btSave: document.getElementById('bt_saveAlterTable_' + v_tab.id),
	// 		btNewConstraint: document.getElementById('bt_newConstraintAlterTable_' + v_tab.id),
	// 		btNewIndex: document.getElementById('bt_newIndexAlterTable_' + v_tab.id),
	// 		htColumns: null,
	// 		htConstraints: null,
	// 		htIndexes: null,
	// 		htDivColumns: document.getElementById('div_alter_table_data_' + v_tab.id),
	// 		htDivConstraints: document.getElementById('div_alter_constraint_data_' + v_tab.id),
	// 		htDivIndexes: document.getElementById('div_alter_index_data_' + v_tab.id),
	// 		tab_title_span : v_tab_title_span,
	// 		tabControl: v_curr_tabs,
	// 		alterTableObject: { mode: null },
	//     tabCloseSpan: v_tab_close_span
	// 	};
	//
	// 	v_curr_tabs.tabList[0].elementLi.onclick = function() {
	//
	// 		v_curr_tabs.selectTabIndex(0);
	// 		v_tag.alterTableObject.window = 'columns';
	//     refreshHeights();
	// 	}
	//
	// 	v_curr_tabs.tabList[1].elementLi.onclick = function() {
	//
	// 		v_curr_tabs.selectTabIndex(1);
	// 		v_tag.alterTableObject.window = 'constraints';
	//     refreshHeights();
	// 	}
	//
	// 	v_curr_tabs.tabList[2].elementLi.onclick = function() {
	//
	// 		if (v_tag.alterTableObject.mode!='alter')
	// 			showAlert('Create the table first.');
	// 		else {
	// 			v_curr_tabs.selectTabIndex(2);
	// 			v_tag.alterTableObject.window = 'indexes';
	//       refreshHeights();
	// 		}
	//
	// 	}
	//
	// 	v_curr_tabs.selectTabIndex(0);
	//
	// 	v_tab.tag = v_tag;
	//
	//   var v_add_tab = v_connTabControl.selectedTab.tag.tabControl.createTab('+',false,function(e) {showMenuNewTab(e); },null,null,null,null,null,false);
	//   v_add_tab.tag = {
	//     mode: 'add'
	//   }
	//
	//   setTimeout(function() {
	//     refreshHeights();
	//   },10);
	//
	// };

	// Functions to create a default `add` tab
	v_connTabControl.createAddTab = function () {
		v_connTabControl.createTab({
			p_icon: '<i class="fas fa-plus"></i>',
			p_name: "Add Connection",
			p_close: false,
			p_selectable: false,
			p_clickFunction: function (e) {
				showMenuNewTabOuter(e);
			},
			p_omnidb_tooltip_name: '<h5 class="my-1">Add/Select Connections</h5>',
		});
	};

	// Functions to create tabs globally
	v_connTabControl.tag.createConnTab = v_createConnTabFunction;
	//v_connTabControl.tag.createChatTab = v_createChatTabFunction;
	//v_connTabControl.tag.createServerMonitoringTab = v_createServerMonitoringTabFunction;

	// Functions to create snippet panel globally
	v_connTabControl.tag.createSnippetPanel = v_createSnippetPanelFunction;

	// Functions to create tabs inside snippet panel
	v_connTabControl.tag.createSnippetTextTab = v_createSnippetTextTabFunction;

	// Functions to create welcome tab globally
	v_connTabControl.tag.createWelcomeTab = v_createWelcomeTabFunction;

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
