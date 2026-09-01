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

import { createTabControl } from "../tabs.js";
import { getTreeSnippets } from "../tree_context_functions/tree_snippets.js";
import { switchSection } from "../section_switcher.js";
import { resizeSnippetHorizontal, resizeSnippetPanel, showMenuNewTab } from "../workspace.js";

/**
 * Snippets is a full-screen section now (see section_switcher.js), not a
 * slide-in overlay -- this just switches to it. Kept as a named export,
 * rather than inlined at call sites, because the native Wails "Snippets"
 * menu item and the onboarding tutorial both still call it by this name.
 */
export function toggleSnippetPanel() {
	switchSection("snippets");
	resizeSnippetPanel();
}

// Fixed ids: unlike a v_connTabControl connection tab, there is only ever
// one snippet panel instance, so it does not need a unique-per-tab prefix.
var SNIPPET_PANEL_ID = "snippets_panel";

export var v_createSnippetPanelFunction = function (p_index) {
	var v_html =
		"<div id='" +
		SNIPPET_PANEL_ID +
		"' class='omnidb__snippets__panel h-100'>" +
		"<div class='container-fluid h-100' style='position: relative;'>" +
		"<div id='" +
		SNIPPET_PANEL_ID +
		"_div_layout_grid' class='d-flex h-100'>" +
		"<div id='" +
		SNIPPET_PANEL_ID +
		"_div_left' class='omnidb__snippets__div-left h-100' style='width: 300px; flex-shrink: 0;'>" +
		"<div class='h-100'>" +
		"<div class='omnidb__snippets__content-left h-100 d-flex flex-column'>" +
		"<div id='" +
		SNIPPET_PANEL_ID +
		"_tree' style='overflow: auto; flex-grow: 1; transition: scroll 0.3s;'></div>" +
		"</div>" +
		"</div>" +
		"<div id='snippet_resize_line_" +
		SNIPPET_PANEL_ID +
		"' class='resize_line_vertical omnidb__resize-line__container' style='position:absolute;height: 100%;width: 10px;cursor: ew-resize;border-right: 1px dashed #acc4e8;top: 0px;right: 0px;z-index: 10;'></div>" +
		"</div>" + //.div_left
		"<div id='" +
		SNIPPET_PANEL_ID +
		"_div_right' class='omnidb__snippets__div-right pt-0 flex-grow-1' style='position: relative;'>" +
		"<div id='" +
		SNIPPET_PANEL_ID +
		"_tabs' class='w-100'></div>" +
		"</div>" + //.div_right
		"</div>" + //.d-flex
		"</div>" + //.container-fluid
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_snippets"));
	v_target.innerHTML = v_html;

	// Binding for the resize line just built above, replacing the on*=
	// attribute it carried -- see dom_event_bindings.js and README.md.
	/** @type {HTMLElement} */ (document.getElementById("snippet_resize_line_" + SNIPPET_PANEL_ID)).addEventListener(
		"mousedown",
		(event) => resizeSnippetHorizontal(event),
	);

	var v_currTabControl = createTabControl({
		p_div: SNIPPET_PANEL_ID + "_tabs",
		p_hierarchy: "secondary",
	});

	v_currTabControl.createTab({
		p_name: "+",
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			showMenuNewTab(e);
		},
	});

	var v_tag = {
		tab_id: SNIPPET_PANEL_ID,
		tabControl: v_currTabControl,
		tabTitle: "teste",
		divLayoutGrid: document.getElementById(SNIPPET_PANEL_ID + "_div_layout_grid"),
		divLeft: document.getElementById(SNIPPET_PANEL_ID + "_div_left"),
		divPanel: document.getElementById(SNIPPET_PANEL_ID),
		divRight: document.getElementById(SNIPPET_PANEL_ID + "_div_right"),
		divTree: /** @type {HTMLElement} */ (document.getElementById(SNIPPET_PANEL_ID + "_tree")),
		connTabControl: v_connTabControl,
		isVisible: false,
		mode: "snippets",
	};

	v_connTabControl.snippet_tag = v_tag;

	getTreeSnippets(v_tag.divTree.id);

	if (v_connTabControl.snippet_tag.tabControl.tabList.length > 0) {
		v_connTabControl.snippet_tag.tabControl.selectTab(v_connTabControl.snippet_tag.tabControl.tabList[0]);
	}
	v_connTabControl.tag.createSnippetTextTab();
	v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.setValue("");
	v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.clearSelection();
	v_connTabControl.snippet_tag.tabControl.selectedTab.tag.editor.gotoLine(0, 0, true);

	// Creating `Add` tab in the outer tab list
	// v_connTabControl.createAddTab();
	// v_connTabControl.createTab('+',false,v_connTabControl.tag.createConnTab,false);

	//setTimeout(function() {
	//  refreshTreeHeight();
	//},10);
};
