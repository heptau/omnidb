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
import { showAlert, showConfirm, showError } from "../notification_control.js";
import { showPasswordPrompt } from "../passwords.js";
import { escapeHtml, escapeHtmlAttribute } from "../query.js";
import { t } from "../i18n.js";
import { customMenu } from "../custom_menu.js";

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

	p_tag.columnsDiv.appendChild(v_column);
	p_tag.rolesListDiv = /** @type {HTMLElement} */ (v_column.querySelector(".omnidb__permissions__list"));
	p_tag.addRoleBtn = /** @type {HTMLButtonElement} */ (v_column.querySelector(".omnidb__permissions__add-role"));
	p_tag.deleteRoleBtn = /** @type {HTMLButtonElement} */ (
		v_column.querySelector(".omnidb__permissions__delete-role")
	);

	p_tag.addRoleBtn.addEventListener("click", function () {
		openCreateRoleDialog(p_tag);
	});
	p_tag.deleteRoleBtn.addEventListener("click", function () {
		if (p_tag.selectedRole) confirmDropRole(p_tag, p_tag.selectedRole);
	});

	fetchRoles(p_tag);
}

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
 * @param {Array<{v_name: string, v_oid: number, v_can_login: boolean, v_is_public?: boolean}>} p_roles
 */
function renderRolesList(p_tag, p_roles) {
	p_tag.roles = p_roles;
	p_tag.rolesListDiv.innerHTML = "";

	for (var i = 0; i < p_roles.length; i++) {
		(function (p_role) {
			var v_row = document.createElement("div");
			v_row.className = "omnidb__permissions__role-row";
			if (p_role.v_is_public) v_row.classList.add("omnidb__permissions__role-row--public");
			if (p_tag.selectedRole === p_role.v_name) v_row.classList.add("omnidb__permissions__role-row--selected");

			var v_icon = document.createElement("i");
			v_icon.className = "fas " + (p_role.v_is_public ? "fa-globe" : p_role.v_can_login ? "fa-user" : "fa-user-friends");
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_role.v_name;
			v_row.appendChild(v_label);

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
		})(p_roles[i]);
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
			v_rows[i].textContent === p_role_name,
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
	showConfirm(
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
		},
		true,
		t("tree.create_role"),
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
			showConfirm(
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
				},
				true,
				t("common.save"),
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

	showConfirm(
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
		var v_na_members = document.createElement("div");
		v_na_members.className = "omnidb__permissions__list-empty";
		v_na_members.textContent = t("permissions.public_membership_not_applicable");
		v_col_state.membersListDiv.appendChild(v_na_members);

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
 * @param {Array<{v_name: string, v_direct: boolean, v_admin_option: boolean}>} p_ancestors
 */
function renderAncestorsList(p_tag, p_col_state, p_ancestors) {
	var v_rows = [{ v_name: "PUBLIC", v_direct: false, v_admin_option: false, v_is_public: true }].concat(
		p_ancestors.map(function (p_ancestor) {
			return {
				v_name: p_ancestor.v_name,
				v_direct: p_ancestor.v_direct,
				v_admin_option: p_ancestor.v_admin_option,
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
			v_icon.className = "fas " + (p_row.v_is_public ? "fa-globe" : "fa-users");
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_row.v_name;
			v_row.appendChild(v_label);

			if (p_row.v_direct && p_row.v_admin_option) {
				var v_suffix = document.createElement("span");
				v_suffix.className = "omnidb__permissions__row-suffix";
				v_suffix.textContent = t("permissions.admin_option_suffix");
				v_row.appendChild(v_suffix);
			}

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
 * The top half's flattened "members" closure for the focused role -- the
 * mirror image of renderAncestorsList: every role that is, directly or
 * indirectly, a member of the focused role (so inherits its privileges),
 * rather than every role the focused role is itself a member of. No
 * synthesized PUBLIC row here -- see this file's Phase 10b module comment
 * for why there's no universal entry to add on this side.
 * @param {any} p_tag
 * @param {any} p_col_state
 * @param {Array<{v_name: string, v_direct: boolean}>} p_descendants
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
			v_icon.className = "fas fa-users";
			v_row.appendChild(v_icon);

			var v_label = document.createElement("span");
			v_label.textContent = p_row.v_name;
			v_row.appendChild(v_label);

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
 * @param {{v_name: string, v_direct: boolean}} p_row
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
 * @returns {{listDiv: HTMLElement, getValue: () => string | null}}
 */
function buildRolePickerList(p_container, p_roles) {
	var v_list = document.createElement("div");
	v_list.className = "omnidb__permissions__role-picker";

	var v_selected = p_roles.length > 0 ? p_roles[0].v_name : null;

	function renderRows() {
		v_list.innerHTML = "";
		for (var i = 0; i < p_roles.length; i++) {
			(function (p_role) {
				var v_row = document.createElement("div");
				v_row.className = "omnidb__permissions__role-row";
				if (p_role.v_name === v_selected) v_row.classList.add("omnidb__permissions__role-row--selected");

				var v_icon = document.createElement("i");
				v_icon.className = "fas " + (p_role.v_can_login ? "fa-user" : "fa-user-friends");
				v_row.appendChild(v_icon);

				var v_label = document.createElement("span");
				v_label.textContent = p_role.v_name;
				v_row.appendChild(v_label);

				v_row.addEventListener("click", function () {
					v_selected = p_role.v_name;
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
		getValue: function () {
			return v_selected;
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

	/** @type {{getValue: () => string | null} | null} */
	var v_picker = null;

	showConfirm(
		"",
		function () {
			var v_picked = v_picker ? v_picker.getValue() : null;
			var v_admin = /** @type {HTMLInputElement} */ (document.getElementById("perm_grant_admin_option")).checked;

			if (!v_picked) {
				showAlert(t("permissions.select_role_hint"));
				return;
			}

			var v_member = p_direction === "ancestor" ? v_role : v_picked;
			var v_parent = p_direction === "ancestor" ? v_picked : v_role;

			execAjax(
				"/grant_role_membership_postgresql/",
				JSON.stringify({
					p_database_index: p_tag.connID,
					p_tab_id: p_tag.tabID,
					p_member: v_member,
					p_parent: v_parent,
					p_admin_option: v_admin,
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
		},
		true,
		t(p_direction === "ancestor" ? "permissions.grant_membership" : "permissions.grant_membership_reverse"),
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
	{ value: "schema", labelKey: "permissions.object_type_schema", needsSchema: false, listEndpoint: "/get_schemas_postgresql/", nameField: "v_name", privileges: ["CREATE", "USAGE"] },
	{ value: "table", labelKey: "permissions.object_type_table", needsSchema: true, listEndpoint: "/get_tables_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "view", labelKey: "permissions.object_type_view", needsSchema: true, listEndpoint: "/get_views_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "sequence", labelKey: "permissions.object_type_sequence", needsSchema: true, listEndpoint: "/get_sequences_postgresql/", nameField: "v_sequence_name", privileges: ["USAGE", "SELECT", "UPDATE"] },
	{ value: "function", labelKey: "permissions.object_type_function", needsSchema: true, listEndpoint: "/get_functions_postgresql/", nameField: "v_id", privileges: ["EXECUTE"] },
	{ value: "procedure", labelKey: "permissions.object_type_procedure", needsSchema: true, listEndpoint: "/get_procedures_postgresql/", nameField: "v_id", privileges: ["EXECUTE"] },
	{ value: "materialized_view", labelKey: "permissions.object_type_materialized_view", needsSchema: true, listEndpoint: "/get_mviews_postgresql/", nameField: "v_name", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] },
	{ value: "type", labelKey: "permissions.object_type_type", needsSchema: true, listEndpoint: "/get_types_postgresql/", nameField: "v_type_name", privileges: ["USAGE"] },
	{ value: "domain", labelKey: "permissions.object_type_domain", needsSchema: true, listEndpoint: "/get_domains_postgresql/", nameField: "v_domain_name", privileges: ["USAGE"] },
	{ value: "foreign_data_wrapper", labelKey: "permissions.object_type_foreign_data_wrapper", needsSchema: false, listEndpoint: "/get_foreign_data_wrappers_postgresql/", nameField: "v_name", privileges: ["USAGE"] },
	{ value: "foreign_server", labelKey: "permissions.object_type_foreign_server", needsSchema: false, listEndpoint: "/get_all_foreign_servers_postgresql/", nameField: "v_name", privileges: ["USAGE"] },
];

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

/**
 * @param {string} p_type
 */
function objectTypeIcon(p_type) {
	switch (p_type) {
		case "database":
			return "fa-database";
		case "tablespace":
			return "fa-layer-group";
		case "schema":
			return "fa-folder";
		case "table":
			return "fa-table";
		case "view":
			return "fa-eye";
		case "sequence":
			// Only the descending variant is in this app's icon set (see
			// gen-icons.mjs's MAPPING) -- fa-sort-numeric-up isn't, and
			// silently rendered as a blank mask (a solid square).
			return "fa-sort-numeric-down";
		case "function":
			return "fa-terminal";
		case "procedure":
			return "fa-cog";
		case "materialized_view":
			return "fa-copy";
		case "type":
			return "fa-cube";
		case "domain":
			return "fa-cubes";
		case "foreign_data_wrapper":
			return "fa-plug";
		case "foreign_server":
			return "fa-server";
		default:
			return "fa-key";
	}
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
			fetchSchemasForPicker(p_tag, p_col_state, p_database, function (p_schemas) {
				populateSelectOptions(v_schema_field.select, p_schemas);

				var v_object_field = buildSelectField(p_container, "perm_grant_object_name", t("permissions.object_label"));
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
	showConfirm(
		"",
		function () {
			var v_type = /** @type {HTMLSelectElement} */ (document.getElementById("perm_grant_object_type")).value;
			var v_database_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_object_database"));
			var v_schema_select = /** @type {HTMLSelectElement | null} */ (document.getElementById("perm_grant_object_schema"));
			var v_object_select = /** @type {HTMLSelectElement} */ (document.getElementById("perm_grant_object_name"));
			var v_grantable = /** @type {HTMLInputElement} */ (document.getElementById("perm_grant_object_grantable")).checked;

			var v_object = v_object_select.value;
			if (!v_object) {
				showAlert(t("permissions.select_object_hint"));
				return;
			}

			var v_privileges = [];
			var v_checkboxes = document.querySelectorAll(".perm_grant_privilege_checkbox:checked");
			for (var i = 0; i < v_checkboxes.length; i++) v_privileges.push(/** @type {HTMLInputElement} */ (v_checkboxes[i]).value);
			if (v_privileges.length === 0) {
				showAlert(t("permissions.select_privilege_hint"));
				return;
			}

			var v_database = v_database_select ? v_database_select.value : undefined;

			var v_body = {
				p_database_index: p_tag.connID,
				p_tab_id: p_tag.tabID,
				p_role: p_role_name,
				p_object_type: v_type,
				p_schema: v_schema_select ? v_schema_select.value : "",
				p_object: v_object,
				p_privileges: v_privileges,
				p_grantable: v_grantable,
			};
			if (v_database) v_body.p_database = v_database;

			execAjax(
				"/grant_object_privilege_postgresql/",
				JSON.stringify(v_body),
				function () {
					p_on_granted(v_database, v_type, v_object);
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
		},
		true,
		p_title,
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

	p_tag.columnsDiv.appendChild(v_column);

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

	v_col_state.addBtn.addEventListener("click", function () {
		openAddObjectPrivilegeDialog(p_tag, v_col_state);
	});

	fetchObjectsColumnData(p_tag, v_col_state);
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
				];
			},
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

	var v_databases_group = v_tree.createNode(t("tree.databases"), false, "fas fa-folder", undefined, null, null, null, false);
	for (var d = 0; d < p_databases.length; d++) {
		var v_db_name = p_databases[d].v_name;
		var v_db_grant = v_database_grants[v_db_name] || emptyGrantFor("database", "", v_db_name, v_db_name);
		var v_db_node = v_databases_group.createChildNode(
			stripPgIdentQuotes(v_db_name),
			false,
			"fas " + objectTypeIcon("database"),
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

	var v_tablespaces_group = v_tree.createNode(t("tree.tablespaces"), false, "fas fa-folder", undefined, null, null, null, false);
	for (var s = 0; s < p_tablespaces.length; s++) {
		var v_ts_name = p_tablespaces[s].v_name;
		var v_ts_grant = v_tablespace_grants[v_ts_name] || emptyGrantFor("tablespace", "", v_ts_name, v_ts_name);
		var v_ts_node = v_tablespaces_group.createChildNode(
			v_ts_name,
			false,
			"fas " + objectTypeIcon("tablespace"),
			{ grant: v_ts_grant },
			"cm_perm_grant",
			v_ts_grant.v_privileges.length > 0 ? null : "var(--text-secondary)",
			false,
		);
		p_col_state.tablespaceNodes[v_ts_name] = { node: v_ts_node };
	}

	v_tree.drawTree();

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
	execAjax(
		"/get_role_database_grants_postgresql/",
		JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_col_state.role, p_database: p_database }),
		function (p_return) {
			populateDatabaseNodeChildren(p_database_node, p_database, p_return.v_data);
		},
		function (p_return) {
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
		},
		"box",
		true,
	);
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
 */
function populateDatabaseNodeChildren(p_database_node, p_database, p_grants) {
	p_database_node.removeChildNodes();

	if (p_grants.length === 0) {
		p_database_node.createChildNode(t("permissions.no_database_grants"), false, null, null, null, "var(--text-secondary)", true);
		return;
	}

	var v_grouped = groupDatabaseObjectGrants(p_grants);

	function appendGrantLeafNode(p_parent_node, p_grant) {
		p_parent_node.createChildNode(
			p_grant.v_identifier,
			false,
			"fas " + objectTypeIcon(p_grant.v_object_type),
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
			"fas fa-folder",
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

			var v_type_node = v_schema_node.createChildNode(t(v_spec.labelKey), false, "fas fa-folder", null, null, null, true);
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
		var v_top_node = p_database_node.createChildNode(t(v_spec2.labelKey), false, "fas fa-folder", undefined, null, null, true);
		for (var m = 0; m < v_grants_of_type.length; m++) appendGrantLeafNode(v_top_node, v_grants_of_type[m]);
	}
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

	showConfirm(
		"",
		function () {
			var v_to_grant = [];
			var v_to_revoke = [];
			for (var i = 0; i < v_spec.privileges.length; i++) {
				var v_priv = v_spec.privileges[i];
				var v_checkbox = /** @type {HTMLInputElement} */ (document.getElementById("perm_detail_priv_" + v_priv));
				if (v_checkbox.disabled) continue;
				var v_was_direct = effectivePrivilegeIsDirect(v_sources_by_privilege[v_priv], p_role_name);
				if (v_checkbox.checked && !v_was_direct) v_to_grant.push(v_priv);
				if (!v_checkbox.checked && v_was_direct) v_to_revoke.push(v_priv);
			}
			if (v_to_grant.length === 0 && v_to_revoke.length === 0) return;

			var v_grantable_input = /** @type {HTMLInputElement} */ (document.getElementById("perm_detail_grantable"));

			/** @type {Array<(done: () => void) => void>} */
			var v_ops = [];
			if (v_to_grant.length > 0) {
				v_ops.push(function (p_done) {
					execAjax(
						"/grant_object_privilege_postgresql/",
						JSON.stringify(
							Object.assign(
								{
									p_database_index: p_tag.connID,
									p_tab_id: p_tag.tabID,
									p_role: p_role_name,
									p_object_type: p_grant.v_object_type,
									p_schema: v_schema,
									p_object: v_object,
									p_privileges: v_to_grant,
									p_grantable: v_grantable_input.checked,
								},
								p_extra_fields,
							),
						),
						p_done,
						function (p_return) {
							showAlert(p_return.v_data.message || p_return.v_data);
						},
						"box",
						false,
					);
				});
			}
			if (v_to_revoke.length > 0) {
				v_ops.push(function (p_done) {
					execAjax(
						"/revoke_object_privilege_postgresql/",
						JSON.stringify(
							Object.assign(
								{
									p_database_index: p_tag.connID,
									p_tab_id: p_tag.tabID,
									p_role: p_role_name,
									p_object_type: p_grant.v_object_type,
									p_schema: v_schema,
									p_object: v_object,
									p_privileges: v_to_revoke,
								},
								p_extra_fields,
							),
						),
						p_done,
						function (p_return) {
							showAlert(p_return.v_data.message || p_return.v_data);
						},
						"box",
						false,
					);
				});
			}

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
					v_input.checked = !!v_sources;
					v_input.disabled = !v_direct && v_inherited_sources.length > 0;

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
		},
		true,
		p_grant.v_identifier,
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
 * @param {any} p_tag
 * @param {string} p_role_name
 */
function confirmDropRole(p_tag, p_role_name) {
	showConfirm(
		t("permissions.confirm_drop_role", { role: p_role_name }),
		function () {
			execAjax(
				"/drop_role_postgresql/",
				JSON.stringify({ p_database_index: p_tag.connID, p_tab_id: p_tag.tabID, p_role: p_role_name }),
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
	);
}
