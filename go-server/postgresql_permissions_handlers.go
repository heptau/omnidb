package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

// pgRoleAttributesFields is embedded by every request below that submits a
// role's attribute set (Create Role and Alter Role Attributes) — same field
// set as postgresqlRoleAttributes, just as request-decoded types.
type pgRoleAttributesFields struct {
	PCanLogin    bool    `json:"p_can_login"`
	PSuperuser   bool    `json:"p_superuser"`
	PCreateDB    bool    `json:"p_createdb"`
	PCreateRole  bool    `json:"p_createrole"`
	PInherit     bool    `json:"p_inherit"`
	PReplication bool    `json:"p_replication"`
	PBypassRLS   bool    `json:"p_bypass_rls"`
	PConnLimit   flexInt `json:"p_connection_limit"`
	PValidUntil  string  `json:"p_valid_until"`
}

func (f pgRoleAttributesFields) toAttributes() postgresqlRoleAttributes {
	return postgresqlRoleAttributes{
		CanLogin:    f.PCanLogin,
		Super:       f.PSuperuser,
		CreateDB:    f.PCreateDB,
		CreateRole:  f.PCreateRole,
		Inherit:     f.PInherit,
		Replication: f.PReplication,
		BypassRLS:   f.PBypassRLS,
		ConnLimit:   int64(f.PConnLimit),
		ValidUntil:  f.PValidUntil,
	}
}

func roleAttributesEnvelope(attrs postgresqlRoleAttributes) map[string]any {
	return map[string]any{
		"p_can_login":        attrs.CanLogin,
		"p_superuser":        attrs.Super,
		"p_createdb":         attrs.CreateDB,
		"p_createrole":       attrs.CreateRole,
		"p_inherit":          attrs.Inherit,
		"p_replication":      attrs.Replication,
		"p_bypass_rls":       attrs.BypassRLS,
		"p_connection_limit": attrs.ConnLimit,
		"p_valid_until":      attrs.ValidUntil,
	}
}

type pgCreateRoleRequest struct {
	baseRequest
	pgRoleAttributesFields
	PName     string `json:"p_name"`
	PPassword string `json:"p_password"`
	PPreview  bool   `json:"p_preview"`
}

func handleCreateRolePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgCreateRoleRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if reqBody.PPreview {
			stmt, err := buildCreateRoleSQL(db, reqBody.PName, reqBody.toAttributes(), reqBody.PPassword, true)
			writePreviewOrError(w, err, stmt)
			return
		}
		if err := postgresqlCreateRole(db, reqBody.PName, reqBody.toAttributes(), reqBody.PPassword); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgDropRoleRequest struct {
	baseRequest
	PRole       string `json:"p_role"`
	PReassignTo string `json:"p_reassign_to"`
	PDropOwned  bool   `json:"p_drop_owned"`
	PPreview    bool   `json:"p_preview"`
}

// handleDropRolePostgreSQL drops a role, first handing over what it owns
// (p_reassign_to) and revoking what it holds (p_drop_owned) in every
// database it has dependencies in -- see buildDropRolePlan. Needs the
// connection's own details to reach those other databases.
func handleDropRolePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgDropRoleRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolvePostgreSQLRequest(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID())
		if !ok {
			return
		}
		defer db.Close()

		steps, err := buildDropRolePlan(db, reqBody.PRole, reqBody.PReassignTo, reqBody.PDropOwned)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		if reqBody.PPreview {
			writeEnvelope(w, map[string]any{"v_sql": renderSQLPlan(steps)}, false, -1)
			return
		}
		if err := executeSQLPlan(db, info, steps); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgGetRoleDependenciesRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

// handleGetRoleDependenciesPostgreSQL backs the drop-role dialog's summary:
// per database, what the role owns and holds (see
// postgresqlRoleDependencyCounts), plus its direct memberships.
func handleGetRoleDependenciesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleDependenciesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		deps, err := postgresqlRoleDependencyCounts(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		databases := make([]map[string]any, 0, len(deps.Databases))
		for _, d := range deps.Databases {
			databases = append(databases, map[string]any{"v_name": d.Name, "v_owned": d.Owned, "v_acl": d.ACL, "v_other": d.Other})
		}
		writeEnvelope(w, map[string]any{"v_databases": databases, "v_member_of": deps.MemberOf, "v_members": deps.Members}, false, -1)
	}
}

