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


// Three progressive shrink stages -- widest to narrowest: hide the
// close-button's reserved zone first (Zone A, least useful while the tab
// isn't hovered/focused), then the trailing status-icon zone (Zone D --
// loading spinner/checkmark, or a snippet's unsaved-changes dot), and
// finally -- below this width a tab has no room left to show a legible
// label -- `--icon-only` (see _base.scss/_topbar.scss's
// `.omnidb__tab-menu__link--icon-only` rule) hides the name span instead of
// rendering a sliver of ellipsized text, leaving just the icon (the label
// is still reachable as the tab's tooltip). Each threshold is spaced
// roughly one zone-width (--tab-zone-width, 20px) apart, matching the room
// each stage reclaims.
const CLOSE_ZONE_THRESHOLD_PX = 108;
const STATUS_ZONE_THRESHOLD_PX = 84;
const ICON_ONLY_THRESHOLD_PX = 60;
// Floor for the explicit equal width recomputeTabShrinkStages assigns once
// the row is cramped -- matches --icon-only's own fixed box, so a tab
// hitting this floor lands exactly on the width its --icon-only CSS would
// give it anyway.
const MIN_SHRINK_WIDTH_PX = 40;

// Recomputes every INACTIVE tab's shrink-stage classes (and, if the row
// doesn't fit them all at their natural size, an explicit equal width) in
// one row -- always starting from a clean, unpinned slate rather than
// trusting whatever a tab last carried. Two things this has to work around,
// both of which rule out leaving this to plain CSS flex-shrink:
//
// 1. Once a tab is down to `--icon-only` its box is pinned to a fixed
//    `flex: 0 0 40px` (flex-grow:0) -- so its own rendered size can NEVER
//    change again on its own, even once the row gains room back (a wider
//    window, a closed sibling tab, a different tab becoming active, ...),
//    since flex-grow:0 means it never claims any of the freed-up space.
//    Stripping every tab's inline width/shrink classes first and measuring
//    fresh (below) is what lets a shrunk tab grow back at all.
// 2. flex-shrink distributes shrinkage proportionally to each item's own
//    basis, so tabs with different label lengths -- and so different
//    natural (content-driven) widths -- end up at DIFFERENT widths after
//    shrinking, each crossing the shrink-stage thresholds at a different
//    moment, unless something pins them all to the same explicit value.
//    That's what the equal-width branch below does, but ONLY once they
//    don't already fit naturally -- tabs.js's tabs stay their own natural,
//    content-driven width the rest of the time (see the CSS's plain
//    `flex: 0 1 auto`), so a short label like "DDL" doesn't carry visibly
//    wasted space around it just because some OTHER open tab has a long one.
//
// Container queries can't replace this either: `container-type:
// inline-size` on the tab itself would give it layout containment, meaning
// its width could no longer come from flex distribution/content at all --
// exactly the dynamic, available-space-driven width this whole layout
// depends on.
function recomputeTabShrinkStages(p_tabListDiv) {
	var v_children = p_tabListDiv.children;
	var v_shrinkable = [];
	var v_fixed = [];
	for (var i = 0; i < v_children.length; i++) {
		var v_link = v_children[i];
		if (v_link.classList.contains("active") || v_link.classList.contains("omnidb__tab-menu__link--compact")) {
			v_fixed.push(v_link);
		} else {
			v_shrinkable.push(v_link);
		}
	}
	// Revert every shrinkable tab to its natural, content-driven width (and
	// clear its shrink-stage classes) before measuring anything below --
	// otherwise a tab still pinned to a previous state's explicit width, or
	// still carrying --icon-only, would misreport what the row actually
	// needs/has room for now.
	for (var j = 0; j < v_shrinkable.length; j++) {
		v_shrinkable[j].style.flex = "";
		v_shrinkable[j].classList.remove(
			"omnidb__tab-menu__link--hide-close-zone",
			"omnidb__tab-menu__link--hide-status-zone",
			"omnidb__tab-menu__link--icon-only",
		);
	}
	if (v_shrinkable.length === 0) return;

	// Do the tabs already fit at their natural width? (scrollWidth/
	// clientWidth force the browser to actually apply the reset above and
	// lay the row out fresh before this reads either.) If so, there's
	// nothing left to do -- natural sizing IS the desired resting state.
	if (p_tabListDiv.scrollWidth <= p_tabListDiv.clientWidth + 1) {
		return;
	}

	// They don't -- give every shrinkable tab the identical, explicit width
	// so they shrink (and cross the shrink-stage thresholds) in lockstep,
	// instead of by however long each one's own label happens to be.
	var v_fixedWidth = 0;
	for (var f = 0; f < v_fixed.length; f++) {
		var v_fixedStyle = getComputedStyle(v_fixed[f]);
		v_fixedWidth += v_fixed[f].getBoundingClientRect().width + parseFloat(v_fixedStyle.marginLeft) + parseFloat(v_fixedStyle.marginRight);
	}
	var v_shrinkableMargin = parseFloat(getComputedStyle(v_shrinkable[0]).marginRight) || 0;
	// clientWidth is the PADDING box (padding included, border excluded) --
	// children lay out within the CONTENT box only, so the row's own
	// padding has to come off too, or every tab ends up overestimated by
	// however wide that padding is.
	var v_containerStyle = getComputedStyle(p_tabListDiv);
	var v_innerWidth = p_tabListDiv.clientWidth - parseFloat(v_containerStyle.paddingLeft) - parseFloat(v_containerStyle.paddingRight);
	var v_available = v_innerWidth - v_fixedWidth - v_shrinkableMargin * v_shrinkable.length;
	var v_each = Math.max(MIN_SHRINK_WIDTH_PX, Math.floor(v_available / v_shrinkable.length));
	for (var k = 0; k < v_shrinkable.length; k++) {
		v_shrinkable[k].style.flex = "0 0 " + v_each + "px";
	}

	// Every shrinkable tab now shares the identical explicit width, so one
	// measurement is enough to classify the whole row.
	var v_width = v_shrinkable[0].getBoundingClientRect().width;
	var v_hideClose = v_width > 0 && v_width < CLOSE_ZONE_THRESHOLD_PX;
	var v_hideStatus = v_width > 0 && v_width < STATUS_ZONE_THRESHOLD_PX;
	var v_iconOnly = v_width > 0 && v_width < ICON_ONLY_THRESHOLD_PX;
	for (var m = 0; m < v_shrinkable.length; m++) {
		v_shrinkable[m].classList.toggle("omnidb__tab-menu__link--hide-close-zone", v_hideClose);
		v_shrinkable[m].classList.toggle("omnidb__tab-menu__link--hide-status-zone", v_hideStatus);
		v_shrinkable[m].classList.toggle("omnidb__tab-menu__link--icon-only", v_iconOnly);
	}
}

