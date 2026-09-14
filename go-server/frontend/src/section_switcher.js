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
import { refreshNotifyPane } from "./panel_functions/outer_notify_panel.js";
import { refreshConnectedUsersPane } from "./panel_functions/outer_connected_users_panel.js";
import { toggleSnippetPanel } from "./panel_functions/outer_snippet_panel.js";
import { createTabControl } from "./tabs.js";
import { escapeHtml } from "./query.js";
import { refreshHeights } from "./workspace.js";
import { t } from "./i18n.js";

const SECTION_NAMES = ["welcome", "connections", "database", "notify", "connected_users", "snippets", "settings"];

// The i18n key for each section's display name -- reused from the rail's own
// tooltips (see initSectionSwitcher below) so the window title and the
// tooltip never drift apart. Keyed by SECTION_NAMES entries.
const SECTION_TITLE_KEYS = {
	welcome: "nav.welcome",
	connections: "nav.connections",
	database: "tree.databases_section",
	notify: "nav.notify",
	connected_users: "nav.connected_users",
	snippets: "tree.snippets_section",
	settings: "nav.settings",
};

// Sets both the page's own title (document.title -- read by the browser tab
// in server/web mode) and, in the desktop shell, the native OS window title.
// Wails does NOT sync those two automatically, and worse: window.runtime
// (the JS binding that would otherwise reach WindowSetTitle directly) is
// only injected into pages served through Wails' own asset server --
// workspace.html is served entirely by go-server via a full top-level
// navigation instead, so it's never there (confirmed live: gv_desktopMode
// true, window.runtime still undefined -- see export_save_dialog.go's
// comment for the fuller story, and go-server/notify_title.go for this
// same relay pattern applied to the window title specifically). The
// /notify_title/ HTTP hop to go-server -> wails-app's loopback server is
// the only way to reach the native title bar from here.
//
// "OmniDB - <section>" is deliberately NOT run through t() with a template
// key: unlike the section name itself, the "Brand - Page" window title
// convention this mirrors (VS Code, GitHub Desktop, ...) is not really a
// sentence to localize, just fixed chrome around an already-translated name.
function applyWindowTitle(p_name) {
	var v_key = SECTION_TITLE_KEYS[p_name];
	var v_title = v_key ? "OmniDB - " + t(v_key) : "OmniDB";
	document.title = v_title;
	if (gv_desktopMode) {
		fetch("/notify_title/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: v_title }),
		}).catch(function () {
			// Best-effort -- a missed native title-bar update is cosmetic.
		});
	}
}

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

	applyWindowTitle(p_name);

	// The horizontal strip of open DB connections is a single shared DOM
	// node (v_connTabControl.tabMenu, see tabs.js) -- Database, Notify and
	// Connected Users all show it, in the same place, always pointing at the
	// same selected connection, by physically relocating it between their
	// containers rather than keeping independently-synced strips. It lives in
	// #notify_panel_strip_slot / #connected_users_panel_strip_slot only while
	// that section is active; every other section (Database included) keeps
	// it parked in its original home, #omnidb_main_tablist.
	if (typeof v_connTabControl !== "undefined" && v_connTabControl && v_connTabControl.tabMenu) {
		var v_strip_home_id = "omnidb_main_tablist";
		if (p_name === "notify") v_strip_home_id = "notify_panel_strip_slot";
		else if (p_name === "connected_users") v_strip_home_id = "connected_users_panel_strip_slot";
		var v_strip_home = document.getElementById(v_strip_home_id);
		if (v_strip_home && v_connTabControl.tabMenu.parentElement !== v_strip_home) {
			v_strip_home.insertBefore(v_connTabControl.tabMenu, v_strip_home.firstChild);
		}
	}

	if (p_name === "notify") {
		refreshNotifyPane();
	} else if (p_name === "connected_users") {
		refreshConnectedUsersPane();
	} else if (p_name === "database") {
		// Forces a fresh layout pass for the now-visible connection tab --
		// refreshHeights's own DB-specific sizing skips itself entirely
		// while this section is not active (see isSectionActive below), so
		// anything that changed while the user was away (switching which
		// tab is selected via the relocated strip while on Notify, or
		// resizing the window) needs this to catch up.
		refreshHeights(true);
	}

	if (v_sectionNav && v_sectionNavTabs[p_name] && v_sectionNav.selectedTab !== v_sectionNavTabs[p_name]) {
		v_sectionNav.selectTab(v_sectionNavTabs[p_name]);
	}
}

