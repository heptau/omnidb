// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// Settings > Navigation panel: show or hide the items of the left section
/// rail, reorder them, and move the divider between its upper and lower part.
/// The Settings icon is not listed -- it is always last and always shown.
/// Every change takes effect at once: the rail is rebuilt in place and the
/// layout saved for the user in the background, no Apply button and no reload.
/// </summary>

import { execAjax } from "./ajax_control_bridge.js";
import { t } from "./i18n.js";
import { NAV_DIVIDER, moveNavEntry, resolveNavLayout } from "./nav_layout.js";
import { showAlert } from "./notification_control.js";
import { availableNavItems, navItemDescriptions, rebuildSectionNav } from "./section_switcher.js";

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
}

/**
 * Applies a layout to the rail right away and saves it for the user.
 * @param {string} layoutJSON  "" resets to the default layout
 */
function applyLayout(layoutJSON) {
	rebuildSectionNav(layoutJSON);
	execAjax(
		"/save_nav_layout/",
		JSON.stringify({ p_layout: layoutJSON }),
		() => {},
		(/** @type {{ v_data: any }} */ r) => showAlert(typeof r.v_data === "string" ? r.v_data : t("errors.request_error")),
		"box",
		false,
	);
}

/**
 * Draws the editor for the saved layout into #nav_layout_editor.
 */
export function renderNavLayoutEditor() {
	const root = document.getElementById("nav_layout_editor");
	if (!root) return;
	const layout = resolveNavLayout(typeof v_nav_layout === "string" ? v_nav_layout : "", availableNavItems());
	let order = layout.order.slice();
	const hidden = new Set(layout.hidden);
	const info = new Map(navItemDescriptions().map((d) => [d.id, d]));

	const commit = () => applyLayout(JSON.stringify({ order, hidden: [...hidden] }));

	const draw = () => {
		root.innerHTML = "";
		const list = el("div", "d-flex flex-column gap-1 mb-3");
		list.style.maxWidth = "480px";
		order.forEach((id, index) => {
			const row = el("div", "d-flex align-items-center gap-2 p-1");
			row.style.cssText = "border:1px solid var(--border-color);border-radius:4px;";
			if (id === NAV_DIVIDER) {
				row.style.borderStyle = "dashed";
				const label = el("span", "flex-grow-1 text-muted small", t("settings.navigation.divider"));
				row.append(el("i", "fas fa-ellipsis-h"), label);
			} else {
				const d = /** @type {{ id: string, icon: string, title: string }} */ (info.get(id));
				const box = /** @type {HTMLInputElement} */ (el("input", "form-check-input m-0"));
				box.type = "checkbox";
				box.checked = !hidden.has(id);
				box.title = t("settings.navigation.show");
				box.setAttribute("aria-label", t("settings.navigation.show") + ": " + d.title);
				box.addEventListener("change", () => {
					if (box.checked) hidden.delete(id);
					else hidden.add(id);
					commit();
				});
				const icon = el("i", "fas " + d.icon);
				icon.style.width = "1.4em";
				row.append(box, icon, el("span", "flex-grow-1", d.title));
			}
			/**
			 * @param {number} delta
			 * @param {string} label
			 */
			const mover = (delta, label) => {
				const b = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary"));
				b.type = "button";
				b.title = label;
				b.setAttribute("aria-label", label);
				const arrow = el("i", "fas fa-arrow-up");
				if (delta > 0) arrow.style.transform = "rotate(180deg)";
				b.appendChild(arrow);
				b.disabled = index + delta < 0 || index + delta >= order.length;
				b.addEventListener("click", () => {
					order = moveNavEntry(order, index, delta);
					commit();
					draw();
				});
				row.appendChild(b);
			};
			mover(-1, t("settings.navigation.move_up"));
			mover(1, t("settings.navigation.move_down"));
			list.appendChild(row);
		});
		root.appendChild(list);

		const reset = /** @type {HTMLButtonElement} */ (el("button", "btn btn-sm omnidb__theme__btn--secondary", t("settings.navigation.reset")));
		reset.type = "button";
		reset.addEventListener("click", () => {
			applyLayout("");
			renderNavLayoutEditor();
		});
		root.appendChild(reset);
	};
	draw();
}
