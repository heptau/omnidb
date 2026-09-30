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
 * The Permissions section: a Finder/Miller-columns style role & privilege
 * browser, PostgreSQL only for now (see connectedUsersSupportedDbType's
 * sibling below -- same "not supported" messaging pattern as Notify/
 * Connected Users for every other technology).
 *
 * Phase 1: column 1 -- the server's role list, with direct-execute
 * Create/Drop/Alter Attributes forms (see postgresql_permissions.go/
 * _handlers.go) and the existing Change Password action already used by
 * tree_postgresql.js's cm_role menu.
 *
 * Phase 2: the role selected in column 1's direct role memberships ("member
 * of"), editable (grant/revoke) in column 2.
 *
 * Phase 3: that same role's direct object-level privileges (database/
 * schema/table/view/sequence/function/procedure -- see
 * postgresql_permissions_objects.go for why materialized views and the rest
 * of the long tail wait for a later phase), also editable in column 2.
 *
 * Phase 4 (superseded): column 2's "member of" list originally opened
 * another column per inheritance level when you clicked a row (read-only,
 * recursively, with a cycle guard and a depth fuse) -- Miller/Finder-style
 * drilling. Tried live, then dropped: an unbounded strip of columns turned
 * out to be hard to scan for what a role actually inherits.
 *
 * Phase 4b: PUBLIC gets a synthesized entry in column 1 (see
 * PERMISSIONS_PUBLIC_ROLE) -- not a real pg_roles row, so it has no
 * password/attributes/membership, but its object privileges (column 2's
 * other half) are fully editable, which is how GRANT/REVOKE ... TO/FROM
 * PUBLIC gets managed here.
 *
 * Phase 5 (this file, for now): column 2's "member of" list is flat instead
 * -- every ancestor a role has, direct or indirect, in one list at once
 * (postgresqlRoleAncestors' recursive CTE, direct rows in the normal text
 * color, indirect ones in --inherited grey), rather than a column per level.
 * Double-click or "Nastavit jako aktivní roli" from the row's context menu
 * re-focuses column 1 on that role instead of opening anything further to
 * the right -- there is no "further to the right" anymore, column 2 is
 * always exactly one column, always for whichever role is focused in
 * column 1. PUBLIC is always synthesized in as the first (grey, unless the
 * focused role itself is PUBLIC) entry, the same way it is in column 1.
 *
 * Phase 6: column 3 -- the focused role's *effective* privileges (its own
 * direct grants, plus everything it inherits through column 2's ancestor
 * list, plus PUBLIC) on the two object types with no per-database scope:
 * pg_database and pg_tablespace (see postgresql_permissions_effective.go's
 * module comment for why those two are cluster-wide rather than per-
 * database). A row is shown in the normal text color when the focused role
 * holds at least one of its privileges directly, grey when every privilege
 * it has there is inherited-only. Unlike column 2, there is no inline "-":
 * per the plan this was built from, editing an object's privileges always
 * goes through its own detail dialog (openServerObjectDetailDialog), which
 * shows each valid privilege as a checkbox -- checked+enabled = direct
 * (uncheck to revoke), checked+disabled+"inherited from: ..." = inherited
 * only (not revocable here, only by making the source role active and
 * revoking it there), unchecked = not held at all (check to grant
 * directly). The "+" footer button is for adding a *new* object to the
 * list, via openAddServerObjectPrivilegeDialog.
 *
 * Phase 7: column 4 -- the same effective-privileges model as column 3, for
 * the object types that *are* scoped to one database: schema/table/view/
 * sequence/function/procedure. Its own header <select> (built in
 * renderDatabaseObjectsColumn) picks which database, independent of
 * whatever the tab itself is pointed at -- its pick defaults to the tab's
 * own active database (p_tag.currentDatabase) the first time this column
 * is built, then is remembered on p_tag.column4Database across role
 * switches. Every request this column makes (reads, grants, revokes, and
 * its own object picker's schema/table/view/sequence/function/procedure
 * lookups) carries that database explicitly, so the tab's own remembered
 * active database is never touched by it (see
 * handleGetRoleDatabaseGrantsPostgreSQL's comment, postgresql_permissions_
 * effective_handlers.go, and pgGrantObjectPrivilegeRequest's PDatabase
 * comment, postgresql_permissions_objects_handlers.go). Its detail dialog
 * (openDatabaseObjectDetailDialog) and "+" dialog
 * (openAddDatabaseObjectPrivilegeDialog) are thin wrappers around
 * openEffectiveObjectDetailDialog (shared with column 3) and
 * openGrantObjectPrivilegeDialogGeneric (column 4's only caller today, kept
 * parameterized for reuse), parameterized by PERMISSIONS_DATABASE_OBJECT_TYPES
 * and the picked database.
 *
 * Phase 7b: column 2's own "Object Privileges" section (Phase 3's original
 * direct-grants-only list) removed entirely, now that columns 3/4 cover
 * everything it did and more (inheritance attribution). Column 2 is just
 * the "member of" list from here on.
 *
 * Phase 8: PERMISSIONS_DATABASE_OBJECT_TYPES rounded out with the rest of
 * column 4's long tail -- materialized views, types, domains, foreign data
 * wrappers and foreign servers, same effective-privileges model as
 * everything else in columns 3/4. Foreign tables remain the one gap (see
 * postgresql_permissions_objects.go's module comment) -- see the
 * "Permissions" section of the plan this was built from for the full
 * column-browser design.
 *
 * Phase 9: columns 3 and 4 merged into one "Objects" column, a single tree
 * (renderObjectsColumn/renderObjectsTree) shaped like the Database section's
 * own tree (AimaraJS, same as Phase 7's column 4 already used) -- "Databases"
 * and "Tablespaces" groups at the root (t("tree.databases")/t("tree.
 * tablespaces"), same order and icons as tree_postgresql.js's own root),
 * every database on the server listed (not just ones with a grant -- see
 * fetchObjectsColumnData), each lazily expanding into its own schema/table/
 * view/... subtree only on first expand (fetchDatabaseObjectsForNode,
 * mirroring how the real Database tree only fetches a node's children when
 * it's opened) rather than one picked database driving a second column.
 * Editing an object's privileges (right-click, same as before) refreshes
 * only the affected slice -- just that database's subtree
 * (openObjectDetailDialog) or just the edited database/tablespace node's own
 * color (refreshServerLevelGrant) -- never the whole tree, so already-
 * expanded subtrees elsewhere are left alone.
 *
 * Phase 9 also drops the direct-vs-inherited grey that every earlier phase
 * used: a node is now black whenever the role holds *any* privilege there at
 * all (direct or inherited -- effectiveGrantHasDirectPrivilege's old
 * distinction is gone), and grey only when it holds *none* there itself but
 * is shown anyway as the necessary path to a descendant that does -- e.g. a
 * schema with no USAGE granted to anyone relevant, existing solely to hold a
 * function that does have a direct EXECUTE grant. See
 * populateDatabaseNodeChildren and renderObjectsTree's own node-building for
 * which
 * nodes get an ownGrant (black candidate) versus are synthesized purely for
 * structure (always grey).
 *
 * Phase 10a: every database/tablespace/schema node gets the "Edit
 * Privileges" context menu now, grey ones included -- emptyGrantFor stands
 * in for a real grant (zero privileges, so still grey) so a grey object can
 * get its *first* grant the same way any other edit happens here, rather
 * than requiring "+" and a fresh pick of the same object from a dropdown.
 * openEffectiveObjectDetailDialog already rendered an empty v_privileges
 * array as all-unchecked-and-enabled, so nothing changed on the dialog side.
 *
 * Phase 10b: column 2 split into two stacked halves -- "Members" on top
 * (renderDescendantsList/fetchDescendants, postgresqlRoleDescendants on the
 * Go side, the mirror image of postgresqlRoleAncestors: every role that is,
 * directly or indirectly, a member of the focused role) and "Member of" on
 * the bottom (unchanged -- still postgresqlRoleAncestors). Both are editable
 * (grant/revoke, context menu, "+"/"-" footer) via the same
 * openGrantMembershipDialog/confirmRevokeMembership/openMembershipContextMenu,
 * parameterized by which direction (p_direction: "ancestor" | "descendant")
 * decides which side of GRANT parent TO member the focused role plays. No
 * synthesized PUBLIC row in Members -- unlike being a member of PUBLIC
 * (implicit for every role, hence Ancestors always synthesizes it in),
 * nothing is ever "a member of" PUBLIC in the pg_auth_members sense.
 *
 * Same relocated-strip design as Notify/Connected Users (see
 * outer_connected_users_panel.js's module comment): v_connTabControl.tabMenu
 * moves into this section's own slot while it is active, so Permissions
 * always shows the same open connections, in the same place, as every other
 * section built this way.
 */

import { execAjax } from "../ajax_control_bridge.js";
import { setMessageModalTitle, showAlert, showConfirm, showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { escapeHtml, escapeHtmlAttribute } from "../query.js";
import { t } from "../i18n.js";
import { customMenu } from "../custom_menu.js";
import { deliverExportFile } from "../export_file.js";

var PERMISSIONS_STRIP_SLOT_ID = "permissions_panel_strip_slot";
var PERMISSIONS_CONTENT_ID = "permissions_panel_content";

// Bumped on every refreshPermissionsPane call; an in-flight request's
// callback bails if the token it captured no longer matches -- same
// stale-response guard as refreshConnectedUsersPane's v_render_token.
var v_render_token = 0;

// The synthesized column-1 entry for PostgreSQL's PUBLIC pseudo-role --
// never a real /get_roles_postgresql/ row (see isPublicPseudoRole's comment
// on the Go side, postgresql_permissions_objects.go), prepended here so its
// own object privileges can be managed the same way any real role's can.
var PERMISSIONS_PUBLIC_ROLE = { v_name: "PUBLIC", v_oid: 0, v_can_login: false, v_is_public: true };

export var v_createPermissionsPanelFunction = function () {
	var v_html =
		"<div class='omnidb__permissions'>" +
		"<div id='" +
		PERMISSIONS_STRIP_SLOT_ID +
		"' class='omnidb__tab-menu--container omnidb__tab-menu--container--primary omnidb__conn-strip-host'></div>" +
		"<div id='" +
		PERMISSIONS_CONTENT_ID +
		"' class='omnidb__permissions__content'></div>" +
		"</div>";

	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_permissions"));
	v_target.innerHTML = v_html;
};

/**
 * Renders the Permissions content pane for whichever connection tab is
 * currently selected in the shared strip. Safe to call any time, from
 * anywhere -- it no-ops if the section's own shell has not been built yet.
 */
export function refreshPermissionsPane() {
	var v_content = document.getElementById(PERMISSIONS_CONTENT_ID);
	if (v_content == null) return;

	v_render_token++;
	v_content.innerHTML = "";

	var v_conn_tab = typeof v_connTabControl !== "undefined" ? v_connTabControl.selectedTab : null;

	// tabs.js's removeTab leaves selectedTab pointing at the tab just removed
	// when nothing selectable is left to fall back to -- see
	// outer_notify_panel.js's refreshNotifyPane for the same check.
	if (v_conn_tab != null && v_connTabControl.tabList.indexOf(v_conn_tab) === -1) {
		v_conn_tab = null;
	}

	if (v_conn_tab == null || v_conn_tab.tag == null) {
		renderPermissionsEmptyState(v_content);
		return;
	}

	if (v_conn_tab.tag.selectedDBMS !== "postgresql") {
		renderPermissionsUnsupported(v_content, v_conn_tab.tag.selectedDBMS);
		return;
	}

	buildPermissionsLayout(v_content, v_conn_tab, v_render_token);
}

/**
 * @param {HTMLElement} p_content
 */
function renderPermissionsEmptyState(p_content) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("permissions.no_connection_open");
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("permissions.open_connection_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}

/**
 * @param {HTMLElement} p_content
 * @param {string} p_db_type
 */
function renderPermissionsUnsupported(p_content, p_db_type) {
	var v_wrapper = document.createElement("div");
	v_wrapper.className = "omnidb__notify__unsupported";

	var v_icon = document.createElement("i");
	v_icon.className = "fas fa-times-circle omnidb__notify__unsupported-icon";
	v_wrapper.appendChild(v_icon);

	var v_title = document.createElement("div");
	v_title.className = "omnidb__notify__unsupported-title";
	v_title.textContent = t("permissions.not_supported", { technology: p_db_type });
	v_wrapper.appendChild(v_title);

	var v_text = document.createElement("div");
	v_text.className = "omnidb__notify__unsupported-text";
	v_text.textContent = t("permissions.postgresql_only_hint");
	v_wrapper.appendChild(v_text);

	p_content.appendChild(v_wrapper);
}

/**
 * @param {HTMLElement} p_content
 * @param {any} p_conn_tab
 * @param {number} p_token
 */
function buildPermissionsLayout(p_content, p_conn_tab, p_token) {
	var v_columns_id = "permissions_panel_columns_" + p_conn_tab.id;
	p_content.innerHTML = "<div id='" + v_columns_id + "' class='omnidb__permissions__columns'></div>";

	/** @type {any} */
	var v_tag = {
		connID: p_conn_tab.tag.selectedDatabaseIndex,
		tabID: p_conn_tab.id,
		token: p_token,
		columnsDiv: document.getElementById(v_columns_id),
		selectedRole: null,
		// The single column 2 for whichever role is focused in column 1 --
		// see renderRoleDetailColumn. null until a role is first selected.
		column2: null,
		// The single merged objects column (server + database-scoped, see
		// renderObjectsColumn and this file's Phase 9 module comment) for
		// whichever role is focused in column 1. null until a role is first
		// selected.
		objectsColumn: null,
		// Used only to default a lazily-expanded database node's picker (see
		// renderGrantObjectTypeFields) and the "+" dialog's own database
		// select to the tab's own active database.
		currentDatabase: p_conn_tab.tag.selectedDatabase,
	};

	renderRolesColumn(v_tag);
}

/**
 * Column 1: the server's role list, with a Snippets-style "+"/"-" footer
 * (button_new_snippet/button_delete_snippet's exact pattern -- "-" only acts
 * once something is selected) and a right-click menu for the remaining role
 * actions (Change Password, Alter Attributes, Drop Role).
 * @param {any} p_tag
 */
function renderRolesColumn(p_tag) {
	var v_column = document.createElement("div");
	v_column.className = "omnidb__permissions__column omnidb__permissions__column--roles";
	v_column.innerHTML =
		"<div class='omnidb__permissions__column-header'>" +
		escapeHtml(t("permissions.roles_column_title")) +
		"</div>" +
		"<div class='omnidb__permissions__filter'>" +
		"<input type='text' class='form-control form-control-sm omnidb__permissions__filter-text' placeholder='" +
		escapeHtmlAttribute(t("permissions.filter_roles_placeholder")) +
		"'>" +
		"<select class='form-control form-control-sm omnidb__permissions__filter-kind'>" +
		ROLE_FILTER_KINDS.map(function (p_kind) {
			return "<option value='" + p_kind + "'>" + escapeHtml(t("permissions.filter_kind_" + p_kind)) + "</option>";
		}).join("") +
		"</select>" +
		"</div>" +
		"<div class='omnidb__permissions__list'></div>" +
		"<div class='omnidb__list-footer'>" +
		"<div class='omnidb__addremove'>" +
		"<button type='button' class='omnidb__permissions__add-role' title='" +
		escapeHtmlAttribute(t("tree.create_role")) +
		"'><i class='fas fa-plus'></i></button>" +
		"<span class='omnidb__addremove-divider'></span>" +
		"<button type='button' class='omnidb__permissions__delete-role' title='" +
		escapeHtmlAttribute(t("common.delete")) +
		"' disabled><i class='fas fa-minus'></i></button>" +
		"</div>" +
		"</div>";

	attachColumnResizer(v_column, "roles");
	p_tag.columnsDiv.appendChild(v_column);
	p_tag.rolesListDiv = /** @type {HTMLElement} */ (v_column.querySelector(".omnidb__permissions__list"));
	p_tag.addRoleBtn = /** @type {HTMLButtonElement} */ (v_column.querySelector(".omnidb__permissions__add-role"));
	p_tag.deleteRoleBtn = /** @type {HTMLButtonElement} */ (
		v_column.querySelector(".omnidb__permissions__delete-role")
	);

	p_tag.roleFilter = { text: "", kind: "all" };
	var v_filter_text = /** @type {HTMLInputElement} */ (v_column.querySelector(".omnidb__permissions__filter-text"));
	var v_filter_kind = /** @type {HTMLSelectElement} */ (v_column.querySelector(".omnidb__permissions__filter-kind"));
	function onRoleFilterChange() {
		p_tag.roleFilter = { text: v_filter_text.value.trim().toLowerCase(), kind: v_filter_kind.value };
		if (p_tag.roles) renderRolesList(p_tag, p_tag.roles);
	}
	v_filter_text.addEventListener("input", onRoleFilterChange);
	v_filter_kind.addEventListener("change", onRoleFilterChange);

	p_tag.addRoleBtn.addEventListener("click", function () {
		openCreateRoleDialog(p_tag);
	});
	p_tag.deleteRoleBtn.addEventListener("click", function () {
		if (p_tag.selectedRole) confirmDropRole(p_tag, p_tag.selectedRole);
	});

	fetchRoles(p_tag);
}

// Options of the roles column's kind filter (t("permissions.filter_kind_<kind>")).
var ROLE_FILTER_KINDS = ["all", "login", "group", "superuser", "expired"];

/**
 * @param {any} p_tag
 */
function fetchRoles(p_tag) {
	execAjax(
		"/get_roles_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID }),
		function (p_return) {
			if (p_tag.token !== v_render_token) return;
			// PUBLIC is never a row /get_roles_postgresql/ (or pg_roles
			// itself) returns -- it's a grammar keyword, not a real role
			// (see isPublicPseudoRole's comment on the Go side) -- so it's
			// synthesized here, always first, to give it its own column 1
			// entry for managing its object privileges directly.
			renderRolesList(p_tag, [PERMISSIONS_PUBLIC_ROLE].concat(p_return.v_data));
		},
		function (p_return) {
			if (p_tag.token !== v_render_token) return;
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					p_tag.connID,
					function () {
						fetchRoles(p_tag);
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {Array<{v_name: string, v_oid: number, v_can_login: boolean, v_is_public?: boolean, v_superuser?: boolean, v_expired?: boolean}>} p_roles
 */
function renderRolesList(p_tag, p_roles) {
	p_tag.roles = p_roles;
	p_tag.rolesListDiv.innerHTML = "";

	var v_filter = p_tag.roleFilter || { text: "", kind: "all" };
	var v_visible = p_roles.filter(function (p_role) {
		if (v_filter.text && p_role.v_name.toLowerCase().indexOf(v_filter.text) === -1) return false;
		switch (v_filter.kind) {
			case "login":
				return !p_role.v_is_public && p_role.v_can_login;
			case "group":
				return !p_role.v_is_public && !p_role.v_can_login;
			case "superuser":
				return !!p_role.v_superuser;
			case "expired":
				return !!p_role.v_expired;
			default:
				return true;
		}
	});
	if (v_visible.length === 0) {
		var v_empty = document.createElement("div");
		v_empty.className = "omnidb__permissions__list-empty";
		v_empty.textContent = t("permissions.filter_no_match");
		p_tag.rolesListDiv.appendChild(v_empty);
		return;
	}

	for (var i = 0; i < v_visible.length; i++) {
		(function (p_role) {
			var v_row = document.createElement("div");
			v_row.className = "omnidb__permissions__role-row";
			v_row.dataset.role = p_role.v_name;
			if (p_role.v_is_public) v_row.classList.add("omnidb__permissions__role-row--public");
			if (p_tag.selectedRole === p_role.v_name) v_row.classList.add("omnidb__permissions__role-row--selected");

			var v_icon = document.createElement("i");
			v_icon.className = "fas node-all " + (p_role.v_is_public ? "fa-globe" : p_role.v_can_login ? "fa-user" : "fa-user-friends");
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_role.v_name;
			v_row.appendChild(v_label);

			// Risky/inactive states worth seeing without opening the role.
			var v_badges = [];
			if (p_role.v_superuser) v_badges.push(t("permissions.role_badge_superuser"));
			if (p_role.v_expired) v_badges.push(t("permissions.role_badge_expired"));
			if (v_badges.length > 0) {
				var v_badge = document.createElement("span");
				v_badge.className = "omnidb__permissions__row-suffix";
				v_badge.textContent = "(" + v_badges.join(", ") + ")";
				v_row.appendChild(v_badge);
			}

			v_row.addEventListener("click", function () {
				selectRole(p_tag, p_role.v_name);
			});
			// PUBLIC has no password/attributes/drop -- it isn't a real
			// role (see PERMISSIONS_PUBLIC_ROLE's comment) -- so it gets no
			// context menu at all, rather than one full of actions that
			// would just fail against the database.
			if (!p_role.v_is_public) {
				v_row.addEventListener("contextmenu", function (e) {
					e.preventDefault();
					selectRole(p_tag, p_role.v_name);
					openRoleContextMenu(p_tag, p_role.v_name, e);
				});
			}

			p_tag.rolesListDiv.appendChild(v_row);
		})(v_visible[i]);
	}
}

/**
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function selectRole(p_tag, p_role_name) {
	p_tag.selectedRole = p_role_name;
	// The footer "-" mirrors the context menu's Drop Role, which PUBLIC
	// doesn't have either (see renderRolesList) -- keep it disabled rather
	// than letting it reach confirmDropRole for a "role" that doesn't exist.
	p_tag.deleteRoleBtn.disabled = p_role_name === "PUBLIC";

	var v_rows = p_tag.rolesListDiv.querySelectorAll(".omnidb__permissions__role-row");
	for (var i = 0; i < v_rows.length; i++) {
		v_rows[i].classList.toggle(
			"omnidb__permissions__role-row--selected",
			/** @type {HTMLElement} */ (v_rows[i]).dataset.role === p_role_name,
		);
	}

	renderRoleDetailColumn(p_tag, p_role_name);
	renderObjectsColumn(p_tag, p_role_name);
}

/**
 * @param {any} p_tag
 * @param {string} p_role_name
 * @param {MouseEvent} p_event
 */
function openRoleContextMenu(p_tag, p_role_name, p_event) {
	customMenu(
		{ x: p_event.clientX, y: p_event.clientY },
		[
			{
				text: t("tree.change_password"),
				icon: "fas cm-all fa-key",
				action: function () {
					openChangePasswordDialog(p_tag, p_role_name);
				},
			},
			{
				text: t("permissions.alter_role_attributes"),
				// fa-pen, not the more semantically-literal fa-sliders-h --
				// this app's icon set is a curated ~100-name subset (see
				// frontend/scripts/gen-icons.mjs), not the full Font Awesome
				// glyph set, and fa-sliders-h isn't in it (renders as a
				// blank mask -- a solid square -- instead of a glyph).
				// fa-pen is already used for this exact "edit" meaning by
				// connections.js's own customMenu entry.
				icon: "fas cm-all fa-pen",
				action: function () {
					openAlterRoleAttributesDialog(p_tag, p_role_name);
				},
			},
			{
				text: t("permissions.rename_role"),
				icon: "fas cm-all fa-pen",
				action: function () {
					openRenameRoleDialog(p_tag, p_role_name);
				},
			},
			{
				text: t("permissions.export_permissions"),
				icon: "fas cm-all fa-file",
				action: function () {
					openExportPermissionsDialog(p_tag, p_role_name);
				},
			},
			{
				text: t("permissions.export_permissions_all"),
				icon: "fas cm-all fa-file",
				action: function () {
					openExportPermissionsDialog(p_tag, "");
				},
			},
			{
				text: t("permissions.clone_role"),
				icon: "fas cm-all fa-copy",
				action: function () {
					openCloneRoleDialog(p_tag, p_role_name);
				},
			},
			{
				text: t("tree.drop_role"),
				icon: "fas cm-all fa-times",
				action: function () {
					confirmDropRole(p_tag, p_role_name);
				},
			},
		],
		null,
	);
}

// --- role attribute form -----------------------------------------------

/**
 * The checkbox/connection-limit/expiration fields shared by Create Role and
 * Alter Role Attributes -- appended into whatever container the caller
 * already built (name/password fields, for Create, go above these).
 * @param {HTMLElement} p_container
 * @param {{can_login?: boolean, superuser?: boolean, createdb?: boolean, createrole?: boolean, inherit?: boolean, replication?: boolean, bypass_rls?: boolean, connection_limit?: number, valid_until?: string}} p_values
 */
function appendRoleAttributeFields(p_container, p_values) {
	/**
	 * @param {string} p_id
	 * @param {string} p_label
	 * @param {boolean} p_checked
	 */
	function checkboxRow(p_id, p_label, p_checked) {
		var v_row = document.createElement("div");
		v_row.className = "form-check mb-2";

		var v_input = document.createElement("input");
		v_input.type = "checkbox";
		v_input.className = "form-check-input";
		v_input.id = p_id;
		v_input.checked = !!p_checked;

		var v_label = document.createElement("label");
		v_label.className = "form-check-label";
		v_label.setAttribute("for", p_id);
		v_label.textContent = p_label;

		v_row.appendChild(v_input);
		v_row.appendChild(v_label);
		return v_row;
	}

	p_container.appendChild(checkboxRow("perm_role_can_login", t("permissions.attr_can_login"), p_values.can_login ?? true));
	p_container.appendChild(checkboxRow("perm_role_superuser", t("permissions.attr_superuser"), !!p_values.superuser));
	p_container.appendChild(checkboxRow("perm_role_createdb", t("permissions.attr_createdb"), !!p_values.createdb));
	p_container.appendChild(checkboxRow("perm_role_createrole", t("permissions.attr_createrole"), !!p_values.createrole));
	p_container.appendChild(checkboxRow("perm_role_inherit", t("permissions.attr_inherit"), p_values.inherit ?? true));
	p_container.appendChild(checkboxRow("perm_role_replication", t("permissions.attr_replication"), !!p_values.replication));
	p_container.appendChild(checkboxRow("perm_role_bypassrls", t("permissions.attr_bypass_rls"), !!p_values.bypass_rls));

	var v_connlimit_col = document.createElement("div");
	v_connlimit_col.className = "col-md-12 mb-3";
	var v_connlimit_label = document.createElement("label");
	v_connlimit_label.setAttribute("for", "perm_role_connlimit");
	v_connlimit_label.textContent = t("permissions.connection_limit");
	var v_connlimit_input = document.createElement("input");
	v_connlimit_input.type = "number";
	v_connlimit_input.id = "perm_role_connlimit";
	v_connlimit_input.className = "form-control";
	v_connlimit_input.value = String(p_values.connection_limit ?? -1);
	v_connlimit_col.appendChild(v_connlimit_label);
	v_connlimit_col.appendChild(v_connlimit_input);
	p_container.appendChild(v_connlimit_col);

	var v_valid_until_col = document.createElement("div");
	v_valid_until_col.className = "col-md-12 mb-3";
	var v_valid_until_label = document.createElement("label");
	v_valid_until_label.setAttribute("for", "perm_role_valid_until");
	v_valid_until_label.textContent = t("permissions.valid_until");
	var v_valid_until_input = document.createElement("input");
	v_valid_until_input.type = "datetime-local";
	v_valid_until_input.id = "perm_role_valid_until";
	v_valid_until_input.className = "form-control";
	if (p_values.valid_until && p_values.valid_until.toLowerCase() !== "infinity") {
		v_valid_until_input.value = p_values.valid_until.slice(0, 16);
	}
	v_valid_until_col.appendChild(v_valid_until_label);
	v_valid_until_col.appendChild(v_valid_until_input);
	var v_valid_until_hint = document.createElement("div");
	v_valid_until_hint.className = "form-text";
	v_valid_until_hint.textContent = t("permissions.valid_until_hint");
	v_valid_until_col.appendChild(v_valid_until_hint);
	p_container.appendChild(v_valid_until_col);
}

/**
 * @returns {{p_can_login: boolean, p_superuser: boolean, p_createdb: boolean, p_createrole: boolean, p_inherit: boolean, p_replication: boolean, p_bypass_rls: boolean, p_connection_limit: number, p_valid_until: string}}
 */
function readRoleAttributeFields() {
	return {
		p_can_login: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_can_login")).checked,
		p_superuser: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_superuser")).checked,
		p_createdb: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_createdb")).checked,
		p_createrole: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_createrole")).checked,
		p_inherit: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_inherit")).checked,
		p_replication: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_replication")).checked,
		p_bypass_rls: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_bypassrls")).checked,
		p_connection_limit: Number(/** @type {HTMLInputElement} */ (document.getElementById("perm_role_connlimit")).value || -1),
		p_valid_until: /** @type {HTMLInputElement} */ (document.getElementById("perm_role_valid_until")).value,
	};
}

/**
 * @param {any} p_tag
 */
function openCreateRoleDialog(p_tag) {
	showFormDialog(
		"",
		function () {
			var v_name = /** @type {HTMLInputElement} */ (document.getElementById("perm_role_name")).value.trim();
			if (v_name === "") {
				showAlert(t("permissions.role_name_empty"));
				return;
			}
			var v_password = /** @type {HTMLInputElement} */ (document.getElementById("perm_role_password")).value;
			var v_attrs = readRoleAttributeFields();

			execAjax(
				"/create_role_postgresql/",
				JSON.stringify(
					Object.assign({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_name: v_name, p_password: v_password }, v_attrs),
				),
				function () {
					showAlert(t("permissions.role_created"));
					fetchRoles(p_tag);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_name_col = document.createElement("div");
			v_name_col.className = "col-md-12 mb-3";
			var v_name_label = document.createElement("label");
			v_name_label.setAttribute("for", "perm_role_name");
			v_name_label.textContent = t("permissions.role_name");
			var v_name_input = document.createElement("input");
			v_name_input.type = "text";
			v_name_input.id = "perm_role_name";
			v_name_input.className = "form-control";
			v_name_col.appendChild(v_name_label);
			v_name_col.appendChild(v_name_input);
			v_content.appendChild(v_name_col);

			var v_password_col = document.createElement("div");
			v_password_col.className = "col-md-12 mb-3";
			var v_password_label = document.createElement("label");
			v_password_label.setAttribute("for", "perm_role_password");
			v_password_label.textContent = t("common.password");
			var v_password_input = document.createElement("input");
			v_password_input.type = "password";
			v_password_input.id = "perm_role_password";
			v_password_input.className = "form-control";
			v_password_col.appendChild(v_password_label);
			v_password_col.appendChild(v_password_input);
			v_content.appendChild(v_password_col);

			appendRoleAttributeFields(v_content, {});

			appendSqlPreview(v_content, function () {
				var v_name = /** @type {HTMLInputElement} */ (document.getElementById("perm_role_name")).value.trim();
				if (v_name === "") return null;
				var v_has_password = /** @type {HTMLInputElement} */ (document.getElementById("perm_role_password")).value !== "";
				// Only whether a password is set matters for the preview
				// (the server masks it) -- the real one is never sent.
				return [
					{
						url: "/create_role_postgresql/",
						body: Object.assign(
							{ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_name: v_name, p_password: v_has_password ? "x" : "" },
							readRoleAttributeFields(),
						),
					},
				];
			});
		},
		true,
		t("common.save"),
		t("tree.create_role"),
		"fas node-all fa-user",
	);
}

/**
 * "Rename Role" (ALTER ROLE ... RENAME TO). Everything that refers to the
 * role by oid -- grants, memberships, ownership -- follows the new name; a
 * password stored as md5 is cleared by Postgres, which the dialog warns about.
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function openRenameRoleDialog(p_tag, p_role_name) {
	/** @returns {any} null while no new name is entered */
	function requestBody() {
		var v_name = /** @type {HTMLInputElement} */ (document.getElementById("perm_rename_name")).value.trim();
		if (v_name === "") return null;
		return { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name, p_new_name: v_name };
	}

	showFormDialog(
		"",
		function () {
			var v_body = requestBody();
			if (!v_body) {
				showAlert(t("permissions.role_name_empty"));
				return;
			}
			execAjax(
				"/rename_role_postgresql/",
				JSON.stringify(v_body),
				function () {
					// Follow the role: the old name no longer exists, so
					// everything keyed on it (columns 2 and 3) is rebuilt.
					var v_was_selected = p_tag.selectedRole === p_role_name;
					if (v_was_selected) {
						p_tag.selectedRole = v_body.p_new_name;
						renderRoleDetailColumn(p_tag, v_body.p_new_name);
						renderObjectsColumn(p_tag, v_body.p_new_name);
					}
					fetchRoles(p_tag);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_col = document.createElement("div");
			v_col.className = "col-md-12 mb-3";
			var v_label = document.createElement("label");
			v_label.setAttribute("for", "perm_rename_name");
			v_label.textContent = t("permissions.new_name_label");
			var v_input = document.createElement("input");
			v_input.type = "text";
			v_input.id = "perm_rename_name";
			v_input.className = "form-control";
			v_input.value = p_role_name;
			v_col.appendChild(v_label);
			v_col.appendChild(v_input);
			v_content.appendChild(v_col);

			var v_hint = document.createElement("div");
			v_hint.className = "omnidb__permissions__row-suffix mb-3";
			v_hint.textContent = t("permissions.rename_role_hint");
			v_content.appendChild(v_hint);

			appendSqlPreview(v_content, function () {
				var v_body = requestBody();
				return v_body ? [{ url: "/rename_role_postgresql/", body: v_body }] : null;
			});
			v_input.focus();
			v_input.select();
		},
		true,
		t("common.save"),
		t("permissions.rename_role") + ": " + p_role_name,
		"fas node-all fa-user",
	);
}

/**
 * "Export Permissions": a SQL script that recreates one role's permissions
 * (or every role's, with p_role_name "") -- roles without passwords,
 * memberships, direct object privileges and default privileges per database
 * (see buildPermissionsExport). Shown for copying; regenerated whenever a
 * section checkbox changes.
 * @param {any} p_tag
 * @param {string} p_role_name "" = all roles
 */
function openExportPermissionsDialog(p_tag, p_role_name) {
	var v_sections = [
		{ id: "perm_export_roles", key: "p_roles", label: "permissions.export_section_roles" },
		{ id: "perm_export_memberships", key: "p_memberships", label: "permissions.export_section_memberships" },
		{ id: "perm_export_privileges", key: "p_privileges", label: "permissions.export_section_privileges" },
		{ id: "perm_export_defaults", key: "p_default_privileges", label: "permissions.export_section_defaults" },
	];

	showFormDialog(
		"",
		function () {},
		null,
		function () {
			var v_cancel = document.getElementById("modal_message_cancel");
			if (v_cancel) v_cancel.style.display = "none";
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_intro = document.createElement("div");
			v_intro.className = "omnidb__permissions__row-suffix mb-2";
			v_intro.textContent = t("permissions.export_hint");
			v_content.appendChild(v_intro);

			for (var i = 0; i < v_sections.length; i++) {
				var v_row = document.createElement("div");
				v_row.className = "form-check";
				var v_input = document.createElement("input");
				v_input.type = "checkbox";
				v_input.className = "form-check-input";
				v_input.id = v_sections[i].id;
				v_input.checked = true;
				var v_label = document.createElement("label");
				v_label.className = "form-check-label";
				v_label.setAttribute("for", v_sections[i].id);
				v_label.textContent = t(v_sections[i].label);
				v_row.appendChild(v_input);
				v_row.appendChild(v_label);
				v_content.appendChild(v_row);
			}

			var v_text = document.createElement("textarea");
			v_text.className = "form-control omnidb__permissions__sql-preview-text mt-2";
			v_text.readOnly = true;
			v_text.rows = 14;
			v_content.appendChild(v_text);

			var v_copy = document.createElement("button");
			v_copy.type = "button";
			v_copy.className = "btn btn-sm btn-outline-secondary";
			v_copy.textContent = t("permissions.copy_sql");
			v_content.appendChild(v_copy);

			var v_save = document.createElement("button");
			v_save.type = "button";
			v_save.className = "btn btn-sm btn-outline-secondary ml-2 ms-2";
			v_save.textContent = t("permissions.export_save_file");
			v_content.appendChild(v_save);

			/** @returns {any} the request for the script with the sections currently ticked */
			function requestBody() {
				/** @type {any} */
				var v_body = { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name };
				for (var j = 0; j < v_sections.length; j++) {
					v_body[v_sections[j].key] = /** @type {HTMLInputElement} */ (document.getElementById(v_sections[j].id)).checked;
				}
				return v_body;
			}

			var v_token = 0;
			function load() {
				var v_mine = ++v_token;
				v_text.value = "";
				var v_body = requestBody();
				execAjax(
					"/export_permissions_postgresql/",
					JSON.stringify(v_body),
					function (p_return) {
						if (v_mine === v_token) v_text.value = p_return.v_data.v_sql;
					},
					function (p_return) {
						if (v_mine === v_token) v_text.value = "-- " + (p_return.v_data.message || p_return.v_data);
					},
					"box",
					true,
				);
			}
			v_content.addEventListener("change", function (p_event) {
				if (v_content.contains(v_text) && /** @type {HTMLInputElement} */ (p_event.target).type === "checkbox") load();
			});
			v_copy.addEventListener("click", function () {
				copyTextQuietly(v_text.value);
				v_copy.textContent = t("permissions.sql_copied");
				window.setTimeout(function () {
					v_copy.textContent = t("permissions.copy_sql");
				}, 1500);
			});
			// The file is generated server-side (same sections as shown) and
			// handed to the native Save dialog / browser download.
			v_save.addEventListener("click", function () {
				execAjax(
					"/export_permissions_postgresql/",
					JSON.stringify(Object.assign(requestBody(), { p_file: true })),
					function (p_return) {
						deliverExportFile(p_return.v_data);
					},
					function (p_return) {
						showAlert(p_return.v_data.message || p_return.v_data);
					},
					"box",
					true,
				);
			});
			load();
		},
		true,
		t("common.close"),
		t(p_role_name ? "permissions.export_permissions" : "permissions.export_permissions_all") + (p_role_name ? ": " + p_role_name : ""),
		"fas node-all fa-file",
	);
}

/**
 * "Clone Role": a new role with the source's attributes, plus -- optionally
 * -- its direct memberships and direct object privileges in every database
 * (see buildCloneRolePlan). The password is not copied; set one here or leave
 * it empty.
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function openCloneRoleDialog(p_tag, p_role_name) {
	/**
	 * @param {boolean} p_for_preview the real password is never sent for a preview
	 * @returns {any} null while no name is entered
	 */
	function requestBody(p_for_preview) {
		var v_name = /** @type {HTMLInputElement} */ (document.getElementById("perm_clone_name")).value.trim();
		if (v_name === "") return null;
		var v_password = /** @type {HTMLInputElement} */ (document.getElementById("perm_clone_password")).value;
		return {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_source: p_role_name,
			p_name: v_name,
			p_password: p_for_preview ? (v_password ? "x" : "") : v_password,
			p_copy_memberships: /** @type {HTMLInputElement} */ (document.getElementById("perm_clone_memberships")).checked,
			p_copy_privileges: /** @type {HTMLInputElement} */ (document.getElementById("perm_clone_privileges")).checked,
		};
	}

	showFormDialog(
		"",
		function () {
			var v_body = requestBody(false);
			if (!v_body) {
				showAlert(t("permissions.role_name_empty"));
				return;
			}
			execAjax(
				"/clone_role_postgresql/",
				JSON.stringify(v_body),
				function () {
					showAlert(t("permissions.role_created"));
					fetchRoles(p_tag);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				true,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			/**
			 * @param {string} p_id
			 * @param {string} p_label
			 * @param {string} p_type
			 */
			function addTextField(p_id, p_label, p_type) {
				var v_col = document.createElement("div");
				v_col.className = "col-md-12 mb-3";
				var v_label = document.createElement("label");
				v_label.setAttribute("for", p_id);
				v_label.textContent = p_label;
				var v_input = document.createElement("input");
				v_input.type = p_type;
				v_input.id = p_id;
				v_input.className = "form-control";
				v_col.appendChild(v_label);
				v_col.appendChild(v_input);
				v_content.appendChild(v_col);
			}
			/**
			 * @param {string} p_id
			 * @param {string} p_label
			 */
			function addCheckbox(p_id, p_label) {
				var v_row = document.createElement("div");
				v_row.className = "form-check mb-2";
				var v_input = document.createElement("input");
				v_input.type = "checkbox";
				v_input.className = "form-check-input";
				v_input.id = p_id;
				v_input.checked = true;
				var v_label = document.createElement("label");
				v_label.className = "form-check-label";
				v_label.setAttribute("for", p_id);
				v_label.textContent = p_label;
				v_row.appendChild(v_input);
				v_row.appendChild(v_label);
				v_content.appendChild(v_row);
			}

			var v_intro = document.createElement("div");
			v_intro.className = "omnidb__permissions__row-suffix mb-3";
			v_intro.textContent = t("permissions.clone_role_hint", { role: p_role_name });
			v_content.appendChild(v_intro);

			addTextField("perm_clone_name", t("permissions.role_name"), "text");
			addTextField("perm_clone_password", t("common.password"), "password");
			addCheckbox("perm_clone_memberships", t("permissions.clone_copy_memberships"));
			addCheckbox("perm_clone_privileges", t("permissions.clone_copy_privileges"));

			appendSqlPreview(v_content, function () {
				var v_body = requestBody(true);
				return v_body ? [{ url: "/clone_role_postgresql/", body: v_body }] : null;
			});
		},
		true,
		t("common.save"),
		t("permissions.clone_role") + ": " + p_role_name,
		"fas node-all fa-user",
	);
}

/**
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function openAlterRoleAttributesDialog(p_tag, p_role_name) {
	execAjax(
		"/get_role_attributes_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name }),
		function (p_return) {
			var v_current = p_return.v_data;
			showFormDialog(
				"",
				function () {
					var v_attrs = readRoleAttributeFields();
					execAjax(
						"/alter_role_attributes_postgresql/",
						JSON.stringify(
							Object.assign({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name }, v_attrs),
						),
						function () {
							showAlert(t("permissions.role_updated"));
							fetchRoles(p_tag);
						},
						function (p_return2) {
							showAlert(p_return2.v_data.message || p_return2.v_data);
						},
						"box",
						false,
					);
				},
				null,
				function () {
					var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
					appendRoleAttributeFields(v_content, {
						can_login: v_current.p_can_login,
						superuser: v_current.p_superuser,
						createdb: v_current.p_createdb,
						createrole: v_current.p_createrole,
						inherit: v_current.p_inherit,
						replication: v_current.p_replication,
						bypass_rls: v_current.p_bypass_rls,
						connection_limit: v_current.p_connection_limit,
						valid_until: v_current.p_valid_until,
					});

					appendSqlPreview(v_content, function () {
						return [
							{
								url: "/alter_role_attributes_postgresql/",
								body: Object.assign({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name }, readRoleAttributeFields()),
							},
						];
					});
				},
				true,
				t("common.save"),
				t("permissions.alter_role_attributes") + ": " + p_role_name,
				"fas node-all fa-user",
			);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function openChangePasswordDialog(p_tag, p_role_name) {
	/**
	 * @param {string} p_label_text
	 * @param {string} p_input_id
	 */
	function buildPasswordField(p_label_text, p_input_id) {
		var v_col = document.createElement("div");
		v_col.className = "col-md-12 mb-3";

		var v_label = document.createElement("label");
		v_label.setAttribute("for", p_input_id);
		v_label.textContent = p_label_text;

		var v_input = document.createElement("input");
		v_input.type = "password";
		v_input.id = p_input_id;
		v_input.className = "form-control";

		v_col.appendChild(v_label);
		v_col.appendChild(v_input);
		return v_col;
	}

	showFormDialog(
		"",
		function () {
			var v_password = /** @type {HTMLInputElement} */ (document.getElementById("perm_change_pwd_role")).value;
			var v_password_confirm = /** @type {HTMLInputElement} */ (document.getElementById("perm_change_pwd_role_confirm"))
				.value;

			if (v_password === "") {
				showAlert(t("tree.password_empty"));
				return;
			}
			if (v_password_confirm === "") {
				showAlert(t("tree.password_confirmation_empty"));
				return;
			}
			if (v_password !== v_password_confirm) {
				showAlert(t("tree.passwords_do_not_match"));
				return;
			}

			execAjax(
				"/change_role_password_postgresql/",
				JSON.stringify({
					p_database_index: p_tag.connID,
					p_tab_id: p_tag.tabID,
					p_role: p_role_name,
					p_password: v_password,
				}),
				function () {
					showAlert(t("tree.password_changed_successfully"));
				},
				function (p_return) {
					showAlert(p_return.v_data.message);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_row = document.createElement("div");
			v_row.className = "form-row";
			v_row.appendChild(buildPasswordField(t("common.password"), "perm_change_pwd_role"));
			v_row.appendChild(buildPasswordField(t("tree.password_confirmation"), "perm_change_pwd_role_confirm"));
			/** @type {HTMLElement} */ (document.getElementById("modal_message_content")).appendChild(v_row);
		},
		false,
		t("common.save"),
		t("tree.change_password") + ": " + p_role_name,
		"fas node-all fa-user",
	);
}

// --- column 2: membership + object privileges -----------------------------

/**
 * Builds one "list" section inside column 2 -- the same shape column 1's
 * role list uses, just factored out since column 2 stacks two of these
 * (membership on top, object privileges below). The "+"/"-" footer is only
 * built for whichever of showAdd/showRemove the caller asks for.
 * @param {HTMLElement} p_container
 * @param {string} p_header_text
 * @param {{addTitle?: string, showAdd?: boolean, showRemove?: boolean}} p_options
 * @returns {{headerDiv: HTMLElement, listDiv: HTMLElement, addBtn: HTMLButtonElement | null, removeBtn: HTMLButtonElement | null}}
 */
function buildColumnSection(p_container, p_header_text, p_options) {
	var v_section = document.createElement("div");
	v_section.className = "omnidb__permissions__column-section";

	var v_footer_html = "";
	if (p_options.showAdd || p_options.showRemove) {
		v_footer_html = "<div class='omnidb__list-footer'><div class='omnidb__addremove'>";
		if (p_options.showAdd) {
			v_footer_html +=
				"<button type='button' class='omnidb__permissions__section-add' title='" +
				escapeHtmlAttribute(p_options.addTitle || "") +
				"'><i class='fas fa-plus'></i></button>";
		}
		if (p_options.showAdd && p_options.showRemove) v_footer_html += "<span class='omnidb__addremove-divider'></span>";
		if (p_options.showRemove) {
			v_footer_html +=
				"<button type='button' class='omnidb__permissions__section-remove' title='" +
				escapeHtmlAttribute(t("common.delete")) +
				"' disabled><i class='fas fa-minus'></i></button>";
		}
		v_footer_html += "</div></div>";
	}

	v_section.innerHTML =
		"<div class='omnidb__permissions__column-header'><span class='omnidb__permissions__column-header-text'>" +
		escapeHtml(p_header_text) +
		"</span></div>" +
		"<div class='omnidb__permissions__list'></div>" +
		v_footer_html;
	p_container.appendChild(v_section);
	return {
		headerDiv: /** @type {HTMLElement} */ (v_section.querySelector(".omnidb__permissions__column-header")),
		listDiv: /** @type {HTMLElement} */ (v_section.querySelector(".omnidb__permissions__list")),
		addBtn: /** @type {HTMLButtonElement | null} */ (v_section.querySelector(".omnidb__permissions__section-add")),
		removeBtn: /** @type {HTMLButtonElement | null} */ (v_section.querySelector(".omnidb__permissions__section-remove")),
	};
}

/**
 * @param {any} p_tag
 */
function closeColumn2(p_tag) {
	if (p_tag.column2) p_tag.column2.columnDiv.remove();
	p_tag.column2 = null;
}

/**
 * (Re)builds column 2 for whichever role is now focused in column 1 -- two
 * stacked halves (.omnidb__permissions__column-section is flex: 1 1 0, so
 * two of them split the column's height evenly), both always editable:
 * "Members" on top (who is, directly or indirectly, a member of the focused
 * role -- postgresqlRoleDescendants) and "Member of" on the bottom (who the
 * focused role is itself, directly or indirectly, a member of --
 * postgresqlRoleAncestors, unchanged from every earlier phase). See this
 * file's Phase 10b module comment for why both share the same grant/revoke/
 * context-menu code, parameterized by direction, rather than being
 * duplicated.
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function renderRoleDetailColumn(p_tag, p_role_name) {
	closeColumn2(p_tag);
	// PUBLIC is never a member of anything, nor is anything ever a member of
	// PUBLIC (it isn't a real pg_roles row -- see isPublicPseudoRole's
	// comment on the Go side), so neither half has anything to fetch or edit
	// when PUBLIC is the focused role -- managing PUBLIC's own object
	// privileges happens in the objects column instead, same as any other
	// role (see PERMISSIONS_PUBLIC_ROLE above).
	var v_is_public_focus = p_role_name === "PUBLIC";

	var v_column = document.createElement("div");
	v_column.className = "omnidb__permissions__column";

	var v_members_section = buildColumnSection(v_column, t("permissions.members_column_title", { role: p_role_name }), {
		addTitle: t("permissions.grant_membership_reverse"),
		showAdd: !v_is_public_focus,
		showRemove: !v_is_public_focus,
	});
	var v_membership_section = buildColumnSection(v_column, t("permissions.member_of_column_title", { role: p_role_name }), {
		addTitle: t("permissions.grant_membership"),
		showAdd: !v_is_public_focus,
		showRemove: !v_is_public_focus,
	});

	attachColumnResizer(v_column, "detail");
	p_tag.columnsDiv.appendChild(v_column);

	/** @type {any} */
	var v_col_state = {
		role: p_role_name,
		editable: true,
		columnDiv: v_column,
		membersListDiv: v_members_section.listDiv,
		membersAddBtn: v_members_section.addBtn,
		membersRemoveBtn: v_members_section.removeBtn,
		membersSelected: null,
		descendants: null,
		membershipListDiv: v_membership_section.listDiv,
		membershipAddBtn: v_membership_section.addBtn,
		membershipRemoveBtn: v_membership_section.removeBtn,
		membershipSelected: null,
		ancestors: null,
	};
	p_tag.column2 = v_col_state;

	if (v_col_state.membersAddBtn) {
		v_col_state.membersAddBtn.addEventListener("click", function () {
			openGrantMembershipDialog(p_tag, v_col_state, "descendant");
		});
	}
	if (v_col_state.membersRemoveBtn) {
		v_col_state.membersRemoveBtn.addEventListener("click", function () {
			if (v_col_state.membersSelected) confirmRevokeMembership(p_tag, v_col_state, v_col_state.membersSelected, "descendant");
		});
	}
	if (v_col_state.membershipAddBtn) {
		v_col_state.membershipAddBtn.addEventListener("click", function () {
			openGrantMembershipDialog(p_tag, v_col_state, "ancestor");
		});
	}
	if (v_col_state.membershipRemoveBtn) {
		v_col_state.membershipRemoveBtn.addEventListener("click", function () {
			if (v_col_state.membershipSelected) confirmRevokeMembership(p_tag, v_col_state, v_col_state.membershipSelected, "ancestor");
		});
	}

	if (v_is_public_focus) {
		// Every role implicitly gets PUBLIC's privileges (no pg_auth_members
		// row, and independent of LOGIN/INHERIT), so the Members half lists
		// every real role -- all "indirect" (grey), never revocable here.
		renderDescendantsList(
			p_tag,
			v_col_state,
			(p_tag.roles || [])
				.filter(function (p_role) {
					return !p_role.v_is_public;
				})
				.map(function (p_role) {
					return { v_name: p_role.v_name, v_direct: false, v_can_login: p_role.v_can_login };
				}),
		);

		var v_na_membership = document.createElement("div");
		v_na_membership.className = "omnidb__permissions__list-empty";
		v_na_membership.textContent = t("permissions.public_membership_not_applicable");
		v_col_state.membershipListDiv.appendChild(v_na_membership);
	} else {
		fetchDescendants(p_tag, v_col_state);
		fetchAncestors(p_tag, v_col_state);
	}
}

/**
 * @param {any} p_tag
 * @param {any} p_col_state
 */
function fetchAncestors(p_tag, p_col_state) {
	execAjax(
		"/get_role_ancestors_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role }),
		function (p_return) {
			renderAncestorsList(p_tag, p_col_state, p_return.v_data);
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					p_tag.connID,
					function () {
						fetchAncestors(p_tag, p_col_state);
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {any} p_col_state
 */
function fetchDescendants(p_tag, p_col_state) {
	execAjax(
		"/get_role_descendants_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role }),
		function (p_return) {
			renderDescendantsList(p_tag, p_col_state, p_return.v_data);
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					p_tag.connID,
					function () {
						fetchDescendants(p_tag, p_col_state);
					},
					null,
					p_return.v_data.message,
				);
			} else {
				showError(p_return.v_data);
			}
		},
		"box",
		true,
	);
}

/**
 * The bottom half's flattened "member of" closure for the focused role in
 * one list: direct ancestors (an actual pg_auth_members row) in the normal
 * text color, indirect ones (reachable only through another ancestor) in
 * --inherited grey. PUBLIC is always synthesized in first, grey, since it
 * applies to every real role but is never itself a pg_auth_members row (see
 * postgresqlRoleAncestors' comment on the Go side) -- this function is only
 * ever called for a non-PUBLIC focus role (see renderRoleDetailColumn), so
 * there is no "PUBLIC member of PUBLIC" case to guard against here.
 *
 * A plain click only selects/highlights a row (enabling the footer "-" when
 * it's a direct one -- an indirect membership can't be revoked directly,
 * only by making its own role the focus and revoking it there); double-
 * click or the row's own context menu jump straight to that shortcut
 * instead of requiring column 1 to be found and clicked separately.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {Array<{v_name: string, v_direct: boolean, v_admin_option: boolean, v_inherit?: boolean | null, v_set?: boolean | null}>} p_ancestors
 */
function renderAncestorsList(p_tag, p_col_state, p_ancestors) {
	var v_rows = [{ v_name: "PUBLIC", v_direct: false, v_admin_option: false, v_is_public: true }].concat(
		p_ancestors.map(function (p_ancestor) {
			return {
				v_name: p_ancestor.v_name,
				v_direct: p_ancestor.v_direct,
				v_admin_option: p_ancestor.v_admin_option,
				v_inherit: p_ancestor.v_inherit,
				v_set: p_ancestor.v_set,
				v_is_public: false,
			};
		}),
	);
	p_col_state.ancestors = v_rows;
	p_col_state.membershipSelected = null;
	if (p_col_state.membershipRemoveBtn) p_col_state.membershipRemoveBtn.disabled = true;
	p_col_state.membershipListDiv.innerHTML = "";

	for (var i = 0; i < v_rows.length; i++) {
		(function (p_row) {
			var v_row = document.createElement("div");
			v_row.className = "omnidb__permissions__role-row";
			if (!p_row.v_direct) v_row.classList.add("omnidb__permissions__role-row--inherited");

			var v_icon = document.createElement("i");
			v_icon.className = "fas node-all " + (p_row.v_is_public ? "fa-globe" : "fa-users");
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_row.v_name;
			v_row.appendChild(v_label);

			appendMembershipNotes(v_row, p_row);

			v_row.addEventListener("click", function () {
				p_col_state.membershipSelected = p_row.v_direct ? p_row.v_name : null;
				if (p_col_state.membershipRemoveBtn) p_col_state.membershipRemoveBtn.disabled = !p_row.v_direct;

				var v_all = p_col_state.membershipListDiv.querySelectorAll(".omnidb__permissions__role-row");
				for (var j = 0; j < v_all.length; j++) {
					v_all[j].classList.toggle("omnidb__permissions__role-row--selected", v_all[j] === v_row);
				}
			});
			v_row.addEventListener("dblclick", function () {
				selectRole(p_tag, p_row.v_name);
			});
			v_row.addEventListener("contextmenu", function (e) {
				e.preventDefault();
				openMembershipContextMenu(p_tag, p_col_state, p_row, e, "ancestor");
			});

			p_col_state.membershipListDiv.appendChild(v_row);
		})(v_rows[i]);
	}
}

/**
 * The small grey notes after a *direct* membership row: "(admin option)", and
 * on PostgreSQL 16+ "(no inherit)" / "(no SET)" when those options are off
 * (p_row.v_inherit / v_set are null for indirect rows and older servers).
 * @param {HTMLElement} p_row_element
 * @param {{v_direct: boolean, v_admin_option?: boolean, v_inherit?: boolean | null, v_set?: boolean | null}} p_row
 */
function appendMembershipNotes(p_row_element, p_row) {
	if (!p_row.v_direct) return;
	/** @type {string[]} */
	var v_notes = [];
	if (p_row.v_admin_option) v_notes.push(t("permissions.admin_option_suffix"));
	if (p_row.v_inherit === false) v_notes.push(t("permissions.membership_no_inherit"));
	if (p_row.v_set === false) v_notes.push(t("permissions.membership_no_set"));
	if (v_notes.length === 0) return;
	// One line under the name: the columns are narrow and side-by-side notes
	// wrap word by word.
	p_row_element.classList.add("omnidb__permissions__access-row");
	var v_suffix = document.createElement("span");
	v_suffix.className = "omnidb__permissions__row-suffix omnidb__permissions__access-privileges";
	v_suffix.textContent = v_notes.join(" ");
	p_row_element.appendChild(v_suffix);
}

/**
 * The top half's flattened "members" closure for the focused role -- the
 * mirror image of renderAncestorsList: every role that is, directly or
 * indirectly, a member of the focused role (so inherits its privileges),
 * rather than every role the focused role is itself a member of. No
 * synthesized PUBLIC row here -- see this file's Phase 10b module comment
 * for why there's no universal entry to add on this side.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {Array<{v_name: string, v_direct: boolean, v_can_login?: boolean, v_admin_option?: boolean, v_inherit?: boolean | null, v_set?: boolean | null}>} p_descendants
 */
function renderDescendantsList(p_tag, p_col_state, p_descendants) {
	p_col_state.descendants = p_descendants;
	p_col_state.membersSelected = null;
	if (p_col_state.membersRemoveBtn) p_col_state.membersRemoveBtn.disabled = true;
	p_col_state.membersListDiv.innerHTML = "";

	if (p_descendants.length === 0) {
		var v_empty = document.createElement("div");
		v_empty.className = "omnidb__permissions__list-empty";
		v_empty.textContent = t("permissions.no_members");
		p_col_state.membersListDiv.appendChild(v_empty);
		return;
	}

	for (var i = 0; i < p_descendants.length; i++) {
		(function (p_row) {
			var v_row = document.createElement("div");
			v_row.className = "omnidb__permissions__role-row";
			if (!p_row.v_direct) v_row.classList.add("omnidb__permissions__role-row--inherited");

			var v_icon = document.createElement("i");
			v_icon.className = "fas node-all " + (p_row.v_can_login === undefined ? "fa-users" : p_row.v_can_login ? "fa-user" : "fa-user-friends");
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_row.v_name;
			v_row.appendChild(v_label);
			appendMembershipNotes(v_row, p_row);

			v_row.addEventListener("click", function () {
				p_col_state.membersSelected = p_row.v_direct ? p_row.v_name : null;
				if (p_col_state.membersRemoveBtn) p_col_state.membersRemoveBtn.disabled = !p_row.v_direct;

				var v_all = p_col_state.membersListDiv.querySelectorAll(".omnidb__permissions__role-row");
				for (var j = 0; j < v_all.length; j++) {
					v_all[j].classList.toggle("omnidb__permissions__role-row--selected", v_all[j] === v_row);
				}
			});
			v_row.addEventListener("dblclick", function () {
				selectRole(p_tag, p_row.v_name);
			});
			v_row.addEventListener("contextmenu", function (e) {
				e.preventDefault();
				openMembershipContextMenu(p_tag, p_col_state, p_row, e, "descendant");
			});

			p_col_state.membersListDiv.appendChild(v_row);
		})(p_descendants[i]);
	}
}

/**
 * Shared by both halves' rows -- "Set as Active Role" always, "Remove
 * Membership" only for a direct row (an indirect one can't be revoked
 * directly, only by making its own role the focus and revoking it there).
 * p_direction picks which side of GRANT parent TO member p_row plays when
 * "Remove Membership" is chosen (see confirmRevokeMembership).
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {{v_name: string, v_direct: boolean, v_inherit?: boolean | null, v_set?: boolean | null, v_admin_option?: boolean}} p_row
 * @param {MouseEvent} p_event
 * @param {"ancestor" | "descendant"} p_direction
 */
function openMembershipContextMenu(p_tag, p_col_state, p_row, p_event, p_direction) {
	var v_items = [
		{
			text: t("permissions.set_as_active_role"),
			icon: "fas cm-all fa-user",
			action: function () {
				selectRole(p_tag, p_row.v_name);
			},
		},
	];
	// v_inherit is only ever set for a direct row on PostgreSQL 16+.
	if (p_row.v_direct && typeof p_row.v_inherit === "boolean") {
		v_items.push({
			text: t("permissions.edit_membership_options"),
			icon: "fas cm-all fa-pen",
			action: function () {
				openEditMembershipDialog(p_tag, p_col_state, p_row, p_direction);
			},
		});
	}
	if (p_row.v_direct) {
		v_items.push({
			text: t("permissions.remove_membership"),
			icon: "fas cm-all fa-times",
			action: function () {
				confirmRevokeMembership(p_tag, p_col_state, p_row.v_name, p_direction);
			},
		});
	}
	customMenu({ x: p_event.clientX, y: p_event.clientY }, v_items, null);
}

/**
 * A scrollable list of icon+label rows (fa-user for a login role, fa-user-
 * friends for a group role -- same convention as column 1's own
 * renderRolesList) used as a role picker inside modal dialogs. Native
 * `<option>` elements can't render an icon in any browser and this app has
 * no rich-select component (see this file's module comment), so dialogs
 * that need to pick a role from a list use this instead of a `<select>`.
 * @param {HTMLElement} p_container
 * @param {Array<{v_name: string, v_can_login: boolean}>} p_roles
 * Multi-select: a click toggles a row, so any number of roles can be picked.
 * @returns {{listDiv: HTMLElement, getValues: () => string[]}}
 */
function buildRolePickerList(p_container, p_roles) {
	var v_list = document.createElement("div");
	v_list.className = "omnidb__permissions__role-picker";

	/** @type {Object<string, boolean>} */
	var v_selected = {};

	function renderRows() {
		v_list.innerHTML = "";
		for (var i = 0; i < p_roles.length; i++) {
			(function (p_role) {
				var v_row = document.createElement("div");
				v_row.className = "omnidb__permissions__role-row";
				if (v_selected[p_role.v_name]) v_row.classList.add("omnidb__permissions__role-row--selected");

				var v_icon = document.createElement("i");
				v_icon.className = "fas node-all " + (p_role.v_can_login ? "fa-user" : "fa-user-friends");
				v_row.appendChild(v_icon);

				var v_label = document.createElement("span");
				v_label.textContent = p_role.v_name;
				v_row.appendChild(v_label);

				v_row.addEventListener("click", function () {
					if (v_selected[p_role.v_name]) delete v_selected[p_role.v_name];
					else v_selected[p_role.v_name] = true;
					renderRows();
				});

				v_list.appendChild(v_row);
			})(p_roles[i]);
		}
	}
	renderRows();
	p_container.appendChild(v_list);

	return {
		listDiv: v_list,
		getValues: function () {
			return p_roles
				.map(function (p_role) {
					return p_role.v_name;
				})
				.filter(function (p_name) {
					return v_selected[p_name];
				});
		},
	};
}

/**
 * The "+" dialog behind both membership sections' footer buttons --
 * p_direction "ancestor" (bottom, "Member of") grants p_col_state.role
 * membership in a picked parent role (GRANT parent TO role); "descendant"
 * (top, "Members") grants a picked role membership in p_col_state.role
 * itself (GRANT role TO member) -- the reverse relationship, same
 * /grant_role_membership_postgresql/ endpoint either way, just with the two
 * names swapped.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {"ancestor" | "descendant"} p_direction
 */
function openGrantMembershipDialog(p_tag, p_col_state, p_direction) {
	var v_role = p_col_state.role;
	// Only *direct* entries are excluded -- an indirect one can still
	// legitimately get its own direct grant on top (that's exactly how
	// you'd turn an inherited membership into a direct one).
	var v_existing_list = p_direction === "ancestor" ? p_col_state.ancestors : p_col_state.descendants;
	var v_existing_direct = (v_existing_list || [])
		.filter(function (p_entry) {
			return p_entry.v_direct;
		})
		.map(function (p_entry) {
			return p_entry.v_name;
		});
	var v_candidates = (p_tag.roles || []).filter(function (p_role) {
		// PUBLIC can never be either side of a membership grant -- "GRANT
		// PUBLIC TO x" and "GRANT x TO PUBLIC" both aren't valid syntax for
		// this (the latter is a different, unsupported-for-now feature --
		// see the plan this was built from).
		return !p_role.v_is_public && p_role.v_name !== v_role && v_existing_direct.indexOf(p_role.v_name) === -1;
	});

	if (v_candidates.length === 0) {
		showAlert(t("permissions.no_grantable_roles"));
		return;
	}

	/** @type {{getValues: () => string[]} | null} */
	var v_picker = null;

	showFormDialog(
		"",
		function () {
			var v_picked = v_picker ? v_picker.getValues() : [];
			var v_admin = /** @type {HTMLInputElement} */ (document.getElementById("perm_grant_admin_option")).checked;

			if (v_picked.length === 0) {
				showAlert(t("permissions.select_role_hint"));
				return;
			}

			var v_failed = false;
			var v_ops = v_picked.map(function (p_name) {
				return function (p_done) {
					if (v_failed) {
						p_done();
						return;
					}
					execAjax(
						"/grant_role_membership_postgresql/",
						JSON.stringify(
							Object.assign(
								{
									p_database_index: p_tag.connID,
									p_tab_id: p_tag.tabID,
									p_member: p_direction === "ancestor" ? v_role : p_name,
									p_parent: p_direction === "ancestor" ? p_name : v_role,
									p_admin_option: v_admin,
								},
								readMembershipOptionSelects(),
							),
						),
						p_done,
						function (p_return) {
							v_failed = true;
							showAlert(p_return.v_data.message || p_return.v_data);
							p_done();
						},
						"box",
						false,
					);
				};
			});
			runSequentially(v_ops, function () {
				if (p_direction === "ancestor") fetchAncestors(p_tag, p_col_state);
				else fetchDescendants(p_tag, p_col_state);
			});
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_picker_col = document.createElement("div");
			v_picker_col.className = "col-md-12 mb-3";
			var v_picker_label = document.createElement("label");
			v_picker_label.textContent = t("permissions.parent_role_label");
			v_picker_col.appendChild(v_picker_label);
			v_picker = buildRolePickerList(v_picker_col, v_candidates);
			v_content.appendChild(v_picker_col);

			var v_admin_row = document.createElement("div");
			v_admin_row.className = "form-check mb-2";
			var v_admin_input = document.createElement("input");
			v_admin_input.type = "checkbox";
			v_admin_input.className = "form-check-input";
			v_admin_input.id = "perm_grant_admin_option";
			var v_admin_label = document.createElement("label");
			v_admin_label.className = "form-check-label";
			v_admin_label.setAttribute("for", "perm_grant_admin_option");
			v_admin_label.textContent = t("permissions.admin_option");
			v_admin_row.appendChild(v_admin_input);
			v_admin_row.appendChild(v_admin_label);
			v_content.appendChild(v_admin_row);

			appendMembershipOptionSelects(p_tag, v_content);

			appendSqlPreview(v_content, function () {
				var v_picked = v_picker ? v_picker.getValues() : [];
				if (v_picked.length === 0) return null;
				var v_admin = /** @type {HTMLInputElement} */ (document.getElementById("perm_grant_admin_option")).checked;
				return v_picked.map(function (p_name) {
					return {
						url: "/grant_role_membership_postgresql/",
						body: Object.assign(
							{
								p_database_index: p_tag.connID,
								p_tab_id: p_tag.tabID,
								p_member: p_direction === "ancestor" ? v_role : p_name,
								p_parent: p_direction === "ancestor" ? p_name : v_role,
								p_admin_option: v_admin,
							},
							readMembershipOptionSelects(),
						),
					};
				});
			});
		},
		true,
		t("common.save"),
		t(p_direction === "ancestor" ? "permissions.grant_membership" : "permissions.grant_membership_reverse"),
		"fas node-all fa-users",
	);
}

/**
 * The server's major version (e.g. 16), fetched once per tab; 0 if unknown.
 * @param {any} p_tag
 * @param {(major: number) => void} p_callback
 */
function withServerMajor(p_tag, p_callback) {
	if (typeof p_tag.serverMajor === "number") {
		p_callback(p_tag.serverMajor);
		return;
	}
	execAjax(
		"/get_postgresql_version/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID }),
		function (p_return) {
			// The version string reads like "PostgreSQL 18.6".
			var v_match = /(\d+)/.exec(String(p_return.v_data.v_version));
			p_tag.serverMajor = v_match ? parseInt(v_match[1], 10) : 0;
			p_callback(p_tag.serverMajor);
		},
		function () {
			p_callback(0);
		},
		"box",
		false,
	);
}

/**
 * PostgreSQL 16+ membership options for the "add membership" dialog: two
 * three-way selects (server default / yes / no), added once the server
 * version is known to support them. Left on "default" they send nothing, so
 * the plain GRANT is unchanged.
 * @param {any} p_tag
 * @param {HTMLElement} p_content
 */
function appendMembershipOptionSelects(p_tag, p_content) {
	var v_holder = document.createElement("div");
	p_content.appendChild(v_holder);
	withServerMajor(p_tag, function (p_major) {
		if (p_major < 16) return;
		var v_items = [
			{ value: "", label: t("permissions.option_default") },
			{ value: "true", label: t("permissions.option_yes") },
			{ value: "false", label: t("permissions.option_no") },
		];
		var v_inherit = buildSelectField(v_holder, "perm_grant_inherit", t("permissions.membership_inherit_label"));
		populateSelectOptions(v_inherit.select, v_items);
		var v_set = buildSelectField(v_holder, "perm_grant_set", t("permissions.membership_set_label"));
		populateSelectOptions(v_set.select, v_items);
	});
}

/**
 * Reads the selects of appendMembershipOptionSelects into request fields
 * (only the ones not left on "default"; none when the selects are absent).
 * @returns {{p_inherit?: boolean, p_set?: boolean}}
 */
function readMembershipOptionSelects() {
	/** @type {{p_inherit?: boolean, p_set?: boolean}} */
	var v_fields = {};
	var v_inherit = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_inherit"));
	var v_set = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_set"));
	if (v_inherit && v_inherit.value !== "") v_fields.p_inherit = v_inherit.value === "true";
	if (v_set && v_set.value !== "") v_fields.p_set = v_set.value === "true";
	return v_fields;
}

/**
 * Edit one direct membership's admin / INHERIT / SET options (PostgreSQL
 * 16+): a repeated GRANT with all three options explicit updates the
 * existing membership, turning the admin option off included.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {{v_name: string, v_admin_option?: boolean, v_inherit?: boolean | null, v_set?: boolean | null}} p_row
 * @param {"ancestor" | "descendant"} p_direction
 */
function openEditMembershipDialog(p_tag, p_col_state, p_row, p_direction) {
	var v_member = p_direction === "ancestor" ? p_col_state.role : p_row.v_name;
	var v_parent = p_direction === "ancestor" ? p_row.v_name : p_col_state.role;

	/** @returns {any} */
	function requestBody() {
		return {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_member: v_member,
			p_parent: v_parent,
			p_admin_option: /** @type {HTMLInputElement} */ (document.getElementById("perm_edit_admin")).checked,
			p_inherit: /** @type {HTMLInputElement} */ (document.getElementById("perm_edit_inherit")).checked,
			p_set: /** @type {HTMLInputElement} */ (document.getElementById("perm_edit_set")).checked,
		};
	}

	showFormDialog(
		"",
		function () {
			execAjax(
				"/grant_role_membership_postgresql/",
				JSON.stringify(requestBody()),
				function () {
					if (p_direction === "ancestor") fetchAncestors(p_tag, p_col_state);
					else fetchDescendants(p_tag, p_col_state);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_intro = document.createElement("div");
			v_intro.className = "omnidb__permissions__row-suffix mb-3";
			v_intro.textContent = t("permissions.edit_membership_hint", { member: v_member, parent: v_parent });
			v_content.appendChild(v_intro);

			/**
			 * @param {string} p_id
			 * @param {string} p_label
			 * @param {boolean} p_checked
			 */
			function addCheckbox(p_id, p_label, p_checked) {
				var v_row = document.createElement("div");
				v_row.className = "form-check mb-2";
				var v_input = document.createElement("input");
				v_input.type = "checkbox";
				v_input.className = "form-check-input";
				v_input.id = p_id;
				v_input.checked = p_checked;
				var v_label = document.createElement("label");
				v_label.className = "form-check-label";
				v_label.setAttribute("for", p_id);
				v_label.textContent = p_label;
				v_row.appendChild(v_input);
				v_row.appendChild(v_label);
				v_content.appendChild(v_row);
			}
			addCheckbox("perm_edit_admin", t("permissions.admin_option"), !!p_row.v_admin_option);
			addCheckbox("perm_edit_inherit", t("permissions.membership_inherit_label"), p_row.v_inherit !== false);
			addCheckbox("perm_edit_set", t("permissions.membership_set_label"), p_row.v_set !== false);

			appendSqlPreview(v_content, function () {
				return [{ url: "/grant_role_membership_postgresql/", body: requestBody() }];
			});
		},
		true,
		t("common.save"),
		t("permissions.edit_membership_options") + ": " + p_row.v_name,
		"fas node-all fa-users",
	);
}

/**
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_other_role
 * @param {"ancestor" | "descendant"} p_direction
 */
function confirmRevokeMembership(p_tag, p_col_state, p_other_role, p_direction) {
	showConfirm(
		t("permissions.confirm_revoke_membership", { role: p_other_role }),
		function () {
			var v_member = p_direction === "ancestor" ? p_col_state.role : p_other_role;
			var v_parent = p_direction === "ancestor" ? p_other_role : p_col_state.role;

			execAjax(
				"/revoke_role_membership_postgresql/",
				JSON.stringify({
					p_database_index: p_tag.connID,
					p_tab_id: p_tag.tabID,
					p_member: v_member,
					p_parent: v_parent,
				}),
				function () {
					if (p_direction === "ancestor") fetchAncestors(p_tag, p_col_state);
					else fetchDescendants(p_tag, p_col_state);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
	);
}

// --- column 4: database-scoped object privileges (shared helpers) --------

// One entry per object type column 4 supports. listEndpoint/nameField
// drive the "add privilege" dialog's object picker -- reusing the same
// listing endpoints the Database section's own tree already calls
// (get_schemas_postgresql/get_tables_postgresql/get_views_postgresql/
// get_sequences_postgresql/get_functions_postgresql/get_procedures_postgresql/
// get_mviews_postgresql/get_types_postgresql/get_domains_postgresql/
// get_foreign_data_wrappers_postgresql), plus one new one Fáze 8 added
// purely for this picker (get_all_foreign_servers_postgresql -- the tree's
// own get_foreign_servers_postgresql needs a specific FDW, which GRANT/
// REVOKE ON FOREIGN SERVER never does, see postgresqlAllForeignServers'
// comment on the Go side). For function/procedure, nameField is v_id (the
// routine's regprocedure identity string, e.g. "public.myfunc(integer)")
// rather than v_name, since that identity string doubles as the value the
// backend's verifyGrantableObject expects AND a display label that
// disambiguates overloads. privileges must match pgValidPrivilegesByObjectType
// (postgresql_permissions_objects.go) -- changing one without the other
// just makes the picker offer a privilege the backend then rejects. Does
// not include "database" -- that object type lives in
// PERMISSIONS_SERVER_OBJECT_TYPES below, since it (like tablespace) has no
// per-database scope at all. Foreign tables are the one remaining gap (see
// postgresql_permissions_objects.go's module comment).
var PERMISSIONS_DATABASE_OBJECT_TYPES = [
	{ value: "schema", folderLabelKey: "tree.schemas", labelKey: "permissions.object_type_schema", needsSchema: false, listEndpoint: "/get_schemas_postgresql/", nameField: "v_name", privileges: ["CREATE", "USAGE"] },
	{ value: "table", folderLabelKey: "tree.tables", bulkKind: "tables", labelKey: "permissions.object_type_table", needsSchema: true, listEndpoint: "/get_tables_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "view", folderLabelKey: "tree.views", labelKey: "permissions.object_type_view", needsSchema: true, listEndpoint: "/get_views_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "sequence", folderLabelKey: "tree.topic_sequences", bulkKind: "sequences", labelKey: "permissions.object_type_sequence", needsSchema: true, listEndpoint: "/get_sequences_postgresql/", nameField: "v_sequence_name", privileges: ["USAGE", "SELECT", "UPDATE"] },
	{ value: "function", folderLabelKey: "tree.functions", bulkKind: "functions", labelKey: "permissions.object_type_function", needsSchema: true, listEndpoint: "/get_functions_postgresql/", nameField: "v_id", privileges: ["EXECUTE"] },
	{ value: "procedure", folderLabelKey: "tree.topic_procedures", bulkKind: "procedures", labelKey: "permissions.object_type_procedure", needsSchema: true, listEndpoint: "/get_procedures_postgresql/", nameField: "v_id", privileges: ["EXECUTE"] },
	{ value: "materialized_view", folderLabelKey: "tree.topic_materialized_views", labelKey: "permissions.object_type_materialized_view", needsSchema: true, listEndpoint: "/get_mviews_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "type", folderLabelKey: "tree.topic_types", labelKey: "permissions.object_type_type", needsSchema: true, listEndpoint: "/get_types_postgresql/", nameField: "v_type_name", privileges: ["USAGE"] },
	{ value: "domain", folderLabelKey: "tree.topic_domains", labelKey: "permissions.object_type_domain", needsSchema: true, listEndpoint: "/get_domains_postgresql/", nameField: "v_domain_name", privileges: ["USAGE"] },
	{ value: "foreign_data_wrapper", folderLabelKey: "tree.topic_foreign_data_wrappers", labelKey: "permissions.object_type_foreign_data_wrapper", needsSchema: false, listEndpoint: "/get_foreign_data_wrappers_postgresql/", nameField: "v_name", privileges: ["USAGE"] },
	{ value: "foreign_server", folderLabelKey: "tree.foreign_servers", labelKey: "permissions.object_type_foreign_server", needsSchema: false, listEndpoint: "/get_all_foreign_servers_postgresql/", nameField: "v_name", privileges: ["USAGE"] },
];

// folderLabelKey above is the name of the type's *folder* in the objects tree
// -- the same (plural) text the Database section's own tree uses for that
// node -- while labelKey is the singular used by the type pickers.

// Mirrors pgSystemSchemaExcludeSQL (postgresql_permissions_objects.go): the
// object picker's own schema list must exclude the same noise the reverse-
// ACL query already hides, or picking "pg_catalog" here would let a user
// grant on an object the read side then never shows back to them.
var PERMISSIONS_SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/**
 * @param {string} p_name
 */
function isSystemSchemaName(p_name) {
	if (PERMISSIONS_SYSTEM_SCHEMAS.indexOf(p_name) !== -1) return true;
	return /^pg.*temp/.test(p_name);
}

// [item icon, item colour class, folder icon, folder colour class] per object
// type -- the exact same glyph + node-* colour class tree_postgresql.js gives
// that object (and its "Tables"/"Functions"/... folder) in the Database
// section's tree, so both trees look identical. Keep in sync with it.
var PERMISSIONS_OBJECT_ICONS = {
	database: ["fa-database", "node-database", "fa-database", "node-database-list"],
	tablespace: ["fa-folder", "node-tablespace", "fa-folder-open", "node-tablespace-list"],
	schema: ["fa-layer-group", "node-schema", "fa-layer-group", "node-schema-list"],
	table: ["fa-table", "node-table", "fa-th", "node-table-list"],
	view: ["fa-eye", "node-view", "fa-eye", "node-view-list"],
	// Only the descending variant is in this app's icon set (see
	// gen-icons.mjs's MAPPING) -- fa-sort-numeric-up isn't, and
	// silently rendered as a blank mask (a solid square).
	sequence: ["fa-sort-numeric-down", "node-sequence", "fa-sort-numeric-down", "node-sequence-list"],
	function: ["fa-cog", "node-function", "fa-cog", "node-function-list"],
	procedure: ["fa-cog", "node-procedure", "fa-cog", "node-procedure-list"],
	materialized_view: ["fa-eye", "node-mview", "fa-eye", "node-mview-list"],
	type: ["fa-square", "node-type", "fa-square", "node-type-list"],
	domain: ["fa-square", "node-domain", "fa-square", "node-domain-list"],
	foreign_data_wrapper: ["fa-cube", "node-fdw", "fa-cube", "node-fdw-list"],
	foreign_server: ["fa-server", "node-server", "fa-server", "node-server"],
	// Not an object type: the per-database "Owned objects" folder.
	owned_objects: ["fa-user", "node-all", "fa-user", "node-all"],
};

/**
 * Extra icon class marking a node that has no privilege of its own (drawn
 * grey, present only as the path to something below it) -- CSS then fades
 * its icon and italicises its label so it doesn't pass for a real grant.
 * @param {any} p_grant
 */
function dimClass(p_grant) {
	return p_grant.v_privileges.length > 0 ? "" : " omnidb__permissions__node-dim";
}

/**
 * showConfirm with the fixed-width "form" dialog sizing -- every form-like
 * dialog in this file (add membership, grant/edit privileges, role
 * attributes, ...) goes through here so they all share one width.
 * @param {string} p_info
 * @param {(() => void)|null} p_func_yes
 * @param {(() => void)|null} p_func_no
 * @param {(() => void)|null} [p_shown_callback]
 * @param {boolean|null} [_p_large] ignored, kept so call sites read like showConfirm's
 * @param {string|null} [p_yes_label]
 * @param {string|null} [p_title] shown in the dialog header, with p_title_icon before it
 * @param {string|null} [p_title_icon]
 */
function showFormDialog(p_info, p_func_yes, p_func_no, p_shown_callback, _p_large, p_yes_label, p_title, p_title_icon) {
	showConfirm(
		p_info,
		p_func_yes,
		p_func_no,
		function () {
			if (p_title) setMessageModalTitle(p_title, p_title_icon);
			if (p_shown_callback) p_shown_callback();
		},
		"form",
		p_yes_label,
	);
}

// Drag-to-resize for the three columns: the width range each may take, and
// the default every column starts at (see .omnidb__permissions__column). The
// objects column is a tree and can usefully get much wider than the others.
var PERMISSIONS_COLUMN_LIMITS = {
	roles: { min: 200, max: 600 },
	detail: { min: 220, max: 600 },
	objects: { min: 240, max: 1400 },
};
var PERMISSIONS_COLUMN_DEFAULT_WIDTH = 300;
var PERMISSIONS_COLUMN_STORAGE_PREFIX = "omnidb.permissions.columnWidth.";

/**
 * @param {HTMLElement} p_column
 * @param {number | null} p_width null = back to the stylesheet's width
 */
function setColumnWidth(p_column, p_width) {
	p_column.style.width = p_width === null ? "" : p_width + "px";
	p_column.style.flexBasis = p_width === null ? "" : p_width + "px";
}

/**
 * Makes a column resizable with the mouse: a thin handle on its right edge,
 * clamped to PERMISSIONS_COLUMN_LIMITS[p_key], the width remembered across
 * role switches (columns 2 and 3 are rebuilt each time) and page loads, and a
 * double-click resets it. Call it once the column's content is built.
 * @param {HTMLElement} p_column
 * @param {"roles" | "detail" | "objects"} p_key
 */
function attachColumnResizer(p_column, p_key) {
	var v_limits = PERMISSIONS_COLUMN_LIMITS[p_key];
	var v_storage_key = PERMISSIONS_COLUMN_STORAGE_PREFIX + p_key;

	/** @param {number} p_width */
	function clamp(p_width) {
		return Math.max(v_limits.min, Math.min(v_limits.max, Math.round(p_width)));
	}

	try {
		var v_stored = Number(localStorage.getItem(v_storage_key));
		if (v_stored > 0) setColumnWidth(p_column, clamp(v_stored));
	} catch (e) {
		// storage unavailable -- start at the default width
	}

	var v_handle = document.createElement("div");
	v_handle.className = "omnidb__permissions__column-resizer";
	v_handle.title = t("permissions.resize_column_hint");
	p_column.appendChild(v_handle);

	v_handle.addEventListener("pointerdown", function (p_event) {
		p_event.preventDefault();
		var v_start_x = p_event.clientX;
		var v_start_width = p_column.getBoundingClientRect().width;
		v_handle.setPointerCapture(p_event.pointerId);
		v_handle.classList.add("omnidb__permissions__column-resizer--active");
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		/** @param {PointerEvent} p_move */
		function onMove(p_move) {
			setColumnWidth(p_column, clamp(v_start_width + p_move.clientX - v_start_x));
		}
		function onUp() {
			v_handle.removeEventListener("pointermove", onMove);
			v_handle.removeEventListener("pointerup", onUp);
			v_handle.removeEventListener("pointercancel", onUp);
			v_handle.classList.remove("omnidb__permissions__column-resizer--active");
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			try {
				localStorage.setItem(v_storage_key, String(Math.round(p_column.getBoundingClientRect().width)));
			} catch (e) {
				// not remembered -- the width still applies until the page is left
			}
		}
		v_handle.addEventListener("pointermove", onMove);
		v_handle.addEventListener("pointerup", onUp);
		v_handle.addEventListener("pointercancel", onUp);
	});

	v_handle.addEventListener("dblclick", function () {
		setColumnWidth(p_column, null);
		try {
			localStorage.removeItem(v_storage_key);
		} catch (e) {
			// nothing stored to remove
		}
	});
}

/**
 * Copies p_text to the clipboard without any notification (the caller shows
 * its own "copied" feedback).
 * @param {string} p_text
 */
function copyTextQuietly(p_text) {
	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard.writeText(p_text).catch(function () {});
		return;
	}
	var v_area = document.createElement("textarea");
	v_area.style.position = "fixed";
	v_area.style.opacity = "0";
	document.body.appendChild(v_area);
	v_area.value = p_text;
	v_area.select();
	try {
		document.execCommand("copy");
	} catch (e) {
		// nothing to do -- the text stays visible for manual copying
	}
	document.body.removeChild(v_area);
}

/**
 * Appends a collapsible "SQL" section to a form dialog: when opened it asks
 * the backend (every Permissions endpoint accepts p_preview) for the exact
 * statements the dialog's current values would run -- built by the same
 * code as the real call, nothing executed -- and keeps them up to date as
 * the form changes. The statements are copyable.
 * @param {HTMLElement} p_content the dialog's content element
 * @param {() => Array<{url: string, body: Object}> | null} p_get_requests the requests the dialog would send, in order; null while the form is incomplete, [] when nothing would change
 */
function appendSqlPreview(p_content, p_get_requests) {
	var v_wrap = document.createElement("div");
	v_wrap.className = "omnidb__permissions__sql-preview";

	var v_toggle = document.createElement("button");
	v_toggle.type = "button";
	v_toggle.className = "btn btn-sm btn-outline-secondary";
	v_toggle.textContent = t("permissions.show_sql");
	v_wrap.appendChild(v_toggle);

	var v_box = document.createElement("div");
	v_box.style.display = "none";
	var v_pre = document.createElement("pre");
	v_pre.className = "omnidb__permissions__sql-preview-text";
	v_box.appendChild(v_pre);
	var v_copy = document.createElement("button");
	v_copy.type = "button";
	v_copy.className = "btn btn-sm btn-outline-secondary";
	v_copy.textContent = t("permissions.copy_sql");
	v_box.appendChild(v_copy);
	v_wrap.appendChild(v_box);

	var v_token = 0;
	var v_ready = false;
	var v_timer = 0;

	function refresh() {
		if (!v_wrap.isConnected) return;
		var v_requests = p_get_requests();
		v_ready = false;
		if (v_requests === null) {
			v_pre.textContent = t("permissions.sql_incomplete");
			return;
		}
		if (v_requests.length === 0) {
			v_pre.textContent = t("permissions.sql_no_changes");
			return;
		}
		var v_mine = ++v_token;
		/** @type {string[]} */
		var v_parts = [];
		runSequentially(
			v_requests.map(function (p_request) {
				return function (p_done) {
					execAjax(
						p_request.url,
						JSON.stringify(Object.assign({}, p_request.body, { p_preview: true })),
						function (p_return) {
							v_parts.push(p_return.v_data.v_sql);
							p_done();
						},
						function (p_return) {
							v_parts.push("-- " + (p_return.v_data.message || p_return.v_data));
							p_done();
						},
						"box",
						false,
					);
				};
			}),
			function () {
				if (v_mine !== v_token) return;
				v_pre.textContent = v_parts.join("\n");
				v_ready = true;
			},
		);
	}

	// The dialog's content element is reused by every modal, so these
	// listeners outlive this dialog unless removed -- once the wrapper has
	// left the DOM they unhook themselves instead of running a stale form's
	// collector against elements that no longer exist.
	function scheduleRefresh() {
		if (!v_wrap.isConnected) {
			p_content.removeEventListener("input", scheduleRefresh);
			p_content.removeEventListener("change", scheduleRefresh);
			v_observer.disconnect();
			return;
		}
		if (v_box.style.display === "none") return;
		clearTimeout(v_timer);
		v_timer = window.setTimeout(refresh, 250);
	}

	v_toggle.addEventListener("click", function () {
		var v_open = v_box.style.display === "none";
		v_box.style.display = v_open ? "" : "none";
		v_toggle.textContent = t(v_open ? "permissions.hide_sql" : "permissions.show_sql");
		if (v_open) refresh();
	});
	v_copy.addEventListener("click", function () {
		if (!v_ready) return;
		copyTextQuietly(v_pre.textContent || "");
		v_copy.textContent = t("permissions.sql_copied");
		window.setTimeout(function () {
			v_copy.textContent = t("permissions.copy_sql");
		}, 1500);
	});

	p_content.addEventListener("input", scheduleRefresh);
	p_content.addEventListener("change", scheduleRefresh);
	// Dynamic dialogs rebuild parts of their form after async fetches, and
	// the role picker changes selection without any input event.
	var v_observer = new MutationObserver(function (p_mutations) {
		var v_outside = p_mutations.some(function (p_mutation) {
			return !v_wrap.contains(p_mutation.target);
		});
		if (v_outside) scheduleRefresh();
	});
	v_observer.observe(p_content, { childList: true, subtree: true });

	p_content.appendChild(v_wrap);
}

/**
 * An object's name for a dialog header. A routine's identity carries its
 * argument types ("public.f(integer, text)"), which makes the header too long
 * to fit, so those are cut off; every other type is shown as is.
 * @param {string} p_type
 * @param {string} p_label
 */
function dialogObjectLabel(p_type, p_label) {
	if (p_type !== "function" && p_type !== "procedure") return p_label;
	var v_paren = p_label.indexOf("(");
	return v_paren > 0 ? p_label.substring(0, v_paren) : p_label;
}

/**
 * Full icon class string for one object of p_type, or -- with p_folder --
 * for the folder that groups objects of that type.
 * @param {string} p_type
 * @param {boolean} [p_folder]
 */
function objectTypeIcon(p_type, p_folder) {
	var v_icons = /** @type {Object<string, string[]>} */ (PERMISSIONS_OBJECT_ICONS)[p_type];
	if (!v_icons) return "fas node-all fa-key";
	return p_folder ? "fas node-all " + v_icons[2] + " " + v_icons[3] : "fas node-all " + v_icons[0] + " " + v_icons[1];
}

/**
 * The GRANT/REVOKE-object-privilege backend takes the routine's own
 * regprocedure identity for function/procedure (verifyGrantableObject in
 * postgresql_permissions_objects.go), not the bare object name a grant row
 * otherwise carries -- v_identifier already *is* that identity for those
 * two types (see pgDatabaseObjectGrantsSQL, postgresql_permissions_
 * effective.go), so this is the one place that has to pick identifier over
 * object_name depending on type.
 * @param {any} p_grant
 */
function objectParamForGrant(p_grant) {
	if (p_grant.v_object_type === "function" || p_grant.v_object_type === "procedure") return p_grant.v_identifier;
	return p_grant.v_object_name;
}

/**
 * @param {HTMLElement} p_container
 * @param {string} p_id
 * @param {string} p_label_text
 */
function buildSelectField(p_container, p_id, p_label_text) {
	var v_col = document.createElement("div");
	v_col.className = "col-md-12 mb-3";
	var v_label = document.createElement("label");
	v_label.setAttribute("for", p_id);
	v_label.textContent = p_label_text;
	var v_select = document.createElement("select");
	v_select.id = p_id;
	v_select.className = "form-control";
	v_col.appendChild(v_label);
	v_col.appendChild(v_select);
	p_container.appendChild(v_col);
	return { col: v_col, select: v_select };
}

/**
 * @param {HTMLSelectElement} p_select
 * @param {Array<{value: string, label: string}>} p_items
 */
function populateSelectOptions(p_select, p_items) {
	p_select.innerHTML = "";
	for (var i = 0; i < p_items.length; i++) {
		var v_option = document.createElement("option");
		v_option.value = p_items[i].value;
		v_option.textContent = p_items[i].label;
		p_select.appendChild(v_option);
	}
}

/**
 * Fetches (and caches for the lifetime of this column) the non-system
 * schema list, used both as the "Schema" object type's own picker and as
 * the schema selector every other schema-scoped type needs.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string | undefined} p_database optional -- see pgSchemaRequest's
 * comment on the Go side (postgresql_handlers.go). Column 4's "+" dialog
 * (its only caller) always passes its own picked database and skips the
 * cache, since that pick can change between dialog opens; omitting it
 * would fall back to the tab's own active database and cache on
 * p_col_state instead, for a hypothetical caller that doesn't have that
 * concern.
 * @param {(schemas: Array<{value: string, label: string}>) => void} p_callback
 */
function fetchSchemasForPicker(p_tag, p_col_state, p_database, p_callback) {
	if (!p_database && p_col_state.schemasCache) {
		p_callback(p_col_state.schemasCache);
		return;
	}
	var v_body = { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID };
	if (p_database) v_body.p_database = p_database;
	execAjax(
		"/get_schemas_postgresql/",
		JSON.stringify(v_body),
		function (p_return) {
			var v_schemas = p_return.v_data
				.filter(function (p_schema) {
					return !isSystemSchemaName(p_schema.v_name);
				})
				.map(function (p_schema) {
					return { value: p_schema.v_name, label: p_schema.v_name };
				});
			if (!p_database) p_col_state.schemasCache = v_schemas;
			p_callback(v_schemas);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {any} p_spec one of PERMISSIONS_DATABASE_OBJECT_TYPES / PERMISSIONS_SERVER_OBJECT_TYPES
 * @param {string} p_schema
 * @param {string | undefined} p_database optional -- see fetchSchemasForPicker's comment
 * @param {(objects: Array<{value: string, label: string}>) => void} p_callback
 */
function fetchObjectsForPicker(p_tag, p_spec, p_schema, p_database, p_callback) {
	var v_body = { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID };
	if (p_spec.needsSchema) v_body.p_schema = p_schema;
	if (p_database) v_body.p_database = p_database;
	execAjax(
		p_spec.listEndpoint,
		JSON.stringify(v_body),
		function (p_return) {
			var v_items = p_return.v_data.map(function (p_object) {
				return { value: p_object[p_spec.nameField], label: p_object[p_spec.nameField] };
			});
			p_callback(v_items);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * The privilege checkboxes shared by every "+" style grant dialog in this
 * file (used to be duplicated between the database-scoped dialog and
 * column 3's own hand-rolled add dialog before Phase 9 merged them into one).
 * @param {HTMLElement} p_container
 * @param {any} p_spec one of PERMISSIONS_ALL_OBJECT_TYPES
 */
function appendPrivilegeCheckboxes(p_container, p_spec) {
	var v_priv_wrapper = document.createElement("div");
	v_priv_wrapper.className = "mb-2";
	var v_priv_title = document.createElement("label");
	v_priv_title.textContent = t("permissions.privileges_label");
	v_priv_wrapper.appendChild(v_priv_title);
	for (var i = 0; i < p_spec.privileges.length; i++) {
		var v_row = document.createElement("div");
		v_row.className = "form-check";
		var v_input = document.createElement("input");
		v_input.type = "checkbox";
		v_input.className = "form-check-input perm_grant_privilege_checkbox";
		v_input.value = p_spec.privileges[i];
		v_input.id = "perm_grant_priv_" + p_spec.privileges[i];
		var v_label = document.createElement("label");
		v_label.className = "form-check-label";
		v_label.setAttribute("for", v_input.id);
		v_label.textContent = p_spec.privileges[i];
		v_row.appendChild(v_input);
		v_row.appendChild(v_label);
		v_priv_wrapper.appendChild(v_row);
	}
	p_container.appendChild(v_priv_wrapper);
}

/**
 * (Re)builds the object-type-dependent half of openGrantObjectPrivilegeDialogGeneric's
 * dialog: for a database-scoped type (objectTypeNeedsDatabase), a database
 * selector first -- everything below it (schema, if that type needs one,
 * feeding an object selector, plus the privilege checkboxes) is rebuilt
 * under v_rest_container whenever that pick changes, since the schema/object
 * lists are per-database. A type with no database scope (database/
 * tablespace themselves) skips straight to the object selector.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {HTMLElement} p_dynamic
 * @param {string} p_type_value
 * @param {Array<any>} p_type_list
 */
function renderGrantObjectTypeFields(p_tag, p_col_state, p_dynamic, p_type_value, p_type_list) {
	var v_spec = p_type_list.filter(function (p_type) {
		return p_type.value === p_type_value;
	})[0];
	p_dynamic.innerHTML = "";

	function renderRest(p_container, p_database) {
		if (v_spec.needsSchema) {
			var v_schema_field = buildSelectField(p_container, "perm_grant_object_schema", t("permissions.schema_label"));

			// Bulk scope: GRANT/REVOKE ... ON ALL <kind> IN SCHEMA, for the
			// types Postgres has that grammar for.
			/** @type {{col: HTMLElement, select: HTMLSelectElement} | null} */
			var v_scope_field = null;
			/** @type {HTMLElement | null} */
			var v_bulk_hint = null;
			/** @type {{col: HTMLElement, select: HTMLSelectElement} | null} */
			var v_action_field = null;
			if (v_spec.bulkKind) {
				v_scope_field = buildSelectField(p_container, "perm_grant_scope", t("permissions.scope_label"));
				populateSelectOptions(v_scope_field.select, [
					{ value: "single", label: t("permissions.scope_single") },
					{ value: "all", label: t("permissions.scope_all_" + v_spec.bulkKind) },
				]);
				v_action_field = buildSelectField(p_container, "perm_grant_action", t("permissions.action_label"));
				populateSelectOptions(v_action_field.select, [
					{ value: "grant", label: t("permissions.action_grant") },
					{ value: "revoke", label: t("permissions.action_revoke") },
				]);
				v_action_field.col.style.display = "none";
				v_bulk_hint = document.createElement("div");
				v_bulk_hint.className = "omnidb__permissions__row-suffix mb-3";
				v_bulk_hint.textContent = t("permissions.scope_all_hint");
				v_bulk_hint.style.display = "none";
				p_container.appendChild(v_bulk_hint);
			}

			fetchSchemasForPicker(p_tag, p_col_state, p_database, function (p_schemas) {
				populateSelectOptions(v_schema_field.select, p_schemas);

				var v_object_field = buildSelectField(p_container, "perm_grant_object_name", t("permissions.object_label"));
				if (v_scope_field) {
					var v_scope_select = v_scope_field.select;
					var v_applyScope = function () {
						var v_all = v_scope_select.value === "all";
						v_object_field.col.style.display = v_all ? "none" : "";
						if (v_action_field) v_action_field.col.style.display = v_all ? "" : "none";
						if (v_bulk_hint) v_bulk_hint.style.display = v_all ? "" : "none";
					};
					v_scope_select.addEventListener("change", v_applyScope);
					v_applyScope();
				}
				var v_loadObjects = function () {
					fetchObjectsForPicker(p_tag, v_spec, v_schema_field.select.value, p_database, function (p_objects) {
						populateSelectOptions(v_object_field.select, p_objects);
					});
				};
				v_schema_field.select.addEventListener("change", v_loadObjects);
				v_loadObjects();
			});
		} else {
			var v_object_field2 = buildSelectField(p_container, "perm_grant_object_name", t("permissions.object_label"));
			fetchObjectsForPicker(p_tag, v_spec, "", p_database, function (p_objects) {
				populateSelectOptions(v_object_field2.select, p_objects);
			});
		}
		appendPrivilegeCheckboxes(p_container, v_spec);
	}

	if (objectTypeNeedsDatabase(p_type_value)) {
		var v_db_field = buildSelectField(p_dynamic, "perm_grant_object_database", t("permissions.database_label"));
		var v_rest_container = document.createElement("div");
		p_dynamic.appendChild(v_rest_container);

		fetchAllDatabases(p_tag, function (p_databases) {
			populateSelectOptions(
				v_db_field.select,
				p_databases.map(function (p_db) {
					return { value: p_db.v_name, label: stripPgIdentQuotes(p_db.v_name) };
				}),
			);
			var v_default = p_databases
				.map(function (p_db) {
					return p_db.v_name;
				})
				.filter(function (p_name) {
					return stripPgIdentQuotes(p_name) === p_tag.currentDatabase;
				})[0];
			if (v_default) v_db_field.select.value = v_default;

			function rebuildRest() {
				v_rest_container.innerHTML = "";
				renderRest(v_rest_container, v_db_field.select.value);
			}
			v_db_field.select.addEventListener("change", rebuildRest);
			rebuildRest();
		});
	} else {
		renderRest(p_dynamic, undefined);
	}
}

/**
 * The "+" dialog behind the objects column's own footer button
 * (openAddObjectPrivilegeDialog) -- pick a type (database/tablespace or any
 * database-scoped one, PERMISSIONS_ALL_OBJECT_TYPES), then a database (for
 * the types that need one, see renderGrantObjectTypeFields) and an object
 * (with a schema step first for the types that need one), then check which
 * privileges to grant directly to p_role_name. p_on_granted gets back
 * whichever database/type/object ended up granted, so the caller can
 * refresh just the affected slice of the tree (see openAddObjectPrivilegeDialog).
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_role_name
 * @param {Array<any>} p_type_list
 * @param {string} p_title
 * @param {(database: string | undefined, objectType: string, identifier: string) => void} p_on_granted
 */
function openGrantObjectPrivilegeDialogGeneric(p_tag, p_col_state, p_role_name, p_type_list, p_title, p_on_granted) {
	/**
	 * Reads the form into the one request it amounts to (a single-object
	 * grant, or a bulk grant/revoke over a whole schema) -- shared by Save
	 * and the SQL preview. `error` is the hint to show when the form is
	 * incomplete.
	 * @returns {{error: string} | {error: null, url: string, body: any, database: string | undefined, type: string, object: string}}
	 */
	function collect() {
		var v_type = /** @type {HTMLSelectElement} */ (document.getElementById("perm_grant_object_type")).value;
		var v_database_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_object_database"));
		var v_schema_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_object_schema"));
		var v_object_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_object_name"));
		var v_scope_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_scope"));
		var v_action_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_action"));
		var v_grantable = /** @type {HTMLInputElement} */ (document.getElementById("perm_grant_object_grantable")).checked;
		var v_bulk = !!v_scope_select && v_scope_select.value === "all";

		var v_spec = p_type_list.filter(function (p_type) {
			return p_type.value === v_type;
		})[0];
		var v_schema = v_schema_select ? v_schema_select.value : "";
		var v_object = v_object_select ? v_object_select.value : "";
		if (v_bulk ? !v_schema : !v_object) return { error: t(v_bulk ? "permissions.select_schema_hint" : "permissions.select_object_hint") };

		var v_privileges = [];
		var v_checkboxes = document.querySelectorAll(".perm_grant_privilege_checkbox:checked");
		for (var i = 0; i < v_checkboxes.length; i++) v_privileges.push(/** @type {HTMLInputElement} */ (v_checkboxes[i]).value);
		if (v_privileges.length === 0) return { error: t("permissions.select_privilege_hint") };

		var v_database = v_database_select ? v_database_select.value : undefined;

		/** @type {any} */
		var v_body = { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name, p_privileges: v_privileges, p_grantable: v_grantable };
		var v_url;
		if (v_bulk) {
			v_url = "/bulk_object_privilege_postgresql/";
			v_body.p_kind = v_spec.bulkKind;
			v_body.p_schema = v_schema;
			v_body.p_revoke = !!v_action_select && v_action_select.value === "revoke";
		} else {
			v_url = "/grant_object_privilege_postgresql/";
			v_body.p_object_type = v_type;
			v_body.p_schema = v_schema;
			v_body.p_object = v_object;
		}
		if (v_database) v_body.p_database = v_database;
		return { error: null, url: v_url, body: v_body, database: v_database, type: v_type, object: v_bulk ? v_schema : v_object };
	}

	showFormDialog(
		"",
		function () {
			var v_request = collect();
			if (v_request.error !== null) {
				showAlert(v_request.error);
				return;
			}
			var v_done = v_request;

			execAjax(
				v_done.url,
				JSON.stringify(v_done.body),
				function () {
					p_on_granted(v_done.database, v_done.type, v_done.object);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_type_field = buildSelectField(v_content, "perm_grant_object_type", t("permissions.object_type_label"));
			populateSelectOptions(
				v_type_field.select,
				p_type_list.map(function (p_type) {
					return { value: p_type.value, label: t(p_type.labelKey) };
				}),
			);

			var v_dynamic = document.createElement("div");
			v_dynamic.id = "perm_grant_object_dynamic";
			v_content.appendChild(v_dynamic);

			var v_grantable_row = document.createElement("div");
			v_grantable_row.className = "form-check mb-2";
			var v_grantable_input = document.createElement("input");
			v_grantable_input.type = "checkbox";
			v_grantable_input.className = "form-check-input";
			v_grantable_input.id = "perm_grant_object_grantable";
			var v_grantable_label = document.createElement("label");
			v_grantable_label.className = "form-check-label";
			v_grantable_label.setAttribute("for", "perm_grant_object_grantable");
			v_grantable_label.textContent = t("permissions.with_grant_option");
			v_grantable_row.appendChild(v_grantable_input);
			v_grantable_row.appendChild(v_grantable_label);
			v_content.appendChild(v_grantable_row);

			v_type_field.select.addEventListener("change", function () {
				renderGrantObjectTypeFields(p_tag, p_col_state, v_dynamic, v_type_field.select.value, p_type_list);
			});
			renderGrantObjectTypeFields(p_tag, p_col_state, v_dynamic, v_type_field.select.value, p_type_list);

			appendSqlPreview(v_content, function () {
				var v_request = collect();
				return v_request.error !== null ? null : [{ url: v_request.url, body: v_request.body }];
			});
		},
		true,
		t("common.save"),
		p_title,
		"fas node-all fa-key",
	);
}

// --- unified objects column: server + database-scoped object privileges --

// The only two object types with no per-database scope (see
// postgresql_permissions_effective.go's module comment) -- shares
// PERMISSIONS_DATABASE_OBJECT_TYPES' shape (listEndpoint/nameField feed
// fetchObjectsForPicker the same way) but is its own array since "database"
// belongs here, not there (it has no per-database scope either -- see
// PERMISSIONS_DATABASE_OBJECT_TYPES' own comment for why it's left out of
// that one). Neither of these two needs a schema step.
var PERMISSIONS_SERVER_OBJECT_TYPES = [
	{
		value: "database",
		labelKey: "permissions.object_type_database",
		needsSchema: false,
		listEndpoint: "/get_databases_postgresql/",
		nameField: "v_name",
		privileges: ["CREATE", "CONNECT", "TEMPORARY"],
	},
	{
		value: "tablespace",
		labelKey: "permissions.object_type_tablespace",
		needsSchema: false,
		listEndpoint: "/get_tablespaces_postgresql/",
		nameField: "v_name",
		privileges: ["CREATE"],
	},
];

// Every object type the "+" dialog's own type picker offers -- see this
// file's Phase 9 module comment. Must be assembled after both source arrays
// above (var initializers run top-to-bottom, unlike function declarations).
var PERMISSIONS_ALL_OBJECT_TYPES = PERMISSIONS_SERVER_OBJECT_TYPES.concat(PERMISSIONS_DATABASE_OBJECT_TYPES);

/**
 * Whether p_type_value needs a database picked before its own schema/object
 * lookups can run -- everything in PERMISSIONS_DATABASE_OBJECT_TYPES (schema
 * itself included), never PERMISSIONS_SERVER_OBJECT_TYPES.
 * @param {string} p_type_value
 */
function objectTypeNeedsDatabase(p_type_value) {
	return PERMISSIONS_DATABASE_OBJECT_TYPES.some(function (p_type) {
		return p_type.value === p_type_value;
	});
}

/**
 * @param {any} p_tag
 */
function closeObjectsColumn(p_tag) {
	if (p_tag.objectsColumn) p_tag.objectsColumn.columnDiv.remove();
	p_tag.objectsColumn = null;
}

/**
 * (Re)builds the merged objects column for whichever role is now focused in
 * column 1 -- see this file's module comment (Phase 9) for the tree shape
 * and the direct-vs-none-at-all coloring rule (effectiveGrantHasDirectPrivilege
 * and the old column 3/4 split are both gone).
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function renderObjectsColumn(p_tag, p_role_name) {
	closeObjectsColumn(p_tag);

	var v_column = document.createElement("div");
	v_column.className = "omnidb__permissions__column";

	var v_section = buildColumnSection(v_column, t("permissions.objects_column_title", { role: p_role_name }), {
		addTitle: t("permissions.add_object_privilege"),
		showAdd: true,
		showRemove: false,
	});

	attachColumnResizer(v_column, "objects");
	p_tag.columnsDiv.appendChild(v_column);

	// Name filter for the databases/tablespaces below; its text survives
	// switching roles (p_tag.objectsFilter), since the tree is rebuilt then.
	var v_filter = document.createElement("div");
	v_filter.className = "omnidb__permissions__filter";
	var v_filter_input = document.createElement("input");
	v_filter_input.type = "text";
	v_filter_input.className = "form-control form-control-sm";
	v_filter_input.placeholder = t("permissions.filter_databases_placeholder");
	v_filter_input.value = p_tag.objectsFilter || "";
	v_filter.appendChild(v_filter_input);
	v_section.headerDiv.insertAdjacentElement("afterend", v_filter);

	/** @type {any} */
	var v_col_state = {
		role: p_role_name,
		columnDiv: v_column,
		listDiv: v_section.listDiv,
		addBtn: v_section.addBtn,
		tree: null,
		// identifier -> { node, loaded } -- loaded flips true once that
		// database's own schema/object grants have been fetched at least
		// once (see fetchDatabaseObjectsForNode); a database/tablespace
		// grant edit that doesn't touch a database's own subtree never
		// resets it, so an already-expanded subtree stays put (see
		// refreshServerLevelGrant).
		databaseNodes: {},
		tablespaceNodes: {},
	};
	p_tag.objectsColumn = v_col_state;

	v_filter_input.addEventListener("input", function () {
		p_tag.objectsFilter = v_filter_input.value.trim();
		applyObjectsFilter(p_tag, v_col_state);
	});

	v_col_state.addBtn.addEventListener("click", function () {
		openAddObjectPrivilegeDialog(p_tag, v_col_state);
	});

	fetchObjectsColumnData(p_tag, v_col_state);
}

/**
 * Hides the database and tablespace nodes whose name does not contain the
 * filter text (case-insensitive); everything below a visible node is left
 * as it is. A no-op until the tree has been drawn.
 * @param {any} p_tag
 * @param {any} p_col_state
 */
function applyObjectsFilter(p_tag, p_col_state) {
	var v_text = (p_tag.objectsFilter || "").toLowerCase();
	/** @param {Object<string, any>} p_nodes */
	function apply(p_nodes) {
		Object.keys(p_nodes).forEach(function (p_name) {
			var v_li = p_nodes[p_name].node && p_nodes[p_name].node.elementLi;
			if (!v_li) return;
			var v_match = v_text === "" || stripPgIdentQuotes(p_name).toLowerCase().indexOf(v_text) !== -1;
			v_li.style.display = v_match ? "" : "none";
		});
	}
	apply(p_col_state.databaseNodes);
	apply(p_col_state.tablespaceNodes);
}

/**
 * Joins the three lists renderObjectsTree needs: the focused role's
 * effective privileges on every database/tablespace (postgresqlEffective
 * ObjectGrants, same endpoint column 3 used to call alone), plus *every*
 * database and tablespace that exists on the server -- not just ones the
 * role already has a grant on, so the "Databases"/"Tablespaces" groups list
 * everything the same way the Database section's own tree does (see this
 * file's Phase 9 module comment), with privilege-less entries synthesized
 * in grey rather than left out.
 * @param {any} p_tag
 * @param {any} p_col_state
 */
function fetchObjectsColumnData(p_tag, p_col_state) {
	/** @type {Array<any> | null} */
	var v_server_grants = null;
	/** @type {Array<any> | null} */
	var v_databases = null;
	/** @type {Array<any> | null} */
	var v_tablespaces = null;
	var v_pending = 3;
	var v_errored = false;

	function onSuccess() {
		v_pending--;
		if (v_pending === 0 && !v_errored) {
			renderObjectsTree(p_tag, p_col_state, /** @type {any} */ (v_server_grants), /** @type {any} */ (v_databases), /** @type {any} */ (v_tablespaces));
		}
	}

	// Guards against all three requests independently hitting the same
	// password_timeout at once and stacking three password prompts -- the
	// first one's retry re-does the whole join anyway.
	function onError(p_return) {
		if (v_errored) return;
		v_errored = true;
		if (p_return.v_data.password_timeout) {
			showPasswordPrompt(
				p_tag.connID,
				function () {
					fetchObjectsColumnData(p_tag, p_col_state);
				},
				null,
				p_return.v_data.message,
			);
		} else {
			showError(p_return.v_data);
		}
	}

	execAjax(
		"/get_role_server_grants_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role }),
		function (p_return) {
			v_server_grants = p_return.v_data;
			onSuccess();
		},
		onError,
		"box",
		true,
	);
	fetchAllDatabases(
		p_tag,
		function (p_data) {
			v_databases = p_data;
			onSuccess();
		},
		onError,
	);
	fetchAllTablespaces(
		p_tag,
		function (p_data) {
			v_tablespaces = p_data;
			onSuccess();
		},
		onError,
	);
}

/**
 * @param {any} p_tag
 * @param {(databases: Array<{v_name: string}>) => void} p_callback
 * @param {((p_return: any) => void) | undefined} [p_on_error] defaults to a plain showAlert -- fetchObjectsColumnData passes its own to fold in password-retry handling.
 */
function fetchAllDatabases(p_tag, p_callback, p_on_error) {
	execAjax(
		"/get_databases_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID }),
		function (p_return) {
			p_callback(p_return.v_data);
		},
		p_on_error ||
			function (p_return) {
				showAlert(p_return.v_data.message || p_return.v_data);
			},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {(tablespaces: Array<{v_name: string}>) => void} p_callback
 * @param {((p_return: any) => void) | undefined} [p_on_error]
 */
function fetchAllTablespaces(p_tag, p_callback, p_on_error) {
	execAjax(
		"/get_tablespaces_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID }),
		function (p_return) {
			p_callback(p_return.v_data);
		},
		p_on_error ||
			function (p_return) {
				showAlert(p_return.v_data.message || p_return.v_data);
			},
		"box",
		true,
	);
}

/**
 * A quoted PostgreSQL identifier's own raw name, so it can be compared
 * against tag.currentDatabase (always unquoted, since it comes straight from
 * the connection's own config/tree, never through quote_ident()) -- strips
 * one layer of surrounding double quotes and un-doubles any escaped quote
 * inside, same as PostgreSQL's own identifier-quoting rules.
 * @param {string} p_quoted_ident
 */
function stripPgIdentQuotes(p_quoted_ident) {
	if (p_quoted_ident.length >= 2 && p_quoted_ident.charAt(0) === '"' && p_quoted_ident.charAt(p_quoted_ident.length - 1) === '"') {
		return p_quoted_ident.slice(1, -1).replace(/""/g, '"');
	}
	return p_quoted_ident;
}

/**
 * @param {{v_grantee: string}[] | undefined} p_sources
 * @param {string} p_role_name
 */
function effectivePrivilegeIsDirect(p_sources, p_role_name) {
	if (!p_sources) return false;
	for (var i = 0; i < p_sources.length; i++) {
		if (p_sources[i].v_grantee === p_role_name) return true;
	}
	return false;
}

/**
 * A postgresqlEffectiveObjectGrants-shaped stand-in for an object the
 * focused role has no privilege on at all -- used for a tree node that's
 * shown anyway (a database/tablespace, since every one on the server is now
 * listed regardless of privilege, or a schema that only exists to group
 * grant-bearing children -- see this file's Phase 9 module comment) so it
 * can still open the same edit-privileges dialog as a real grant.
 * openEffectiveObjectDetailDialog already renders every privilege as an
 * unchecked, enabled checkbox for an empty v_privileges array -- checking
 * one there is exactly how the first grant on a previously privilege-less
 * object gets made -- so this needs no special-casing on the dialog side. A
 * real grant from the backend always has at least one privilege (that's the
 * only reason aclexplode would have returned it at all), so
 * v_privileges.length > 0 doubles as "is this a real grant" wherever a node
 * needs to tell the two apart (its own color, mainly).
 * @param {string} p_object_type
 * @param {string} p_schema
 * @param {string} p_object_name
 * @param {string} p_identifier
 */
function emptyGrantFor(p_object_type, p_schema, p_object_name, p_identifier) {
	return { v_object_type: p_object_type, v_schema: p_schema, v_object_name: p_object_name, v_identifier: p_identifier, v_privileges: [] };
}

/**
 * Sets a tree node's own grant, in place -- used both when building the tree
 * the first time and when refreshing just one node after an edit
 * (refreshServerLevelGrant), rather than tearing down and rebuilding
 * whatever part of the tree that node lives in. Every node gets the same
 * "Edit Privileges" context menu now, whether p_grant is real or a
 * emptyGrantFor stand-in (see that function's comment for why) -- grey vs.
 * black is p_grant.v_privileges.length alone. p_extra_tag is merged
 * alongside { grant: p_grant } into the node's own tag -- callers that need
 * to find their way back to a particular database (the lazy-expand hook,
 * the context menu's own p_database lookup) keep that on the tag across a
 * grant refresh this way.
 * @param {any} p_node
 * @param {any} p_grant
 * @param {Record<string, any>} [p_extra_tag]
 */
function updateNodeGrant(p_node, p_grant, p_extra_tag) {
	p_node.tag = Object.assign({}, p_extra_tag, { grant: p_grant });
	p_node.contextMenu = "cm_perm_grant";
	if (p_node.elementA) p_node.elementA.style.color = p_grant.v_privileges.length > 0 ? "" : "var(--text-secondary)";
}

/**
 * Re-fetches just the server-wide grants and updates one database/tablespace
 * node's own color/grant in place, after editing it through the tree's
 * context menu -- never rebuilds the tree (that would collapse every
 * already-expanded database subtree along with it).
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_object_type "database" | "tablespace"
 * @param {string} p_identifier
 */
function refreshServerLevelGrant(p_tag, p_col_state, p_object_type, p_identifier) {
	execAjax(
		"/get_role_server_grants_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role }),
		function (p_return) {
			var v_grant =
				p_return.v_data.filter(function (p_grant) {
					return p_grant.v_object_type === p_object_type && p_grant.v_identifier === p_identifier;
				})[0] || emptyGrantFor(p_object_type, "", p_identifier, p_identifier);
			var v_map = p_object_type === "database" ? p_col_state.databaseNodes : p_col_state.tablespaceNodes;
			var v_state = v_map[p_identifier];
			if (!v_state) return;
			updateNodeGrant(v_state.node, v_grant, p_object_type === "database" ? { kind: "database", database: p_identifier } : undefined);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * Groups a flat postgresqlEffectiveObjectGrants[] (one database's worth) into
 * the shape populateDatabaseNodeChildren draws: one entry per schema (its
 * own grant, if schema-level USAGE/CREATE is held at all, plus its
 * schema-scoped children bucketed by object type) and a separate bucket per
 * schema-less object type (foreign_data_wrapper/foreign_server), which
 * become top-level groups under the database node rather than living under
 * one. A `schema`-typed row's own v_object_name *is* the schema it names
 * (its v_schema is empty -- see pgDatabaseObjectGrantsSQL, postgresql_
 * permissions_effective.go); every other schema-scoped type's v_schema
 * names its containing schema instead.
 * @param {Array<any>} p_grants postgresqlEffectiveObjectGrants[]
 * @returns {{schemas: Object<string, {ownGrant: any, types: Object<string, Array<any>>}>, topLevel: Object<string, Array<any>>}}
 */
function groupDatabaseObjectGrants(p_grants) {
	/** @type {Object<string, {ownGrant: any, types: Object<string, Array<any>>}>} */
	var v_schemas = {};
	/** @type {Object<string, Array<any>>} */
	var v_top_level = {};

	function schemaEntry(p_name) {
		if (!v_schemas[p_name]) v_schemas[p_name] = { ownGrant: null, types: {} };
		return v_schemas[p_name];
	}

	for (var i = 0; i < p_grants.length; i++) {
		var v_grant = p_grants[i];
		if (v_grant.v_object_type === "schema") {
			schemaEntry(v_grant.v_object_name).ownGrant = v_grant;
		} else if (v_grant.v_schema) {
			var v_entry = schemaEntry(v_grant.v_schema);
			if (!v_entry.types[v_grant.v_object_type]) v_entry.types[v_grant.v_object_type] = [];
			v_entry.types[v_grant.v_object_type].push(v_grant);
		} else {
			if (!v_top_level[v_grant.v_object_type]) v_top_level[v_grant.v_object_type] = [];
			v_top_level[v_grant.v_object_type].push(v_grant);
		}
	}

	return { schemas: v_schemas, topLevel: v_top_level };
}

/**
 * The whole merged tree, built with the same AimaraJS component
 * (lib/aimaraJS/lib/Aimara.js) the Database section's own tree uses -- see
 * this file's Phase 9 module comment for why. Only the two root groups
 * ("Databases"/"Tablespaces") and their immediate database/tablespace
 * children are built here; each database node's own schema/table/view/...
 * subtree is left for fetchDatabaseObjectsForNode to fill in lazily, the
 * first time that node is expanded (tree.nodeAfterOpenEvent below), the same
 * "only fetch a node's children once it's actually opened" shape the real
 * Database tree uses -- unlike that tree, we don't yet know a database has
 * any children worth fetching, so every database node gets a spinner
 * placeholder child up front purely so Aimara draws its expand chevron.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {Array<any>} p_server_grants postgresqlEffectiveObjectGrants[] (database/tablespace)
 * @param {Array<{v_name: string}>} p_databases every database on the server
 * @param {Array<{v_name: string}>} p_tablespaces every tablespace on the server
 */
function renderObjectsTree(p_tag, p_col_state, p_server_grants, p_databases, p_tablespaces) {
	p_col_state.listDiv.innerHTML = "";
	p_col_state.databaseNodes = {};
	p_col_state.tablespaceNodes = {};

	var v_tree_div_id = "permissions_objects_tree_" + p_tag.tabID;
	var v_tree_div = document.createElement("div");
	v_tree_div.id = v_tree_div_id;
	p_col_state.listDiv.appendChild(v_tree_div);

	var v_context_menu = {
		cm_perm_grant: {
			elements: function (p_node) {
				return [
					{
						text: t("permissions.edit_privileges"),
						icon: "fas cm-all fa-pen",
						action: function () {
							openObjectDetailDialog(p_tag, p_col_state, p_node.tag.grant, p_node.tag.database);
						},
					},
					{
						text: t("permissions.change_owner"),
						icon: "fas cm-all fa-user",
						action: function () {
							var v_grant = p_node.tag.grant;
							openChangeOwnerDialog(p_tag, p_col_state, p_node.tag.database, v_grant.v_object_type, v_grant.v_schema || "", objectParamForGrant(v_grant), v_grant.v_identifier, null);
						},
					},
					{
						text: t("permissions.who_has_access"),
						icon: "fas cm-all fa-users",
						action: function () {
							var v_grant = p_node.tag.grant;
							openObjectAccessDialog(p_tag, p_node.tag.database, v_grant.v_object_type, v_grant.v_schema || "", objectParamForGrant(v_grant), v_grant.v_identifier);
						},
					},
				];
			},
		},
	};

	v_context_menu.cm_perm_owned = {
		elements: function (p_node) {
			return [
				{
					text: t("permissions.change_owner"),
					icon: "fas cm-all fa-user",
					action: function () {
						var v_owned = p_node.tag.owned;
						openChangeOwnerDialog(p_tag, p_col_state, p_node.tag.database, v_owned.v_object_type, v_owned.v_schema, v_owned.v_object, p_node.text, p_col_state.role);
					},
				},
				{
					text: t("permissions.who_has_access"),
					icon: "fas cm-all fa-users",
					action: function () {
						var v_owned = p_node.tag.owned;
						openObjectAccessDialog(p_tag, p_node.tag.database, v_owned.v_object_type, v_owned.v_schema, v_owned.v_object, p_node.text);
					},
				},
			];
		},
	};
	v_context_menu.cm_perm_default_folder = {
		elements: function (p_node) {
			return [
				{
					text: t("permissions.add_default_privileges"),
					icon: "fas cm-all fa-plus",
					action: function () {
						openDefaultPrivilegesDialog(p_tag, p_col_state, p_node.tag.database, null);
					},
				},
			];
		},
	};
	v_context_menu.cm_perm_default_entry = {
		elements: function (p_node) {
			return [
				{
					text: t("permissions.edit_privileges"),
					icon: "fas cm-all fa-pen",
					action: function () {
						openDefaultPrivilegesDialog(p_tag, p_col_state, p_node.tag.database, p_node.tag.entry);
					},
				},
				{
					text: t("permissions.remove_default_privileges"),
					icon: "fas cm-all fa-times",
					action: function () {
						confirmRemoveDefaultPrivileges(p_tag, p_col_state, p_node.tag.database, p_node.tag.entry);
					},
				},
			];
		},
	};

	var v_tree = createTree(v_tree_div_id, "transparent", v_context_menu);
	p_col_state.tree = v_tree;

	/** @type {Object<string, Object<string, any>>} */
	var v_server_by_type = {};
	for (var i = 0; i < p_server_grants.length; i++) {
		var v_server_grant = p_server_grants[i];
		if (!v_server_by_type[v_server_grant.v_object_type]) v_server_by_type[v_server_grant.v_object_type] = {};
		v_server_by_type[v_server_grant.v_object_type][v_server_grant.v_identifier] = v_server_grant;
	}
	var v_database_grants = v_server_by_type["database"] || {};
	var v_tablespace_grants = v_server_by_type["tablespace"] || {};

	var v_databases_group = v_tree.createNode(t("tree.databases"), false, objectTypeIcon("database", true), undefined, null, null, null, false);
	for (var d = 0; d < p_databases.length; d++) {
		var v_db_name = p_databases[d].v_name;
		var v_db_grant = v_database_grants[v_db_name] || emptyGrantFor("database", "", v_db_name, v_db_name);
		var v_db_node = v_databases_group.createChildNode(
			stripPgIdentQuotes(v_db_name),
			false,
			objectTypeIcon("database") + dimClass(v_db_grant),
			{ kind: "database", database: v_db_name, grant: v_db_grant },
			"cm_perm_grant",
			v_db_grant.v_privileges.length > 0 ? null : "var(--text-secondary)",
			false,
		);
		// Placeholder so Aimara draws the expand chevron before we know
		// whether this database actually has anything worth showing --
		// replaced by fetchDatabaseObjectsForNode on first expand.
		v_db_node.createChildNode("", false, "node-spin", null, null, null, false);
		p_col_state.databaseNodes[v_db_name] = { node: v_db_node, loaded: false };
	}

	var v_tablespaces_group = v_tree.createNode(t("tree.tablespaces"), false, objectTypeIcon("tablespace", true), undefined, null, null, null, false);
	for (var s = 0; s < p_tablespaces.length; s++) {
		var v_ts_name = p_tablespaces[s].v_name;
		var v_ts_grant = v_tablespace_grants[v_ts_name] || emptyGrantFor("tablespace", "", v_ts_name, v_ts_name);
		var v_ts_node = v_tablespaces_group.createChildNode(
			v_ts_name,
			false,
			objectTypeIcon("tablespace") + dimClass(v_ts_grant),
			{ grant: v_ts_grant },
			"cm_perm_grant",
			v_ts_grant.v_privileges.length > 0 ? null : "var(--text-secondary)",
			false,
		);
		p_col_state.tablespaceNodes[v_ts_name] = { node: v_ts_node };
	}

	v_tree.drawTree();
	applyObjectsFilter(p_tag, p_col_state);

	v_tree.nodeAfterOpenEvent = function (p_node) {
		var v_state = p_node.tag && p_node.tag.kind === "database" ? p_col_state.databaseNodes[p_node.tag.database] : null;
		if (v_state && !v_state.loaded) {
			v_state.loaded = true;
			fetchDatabaseObjectsForNode(p_tag, p_col_state, v_state.node, p_node.tag.database);
		}
	};
}

/**
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {any} p_database_node
 * @param {string} p_database
 */
function fetchDatabaseObjectsForNode(p_tag, p_col_state, p_database_node, p_database) {
	/** @type {Array<any> | null} */
	var v_grants = null;
	/** @type {Array<any> | null} */
	var v_defaults = null;
	/** @type {any} */
	var v_owned = null;
	var v_failed = false;

	function onLoaded() {
		if (v_grants !== null && v_defaults !== null && v_owned !== null && !v_failed) {
			populateDatabaseNodeChildren(p_database_node, p_database, v_grants, v_defaults, v_owned);
		}
	}

	var v_base = { p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role, p_database: p_database };
	execAjax(
		"/get_role_default_privileges_postgresql/",
		JSON.stringify(v_base),
		function (p_return) {
			v_defaults = p_return.v_data;
			onLoaded();
		},
		onFailed,
		"box",
		true,
	);
	execAjax(
		"/get_role_owned_objects_postgresql/",
		JSON.stringify(v_base),
		function (p_return) {
			v_owned = p_return.v_data;
			onLoaded();
		},
		onFailed,
		"box",
		true,
	);
	execAjax(
		"/get_role_database_grants_postgresql/",
		JSON.stringify(v_base),
		function (p_return) {
			v_grants = p_return.v_data;
			onLoaded();
		},
		onFailed,
		"box",
		true,
	);

	function onFailed(p_return) {
		// Both requests can fail at once (same password timeout, say);
		// only the first failure prompts.
		if (v_failed) return;
		v_failed = true;
		// Allow a retry on the next expand rather than leaving this
		// database permanently stuck on "loaded" with nothing to show.
		var v_state = p_col_state.databaseNodes[p_database];
		if (v_state) v_state.loaded = false;
		if (p_return.v_data.password_timeout) {
			showPasswordPrompt(
				p_tag.connID,
				function () {
					fetchDatabaseObjectsForNode(p_tag, p_col_state, p_database_node, p_database);
				},
				null,
				p_return.v_data.message,
			);
		} else {
			showError(p_return.v_data);
		}
	}
}

/**
 * Fills in one database node's own schema/table/view/... subtree, replacing
 * its spinner placeholder -- see renderObjectsTree's own comment for the
 * lazy-load shape this is the other half of. A leaf object always has an
 * ownGrant (it only exists in p_grants because aclexplode found a privilege
 * for it), so it's always shown black; a schema is grey unless it has its
 * own USAGE/CREATE grant, exactly the "added purely as the path to a
 * privileged descendant" case from this file's Phase 9 module comment.
 * @param {any} p_database_node
 * @param {string} p_database
 * @param {Array<any>} p_grants postgresqlEffectiveObjectGrants[]
 * @param {Array<any>} p_defaults default-privilege entries (get_role_default_privileges_postgresql)
 * @param {{v_objects: Array<any>, v_truncated: boolean}} p_owned objects the role owns (get_role_owned_objects_postgresql)
 */
function populateDatabaseNodeChildren(p_database_node, p_database, p_grants, p_defaults, p_owned) {
	p_database_node.removeChildNodes();

	if (p_grants.length === 0) {
		p_database_node.createChildNode(t("permissions.no_database_grants"), false, null, null, null, "var(--text-secondary)", true);
	} else {
		appendDatabaseGrantNodes(p_database_node, p_database, p_grants);
	}
	appendOwnedObjectsNode(p_database_node, p_database, p_owned);
	appendDefaultPrivilegesNode(p_database_node, p_database, p_defaults);
}

/**
 * The per-database "Owned objects" folder: what the focused role owns here,
 * grouped by type, each with a "Change owner" context menu. Capped by the
 * backend (pgOwnedObjectsLimit) -- the count then shows a trailing "+".
 * @param {any} p_database_node
 * @param {string} p_database
 * @param {{v_objects: Array<any>, v_truncated: boolean}} p_owned
 */
function appendOwnedObjectsNode(p_database_node, p_database, p_owned) {
	var v_folder = p_database_node.createChildNode(
		t("permissions.owned_objects", { count: p_owned.v_objects.length + (p_owned.v_truncated ? "+" : "") }),
		false,
		objectTypeIcon("owned_objects", true),
		null,
		null,
		null,
		true,
	);
	if (p_owned.v_objects.length === 0) {
		v_folder.createChildNode(t("permissions.no_owned_objects"), false, null, null, null, "var(--text-secondary)", true);
		return;
	}
	for (var i = 0; i < PERMISSIONS_DATABASE_OBJECT_TYPES.length; i++) {
		var v_spec = PERMISSIONS_DATABASE_OBJECT_TYPES[i];
		var v_objects = p_owned.v_objects.filter(function (p_object) {
			return p_object.v_object_type === v_spec.value;
		});
		if (v_objects.length === 0) continue;
		var v_type_node = v_folder.createChildNode(t(v_spec.folderLabelKey), false, objectTypeIcon(v_spec.value, true), null, null, null, true);
		for (var j = 0; j < v_objects.length; j++) {
			var v_object = v_objects[j];
			// A routine's identity already carries its schema; every other
			// type's name comes back quote_ident()-quoted and unqualified.
			var v_label =
				v_object.v_object_type === "function" || v_object.v_object_type === "procedure"
					? v_object.v_object
					: (v_object.v_schema ? stripPgIdentQuotes(v_object.v_schema) + "." : "") + stripPgIdentQuotes(v_object.v_object);
			v_type_node.createChildNode(v_label, false, objectTypeIcon(v_object.v_object_type), { database: p_database, owned: v_object }, "cm_perm_owned", null, true);
		}
	}
}

/**
 * "Change owner" for one object: pick the new owner, ALTER ... OWNER TO.
 * p_database is the tree node's database for a database-scoped object, and
 * ignored for database/tablespace themselves (no database scope).
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string | undefined} p_database
 * @param {string} p_object_type
 * @param {string} p_schema
 * @param {string} p_object
 * @param {string} p_label shown in the dialog title
 * @param {string | null} p_current_owner excluded from the list when known
 */
function openChangeOwnerDialog(p_tag, p_col_state, p_database, p_object_type, p_schema, p_object, p_label, p_current_owner) {
	var v_needs_database = objectTypeNeedsDatabase(p_object_type) && !!p_database;

	/** @returns {any} null while no owner is picked */
	function requestBody() {
		var v_owner = /** @type {HTMLSelectElement} */ (document.getElementById("perm_change_owner")).value;
		if (!v_owner) return null;
		/** @type {any} */
		var v_body = {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_role: v_owner,
			p_object_type: p_object_type,
			p_schema: p_schema,
			p_object: p_object,
		};
		if (v_needs_database) v_body.p_database = p_database;
		return v_body;
	}

	showFormDialog(
		"",
		function () {
			var v_body = requestBody();
			if (!v_body) {
				showAlert(t("permissions.select_owner_hint"));
				return;
			}
			execAjax(
				"/alter_object_owner_postgresql/",
				JSON.stringify(v_body),
				function () {
					if (v_needs_database && p_database) refreshDatabaseNode(p_tag, p_col_state, p_database);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));
			var v_field = buildSelectField(v_content, "perm_change_owner", t("permissions.new_owner_label"));
			populateSelectOptions(
				v_field.select,
				[{ value: "", label: t("permissions.drop_choose_owner") }].concat(
					(p_tag.roles || [])
						.filter(function (/** @type {any} */ p_role) {
							return !p_role.v_is_public && p_role.v_name !== p_current_owner && !isPredefinedRoleName(p_role.v_name);
						})
						.map(function (/** @type {any} */ p_role) {
							return { value: p_role.v_name, label: p_role.v_name };
						}),
				),
			);
			appendSqlPreview(v_content, function () {
				var v_body = requestBody();
				return v_body ? [{ url: "/alter_object_owner_postgresql/", body: v_body }] : null;
			});
		},
		true,
		t("common.save"),
		t("permissions.change_owner") + ": " + dialogObjectLabel(p_object_type, p_label),
		objectTypeIcon(p_object_type),
	);
}

/**
 * The per-database "Default privileges" folder (ALTER DEFAULT PRIVILEGES):
 * one leaf per (creator, schema, kind, grantee) slot that involves the
 * focused role, as grantee or as the creating role. The folder itself is
 * always present -- its context menu is how a first default is added.
 * @param {any} p_database_node
 * @param {string} p_database
 * @param {Array<any>} p_defaults
 */
function appendDefaultPrivilegesNode(p_database_node, p_database, p_defaults) {
	var v_folder = p_database_node.createChildNode(
		t("permissions.default_privileges"),
		false,
		objectTypeIcon("default_privileges", true),
		{ database: p_database },
		"cm_perm_default_folder",
		null,
		true,
	);
	if (p_defaults.length === 0) {
		v_folder.createChildNode(t("permissions.no_default_privileges"), false, null, null, null, "var(--text-secondary)", true);
		return;
	}
	for (var i = 0; i < p_defaults.length; i++) {
		var v_entry = p_defaults[i];
		var v_label =
			v_entry.v_creator +
			" \u2192 " +
			v_entry.v_grantee +
			": " +
			t(DEFAULT_KIND_LABEL_KEY[v_entry.v_kind]) +
			(v_entry.v_schema ? " (" + v_entry.v_schema + ")" : "") +
			" [" +
			v_entry.v_privileges
				.map(function (p_priv) {
					return p_priv.v_privilege + (p_priv.v_grantable ? "*" : "");
				})
				.join(", ") +
			"]";
		v_folder.createChildNode(v_label, false, objectTypeIcon(DEFAULT_KIND_ICON_TYPE[v_entry.v_kind]), { database: p_database, entry: v_entry }, "cm_perm_default_entry", null, true);
	}
}

/**
 * @param {any} p_database_node
 * @param {string} p_database
 * @param {Array<any>} p_grants
 */
function appendDatabaseGrantNodes(p_database_node, p_database, p_grants) {
	var v_grouped = groupDatabaseObjectGrants(p_grants);

	function appendGrantLeafNode(p_parent_node, p_grant) {
		p_parent_node.createChildNode(
			p_grant.v_identifier,
			false,
			objectTypeIcon(p_grant.v_object_type),
			{ grant: p_grant, database: p_database },
			"cm_perm_grant",
			null,
			true,
		);
	}

	var v_schema_names = Object.keys(v_grouped.schemas).sort();
	for (var i = 0; i < v_schema_names.length; i++) {
		var v_schema_entry = v_grouped.schemas[v_schema_names[i]];
		var v_schema_grant = v_schema_entry.ownGrant || emptyGrantFor("schema", "", v_schema_names[i], v_schema_names[i]);
		var v_schema_node = p_database_node.createChildNode(
			v_schema_names[i],
			false,
			objectTypeIcon("schema") + dimClass(v_schema_grant),
			{ grant: v_schema_grant, database: p_database },
			"cm_perm_grant",
			v_schema_grant.v_privileges.length > 0 ? null : "var(--text-secondary)",
			true,
		);

		for (var j = 0; j < PERMISSIONS_DATABASE_OBJECT_TYPES.length; j++) {
			var v_spec = PERMISSIONS_DATABASE_OBJECT_TYPES[j];
			if (v_spec.value === "schema") continue;
			var v_type_grants = v_schema_entry.types[v_spec.value];
			if (!v_type_grants || v_type_grants.length === 0) continue;

			var v_type_node = v_schema_node.createChildNode(t(v_spec.folderLabelKey), false, objectTypeIcon(v_spec.value, true), null, null, null, true);
			for (var k = 0; k < v_type_grants.length; k++) appendGrantLeafNode(v_type_node, v_type_grants[k]);
		}
	}

	// Schema-less types only -- see groupDatabaseObjectGrants' comment.
	var v_top_level_types = ["foreign_data_wrapper", "foreign_server"];
	for (var t_i = 0; t_i < v_top_level_types.length; t_i++) {
		var v_grants_of_type = v_grouped.topLevel[v_top_level_types[t_i]];
		if (!v_grants_of_type || v_grants_of_type.length === 0) continue;

		var v_spec2 = PERMISSIONS_DATABASE_OBJECT_TYPES.filter(function (p_type) {
			return p_type.value === v_top_level_types[t_i];
		})[0];
		var v_top_node = p_database_node.createChildNode(t(v_spec2.folderLabelKey), false, objectTypeIcon(v_spec2.value, true), undefined, null, null, true);
		for (var m = 0; m < v_grants_of_type.length; m++) appendGrantLeafNode(v_top_node, v_grants_of_type[m]);
	}
}

// ALTER DEFAULT PRIVILEGES kinds, mirroring pgDefaultPrivilegeKinds
// (postgresql_permissions_bulk.go) -- the privilege lists must match
// pgValidPrivilegesByObjectType for the kind's own object type.
var DEFAULT_PRIVILEGE_KINDS = [
	{ value: "tables", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "sequences", privileges: ["USAGE", "SELECT", "UPDATE"] },
	{ value: "functions", privileges: ["EXECUTE"] },
	{ value: "types", privileges: ["USAGE"] },
	{ value: "schemas", privileges: ["USAGE", "CREATE"] },
];

// The Database section's own tree names for each default-privilege kind (the
// same keys as the objects tree's folders, see folderLabelKey above).
var DEFAULT_KIND_LABEL_KEY = {
	tables: "tree.tables",
	sequences: "tree.topic_sequences",
	functions: "tree.functions",
	types: "tree.topic_types",
	schemas: "tree.schemas",
};

// Which PERMISSIONS_OBJECT_ICONS entry each default-privilege kind borrows.
var DEFAULT_KIND_ICON_TYPE = { tables: "table", sequences: "sequence", functions: "function", types: "type", schemas: "schema" };

/**
 * Add (p_entry null) or edit one default-privileges slot for the focused
 * role. Adding grants to the focused role; editing keeps the slot's creator/
 * schema/kind/grantee fixed and grants/revokes only the ticks that changed.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_database database as carried by the tree node (quoted identifier)
 * @param {any} p_entry an entry of get_role_default_privileges_postgresql, or null to add
 */
function openDefaultPrivilegesDialog(p_tag, p_col_state, p_database, p_entry) {
	var v_editing = !!p_entry;
	/** @type {Object<string, boolean>} */
	var v_had = {};
	if (v_editing) {
		for (var i = 0; i < p_entry.v_privileges.length; i++) v_had[p_entry.v_privileges[i].v_privilege] = true;
	}
	var v_grantee = v_editing ? p_entry.v_grantee : p_col_state.role;

	/**
	 * @returns {{error: string} | {error: null, requests: Array<{url: string, body: any}>}}
	 */
	function collect() {
		var v_creator = /** @type {HTMLSelectElement} */ (document.getElementById("perm_default_creator")).value;
		var v_schema = /** @type {HTMLSelectElement} */ (document.getElementById("perm_default_schema")).value;
		var v_kind = /** @type {HTMLSelectElement} */ (document.getElementById("perm_default_kind")).value;
		var v_grantable = /** @type {HTMLInputElement} */ (document.getElementById("perm_default_grantable")).checked;
		var v_to_grant = [];
		var v_to_revoke = [];
		var v_boxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(".perm_grant_privilege_checkbox"));
		for (var b = 0; b < v_boxes.length; b++) {
			if (v_boxes[b].checked && !v_had[v_boxes[b].value]) v_to_grant.push(v_boxes[b].value);
			if (!v_boxes[b].checked && v_had[v_boxes[b].value]) v_to_revoke.push(v_boxes[b].value);
		}
		if (!v_editing && v_to_grant.length === 0) return { error: t("permissions.select_privilege_hint") };

		var v_base = {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_database: p_database,
			p_role: v_grantee,
			p_creator: v_creator,
			p_schema: v_schema,
			p_kind: v_kind,
		};
		/** @type {Array<{url: string, body: any}>} */
		var v_requests = [];
		if (v_to_grant.length > 0) {
			v_requests.push({
				url: "/alter_default_privileges_postgresql/",
				body: Object.assign({}, v_base, { p_privileges: v_to_grant, p_grantable: v_grantable, p_revoke: false }),
			});
		}
		if (v_to_revoke.length > 0) {
			v_requests.push({
				url: "/alter_default_privileges_postgresql/",
				body: Object.assign({}, v_base, { p_privileges: v_to_revoke, p_grantable: false, p_revoke: true }),
			});
		}
		return { error: null, requests: v_requests };
	}

	showFormDialog(
		"",
		function () {
			var v_collected = collect();
			if (v_collected.error !== null) {
				showAlert(v_collected.error);
				return;
			}
			var v_requests = v_collected.requests;
			if (v_requests.length === 0) return;
			runSequentially(
				v_requests.map(function (p_request) {
					return function (p_done) {
						execAjax(
							p_request.url,
							JSON.stringify(p_request.body),
							p_done,
							function (p_return) {
								showAlert(p_return.v_data.message || p_return.v_data);
							},
							"box",
							false,
						);
					};
				}),
				function () {
					refreshDatabaseNode(p_tag, p_col_state, p_database);
				},
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_intro = document.createElement("div");
			v_intro.className = "omnidb__permissions__row-suffix mb-3";
			v_intro.textContent = t("permissions.default_privileges_hint", { role: v_grantee });
			v_content.appendChild(v_intro);

			var v_creator_field = buildSelectField(v_content, "perm_default_creator", t("permissions.default_creator_label"));
			populateSelectOptions(
				v_creator_field.select,
				[{ value: "", label: t("permissions.default_creator_current") }].concat(
					(p_tag.roles || [])
						.filter(function (/** @type {any} */ p_role) {
							return !p_role.v_is_public;
						})
						.map(function (/** @type {any} */ p_role) {
							return { value: p_role.v_name, label: p_role.v_name };
						}),
				),
			);

			var v_schema_field = buildSelectField(v_content, "perm_default_schema", t("permissions.schema_label"));
			populateSelectOptions(v_schema_field.select, [{ value: "", label: t("permissions.default_schema_all") }]);
			fetchSchemasForPicker(p_tag, p_col_state, p_database, function (p_schemas) {
				populateSelectOptions(v_schema_field.select, [{ value: "", label: t("permissions.default_schema_all") }].concat(p_schemas));
				if (v_editing) v_schema_field.select.value = p_entry.v_schema;
			});

			var v_kind_field = buildSelectField(v_content, "perm_default_kind", t("permissions.default_kind_label"));
			populateSelectOptions(
				v_kind_field.select,
				DEFAULT_PRIVILEGE_KINDS.map(function (p_kind) {
					return { value: p_kind.value, label: t(DEFAULT_KIND_LABEL_KEY[p_kind.value]) };
				}),
			);

			var v_priv_container = document.createElement("div");
			v_content.appendChild(v_priv_container);

			function renderPrivileges() {
				var v_kind = v_kind_field.select.value;
				var v_spec = DEFAULT_PRIVILEGE_KINDS.filter(function (p_k) {
					return p_k.value === v_kind;
				})[0];
				v_priv_container.innerHTML = "";
				appendPrivilegeCheckboxes(v_priv_container, v_spec);
				if (v_editing) {
					var v_boxes = /** @type {NodeListOf<HTMLInputElement>} */ (v_priv_container.querySelectorAll(".perm_grant_privilege_checkbox"));
					for (var b = 0; b < v_boxes.length; b++) v_boxes[b].checked = !!v_had[v_boxes[b].value];
				}
				// ALTER DEFAULT PRIVILEGES ... ON SCHEMAS cannot take IN SCHEMA.
				if (!v_editing) {
					v_schema_field.select.disabled = v_kind === "schemas";
					if (v_kind === "schemas") v_schema_field.select.value = "";
				}
			}
			v_kind_field.select.addEventListener("change", renderPrivileges);

			var v_grantable_row = document.createElement("div");
			v_grantable_row.className = "form-check mb-2";
			var v_grantable_input = document.createElement("input");
			v_grantable_input.type = "checkbox";
			v_grantable_input.className = "form-check-input";
			v_grantable_input.id = "perm_default_grantable";
			var v_grantable_label = document.createElement("label");
			v_grantable_label.className = "form-check-label";
			v_grantable_label.setAttribute("for", "perm_default_grantable");
			v_grantable_label.textContent = t("permissions.with_grant_option");
			v_grantable_row.appendChild(v_grantable_input);
			v_grantable_row.appendChild(v_grantable_label);
			v_content.appendChild(v_grantable_row);

			if (v_editing) {
				v_creator_field.select.value = p_entry.v_creator;
				v_kind_field.select.value = p_entry.v_kind;
				v_creator_field.select.disabled = true;
				v_schema_field.select.disabled = true;
				v_kind_field.select.disabled = true;
				v_grantable_input.checked = p_entry.v_privileges.some(function (/** @type {any} */ p_priv) {
					return p_priv.v_grantable;
				});
			}
			renderPrivileges();

			appendSqlPreview(v_content, function () {
				var v_collected = collect();
				return v_collected.error !== null ? null : v_collected.requests;
			});
		},
		true,
		t("common.save"),
		t("permissions.default_privileges") + ": " + stripPgIdentQuotes(p_database),
		"fas node-all fa-key",
	);
}

/**
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_database
 * @param {any} p_entry
 */
function confirmRemoveDefaultPrivileges(p_tag, p_col_state, p_database, p_entry) {
	showConfirm(
		t("permissions.confirm_remove_default_privileges"),
		function () {
			execAjax(
				"/alter_default_privileges_postgresql/",
				JSON.stringify({
					p_database_index: p_tag.connID,
					p_tab_id: p_tag.tabID,
					p_database: p_database,
					p_role: p_entry.v_grantee,
					p_creator: p_entry.v_creator,
					p_schema: p_entry.v_schema,
					p_kind: p_entry.v_kind,
					p_privileges: p_entry.v_privileges.map(function (/** @type {any} */ p_priv) {
						return p_priv.v_privilege;
					}),
					p_revoke: true,
				}),
				function () {
					refreshDatabaseNode(p_tag, p_col_state, p_database);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
	);
}

/**
 * Reloads one database node's subtree (grants and default privileges).
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {string} p_database
 */
function refreshDatabaseNode(p_tag, p_col_state, p_database) {
	var v_state = p_col_state.databaseNodes[p_database];
	if (!v_state) return;
	v_state.loaded = false;
	fetchDatabaseObjectsForNode(p_tag, p_col_state, v_state.node, p_database);
}

/**
 * Runs each op (an async step that calls its own `done` callback when
 * finished) strictly in order, then calls p_final -- GRANT and REVOKE are
 * separate requests (no combined endpoint), so a detail-dialog save that
 * touches both must not fire them concurrently against the same object.
 * @param {Array<(done: () => void) => void>} p_ops
 * @param {() => void} p_final
 */
function runSequentially(p_ops, p_final) {
	if (p_ops.length === 0) {
		p_final();
		return;
	}
	p_ops[0](function () {
		runSequentially(p_ops.slice(1), p_final);
	});
}

/**
 * The detail dialog shared behind every node's context menu (see
 * renderObjectsTree's cm_perm_grant): one checkbox per privilege valid for
 * that object type (p_type_list, mirroring the backend's
 * pgValidPrivilegesByObjectType) --
 *  - checked + enabled: held directly by p_role_name -- uncheck to revoke.
 *  - checked + disabled + "inherited from: ...": held only via an ancestor
 *    or PUBLIC -- not revocable here (see this file's module comment).
 *  - unchecked: not held at all -- check to grant directly, even when the
 *    object already has other privileges inherited (the Foo/bar1/bar2 case
 *    from the plan this was built from).
 * p_extra_fields is merged into every grant/revoke request body --
 * openObjectDetailDialog passes { p_database: ... } for a database-scoped
 * object (see pgGrantObjectPrivilegeRequest's PDatabase comment on the Go
 * side), {} for a database/tablespace itself.
 * @param {any} p_tag
 * @param {string} p_role_name
 * @param {any} p_grant postgresqlEffectiveObjectGrants entry, as rendered
 * @param {Array<any>} p_type_list PERMISSIONS_ALL_OBJECT_TYPES
 * @param {Record<string, any>} p_extra_fields
 * @param {() => void} p_on_saved
 */
function openEffectiveObjectDetailDialog(p_tag, p_role_name, p_grant, p_type_list, p_extra_fields, p_on_saved) {
	var v_spec = p_type_list.filter(function (p_type) {
		return p_type.value === p_grant.v_object_type;
	})[0];
	var v_object = objectParamForGrant(p_grant);
	var v_schema = p_grant.v_schema || "";

	/** @type {Object<string, Array<{v_grantee: string, v_grantable: boolean}>>} */
	var v_sources_by_privilege = {};
	for (var i = 0; i < p_grant.v_privileges.length; i++) {
		v_sources_by_privilege[p_grant.v_privileges[i].v_privilege] = p_grant.v_privileges[i].v_sources;
	}

	/**
	 * The grant and/or revoke request the dialog's current ticks amount to
	 * (shared by Save and the SQL preview) -- only privileges whose direct
	 * state actually changed.
	 * @returns {Array<{url: string, body: Object}>}
	 */
	function collectRequests() {
		var v_to_grant = [];
		var v_to_revoke = [];
		for (var i = 0; i < v_spec.privileges.length; i++) {
			var v_priv = v_spec.privileges[i];
			var v_checkbox = /** @type {HTMLInputElement} */ (document.getElementById("perm_detail_priv_" + v_priv));
			var v_was_direct = effectivePrivilegeIsDirect(v_sources_by_privilege[v_priv], p_role_name);
			if (v_checkbox.checked && !v_was_direct) v_to_grant.push(v_priv);
			if (!v_checkbox.checked && v_was_direct) v_to_revoke.push(v_priv);
		}

		var v_grantable_input = /** @type {HTMLInputElement} */ (document.getElementById("perm_detail_grantable"));
		var v_base = {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_role: p_role_name,
			p_object_type: p_grant.v_object_type,
			p_schema: v_schema,
			p_object: v_object,
		};

		/** @type {Array<{url: string, body: Object}>} */
		var v_requests = [];
		if (v_to_grant.length > 0) {
			v_requests.push({
				url: "/grant_object_privilege_postgresql/",
				body: Object.assign({}, v_base, { p_privileges: v_to_grant, p_grantable: v_grantable_input.checked }, p_extra_fields),
			});
		}
		if (v_to_revoke.length > 0) {
			v_requests.push({
				url: "/revoke_object_privilege_postgresql/",
				body: Object.assign({}, v_base, { p_privileges: v_to_revoke }, p_extra_fields),
			});
		}
		return v_requests;
	}

	showFormDialog(
		"",
		function () {
			var v_requests = collectRequests();
			if (v_requests.length === 0) return;

			/** @type {Array<(done: () => void) => void>} */
			var v_ops = v_requests.map(function (p_request) {
				return function (p_done) {
					execAjax(
						p_request.url,
						JSON.stringify(p_request.body),
						p_done,
						function (p_return) {
							showAlert(p_return.v_data.message || p_return.v_data);
						},
						"box",
						false,
					);
				};
			});

			runSequentially(v_ops, p_on_saved);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_grantable_row = document.createElement("div");
			v_grantable_row.className = "form-check mb-2";
			var v_grantable_input = document.createElement("input");
			v_grantable_input.type = "checkbox";
			v_grantable_input.className = "form-check-input";
			v_grantable_input.id = "perm_detail_grantable";
			var v_grantable_label = document.createElement("label");
			v_grantable_label.className = "form-check-label";
			v_grantable_label.setAttribute("for", "perm_detail_grantable");
			v_grantable_label.textContent = t("permissions.with_grant_option");
			v_grantable_row.appendChild(v_grantable_input);
			v_grantable_row.appendChild(v_grantable_label);
			v_content.appendChild(v_grantable_row);

			var v_priv_title = document.createElement("label");
			v_priv_title.textContent = t("permissions.privileges_label");
			v_content.appendChild(v_priv_title);

			var v_priv_note = document.createElement("div");
			v_priv_note.className = "omnidb__permissions__row-suffix mb-2";
			v_priv_note.textContent = t("permissions.direct_grant_hint");
			v_content.appendChild(v_priv_note);

			for (var i = 0; i < v_spec.privileges.length; i++) {
				(function (p_priv) {
					var v_sources = v_sources_by_privilege[p_priv];
					var v_direct = effectivePrivilegeIsDirect(v_sources, p_role_name);
					var v_inherited_sources = (v_sources || []).filter(function (p_source) {
						return p_source.v_grantee !== p_role_name;
					});

					var v_row = document.createElement("div");
					v_row.className = "form-check mb-1";

					var v_input = document.createElement("input");
					v_input.type = "checkbox";
					v_input.className = "form-check-input";
					v_input.id = "perm_detail_priv_" + p_priv;
					// The box is the role's own *direct* grant -- an inherited-
					// only privilege stays unticked (with the hint below) so it
					// can still be granted directly and survive losing the
					// membership it comes from.
					v_input.checked = v_direct;

					var v_label = document.createElement("label");
					v_label.className = "form-check-label";
					v_label.setAttribute("for", v_input.id);
					v_label.textContent = p_priv;

					v_row.appendChild(v_input);
					v_row.appendChild(v_label);

					if (v_inherited_sources.length > 0) {
						var v_hint = document.createElement("span");
						v_hint.className = "omnidb__permissions__row-suffix";
						v_hint.textContent =
							" " +
							t("permissions.inherited_from", {
								sources: v_inherited_sources
									.map(function (p_source) {
										return p_source.v_grantee;
									})
									.join(", "),
							});
						v_row.appendChild(v_hint);
					}

					v_content.appendChild(v_row);
				})(v_spec.privileges[i]);
			}

			appendSqlPreview(v_content, collectRequests);
		},
		true,
		t("common.save"),
		dialogObjectLabel(p_grant.v_object_type, p_grant.v_identifier),
		objectTypeIcon(p_grant.v_object_type),
	);
}

/**
 * Opens the shared detail dialog for one tree node's grant and, once saved,
 * refreshes only the affected slice of the tree -- that database's own
 * subtree (p_database set, a schema/table/view/... grant) or just the
 * edited database/tablespace node's own color (p_database undefined, see
 * refreshServerLevelGrant) -- never the whole tree.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {any} p_grant
 * @param {string | undefined} p_database
 */
function openObjectDetailDialog(p_tag, p_col_state, p_grant, p_database) {
	var v_needs_database = objectTypeNeedsDatabase(p_grant.v_object_type);
	var v_extra_fields = v_needs_database ? { p_database: p_database } : {};

	openEffectiveObjectDetailDialog(p_tag, p_col_state.role, p_grant, PERMISSIONS_ALL_OBJECT_TYPES, v_extra_fields, function () {
		if (v_needs_database && p_database) {
			var v_state = p_col_state.databaseNodes[p_database];
			if (v_state) {
				v_state.loaded = false;
				fetchDatabaseObjectsForNode(p_tag, p_col_state, v_state.node, p_database);
			}
		} else {
			refreshServerLevelGrant(p_tag, p_col_state, p_grant.v_object_type, p_grant.v_identifier);
		}
	});
}

/**
 * The "+" footer dialog: pick a type (database/tablespace or any
 * database-scoped one), then a database (if that type needs one) and an
 * object, then check the privileges to grant directly. Refreshes only the
 * affected slice of the tree afterwards, same as openObjectDetailDialog --
 * a newly-granted database-scoped object also expands that database's node
 * if it wasn't already, so the freshly-added object is immediately visible
 * rather than requiring a manual expand to discover it.
 * @param {any} p_tag
 * @param {any} p_col_state
 */
function openAddObjectPrivilegeDialog(p_tag, p_col_state) {
	openGrantObjectPrivilegeDialogGeneric(
		p_tag,
		p_col_state,
		p_col_state.role,
		PERMISSIONS_ALL_OBJECT_TYPES,
		t("permissions.add_object_privilege"),
		function (p_database, p_object_type, p_identifier) {
			if (objectTypeNeedsDatabase(p_object_type) && p_database) {
				var v_state = p_col_state.databaseNodes[p_database];
				if (v_state) {
					v_state.loaded = false;
					fetchDatabaseObjectsForNode(p_tag, p_col_state, v_state.node, p_database);
					if (!v_state.node.expanded) v_state.node.expandNode();
				}
			} else {
				refreshServerLevelGrant(p_tag, p_col_state, p_object_type, p_identifier);
			}
		},
	);
}

/**
 * The reverse view: every role that can do something with one object, and
 * why (owner / direct grant / inherited through a membership / superuser),
 * straight from Postgres's own has_*_privilege answers (see
 * postgresqlObjectAccess). Superuser-only roles fold into a collapsed
 * group, since they can do everything and would bury the real grants.
 * Clicking a role makes it the active role in column 1.
 * @param {any} p_tag
 * @param {string | undefined} p_database database of the tree node, for a database-scoped type
 * @param {string} p_object_type
 * @param {string} p_schema
 * @param {string} p_object
 * @param {string} p_label shown in the dialog title
 */
function openObjectAccessDialog(p_tag, p_database, p_object_type, p_schema, p_object, p_label) {
	/** @type {any} */
	var v_body = {
		p_database_index: p_tag.connID,
		p_tab_id: p_tag.tabID,
		p_object_type: p_object_type,
		p_schema: p_schema,
		p_object: p_object,
	};
	if (objectTypeNeedsDatabase(p_object_type) && p_database) v_body.p_database = p_database;

	execAjax(
		"/get_object_access_postgresql/",
		JSON.stringify(v_body),
		function (p_return) {
			/** @type {{v_owner: string, v_roles: Array<{v_role: string, v_superuser: boolean, v_privileges: Array<{v_privilege: string, v_source: string, v_grantable: boolean}>}>}} */
			var v_data = p_return.v_data;
			showFormDialog(
				"",
				function () {},
				null,
				function () {
					var v_cancel = document.getElementById("modal_message_cancel");
					if (v_cancel) v_cancel.style.display = "none";
					renderObjectAccess(p_tag, /** @type {HTMLElement} */ (document.getElementById("modal_message_content")), v_data);
				},
				true,
				t("common.close"),
				t("permissions.who_has_access") + ": " + dialogObjectLabel(p_object_type, p_label),
				objectTypeIcon(p_object_type),
			);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {HTMLElement} p_content
 * @param {{v_owner: string, v_roles: Array<{v_role: string, v_superuser: boolean, v_privileges: Array<{v_privilege: string, v_source: string, v_grantable: boolean}>}>}} p_data
 */
function renderObjectAccess(p_tag, p_content, p_data) {
	if (p_data.v_owner) {
		var v_owner = document.createElement("div");
		v_owner.className = "omnidb__permissions__row-suffix mb-2";
		v_owner.textContent = t("permissions.access_owner", { owner: p_data.v_owner });
		p_content.appendChild(v_owner);
	}

	var v_regular = p_data.v_roles.filter(function (p_role) {
		return !(p_role.v_superuser && p_role.v_privileges.every(function (p_priv) { return p_priv.v_source === "superuser"; }));
	});
	var v_superusers = p_data.v_roles.filter(function (p_role) {
		return v_regular.indexOf(p_role) === -1;
	});

	/**
	 * @param {HTMLElement} p_parent
	 * @param {typeof p_data.v_roles} p_roles
	 */
	function appendRows(p_parent, p_roles) {
		for (var i = 0; i < p_roles.length; i++) {
			(function (p_role) {
				var v_row = document.createElement("div");
				v_row.className = "omnidb__permissions__role-row omnidb__permissions__access-row";

				var v_icon = document.createElement("i");
				var v_is_public = p_role.v_role === "PUBLIC";
				v_icon.className = "fas node-all " + (v_is_public ? "fa-users" : "fa-user");
				v_row.appendChild(v_icon);

				var v_text = document.createElement("span");
				v_text.textContent = p_role.v_role;
				v_row.appendChild(v_text);

				var v_privs = document.createElement("div");
				v_privs.className = "omnidb__permissions__row-suffix omnidb__permissions__access-privileges";
				v_privs.textContent = p_role.v_privileges
					.map(function (p_priv) {
						var v_notes = [];
						if (p_priv.v_source !== "direct") v_notes.push(t("permissions.access_source_" + p_priv.v_source));
						if (p_priv.v_grantable) v_notes.push(t("permissions.access_grant_option"));
						return p_priv.v_privilege + (v_notes.length > 0 ? " (" + v_notes.join(", ") + ")" : "");
					})
					.join(", ");
				v_row.appendChild(v_privs);

				v_row.addEventListener("click", function () {
					var v_known = (p_tag.roles || []).some(function (/** @type {any} */ p_entry) {
						return p_entry.v_name === p_role.v_role;
					});
					if (!v_known) return;
					var v_close = document.getElementById("modal_message_ok");
					if (v_close) v_close.click();
					selectRole(p_tag, p_role.v_role);
				});
				p_parent.appendChild(v_row);
			})(p_roles[i]);
		}
	}

	var v_list = document.createElement("div");
	v_list.className = "omnidb__permissions__role-picker";
	if (v_regular.length === 0) {
		var v_none = document.createElement("div");
		v_none.className = "omnidb__permissions__list-empty";
		v_none.textContent = t("permissions.access_nobody");
		v_list.appendChild(v_none);
	}
	appendRows(v_list, v_regular);
	p_content.appendChild(v_list);

	if (v_superusers.length > 0) {
		var v_details = document.createElement("details");
		v_details.className = "mt-2";
		var v_summary = document.createElement("summary");
		v_summary.className = "omnidb__permissions__row-suffix";
		v_summary.textContent = t("permissions.access_superusers", { count: v_superusers.length });
		v_details.appendChild(v_summary);
		var v_super_list = document.createElement("div");
		v_super_list.className = "omnidb__permissions__role-picker mt-1";
		appendRows(v_super_list, v_superusers);
		v_details.appendChild(v_super_list);
		p_content.appendChild(v_details);
	}
}

/**
 * Postgres reserves the pg_ prefix for its predefined roles (pg_monitor, ...);
 * they make no sense as an object owner, so the owner pickers leave them out.
 * @param {string} p_name
 */
function isPredefinedRoleName(p_name) {
	return p_name.indexOf("pg_") === 0;
}

/**
 * The drop-role dialog. A role that still owns objects or holds privileges
 * cannot simply be dropped in Postgres, so this first asks what ties it to
 * the server (per database -- see postgresqlRoleDependencyCounts) and, when
 * there is something, makes the user pick a role to take over its objects;
 * the backend then reassigns ownership and revokes the role's privileges in
 * every affected database before the final DROP ROLE (buildDropRolePlan).
 * The SQL box shows that whole sequence.
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function confirmDropRole(p_tag, p_role_name) {
	execAjax(
		"/get_role_dependencies_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name }),
		function (p_return) {
			openDropRoleDialog(p_tag, p_role_name, p_return.v_data);
		},
		function (p_return) {
			showAlert(p_return.v_data.message || p_return.v_data);
		},
		"box",
		true,
	);
}

/**
 * @param {any} p_tag
 * @param {string} p_role_name
 * @param {{v_databases: Array<{v_name: string, v_owned: number, v_acl: number, v_other: number}>, v_member_of: number, v_members: number}} p_deps
 */
function openDropRoleDialog(p_tag, p_role_name, p_deps) {
	var v_owned = 0;
	var v_held = 0;
	for (var i = 0; i < p_deps.v_databases.length; i++) {
		v_owned += p_deps.v_databases[i].v_owned;
		v_held += p_deps.v_databases[i].v_acl + p_deps.v_databases[i].v_other;
	}

	/** @returns {any} */
	function requestBody() {
		var v_owner_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_drop_new_owner"));
		return {
			p_database_index: p_tag.connID,
			p_tab_id: p_tag.tabID,
			p_role: p_role_name,
			p_reassign_to: v_owner_select ? v_owner_select.value : "",
			p_drop_owned: v_held > 0,
		};
	}

	showFormDialog(
		"",
		function () {
			var v_body = requestBody();
			if (v_owned > 0 && !v_body.p_reassign_to) {
				showAlert(t("permissions.select_owner_hint"));
				return;
			}
			execAjax(
				"/drop_role_postgresql/",
				JSON.stringify(v_body),
				function () {
					showAlert(t("permissions.role_dropped"));
					p_tag.selectedRole = null;
					p_tag.deleteRoleBtn.disabled = true;
					if (p_tag.column2 && p_tag.column2.role === p_role_name) closeColumn2(p_tag);
					if (p_tag.objectsColumn && p_tag.objectsColumn.role === p_role_name) closeObjectsColumn(p_tag);
					fetchRoles(p_tag);
				},
				function (p_return) {
					showAlert(p_return.v_data.message || p_return.v_data);
				},
				"box",
				false,
			);
		},
		null,
		function () {
			var v_content = /** @type {HTMLElement} */ (document.getElementById("modal_message_content"));

			var v_warning = document.createElement("div");
			v_warning.className = "mb-3";
			v_warning.textContent = t("permissions.confirm_drop_role", { role: p_role_name });
			v_content.appendChild(v_warning);

			if (p_deps.v_databases.length > 0) {
				var v_heading = document.createElement("div");
				v_heading.className = "mb-1";
				v_heading.textContent = t("permissions.drop_dependencies_heading");
				v_content.appendChild(v_heading);

				var v_list = document.createElement("ul");
				v_list.className = "mb-3";
				for (var d = 0; d < p_deps.v_databases.length; d++) {
					var v_dep = p_deps.v_databases[d];
					var v_item = document.createElement("li");
					v_item.textContent = t("permissions.drop_deps_database", {
						database: v_dep.v_name === "" ? t("permissions.drop_deps_shared") : v_dep.v_name,
						owned: v_dep.v_owned,
						held: v_dep.v_acl + v_dep.v_other,
					});
					v_list.appendChild(v_item);
				}
				v_content.appendChild(v_list);
			}

			if (p_deps.v_member_of + p_deps.v_members > 0) {
				var v_memberships = document.createElement("div");
				v_memberships.className = "omnidb__permissions__row-suffix mb-3";
				v_memberships.textContent = t("permissions.drop_memberships_note", { count: p_deps.v_member_of + p_deps.v_members });
				v_content.appendChild(v_memberships);
			}

			if (v_owned > 0) {
				var v_owner_field = buildSelectField(v_content, "perm_drop_new_owner", t("permissions.drop_new_owner_label"));
				populateSelectOptions(
					v_owner_field.select,
					[{ value: "", label: t("permissions.drop_choose_owner") }].concat(
						(p_tag.roles || [])
							.filter(function (/** @type {any} */ p_role) {
								return !p_role.v_is_public && p_role.v_name !== p_role_name && !isPredefinedRoleName(p_role.v_name);
							})
							.map(function (/** @type {any} */ p_role) {
								return { value: p_role.v_name, label: p_role.v_name };
							}),
					),
				);
				var v_owner_hint = document.createElement("div");
				v_owner_hint.className = "omnidb__permissions__row-suffix mb-3";
				v_owner_hint.textContent = t("permissions.drop_new_owner_hint");
				v_content.appendChild(v_owner_hint);
			}

			if (v_held > 0) {
				var v_privileges_note = document.createElement("div");
				v_privileges_note.className = "omnidb__permissions__row-suffix mb-3";
				v_privileges_note.textContent = t("permissions.drop_privileges_note");
				v_content.appendChild(v_privileges_note);
			}

			appendSqlPreview(v_content, function () {
				var v_body = requestBody();
				if (v_owned > 0 && !v_body.p_reassign_to) return null;
				return [{ url: "/drop_role_postgresql/", body: v_body }];
			});
		},
		true,
		t("tree.drop_role"),
		t("tree.drop_role") + ": " + p_role_name,
		"fas node-all fa-times",
	);
}