// One shared observer, watching every tabControl's tab-LIST row (not the
// individual tabs -- see recomputeTabShrinkStages' comment for why that
// distinction matters) for width changes, e.g. the window resizing.
// Adding/removing a tab or changing which one is active doesn't resize the
// row itself (it's sized by its parent, not its children), so those paths
// call recomputeTabShrinkStages directly instead of relying on this.
const v_tabListObserver =
	typeof ResizeObserver !== "undefined"
		? new ResizeObserver(function (p_entries) {
				for (const v_entry of p_entries) {
					recomputeTabShrinkStages(v_entry.target);
				}
			})
		: null;

export function composedPath(el) {
	var path = [];
	while (el) {
		path.push(el);
		if (el.tagName === "HTML") {
			path.push(document);
			path.push(window);
			return path;
		}
		el = el.parentElement;
	}
}

/**
 * ## createTabControl
 * @desc Creates the `tabControl` with methods to manipulate the tab-system.
 *
 * @param {object} config
 * @param {string} config.p_div String for the ID of the target DOM element where the tabControl will create/remove tabs.
 * @param {string} [config.p_hierarchy] Optional string defining the tab-system classes with OmniDB pre-defined styles ['primary', 'secondary',...].
 * The classes system refers to BEM practices implemented inside OmniDB: 'omnidb__tab-menu' (default base class), 'omnidb__tab-menu--primary', 'omnidb__tab-menu--secondary'.
 * - 'primary': OmniDB Outer Tabs. Results in the tab classlists containing 'omnidb__tab-menu omnidb__tab-menu--primary', 'omnidb__tab-content omnidb__tab-content--primary'
 * - 'secondary': OmniDB Inner Tabs. Results in the tab classlists containing 'omnidb__tab-menu omnidb__tab-menu--secondary', 'omnidb__tab-content omnidb__tab-content--secondary'
 * @param {string} [config.p_layout] String defining some additional ready-to-use styles for the tab system.
 * - 'card': Adds a bootstrap based card style to the tab system, with the tab-menu inside the card-header and the tab-content inside the card-body.
 * @return {any} Returns the `tabControl` object.
 */