/**
 * Whether the given section is currently the one shown. Exported for code
 * that runs regardless of which section is active (e.g. a connection tab's
 * selectFunction, reachable via the relocated strip from Notify too) but
 * that should only do section-specific work -- layout math that assumes
 * real getBoundingClientRect() dimensions, or re-rendering a section's own
 * content -- while that section is actually visible.
 * @param {string} p_name
 */
export function isSectionActive(p_name) {
	var v_div = v_sectionDivs[p_name];
	return v_div != null && v_div.classList.contains("omnidb__section--active");
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
		p_isDraggable: false,
		p_selectFunction: function () {
			switchSection("welcome");
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.welcome")) + "</h5>",
	});

	v_sectionNavTabs.connections = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-plug"></i>',
		p_close: false,
		p_isDraggable: false,
		p_selectFunction: function () {
			// Also refreshes the connection list from the server -- see
			// connections.js, which now shows this section instead of a
			// modal as its last step.
			startConnectionManagement();
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.connections")) + "</h5>",
	});

	v_sectionNavTabs.database = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-database"></i>',
		p_close: false,
		p_isDraggable: false,
		p_selectFunction: function () {
			switchSection("database");
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("tree.databases_section")) + "</h5>",
	});

	v_sectionNavTabs.notify = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-bell"></i>',
		p_close: false,
		p_isDraggable: false,
		p_selectFunction: function () {
			switchSection("notify");
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.notify")) + "</h5>",
	});

	v_sectionNavTabs.connected_users = v_sectionNav.createTab({
		// fa-server, not fa-users: represents the server-side connections/
		// processes this section shows, and keeps fa-users free for a future
		// Roles/permissions section, which is the more natural home for it.
		p_icon: '<i class="fas fa-server"></i>',
		p_close: false,
		p_isDraggable: false,
		p_selectFunction: function () {
			switchSection("connected_users");
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.connected_users")) + "</h5>",
	});

	v_sectionNavTabs.snippets = v_sectionNav.createTab({
		p_icon: '<i class="fas fa-scroll"></i>',
		p_close: false,
		p_isDraggable: false,
		p_selectFunction: function () {
			toggleSnippetPanel();
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("tree.snippets_section")) + "</h5>",
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
		p_isDraggable: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			startTutorial("getting_started", e.currentTarget);
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.getting_started")) + "</h5>",
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
		p_isDraggable: false,
		p_selectFunction: function () {
			showConfigUser();
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.settings")) + "</h5>",
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
		p_isDraggable: false,
		p_selectable: false,
		p_clickFunction: function (e) {
			e.stopPropagation();
			toggleAccountMenu();
		},
		p_tooltip_name: '<h5 class="my-1">' + escapeHtml(t("nav.account")) + "</h5>",
	});

	var v_menu = document.createElement("div");
	v_menu.id = "omnidb_section_nav__account_menu";
	v_menu.className = "omnidb__account-menu";

	var v_html = '<div class="omnidb__account-menu__version"><i class="fas fa-code-branch me-1"></i>' + escapeHtml(String(v_short_version)) + "</div>";
	if (!gv_desktopMode) {
		v_html += '<div class="omnidb__account-menu__username">' + escapeHtml(String(v_user_name)) + "</div>";
		v_html +=
			'<button id="omnidb_section_nav__link-signout" type="button" class="btn btn-sm omnidb__theme__btn--secondary w-100 mt-2">' +
			'<i class="fas fa-sign-out-alt me-1"></i>' + escapeHtml(t("nav.sign_out")) + "</button>";
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
