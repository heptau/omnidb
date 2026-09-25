package main

import (
	"encoding/json"
	"net/http"
	"net/url"
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

		if err := postgresqlCreateRole(db, reqBody.PName, reqBody.toAttributes(), reqBody.PPassword); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgDropRoleRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

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
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if err := postgresqlDropRole(db, reqBody.PRole); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgAlterRoleAttributesRequest struct {
	baseRequest
	pgRoleAttributesFields
	PRole string `json:"p_role"`
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
	adminOptionByName := make(map[string]bool, len(direct))
	for _, m := range direct {
		adminOptionByName[m.Name] = m.AdminOption
	}
	out := make([]map[string]any, 0, len(ancestors))
	for _, a := range ancestors {
		out = append(out, map[string]any{"v_name": a.Name, "v_direct": a.Direct, "v_admin_option": adminOptionByName[a.Name]})
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
// focused role is itself a member of. No admin_option merge here (unlike
// ancestorsEnvelope) — the "Members" list doesn't show that suffix.
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
		out := make([]map[string]any, 0, len(descendants))
		for _, d := range descendants {
			out = append(out, map[string]any{"v_name": d.Name, "v_direct": d.Direct})
		}
		writeEnvelope(w, out, false, -1)
	}
}

type pgGrantRoleMembershipRequest struct {
	baseRequest
	PMember      string `json:"p_member"`
	PParent      string `json:"p_parent"`
	PAdminOption bool   `json:"p_admin_option"`
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

		if err := postgresqlGrantRoleMembership(db, reqBody.PMember, reqBody.PParent, reqBody.PAdminOption); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgRevokeRoleMembershipRequest struct {
	baseRequest
	PMember string `json:"p_member"`
	PParent string `json:"p_parent"`
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

		if err := postgresqlRevokeRoleMembership(db, reqBody.PMember, reqBody.PParent); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
