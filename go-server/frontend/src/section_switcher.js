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

/**
 * The narrow, icon-only vertical activity bar (VSCode-style) and the
 * full-screen section it switches between. Deliberately a *separate*
 * tabControl instance from v_connTabControl: v_connTabControl is read
 * unguarded as "the currently open DB connection" in ~1000+ call sites
 * across the bundle, so folding these fixed sections into it would mean
 * auditing all of them. Keeping it as its own small, private instance means
 * none of that code needs to change -- v_connTabControl still only ever
 * holds DB connection/terminal tabs, just rendered inside the Database
 * section's own container instead of directly under #omnidb__main.
 */

import { startConnectionManagement } from "./connections.js";
import { confirmSignout, showConfigUser } from "./header_actions.js";
import { startTutorial } from "./tutorial_functions/tutorial.js";
import { toggleSnippetPanel } from "./panel_functions/outer_snippet_panel.js";
import { createTabControl } from "./tabs.js";
import { escapeHtml } from "./query.js";
import { refreshBootstrapTooltips } from "./workspace.js";

const SECTION_NAMES = ["welcome", "connections", "database", "snippets", "settings"];

/** @type {Record<string, HTMLElement>} */
var v_sectionDivs = {};
/** @type {any} */
var v_sectionNav;
/** @type {Record<string, any>} */
var v_sectionNavTabs = {};

/**
 * Shows exactly one full-screen section and hides the rest. Safe to call
 * repeatedly with the same name -- section visibility is applied
 * unconditionally every call, while the nav icon highlight is only touched
 * when it does not already match (tabControl.selectTab no-ops otherwise),
 * which is what keeps this from recursing through a section's own
 * selectFunction indefinitely.
 * @param {string} p_name
 */
export function switchSection(p_name) {
	for (let i = 0; i < SECTION_NAMES.length; i++) {
		var v_name = SECTION_NAMES[i];
		var v_div = v_sectionDivs[v_name];
		if (v_div) v_div.classList.toggle("omnidb__section--active", v_name === p_name);
	}
	if (v_sectionNav && v_sectionNavTabs[p_name] && v_sectionNav.selectedTab !== v_sectionNavTabs[p_name]) {
		v_sectionNav.selectTab(v_sectionNavTabs[p_name]);
	}
}

export function initSectionSwitcher() {
	for (let i = 0; i < SECTION_NAMES.length; i++) {
		v_sectionDivs[SECTION_NAMES[i]] = /** @type {HTMLElement} */ (
			document.getElementById("omnidb__section_" + SECTION_NAMES[i])
		);
	}

	// A distinct hierarchy string from v_connTabControl's "primary" -- this
	// keeps the vertical bar out of reach of the horizontal strip's CSS
	// (scss/omnidb/_topbar.scss) entirely, rather than fighting it with
	// higher-specificity overrides.
	v_sectionNav = createTabControl({ p_div: "omnidb_section_nav", p_hierarchy: "sectionnav" });

	v_sectionNavTabs.welcome = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-hand-spock"></i>',
		p_close: false,
		p_selectFunction: function () {
			switchSection("welcome");
			document.title = "Welcome to OmniDB";
			refreshBootstrapTooltips();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Welcome</h5>',
	});

	v_sectionNavTabs.connections = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-plug"></i>',
		p_close: false,
		p_selectFunction: function () {
			// Also refreshes the connection list from the server -- see
			// connections.js, which now shows this section instead of a
			// modal as its last step.
			startConnectionManagement();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Connections</h5>',
	});

	v_sectionNavTabs.database = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-database"></i>',
		p_close: false,
		p_selectFunction: function () {
			switchSection("database");
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Database</h5>',
	});

	v_sectionNavTabs.snippets = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-book"></i>',
		p_close: false,
		p_selectFunction: function () {
			toggleSnippetPanel();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Snippets</h5>',
	});

	// Pushes About/Account/Settings to the bottom of the rail, VSCode-style.
	var v_spacer = document.createElement("div");
	v_spacer.className = "omnidb__section-nav__spacer";
	v_sectionNav.tabListDiv.appendChild(v_spacer);

	// Getting Started used to be reachable only by clicking the floating
	// omnis icon in the bottom-right corner (see workspace.js) -- that was
	// its one and only purpose there, so it's a rail icon now instead. Not
	// selectable, just a click trigger, same shape as the Account icon
	// below (this replaces the old About entry -- About's info now lives
	// on the Welcome section instead, see outer_welcome_tab.js).
	v_sectionNav.createTab({
		p_icon: '<i class="fas fa-lightbulb"></i>',
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			startTutorial("getting_started", e.currentTarget);
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Getting Started</h5>',
	});

	// The account icon (username/version/sign-out) only has anything to show
	// in server mode -- the desktop (Wails) build has no session/user
	// concept, so it is not created at all there rather than shown empty.
	if (!gv_desktopMode) {
		initAccountMenu();
	}

	// Settings is the very last icon, bottom-most, VSCode-style.
	v_sectionNavTabs.settings = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-cog"></i>',
		p_close: false,
		p_selectFunction: function () {
			showConfigUser();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Settings</h5>',
	});

	// No default switchSection() call here -- workspace.js's initWorkspace()
	// decides the startup section itself, since it depends on whether
	// getDatabaseList() restores any previously-open connection tabs (see
	// its comment for why that section must already be visible *before*
	// those tabs are created, not switched to afterward).
}

/**
 * The account icon at the very bottom of the rail: not a section (nothing
 * in the main content area reacts to it), just a small popup with the
 * username/version/sign-out that used to live in the top-right utilities
 * bar. Kept out of Settings on purpose -- sign out is reached often enough
 * that it should not cost a section switch to get to.
 */
function initAccountMenu() {
	var v_tab = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-user"></i>',
		p_close: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			e.stopPropagation();
			toggleAccountMenu();
		},
		p_omnidb_tooltip_name: '<h5 class="my-1">Account</h5>',
	});

	var v_menu = document.createElement("div");
	v_menu.id = "omnidb_section_nav__account_menu";
	v_menu.className = "omnidb__account-menu";

	var v_html = '<div class="omnidb__account-menu__version"><i class="fas fa-code-branch me-1"></i>' + escapeHtml(String(v_short_version)) + "</div>";
	if (!gv_desktopMode) {
		v_html += '<div class="omnidb__account-menu__username">' + escapeHtml(String(v_user_name)) + "</div>";
		v_html +=
			'<button id="omnidb_section_nav__link-signout" type="button" class="btn btn-sm omnidb__theme__btn--secondary w-100 mt-2">' +
			'<i class="fas fa-sign-out-alt me-1"></i>Sign out</button>';
	}
	v_menu.innerHTML = v_html;
	document.body.appendChild(v_menu);

	if (!gv_desktopMode) {
		/** @type {HTMLElement} */ (document.getElementById("omnidb_section_nav__link-signout")).addEventListener(
			"click",
			function () {
				hideAccountMenu();
				confirmSignout();
			},
		);
	}

	document.addEventListener("click", function (e) {
		if (!(e.target instanceof Node)) return;
		if (!v_menu.contains(e.target) && !v_tab.elementA.contains(e.target)) {
			hideAccountMenu();
		}
	});
}

function toggleAccountMenu() {
	/** @type {HTMLElement} */ (document.getElementById("omnidb_section_nav__account_menu")).classList.toggle(
		"omnidb__account-menu--open",
	);
}

function hideAccountMenu() {
	/** @type {HTMLElement} */ (document.getElementById("omnidb_section_nav__account_menu")).classList.remove(
		"omnidb__account-menu--open",
	);
}
