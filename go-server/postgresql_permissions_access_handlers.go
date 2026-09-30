package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// pgGetObjectAccessRequest: same object addressing as the grant requests
// (p_schema/p_object in verifyGrantableObject's convention, p_database for a
// database-scoped type).
type pgGetObjectAccessRequest struct {
	baseRequest
	PObjectType string `json:"p_object_type"`
	PSchema     string `json:"p_schema"`
	PObject     string `json:"p_object"`
	PDatabase   string `json:"p_database"`
}

func handleGetObjectAccessPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetObjectAccessRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		owner, roles, err := postgresqlObjectAccess(db, reqBody.PObjectType, reqBody.PSchema, reqBody.PObject)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(roles))
		for _, role := range roles {
			privs := make([]map[string]any, 0, len(role.Privileges))
			for _, p := range role.Privileges {
				privs = append(privs, map[string]any{"v_privilege": p.Privilege, "v_source": p.Source, "v_grantable": p.Grantable})
			}
			out = append(out, map[string]any{"v_role": role.Role, "v_superuser": role.Superuser, "v_privileges": privs})
		}
		writeEnvelope(w, map[string]any{"v_owner": owner, "v_roles": out}, false, -1)
	}
}
