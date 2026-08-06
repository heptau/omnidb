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
import { resizeSnippetHorizontal, resizeSnippetPanel, showMenuNewTab } from "../workspace.js";

/** @param {boolean|"visible"|"hidden"} [p_set_state] */
export var toggleSnippetPanel = function (p_set_state = false) {
	var v_element = v_connTabControl.snippet_tag.divPanel;
	var v_snippet_tag = v_connTabControl.snippet_tag;

	let v_set_state = p_set_state;
	if (v_set_state === "visible") {
		v_element.classList.add("omnidb__panel--slide-in");
	} else if (v_set_state === "hidden") {
		v_element.classList.remove("omnidb__panel--slide-in");
	} else {
		v_element.classList.toggle("omnidb__panel--slide-in");
	}

	resizeSnippetPanel();
};

export var v_createSnippetPanelFunction = function (p_index) {
	// v_connTabControl.removeLastTab();

	var v_tab = v_connTabControl.createTab({
		p_icon: `<i class="fas fa-book"></i>`,
		p_name: `Snippets`,
		p_close: false,
		p_selectable: false,
		p_clickFunction: function () {
			toggleSnippetPanel();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Snippets Panel</h5>',
	});

	v_connTabControl.selectTab(v_tab);

	var v_html =
		"<div id='" +
		v_tab.id +
		"_panel_snippet' class='omnidb__panel omnidb__panel--snippet'>" +
		"<button id='bt_toggle_snippet_panel_" +
		v_tab.id +
		"' type='button' class='px-4 btn omnidb__theme__btn--secondary omnidb__panel__toggler'><i class='fas fa-arrows-alt-v'></i></button>" +
		"<div class='container-fluid h-100' style='position: relative;'>" +
		"<div id='" +
		v_tab.id +
		"_snippet_div_layout_grid' class='d-flex h-100'>" +
		"<div id='" +
		v_tab.id +
		"_snippet_div_left' class='omnidb__snippets__div-left h-100' style='width: 300px; flex-shrink: 0;'>" +
		"<div class='h-100'>" +
		"<div class='omnidb__snippets__content-left h-100 d-flex flex-column'>" +
		"<div id='" +
		v_tab.id +
		"_snippet_tree' style='overflow: auto; flex-grow: 1; transition: scroll 0.3s;'></div>" +
		"</div>" +
		"</div>" +
		"<div id='snippet_resize_line_" +
		v_tab.id +
		"' class='resize_line_vertical omnidb__resize-line__container' style='position:absolute;height: 100%;width: 10px;cursor: ew-resize;border-right: 1px dashed #acc4e8;top: 0px;right: 0px;z-index: 10;'></div>" +
		"</div>" + //.div_left
		"<div id='" +
		v_tab.id +
		"_snippet_div_right' class='omnidb__snippets__div-right pt-0 flex-grow-1' style='position: relative;'>" +
		"<div id='" +
		v_tab.id +
		"_snippet_tabs' class='w-100'></div>" +
		"</div>" + //.div_right
		"</div>" + //.d-flex
		"</div>" + //.container-fluid
		"</div>";

	v_connTabControl.snippet_div = document.createElement("div");
	v_connTabControl.snippet_div.id = v_tab.id + "_snippet";
	v_connTabControl.snippet_div.innerHTML = v_html;
	/** @type {HTMLElement} */ (document.getElementById(v_connTabControl.id)).append(v_connTabControl.snippet_div);

	// Bindings for the panel toggler and the resize line just built above,
	// replacing the on*= attributes they carried -- see dom_event_bindings.js and
	// README.md. Both elements needed an id; they had none.
	/** @type {HTMLElement} */ (document.getElementById("bt_toggle_snippet_panel_" + v_tab.id)).addEventListener(
		"click",
		() => toggleSnippetPanel(),
	);
	/** @type {HTMLElement} */ (document.getElementById("snippet_resize_line_" + v_tab.id)).addEventListener(
		"mousedown",
		(event) => resizeSnippetHorizontal(event),
	);

	var v_currTabControl = createTabControl({
		p_div: v_tab.id + "_snippet_tabs",
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
		tab_id: v_tab.id,
		tabControl: v_currTabControl,
		tabTitle: "teste",
		divLayoutGrid: document.getElementById(v_tab.id + "_snippet_div_layout_grid"),
		divLeft: document.getElementById(v_tab.id + "_snippet_div_left"),
		divPanel: document.getElementById(v_tab.id + "_panel_snippet"),
		divRight: document.getElementById(v_tab.id + "_snippet_div_right"),
		divTree: /** @type {HTMLElement} */ (document.getElementById(v_tab.id + "_snippet_tree")),
		connTabControl: v_connTabControl,
		isVisible: false,
		mode: "snippets",
	};

	v_tab.tag = v_tag;

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
