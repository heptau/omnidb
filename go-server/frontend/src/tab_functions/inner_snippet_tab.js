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

import { beforeCloseTab } from "../create_tab_functions.js";
import { saveSnippetText } from "../tree_context_functions/tree_snippets.js";
import { indentSQL, refreshHeights, removeTab } from "../workspace.js";


/** @param {{id: any, name: string, id_parent: any}|null} [p_snippet] */
export var v_createSnippetTextTabFunction = function (p_snippet = null) {
	var v_name = "New Snippet";
	/** @type {{id: any, name: string|null, parent: any, type: string}} */
	var v_details = {
		id: null,
		name: null,
		parent: null,
		type: "snippet",
	};

	if (p_snippet) {
		v_name = p_snippet.name;
		v_details = {
			id: p_snippet.id,
			name: p_snippet.name,
			parent: p_snippet.id_parent,
			type: "snippet",
		};
	}

	v_connTabControl.snippet_tag.tabControl.removeTabIndex(v_connTabControl.snippet_tag.tabControl.tabList.length - 1);
	var v_tab = v_connTabControl.snippet_tag.tabControl.createTab({
		p_icon: '<i class="fas fa-scroll icon-tab-title"></i>',
		p_name: '<span id="tab_title">' + v_name + "</span>",
		p_status:
			'<span id="tab_loading" style="display:none;"><i class="tab-icon node-spin"></i></span><i title="" id="tab_check" style="display: none;" class="fas fa-check-circle tab-icon icon-check"></i>',
		p_selectFunction: function () {
			refreshHeights();
			if (this.tag != null && this.editor != null) {
				this.editor.focus();
			}
		},
		p_closeFunction: function (e, p_tab) {
			var v_current_tab = p_tab;
			// Only prompt when the tab actually has unsaved changes (the same
			// dot shown next to its title, see the dirty-dot block below) --
			// closing an already-saved snippet, whether via the X or the
			// keyboard shortcut (shortcuts.js's shortcut_close_snippet_tab),
			// shouldn't need a confirmation nobody asked for.
			if (v_current_tab.tag.tab_dirty_dot.style.display !== "none") {
				beforeCloseTab(e, function () {
					removeTab(v_current_tab);
				});
			} else {
				removeTab(v_current_tab);
			}
		},
	});
	v_connTabControl.snippet_tag.tabControl.selectTab(v_tab);

	// Unsaved-changes dot: appended straight onto the tab's <a> (elementA)
	// rather than into the p_name/tab_title flow above, so it lands in the
	// fixed-width "Zone D" balance space reserved on every secondary-tier tab
	// (see _base.scss) instead of drifting around next to a title whose
	// length varies and gets ellipsized.
	var v_tab_dirty_dot = document.createElement("span");
	v_tab_dirty_dot.className = "omnidb__tab-dirty-dot";
	v_tab_dirty_dot.title = "Unsaved changes";
	v_tab_dirty_dot.style.display = "none";
	v_tab.elementA.appendChild(v_tab_dirty_dot);

	//Adding unique names to spans
	var v_tab_title_span = /** @type {HTMLElement} */ (document.getElementById("tab_title"));
	v_tab_title_span.id = "tab_title_" + v_tab.id;
	var v_tab_loading_span = /** @type {HTMLElement} */ (document.getElementById("tab_loading"));
	v_tab_loading_span.id = "tab_loading_" + v_tab.id;
	var v_tab_check_span = /** @type {HTMLElement} */ (document.getElementById("tab_check"));
	v_tab_check_span.id = "tab_check_" + v_tab.id;

	var v_html =
		// omnidb__snippets__editor-host: sizes via flex (see #snippets_panel_tabs
		// in _base.scss) instead of a JS-computed pixel height -- no inline
		// height here, the flex column gives it whatever's left after the
		// action bar below takes its own (fixed) height.
		'<div id="txt_snippet_' +
		v_tab.id +
		'" class="omnidb__snippets__editor-host" style="border-right: 1px solid #c3c3c3; border-bottom: 1px solid #c3c3c3;"></div>' +
		// No Bootstrap row/col-12 wrapper here (unlike inner_query_tab.js's
		// actions bar): .omnidb__tab-actions is already a self-contained,
		// full-width flex bar with its own horizontal padding, so a .row's
		// negative gutter margin (which doesn't exactly cancel that padding)
		// only pushed it out of alignment with the bordered editor above.
		//
		// omnidb__tab-actions--no-divider: the shared .omnidb__tab-actions
		// rule's border-bottom exists to separate the bar from a result grid
		// underneath it (Query/Console tabs) -- there's nothing below this
		// bar, so that border was just a hard edge sitting directly under
		// the buttons with no matching edge above them, making the button
		// row read as bottom-heavy even though its padding is symmetric.
		//
		// btn-sm on both buttons: matches every other action bar in the app
		// (Query/Console/EditData) -- a plain (non -sm) `btn` here used to
		// render at a regular Bootstrap button's full spec height, which
		// this bar's own min-height floor couldn't override since it was
		// already the taller of the two, breaking this bar's height match
		// with the addremove footer next to it.
		'<div class="tab_actions omnidb__tab-actions omnidb__tab-actions--no-divider mt-2">' +
		'<button id="bt_indent_' +
		v_tab.id +
		'" class="btn btn-sm omnidb__theme__btn--secondary omnidb__tab-actions__btn" title="Indent SQL"><i class="fas fa-indent me-2"></i>Indent</button>' +
		'<button id="bt_save_' +
		v_tab.id +
		'" class="btn btn-sm omnidb__theme__btn--primary omnidb__tab-actions__btn" title="Save"><i class="fas fa-save me-2"></i>Save</button>' +
		"</div>";

	var v_div = /** @type {HTMLElement} */ (document.getElementById("div_" + v_tab.id));
	v_div.innerHTML = v_html;

	var v_txt_snippet = /** @type {HTMLElement} */ (document.getElementById("txt_snippet_" + v_tab.id));

	// Height comes from .omnidb__snippets__editor-host's flex rule (see
	// _base.scss) now, not a JS calculation -- by this point v_div already
	// carries the tab-pane's "active" class (selectTab above ran before
	// v_html was assigned), so the flex column has already resolved a real
	// height for this element.

	var langTools = ace.require("ace/ext/language_tools");
	var v_editor = ace.edit("txt_snippet_" + v_tab.id);
	v_editor.$blockScrolling = Infinity;
	v_editor.setTheme("ace/theme/" + v_editor_theme);
	v_editor.session.setMode("ace/mode/sql");

	v_editor.setFontSize(Number(v_font_size));
	v_editor.session.setTabSize(v_indent_size || 4);
	v_editor.session.setUseSoftTabs(v_indent_char !== 'tab');
	v_editor.setOption("printMarginColumn", v_ruler_column || 128);

	v_editor.commands.bindKey("ctrl-space", null);

	//Remove shortcuts from ace in order to avoid conflict with omnidb shortcuts
	v_editor.commands.bindKey("Cmd-,", null);
	v_editor.commands.bindKey("Ctrl-,", null);
	v_editor.commands.bindKey("Cmd-Delete", null);
	v_editor.commands.bindKey("Ctrl-Delete", null);
	v_editor.commands.bindKey("Ctrl-Up", null);
	v_editor.commands.bindKey("Ctrl-Down", null);

	v_txt_snippet.onclick = function () {
		v_editor.focus();
	};

	var v_tag = {
		tab_id: v_tab.id,
		mode: "snippet",
		editor: v_editor,
		editorDiv: v_txt_snippet,
		editorDivId: "txt_snippet_" + v_tab.id,
		query_info: document.getElementById("div_query_info_" + v_tab.id),
		div_result: document.getElementById("div_result_" + v_tab.id),
		sel_export_type: document.getElementById("sel_export_type_" + v_tab.id),
		tab_title_span: v_tab_title_span,
		tab_dirty_dot: v_tab_dirty_dot,
		tab_loading_span: v_tab_loading_span,
		tab_check_span: v_tab_check_span,
		bt_start: document.getElementById("bt_start_" + v_tab.id),
		bt_save: /** @type {HTMLElement} */ (document.getElementById("bt_save_" + v_tab.id)),
		tabControl: v_connTabControl.snippet_tag.tabControl,
		snippetTab: v_connTabControl.selectedTab,
		snippetObject: v_details,
		// Set around programmatic editor.setValue() calls (loading a snippet's
		// saved text, or clearing a brand new tab) so that isn't mistaken for a
		// user edit -- see tree_snippets.js's startEditSnippetText.
		suppressDirtyTracking: false,
	};

	v_tab.tag = v_tag;

	// Toolbar bindings, replacing the on*= attributes the two buttons above used
	// to carry -- see dom_event_bindings.js and README.md. saveSnippetText reads
	// event.clientX/clientY to place its prompt, so it takes the event itself.
	/** @type {HTMLElement} */ (document.getElementById("bt_indent_" + v_tab.id)).addEventListener("click", () =>
		indentSQL("snippet"),
	);
	v_tag.bt_save.addEventListener("click", saveSnippetText);

	// Unsaved-changes dot: any real edit shows it, Save (see saveSnippetText's
	// callback) clears it. Loading content programmatically doesn't count --
	// see suppressDirtyTracking above.
	v_editor.session.on("change", function () {
		if (v_tag.suppressDirtyTracking) return;
		v_tab_dirty_dot.style.display = "";
	});

	// Creating + tab in the outer tab list
	var v_add_tab = v_connTabControl.snippet_tag.tabControl.createTab({
		p_icon: '<i class="fas fa-plus"></i>',
		p_close: false,
		p_selectable: false,
		p_isDraggable: false,
		p_clickFunction: function (e) {
			// showMenuNewTab(e);
			v_connTabControl.tag.createSnippetTextTab();
		},
	});
	v_add_tab.elementA.classList.add("omnidb__tab-menu__link--compact");
	v_add_tab.tag = {
		mode: "add",
	};


	v_editor.focus();
};
