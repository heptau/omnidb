package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// effectiveObjectGrantsEnvelope mirrors postgresqlEffectiveObjectGrants —
// each privilege carries its own list of sources (grantee + that grantee's
// own grant option) rather than a single flattened grantee/grantable pair,
// so the frontend can tell a direct grant from an inherited one (and show
// "inherited from: ..." for the latter) without another round trip.
func effectiveObjectGrantsEnvelope(items []postgresqlEffectiveObjectGrants) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, g := range items {
		privileges := make([]map[string]any, 0, len(g.Privileges))
		for _, p := range g.Privileges {
			sources := make([]map[string]any, 0, len(p.Sources))
			for _, s := range p.Sources {
				sources = append(sources, map[string]any{"v_grantee": s.Grantee, "v_grantable": s.Grantable})
			}
			privileges = append(privileges, map[string]any{"v_privilege": p.Privilege, "v_sources": sources})
		}
		out = append(out, map[string]any{
			"v_object_type": g.ObjectType,
			"v_schema":      g.Schema,
			"v_object_name": g.ObjectName,
			"v_identifier":  g.Identifier,
			"v_privileges":  privileges,
		})
	}
	return out
}

type pgGetRoleServerGrantsRequest struct {
	baseRequest
	PRole string `json:"p_role"`
}

// handleGetRoleServerGrantsPostgreSQL backs the Permissions panel's column 3
// (postgresqlRoleServerObjectGrants) — the role's effective database and
// tablespace privileges.
func handleGetRoleServerGrantsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleServerGrantsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		grants, err := postgresqlRoleServerObjectGrants(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, effectiveObjectGrantsEnvelope(grants), false, -1)
	}
}

type pgGetRoleDatabaseGrantsRequest struct {
	baseRequest
	PRole     string `json:"p_role"`
	PDatabase string `json:"p_database"`
}

// handleGetRoleDatabaseGrantsPostgreSQL backs the Permissions panel's
// column 4 (postgresqlRoleDatabaseObjectGrants) — unlike every other
// permissions route, it connects to p_database explicitly
// (resolvePostgreSQLRequestForDatabase, postgresql_handlers.go) rather than
// the tab's own remembered active database, since the whole point of
// column 4's own database picker is choosing one independent of whatever
// the tab happens to be pointed at.
func handleGetRoleDatabaseGrantsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleDatabaseGrantsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil || reqBody.PDatabase == "" {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		grants, err := postgresqlRoleDatabaseObjectGrants(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, effectiveObjectGrantsEnvelope(grants), false, -1)
	}
}