type pgAlterRoleAttributesRequest struct {
	baseRequest
	pgRoleAttributesFields
	PRole    string `json:"p_role"`
	PPreview bool   `json:"p_preview"`
}

func handleAlterRoleAttributesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgAlterRoleAttributesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if reqBody.PPreview {
			stmt, err := buildAlterRoleAttributesSQL(db, reqBody.PRole, reqBody.toAttributes())
			writePreviewOrError(w, err, stmt)
			return
		}
		if err := postgresqlAlterRoleAttributes(db, reqBody.PRole, reqBody.toAttributes()); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgGetRoleAttributesRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

func handleGetRoleAttributesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleAttributesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		attrs, err := postgresqlRoleAttributesFor(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, roleAttributesEnvelope(attrs), false, -1)
	}
}

// ancestorsEnvelope merges postgresqlRoleAncestors' flattened closure with
// postgresqlRoleMemberships' direct-only admin_option flags, so the
// Permissions panel's column 2 can show "(admin option)" the same way it
// always could — postgresqlRoleAncestors' own recursive CTE has no reason
// to carry per-edge admin_option through an arbitrarily long chain of
// ancestors, so this reuses the existing direct-membership query instead of
// complicating that CTE for a value only ever shown on its depth-1 rows.
func ancestorsEnvelope(ancestors []postgresqlRoleAncestor, direct []postgresqlRoleMembership) []map[string]any {
	directByName := make(map[string]postgresqlRoleMembership, len(direct))
	for _, m := range direct {
		directByName[m.Name] = m
	}
	out := make([]map[string]any, 0, len(ancestors))
	for _, a := range ancestors {
		m := directByName[a.Name]
		row := map[string]any{"v_name": a.Name, "v_direct": a.Direct, "v_admin_option": m.AdminOption}
		// PostgreSQL 16+ INHERIT/SET options of a direct membership; null
		// for indirect rows and on older servers.
		if a.Direct && m.Inherit != nil && m.Set != nil {
			row["v_inherit"], row["v_set"] = *m.Inherit, *m.Set
		} else {
			row["v_inherit"], row["v_set"] = nil, nil
		}
		out = append(out, row)
	}
	return out
}

type pgGetRoleAncestorsRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

// handleGetRoleAncestorsPostgreSQL backs the Permissions panel's flat
// column 2 (postgresqlRoleAncestors) — replaces the old direct-only
// /get_role_memberships_postgresql/ endpoint that column used before the
// column-drilling redesign; postgresqlRoleMemberships itself is unchanged
// and still backs the DDL panel's own GRANT-statement reproduction.
func handleGetRoleAncestorsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleAncestorsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		ancestors, err := postgresqlRoleAncestors(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		direct, err := postgresqlRoleMemberships(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, ancestorsEnvelope(ancestors, direct), false, -1)
	}
}

type pgGetRoleDescendantsRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

// handleGetRoleDescendantsPostgreSQL backs the Permissions panel's column 2
// "Members" half (postgresqlRoleDescendants) — the mirror image of
// handleGetRoleAncestorsPostgreSQL just above: every role that is, directly
// or indirectly, a member of the focused role, rather than every role the
// focused role is itself a member of. Direct rows carry the same admin/inherit/
// set flags as ancestorsEnvelope's, from postgresqlRoleDirectMembers.
func handleGetRoleDescendantsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleDescendantsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		descendants, err := postgresqlRoleDescendants(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		directMembers, err := postgresqlRoleDirectMembers(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		directByName := make(map[string]postgresqlRoleMembership, len(directMembers))
		for _, m := range directMembers {
			directByName[m.Name] = m
		}
		out := make([]map[string]any, 0, len(descendants))
		for _, d := range descendants {
			m := directByName[d.Name]
			row := map[string]any{"v_name": d.Name, "v_direct": d.Direct, "v_admin_option": m.AdminOption, "v_inherit": nil, "v_set": nil}
			// PostgreSQL 16+ options of a direct membership (null otherwise).
			if d.Direct && m.Inherit != nil && m.Set != nil {
				row["v_inherit"], row["v_set"] = *m.Inherit, *m.Set
			}
			out = append(out, row)
		}
		writeEnvelope(w, out, false, -1)
	}
}

type pgGrantRoleMembershipRequest struct {
	baseRequest
	PMember      string `json:"p_member"`
	PParent      string `json:"p_parent"`
	PAdminOption bool   `json:"p_admin_option"`
	PInherit     *bool  `json:"p_inherit"` // PostgreSQL 16+; nil = server default
	PSet         *bool  `json:"p_set"`     // PostgreSQL 16+; nil = server default
	PPreview     bool   `json:"p_preview"`
}

func handleGrantRoleMembershipPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGrantRoleMembershipRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if reqBody.PPreview {
			stmt, err := buildGrantRoleMembershipSQL(db, reqBody.PMember, reqBody.PParent, reqBody.PAdminOption, reqBody.PInherit, reqBody.PSet)
			writePreviewOrError(w, err, stmt)
			return
		}
		if err := postgresqlGrantRoleMembership(db, reqBody.PMember, reqBody.PParent, reqBody.PAdminOption, reqBody.PInherit, reqBody.PSet); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgRevokeRoleMembershipRequest struct {
	baseRequest
	PMember  string `json:"p_member"`
	PParent  string `json:"p_parent"`
	PPreview bool   `json:"p_preview"`
}

func handleRevokeRoleMembershipPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgRevokeRoleMembershipRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if reqBody.PPreview {
			stmt, err := buildRevokeRoleMembershipSQL(db, reqBody.PMember, reqBody.PParent)
			writePreviewOrError(w, err, stmt)
			return
		}
		if err := postgresqlRevokeRoleMembership(db, reqBody.PMember, reqBody.PParent); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// writePreviewOrError answers a p_preview request: the statement text the
// real call would have executed, as {v_sql}, or the same error the real call
// would have raised (unknown role/object, invalid privilege, ...). Nothing is
// ever executed on this path.
func writePreviewOrError(w http.ResponseWriter, err error, stmts ...string) {
	if err != nil {
		writeDatabaseError(w, err.Error())
		return
	}
	writeEnvelope(w, map[string]any{"v_sql": strings.Join(stmts, ";\n") + ";"}, false, -1)
}

type pgCloneRoleRequest struct {
	baseRequest
	PSource          string `json:"p_source"`
	PName            string `json:"p_name"`
	PPassword        string `json:"p_password"`
	PCopyMemberships bool   `json:"p_copy_memberships"`
	PCopyPrivileges  bool   `json:"p_copy_privileges"`
	PPreview         bool   `json:"p_preview"`
}

// handleCloneRolePostgreSQL creates a new role modelled on an existing one
// (see buildCloneRolePlan). Like drop, it needs the connection's own details
// to reach the other databases the source holds privileges in.
func handleCloneRolePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgCloneRoleRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolvePostgreSQLRequest(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID())
		if !ok {
			return
		}
		defer db.Close()

		steps, err := buildCloneRolePlan(db, info, reqBody.PSource, reqBody.PName, reqBody.PPassword, reqBody.PPreview, reqBody.PCopyMemberships, reqBody.PCopyPrivileges)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		if reqBody.PPreview {
			writeEnvelope(w, map[string]any{"v_sql": renderSQLPlan(steps)}, false, -1)
			return
		}
		if err := executeSQLPlan(db, info, steps); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgExportPermissionsRequest struct {
	baseRequest
	PRole              string `json:"p_role"` // "" = every non-predefined role
	PRoles             bool   `json:"p_roles"`
	PMemberships       bool   `json:"p_memberships"`
	PPrivileges        bool   `json:"p_privileges"`
	PDefaultPrivileges bool   `json:"p_default_privileges"`
}

// handleExportPermissionsPostgreSQL returns the permissions-export script
// (see buildPermissionsExport) as {v_sql}; read-only.
func handleExportPermissionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgExportPermissionsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolvePostgreSQLRequest(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID())
		if !ok {
			return
		}
		defer db.Close()

		script, err := buildPermissionsExport(db, info, reqBody.PRole, pgPermissionsExportOptions{
			Roles:             reqBody.PRoles,
			Memberships:       reqBody.PMemberships,
			Privileges:        reqBody.PPrivileges,
			DefaultPrivileges: reqBody.PDefaultPrivileges,
		})
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_sql": script}, false, -1)
	}
}

type pgRenameRoleRequest struct {
	baseRequest
	PRole    string `json:"p_role"`
	PNewName string `json:"p_new_name"`
	PPreview bool   `json:"p_preview"`
}

func handleRenameRolePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgRenameRoleRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		stmt, err := buildRenameRoleSQL(db, reqBody.PRole, reqBody.PNewName)
		if reqBody.PPreview {
			writePreviewOrError(w, err, stmt)
			return
		}
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		if _, err := db.Exec(stmt); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