export function createTabControl({ p_div, p_hierarchy, p_layout }) {
	// Get an element's exact position
	function getPosition(el) {
		var xPos = 0;
		var yPos = 0;

		while (el) {
			if (el.tagName == "BODY") {
				var xScroll = el.scrollLeft || document.documentElement.scrollLeft;
				var yScroll = el.scrollTop || document.documentElement.scrollTop;

				xPos += el.offsetLeft - xScroll + el.clientLeft;
				yPos += el.offsetTop - yScroll + el.clientTop;
			} else {
				xPos += el.offsetLeft - el.scrollLeft + el.clientLeft;
				yPos += el.offsetTop - el.scrollTop + el.clientTop;
			}

			el = el.offsetParent;
		}

		return {
			x: xPos,
			y: yPos,
		};
	}

	// Initializing HTML elements
	var v_div = /** @type {HTMLElement} */ (document.getElementById(p_div));
	v_div.innerHTML = "";

	var v_nav = document.createElement("nav");
	var v_div_tab_list = document.createElement("div");
	v_div_tab_list.className = "nav nav-tabs";
	v_nav.appendChild(v_div_tab_list);
	var v_div_tab_content_list = document.createElement("div");
	v_div_tab_content_list.className = "tab-content omnidb__tab-content";

	var v_tab_menu = document.createElement("div");
	v_tab_menu.className = "omnidb__tab-menu";

	var css_tab_menu_variations = ["omnidb__tab-menu--", "omnidb__theme-bg--menu-"];
	// Adding classes based on variations and hierarchy.
	v_div.classList.add(css_tab_menu_variations[0] + "container");
	if (p_hierarchy !== undefined) {
		v_div.classList.add(css_tab_menu_variations[0] + "container--" + p_hierarchy);
		v_div.classList.add(css_tab_menu_variations[0] + "container--menu-shown");
		for (let i = 0; i < css_tab_menu_variations.length; i++) {
			v_tab_menu.classList.add(css_tab_menu_variations[i] + p_hierarchy);
		}
		v_div_tab_content_list.classList.add("omnidb__tab-content--" + p_hierarchy);
	}

	v_tab_menu.appendChild(v_nav);
	v_div.appendChild(v_tab_menu);
	v_div.appendChild(v_div_tab_content_list);

	if (v_tabListObserver) {
		v_tabListObserver.observe(v_div_tab_list);
	}

	if (p_layout === "card") {
		v_div.classList.add("card");
		v_tab_menu.classList.add("card-header");
		v_tab_menu.classList.add("pb-0");
		v_div_tab_content_list.classList.add("card-body");
	}

	var v_tabControl = {
		// Params
		id: p_div,
		/** @type {any} */
		selectedTab: null,
		/** @type {any} */
		selectedDiv: null,
		/** @type {any} */
		selectedA: null,
		/** @type {any} */
		tabColor: null,
		tabCounter: 0,
		tabListContentDiv: v_div_tab_content_list,
		/** @type {any[]} */
		tabList: [],
		tabListDiv: v_div_tab_list,
		tabMenu: v_tab_menu,
		tabCssVariation: css_tab_menu_variations[0],
		/** @type {any} */
		tag: {},
		isToggleable: p_hierarchy === "primary",
		// A tab that createTab() always inserts new tabs before instead of
		// after -- e.g. the outer connection strip's trailing "+" Add
		// Connection tab (see create_tab_functions.js's createAddTab),
		// which would otherwise end up stuck wherever it happened to be
		// created (usually startup) as every later connection/terminal/
		// website tab got appended past it.
		/** @type {any} */
		trailingTab: null,
		setTrailingTab: function (p_tab) {
			this.trailingTab = p_tab;
		},
		// Actions
		disableTabIndex: function (p_index) {
			this.tabList[p_index].elementA.classList.add("disabled");
		},
		enableTabIndex: function (p_index) {
			this.tabList[p_index].elementA.classList.remove("disabled");
		},
		disableSelectableTabIndex: function (p_index) {
			this.tabList[p_index].selectable = false;
		},
		enableSelectableTabIndex: function (p_index) {
			this.tabList[p_index].selectable = true;
		},
		selectTab: function (p_tab) {
			if (this.selectedTab != p_tab) {
				if (p_tab.selectable) {
					if (this.selectedTab != null) this.selectedTab.selected = false;

					p_tab.selected = true;

					this.selectedTab = p_tab;

					if (this.selectedDiv != null) {
						this.selectedDiv.classList.remove("active");
						this.selectedA.classList.remove("active");
					}

					p_tab.elementA.classList.add("active");
					p_tab.elementDiv.classList.add("active");
					// The tab becoming active never shrinks (see its own CSS
					// rule), so any explicit width/shrink-stage classes it's
					// still carrying from when it WAS inactive are stale --
					// recomputeTabShrinkStages only ever resets SHRINKABLE
					// (i.e. inactive) tabs, skipping whichever one is active,
					// so this one has to be cleared explicitly here instead
					// or it stays pinned to its last inactive width forever
					// (the exact same "stuck" problem recomputeTabShrinkStages
					// itself exists to solve). The sibling that just lost
					// .active needs its own shrink stage freshly (re)computed
					// for its now-different width too, since it's rejoining
					// the shrinkable pool -- that's what the call below does.
					p_tab.elementA.style.flex = "";
					p_tab.elementA.classList.remove(
						"omnidb__tab-menu__link--hide-close-zone",
						"omnidb__tab-menu__link--hide-status-zone",
						"omnidb__tab-menu__link--icon-only",
					);
					recomputeTabShrinkStages(this.tabListDiv);

					this.selectedA = p_tab.elementA;
					this.selectedDiv = p_tab.elementDiv;

					if (p_tab.selectFunction != null) {
						p_tab.selectFunction();
					}
				}
			}
		},
		selectTabIndex: function (p_index) {
			if (this.tabList[p_index].selectable) {
				if (this.selectedTab != null) this.selectedTab.selected = false;

				this.tabList[p_index].selected = true;

				this.selectedTab = this.tabList[p_index];

				if (this.selectedDiv != null) {
					this.selectedDiv.classList.remove("active");
					this.selectedA.classList.remove("active");
				}

				this.tabList[p_index].elementA.classList.add("active");
				this.tabList[p_index].elementDiv.classList.add("active");
				// See the identical comment in selectTab above.
				this.tabList[p_index].elementA.style.flex = "";
				this.tabList[p_index].elementA.classList.remove(
					"omnidb__tab-menu__link--hide-close-zone",
					"omnidb__tab-menu__link--hide-status-zone",
					"omnidb__tab-menu__link--icon-only",
				);
				recomputeTabShrinkStages(this.tabListDiv);

				this.selectedA = this.tabList[p_index].elementA;
				this.selectedDiv = this.tabList[p_index].elementDiv;

				if (this.tabList[p_index].selectFunction != null) {
					this.tabList[p_index].selectFunction();
				}
			}
		},
		disableTab: function (p_tab) {
			p_tab.elementA.classList.add("disabled");
		},
		enableTab: function (p_tab) {
			p_tab.elementA.classList.remove("disabled");
		},
		disableSelectableTab: function (p_tab) {
			p_tab.selectable = false;
		},
		enableSelectableTab: function (p_tab) {
			p_tab.selectable = true;
		},
		disableClose: function (p_tab) {
			if (p_tab.elementClose != null) {
				p_tab.elementClose.style.display = "none";
			}
		},
		enableClose: function (p_tab) {
			if (p_tab.elementClose != null) {
				p_tab.elementClose.style.display = "";
			}
		},
		removeTabIndex: function (p_index) {
			var v_tab = this.tabList[p_index];

			if (v_tab.closeFunction != null) {
				v_tab.closeFunction(null, v_tab);
			} else if (v_tab) {
				this.removeTab(v_tab);
			}
		},
		removeLastTab: function () {
			var v_this = this;
			var v_tab_index = v_this.tabList.length - 1;

			this.removeTabIndex(v_tab_index);
		},
		removeTab: function (p_tab) {
			var v_tab = p_tab;

			v_tab.elementDiv.parentNode.removeChild(v_tab.elementDiv);
			v_tab.elementA.parentNode.removeChild(v_tab.elementA);

			var v_index = this.tabList.indexOf(p_tab);

			var v_current_index = this.tabList.indexOf(this.selectedTab);

			if (v_index == v_current_index) {
				if (v_index > 0) this.selectTabIndex(v_index - 1);
				else if (this.tabList[v_index + 1] != null) this.selectTabIndex(v_index + 1);
				else {
					// No other tab left to fall back to -- clear the
					// selection rather than leaving it pointing at the tab
					// object we are about to remove from tabList below, now
					// detached from the DOM. Callers (e.g. workspace.js's
					// refreshHeights) check for this to detect the empty
					// state.
					this.selectedTab = null;
					this.selectedDiv = null;
					this.selectedA = null;
				}
			}

			this.tabList.splice(this.tabList.indexOf(p_tab), 1);
			// One less tab competing for the row -- the remaining ones may
			// now have room to grow back, which (see recomputeTabShrinkStages'
			// comment) can't happen on its own for any of them already down
			// to --icon-only.
			recomputeTabShrinkStages(this.tabListDiv);
		},
		renameTab: function (p_tab, p_name) {
			var v_tab_title_span = p_tab.elementA.querySelector(".omnidb__tab-menu__link-name");
			if (v_tab_title_span) {
				v_tab_title_span.innerHTML = p_name;
			}

			p_tab.text = p_name;
		},
		// The currently HTML5-dragged tab's elementA, or null -- mirrors
		// connections.js's v_conn_drag_item (module-level there because that
		// list is a singleton; here it has to live per tabControl instance,
		// since a page can have several tab strips at once).
		/** @type {HTMLElement|null} */
		dragItem: null,
		// The tab (elementA) the dragged one should land before for a
		// pointer at viewport-x p_x, or null to drop at the very end.
		// Horizontal counterpart of connections.js's getConnectionDragTarget
		// (that list is vertical, this strip is horizontal, hence x/width
		// here instead of y/height there) -- same "closest box whose center
		// is still ahead of the pointer" approach.
		getTabDragTarget: function (p_x) {
			/** @type {Element|null} */
			var v_closest = null;
			var v_closest_offset = Number.NEGATIVE_INFINITY;
			var v_items = this.tabListDiv.children;
			for (var i = 0; i < v_items.length; i++) {
				var v_item = v_items[i];
				if (v_item === this.dragItem) continue;
				var v_box = v_item.getBoundingClientRect();
				var v_offset = p_x - v_box.left - v_box.width / 2;
				if (v_offset < 0 && v_offset > v_closest_offset) {
					v_closest_offset = v_offset;
					v_closest = v_item;
				}
			}
			return v_closest;
		},
		// The live dragover reordering above only moves DOM nodes around
		// (cheap, and it's what the proven-working connections.js sidebar
		// drag does too) -- this is the one point that syncs the tabList
		// array everything else (selectTabIndex, removeTabIndex, ...) relies
		// on back to the DOM order a finished drag left behind.
		resyncTabListFromDOM: function () {
			var v_by_element = new Map(this.tabList.map((t) => [t.elementA, t]));
			var v_new_list = [];
			var v_children = this.tabListDiv.children;
			for (var i = 0; i < v_children.length; i++) {
				var v_tab = v_by_element.get(v_children[i]);
				if (v_tab) v_new_list.push(v_tab);
			}
			this.tabList = v_new_list;
		},
		hideTabMenu: function () {
			/** @type {HTMLElement} */ (document.getElementById(p_div)).classList.remove(
				this.tabCssVariation + "container--menu-shown",
			);
			this.tabMenu.classList.remove(this.tabCssVariation + "shown");
		},
		showTabMenu: function () {
			/** @type {HTMLElement} */ (document.getElementById(p_div)).classList.add(
				this.tabCssVariation + "container--menu-shown",
			);
			this.tabMenu.classList.add(this.tabCssVariation + "shown");
		},
		toggleTabMenu: function (e) {
			var v_this = this;
			/** @type {HTMLElement} */ (document.getElementById(p_div)).classList.toggle(
				this.tabCssVariation + "container--menu-shown",
			);
			v_this.tabMenu.classList.toggle(v_this.tabCssVariation + "shown");
		},

		/**
		 * ## createTab
		 * @desc Creates a generic tab object with optional parameters and callbacks.
		 * Ex: p_mode === 'customer_dashboard' expects data based on columns from customer tables, and will return all data necessary to kickoff a customer dashboard.
		 *
		 * @param {object} config
		 * @param {Function|null} [config.p_clickFunction] Callback for onclick.
		 * @param {boolean} [config.p_close] Defines if the elementA has a closing icon.
		 * @param {Function|null} [config.p_closeFunction] Callback for closing the tab.
		 * @param {Function|null} [config.p_dblClickFunction]  Callback for ondoubleclick.
		 * @param {boolean} [config.p_disabled]  Defines if the elementA is disabled.
		 * @param {string|false} [config.p_class] Extra CSS class(es) appended to the elementA, e.g. for a per-tab color accent (see outer_connection_tab.js's environment tint).
		 * @param {string|false} [config.p_icon] HTML string is accepted as an optional icon.
		 * @param {boolean} [config.p_isDraggable] Defines if the elementA is draggable inside the tab-menu.
		 * @param {string} [config.p_name] HTML string is accepted as an optional name for the elementA.
		 * @param {Function|false} [config.p_rightClickFunction] Callback for oncontextmenu.
		 * @param {Function|null} [config.p_selectFunction]  Callback for after the tab-content is rendered.
		 * @param {boolean} [config.p_selectable]  Defines if the the tab-content is controlled by default bootstrap tab system selection. Used together with p_clickFunction to override the selecting tab behaviour, like the snippets panel.
		 * @param {string|false} [config.p_status] HTML string for a trailing status indicator (e.g. the loading spinner / success checkmark on Query/Console/... tabs). Rendered in its own reserved zone (Zone D, mirroring the close button's Zone A) instead of inline after the name, so it can't be clipped by the name's own ellipsis and can be hidden -- together with its reserved space -- as a discrete shrink stage.
		 * @param {string|false} [config.p_tooltip_name]  HTML string is accepted as an optional tooltip.
		 * @return {any} Creates the tab object in this tabControl.
		 */
		createTab: function ({
			p_clickFunction = null,
			p_close = true,
			p_closeFunction = null,
			p_dblClickFunction = null,
			p_disabled = false,
			p_class = false,
			p_icon = false,
			p_isDraggable = true,
			p_name = "",
			p_rightClickFunction = false,
			p_selectFunction = null,
			p_selectable = true,
			p_status = false,
			p_tooltip_name = false,
		}) {
			var v_control = this;
			var v_index = this.tabCounter;

			this.tabCounter++;

			var v_tab = {
				id: p_div + "_tab" + v_index + "_" + Date.now(),
				seq: v_index,
				text: p_name,
				selected: false,
				/** @type {any} */
				elementA: null,
				/** @type {any} */
				elementDiv: null,
				/** @type {any} */
				elementClose: null,
				/** @type {any} */
				elementStatus: null,
				/** @type {any} */
				tag: null,
				clickFunction: p_clickFunction,
				dblClickFunction: p_dblClickFunction,
				closeFunction: p_closeFunction,
				selectFunction: p_selectFunction,
				selectable: p_selectable,
				disabled: p_disabled,
				removeTab: function () {
					v_control.removeTab(this);
				},
				renameTab: function (p_name) {
					v_control.renameTab(this, p_name);
				},
				disableClose: function () {
					v_control.disableClose(this);
				},
				enableClose: function () {
					v_control.enableClose(this);
				},
				isDraggable: p_isDraggable,
			};

			// Sets tabMenu toggle action based on page interaction
			// if (this.isToggleable && v_index === 1) {
			//   document.body.addEventListener("click", v_control.toggleTabMenu.bind(v_control));
			// }

			var v_a = document.createElement("a");
			v_a.setAttribute("id", "a_" + v_tab.id);
			v_a.setAttribute("data-toggle", "tab");
			v_a.setAttribute("role", "tab");
			v_a.setAttribute("aria-selected", "false");
			v_a.setAttribute("aria-selected", "false");
			v_a.setAttribute("href", "#" + "div_" + v_tab.id);
			v_a.setAttribute("aria-controls", "div_" + v_tab.id);

			if (v_tab.isDraggable) {
				v_a.setAttribute("draggable", "true");
				// Native HTML5 drag-and-drop, same shape as connections.js's
				// proven-working sidebar-list drag (bindConnectionDrag +
				// bindConnectionListDrop) -- an earlier version of this used
				// only a dragend handler and no dataTransfer payload, which
				// looked fine in a plain Chromium browser but silently no-op'd
				// in the packaged desktop app's WKWebView. The two things that
				// were missing, both present below: a dragover handler on the
				// strip itself that calls preventDefault() (without it the
				// drop is refused and dragend reverts the tab), and
				// dataTransfer.setData() on dragstart (some engines, at least
				// Firefox, refuse to start a drag at all without it).
				v_a.addEventListener("dragstart", function (e) {
					v_control.dragItem = v_a;
					if (e.dataTransfer) {
						e.dataTransfer.effectAllowed = "move";
						e.dataTransfer.setData("text/plain", "");
					}
					// Deferred: applying the class synchronously would bake the
					// faded look into the drag image the browser snapshots
					// right after this handler returns.
					setTimeout(function () {
						v_a.classList.add("omnidb__tab-menu__link--dragging");
					}, 0);
				});
				v_a.addEventListener("dragend", function () {
					v_a.classList.remove("omnidb__tab-menu__link--dragging");
					if (v_control.dragItem !== v_a) return;
					v_control.dragItem = null;
					// The strip's dragover handler already moved the DOM node
					// live; this just syncs tabList to match where it ended up.
					v_control.resyncTabListFromDOM();
				});
			}

			if (p_disabled) {
				v_a.className = "omnidb__tab-menu__link nav-item nav-link disabled";
			} else {
				v_a.className = "omnidb__tab-menu__link nav-item nav-link";
			}
			if (p_class) {
				v_a.className += " " + p_class;
			}
			// The close-icon slot (Zone A) is reserved layout space on every
			// tab -- closable or not -- so a tab's icon/text always starts at
			// the same x-offset regardless of tab type (see tabs-unification
			// plan). This modifier only controls whether the glyph itself can
			// ever become visible; the CSS hover reveal handles the rest.
			if (!p_close) {
				v_a.classList.add("omnidb__tab-menu__link--no-close");
			}

			var v_close = document.createElement("i");
			v_close.className = "fas fa-times tab-icon icon-close omnidb__tab-menu__link-close";

			v_tab.elementClose = v_close;

			v_close.onclick = function (e) {
				e.stopPropagation();
				e.preventDefault();
				if (v_tab.closeFunction != null) {
					v_tab.closeFunction(e, v_tab);
				}
			};

			if (p_rightClickFunction) {
				v_a.oncontextmenu = function (e) {
					e.stopPropagation();
					e.preventDefault();
					p_rightClickFunction(e);
				};
			}

			var v_icon =
				p_icon !== false ? '<span class="omnidb__menu__btn omnidb__tab-menu__link-icon">' + p_icon + "</span>" : "";
			var v_name = p_name !== undefined && p_name !== null && p_name !== "" ? p_name : "";

			// Tooltip fallback: every tab should end up with some tooltip, so
			// call sites that don't pass one (Query/Snippet/Console/
			// Monitoring/EditData/Properties/DDL) get one derived from their
			// own visible label -- stripping any nested HTML (loading
			// spinner, dirty/check icon) down to plain text first.
			var v_effective_tooltip_name = p_tooltip_name;
			if (!p_tooltip_name && v_name) {
				var v_tooltip_scratch = document.createElement("div");
				v_tooltip_scratch.innerHTML = v_name;
				var v_plain_label = (v_tooltip_scratch.textContent || "").trim();
				if (v_plain_label) {
					v_effective_tooltip_name = v_plain_label;
				}
			}

			if (v_effective_tooltip_name) {
				// Native `title` tooltip -- flattens any HTML (e.g. the
				// connection strip's "<h5>alias</h5><div>host:port</div>") to
				// plain text, one line per top-level block, since `title`
				// doesn't render markup. Simpler and more reliable than a
				// Bootstrap Tooltip instance: no show/hide/dispose lifecycle
				// to manage, no clipping against a scrolling ancestor, and no
				// risk of an orphaned popup surviving a closed tab.
				var v_tooltip_html_scratch = document.createElement("div");
				v_tooltip_html_scratch.innerHTML = v_effective_tooltip_name;
				var v_tooltip_lines = [];
				v_tooltip_html_scratch.childNodes.forEach(function (node) {
					var v_line = (node.textContent || "").trim();
					if (v_line) v_tooltip_lines.push(v_line);
				});
				var v_tooltip_text = v_tooltip_lines.length
					? v_tooltip_lines.join("\n")
					: v_tooltip_html_scratch.textContent.trim();

				// Toolbar tab-switcher buttons (Query/Console/Snippet/
				// Monitoring/EditData/Properties/DDL, ...) show this tooltip's
				// text as their own visible label already once they have room
				// for it -- setting `title` there too would just repeat what's
				// already on screen. Checked live on hover (via the icon-only
				// class the ResizeObserver toggles), since a tab's width --
				// and so whether its label is actually showing -- can change
				// after creation. Never suppressed on the connection-switching
				// strip itself (p_hierarchy === "primary"), whose tooltip
				// carries the connection string/host details that never fit
				// on the tab regardless of width.
				if (p_hierarchy === "primary") {
					v_a.setAttribute("title", v_tooltip_text);
				} else {
					v_a.addEventListener("mouseenter", function () {
						if (v_a.classList.contains("omnidb__tab-menu__link--icon-only")) {
							v_a.setAttribute("title", v_tooltip_text);
						} else {
							v_a.removeAttribute("title");
						}
					});
				}
			}
			v_a.innerHTML =
				'<span class="omnidb__tab-menu__link-content">' +
				v_icon +
				'<span class="omnidb__tab-menu__link-name">' +
				v_name +
				"</span>" +
				"</span>";
			// Always appended -- see the --no-close modifier above, which is
			// what actually keeps the glyph hidden for non-closable tabs.
			v_a.appendChild(v_close);

			if (p_status !== false) {
				// Sibling of .link-content rather than nested inside the name
				// span -- Zone D, absolutely positioned same as the close
				// button's Zone A (see _topbar.scss) -- so a long, ellipsized
				// title can never clip this out from under it, and so the
				// --hide-status-zone shrink stage can hide it (and reclaim its
				// space) independently of the name text.
				var v_status = document.createElement("span");
				v_status.className = "omnidb__tab-menu__link-status";
				v_status.innerHTML = p_status;
				v_tab.elementStatus = v_status;
				v_a.appendChild(v_status);
			}

			v_a.ondblclick = function (e) {
				if (v_tab.dblClickFunction != null) v_tab.dblClickFunction(v_tab);
			};

			var v_div = document.createElement("div");
			v_div.className = "tab-pane";
			v_div.setAttribute("id", "div_" + v_tab.id);
			v_div.setAttribute("role", "tabpanel");
			v_div.setAttribute("aria-labelledby", "a_" + v_tab.id);

			v_tab.elementA = v_a;
			v_tab.elementDiv = v_div;

			v_a.onclick = function (e) {
				e.stopPropagation();
				e.preventDefault();
				if (v_tab.selectable) {
					v_control.selectTab(v_tab);
				}
				if (v_tab.clickFunction != null) {
					v_tab.clickFunction(e);
				}
			};

			if (this.trailingTab && this.trailingTab !== v_tab) {
				this.tabListDiv.insertBefore(v_a, this.trailingTab.elementA);
				this.tabListContentDiv.insertBefore(v_div, this.trailingTab.elementDiv);
				var v_trailing_index = this.tabList.indexOf(this.trailingTab);
				this.tabList.splice(v_trailing_index === -1 ? this.tabList.length : v_trailing_index, 0, v_tab);
			} else {
				this.tabListDiv.appendChild(v_a);
				this.tabListContentDiv.appendChild(v_div);
				this.tabList.push(v_tab);
			}

			// A new tab means one more competitor for the row's space --
			// every existing inactive tab needs its shrink stage
			// recomputed for its own now-smaller equal share.
			recomputeTabShrinkStages(this.tabListDiv);

			return v_tab;
		},
	};

	// The dragover/drop half of native HTML5 tab reordering, bound once on
	// the strip itself rather than per tab -- mirrors connections.js's
	// bindConnectionListDrop for its sidebar list (same reasoning: the gaps
	// between tabs, not just the tabs themselves, need to be valid drop
	// targets). createTab's dragstart/dragend (per tab, since each tab is
	// its own drag source) set/clear v_tabControl.dragItem.
	v_div_tab_list.addEventListener("dragover", function (e) {
		if (v_tabControl.dragItem === null) return;
		// Without this the drop is refused and dragend reverts the tab (same
		// HTML5 DnD requirement connections.js's identical comment notes --
		// this exact line was missing before, which is why a WKWebView drop
		// used to silently no-op here).
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

		var v_drag_item = v_tabControl.dragItem;
		var v_target = v_tabControl.getTabDragTarget(e.clientX);
		if (v_target === null) {
			// Never place anything after a pinned tab (the trailing "+"
			// add-tab) -- it must always stay last.
			var v_last = v_div_tab_list.lastElementChild;
			var v_last_tab = v_last != null ? v_tabControl.tabList.find((t) => t.elementA === v_last) : null;
			if (v_last && v_last_tab && v_last_tab.isDraggable === false) {
				if (v_last !== v_drag_item && v_last.previousElementSibling !== v_drag_item) {
					v_div_tab_list.insertBefore(v_drag_item, v_last);
				}
			} else if (v_div_tab_list.lastElementChild !== v_drag_item) {
				v_div_tab_list.appendChild(v_drag_item);
			}
		} else if (v_target.previousElementSibling !== v_drag_item) {
			v_div_tab_list.insertBefore(v_drag_item, v_target);
		}
	});

	v_div_tab_list.addEventListener("drop", function (e) {
		if (v_tabControl.dragItem === null) return;
		// The tab is already where dragover put it -- this only stops the
		// browser from treating the drop as a navigation.
		e.preventDefault();
	});

	return v_tabControl;
}

//Create a HTML element specified by parameter 'p_type'
export function createSimpleElement(p_type, p_id, p_class) {
	var element = document.createElement(p_type);
	if (p_id != undefined) element.id = p_id;
	if (p_class != undefined) element.className = p_class;
	return element;
}

//Create img element
export function createImgElement(p_id, p_class, p_src) {
	var element = document.createElement("img");
	if (p_id != undefined) element.id = p_id;
	if (p_class != undefined) element.className = p_class;
	if (p_src != undefined) element.src = p_src;
	return element;
}
