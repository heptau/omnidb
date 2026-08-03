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

// Opens an external documentation page (postgresql.org, etc.) or the About
// dialog's OmniDB/GitHub links, rather than rendering them in an embedded
// iframe like this used to. Every site this points at (postgresql.org
// confirmed: `X-Frame-Options: DENY` / `frame-ancestors 'none'`; github.com
// sends the same class of header) refuses to be framed at all — the tab
// opened but the iframe stayed permanently blank, no error shown. There is
// no way to embed such a page; opening it externally is the only fix.
//
// Outside the desktop app, window.open() does that directly — it's an
// ordinary browser tab. Inside the desktop app's own webview, window.open()
// is a silent no-op (confirmed against the packaged app: no popup, no
// console error, nothing happens at all), so /open_external_url/ is asked
// to relay the request to wails-app instead, which calls the native
// BrowserOpenURL API (see go-server/open_external_url.go's comment for the
// full story — same pattern as /export_save_dialog/).

import { beforeCloseTab } from "../create_tab_functions.js";
import { showAlert } from "../notification_control.js";
import { removeTab, renameTab, showMenuNewTabOuter } from "../workspace.js";

export var v_openExternalUrl = function (p_url) {
	if (!gv_desktopMode) {
		window.open(p_url, "_blank", "noopener");
		return;
	}

	fetch("/open_external_url/", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url: p_url }),
	})
		.then(function (p_response) {
			return p_response.json();
		})
		.then(function (p_result) {
			if (p_result && p_result.error) {
				showAlert("Error opening link: " + p_result.error);
			}
		})
		.catch(function () {
			showAlert("Error opening link.");
		});
};

export var v_createWebsiteTabFunction = function (p_name, p_site) {
	v_openExternalUrl(p_site);
};

export var v_createWebsiteOuterTabFunction = function (p_name, p_site, p_html, p_close_function) {
	// A bare URL (no inline p_html) is an external site — same iframe-
	// blocking problem as v_createWebsiteTabFunction above (this is what
	// the About dialog's "OmniDB"/"GitHub" links use). p_html-provided
	// callers render local content, not a cross-origin page, so those
	// keep the original embedded-tab behavior below.
	if (p_html == null) {
		v_openExternalUrl(p_site);
		return;
	}

	// Removing last tab of the outer tab list
	v_connTabControl.removeLastTab();

	// Creating console tab in the inner tab list
	var v_tab = v_connTabControl.createTab({
		p_name: '<i class="fas fa-globe-americas icon-tab-title"></i><span id="tab_title"> ' + p_name + "</span>",
		p_selectFunction: function () {
			if (this.tag != null) {
				this.tag.resize();
			}
		},
		p_closeFunction: function (e, p_tab) {
			var v_current_tab = p_tab;
			beforeCloseTab(e, function () {
				if (p_close_function != null) {
					p_close_function();
				}
				removeTab(v_current_tab);
			});
		},
		p_dblClickFunction: renameTab,
	});

	// Selecting newly created tab
	v_connTabControl.selectTab(v_tab);

	var v_html = "<div id='website_" + v_tab.id + "' style=' width: 100%; height: 200px;'>" + p_html + "</div>";

	var v_div = document.getElementById("div_" + v_tab.id);
	v_div.innerHTML = v_html;

	var v_resizeFunction = function () {
		var v_tab_tag = v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag;
		if (v_tab_tag.iframe) {
			v_tab_tag.iframe.style.height = window.innerHeight - $(v_tab_tag.iframe).offset().top - 0.833 * v_font_size + "px";
		}
	};

	var v_tag = {
		tab_id: v_tab.id,
		mode: "website_outer",
		iframe: document.getElementById("website_" + v_tab.id),
		tabControl: v_connTabControl,
		resize: v_resizeFunction,
	};

	v_tab.tag = v_tag;

	// Creating + tab in the outer tab list
	v_connTabControl.createTab({
		p_name: "+",
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			showMenuNewTabOuter(e);
		},
	});

	setTimeout(function () {
		v_resizeFunction();
	}, 10);
};
