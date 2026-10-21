// @ts-check
/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

Portions Copyright (c) 2025-2026, Zbyněk Vanžura
*/

/// <summary>
/// The Bookmarks section: the tables the user pinned, grouped by connection.
/// Clicking one opens it in Edit Data on that connection, opening the
/// connection first when it is not open yet.
/// </summary>

import { execAjax } from "../ajax_control_bridge.js";
import { t } from "../i18n.js";
import { switchSection } from "../section_switcher.js";
import { v_startEditData } from "../tree_context_functions/edit_data.js";

const CONTENT_ID = "omnidb__section_bookmarks";

/**
 * @typedef {{ id: number, conn_id: number, kind: string, schema: string, name: string, alias: string, technology: string }} Bookmark
 */

/**
 * Opens a bookmarked table: switches to the Database section, selecting the
 * connection's tab (or opening one), then starts Edit Data on it.
 * @param {Bookmark} p_bookmark
 */
function openBookmark(p_bookmark) {
	var v_tab = v_connTabControl.tabList.find(function (/** @type {any} */ p_tab) {
		return p_tab.tag && p_tab.tag.selectedDatabaseIndex === p_bookmark.conn_id;
	});
	switchSection("database");
	if (v_tab) {
		v_connTabControl.selectTab(v_tab);
	} else {
		v_connTabControl.tag.createConnTab(p_bookmark.conn_id);
	}
	v_startEditData(p_bookmark.name, p_bookmark.schema);
}

/** @param {number} p_id */
function removeBookmark(p_id) {
	execAjax("/delete_bookmark/", JSON.stringify({ p_id: p_id }), refreshBookmarksPane, null, "box", false);
}

/**
 * Re-reads the bookmarks and redraws the section. Called whenever the section is shown.
 */
export function refreshBookmarksPane() {
	var v_found = document.getElementById(CONTENT_ID);
	if (!v_found) return;
	var v_root = v_found;
	execAjax(
		"/get_bookmarks/",
		JSON.stringify({}),
		function (/** @type {{ v_data: Bookmark[] }} */ p_return) {
			var p_list = p_return.v_data;
			v_root.innerHTML = "";
			var v_wrap = document.createElement("div");
			v_wrap.className = "omnidb__bookmarks p-3";

			var v_title = document.createElement("h5");
			v_title.className = "mb-3";
			v_title.textContent = t("nav.bookmarks");
			v_wrap.appendChild(v_title);

			if (p_list.length === 0) {
				var v_empty = document.createElement("p");
				v_empty.className = "text-muted";
				v_empty.textContent = t("bookmarks.empty");
				v_wrap.appendChild(v_empty);
			}

			var v_group = "";
			/** @type {HTMLElement | null} */
			var v_ul = null;
			p_list.forEach(function (p_bookmark) {
				if (p_bookmark.alias !== v_group || v_ul === null) {
					v_group = p_bookmark.alias;
					var v_heading = document.createElement("div");
					v_heading.className = "fw-bold mt-3 mb-1";
					v_heading.textContent = p_bookmark.alias;
					v_wrap.appendChild(v_heading);
					v_ul = document.createElement("div");
					v_ul.className = "list-group";
					v_wrap.appendChild(v_ul);
				}
				var v_list = /** @type {HTMLElement} */ (v_ul);
				var v_row = document.createElement("div");
				v_row.className = "list-group-item d-flex align-items-center";

				var v_open = document.createElement("button");
				v_open.type = "button";
				v_open.className = "btn btn-link text-start flex-grow-1 p-0";
				var v_icon = document.createElement("i");
				v_icon.className = "fas fa-table me-2";
				v_open.append(v_icon, document.createTextNode((p_bookmark.schema ? p_bookmark.schema + "." : "") + p_bookmark.name));
				v_open.addEventListener("click", function () {
					openBookmark(p_bookmark);
				});

				var v_remove = document.createElement("button");
				v_remove.type = "button";
				v_remove.className = "btn btn-sm btn-link text-danger";
				v_remove.title = t("bookmarks.remove");
				v_remove.setAttribute("aria-label", t("bookmarks.remove"));
				var v_remove_icon = document.createElement("i");
				v_remove_icon.className = "fas fa-times";
				v_remove.appendChild(v_remove_icon);
				v_remove.addEventListener("click", function () {
					removeBookmark(p_bookmark.id);
				});

				v_row.append(v_open, v_remove);
				v_list.appendChild(v_row);
			});

			v_root.appendChild(v_wrap);
		},
		null,
		"box",
		false,
	);
}
