package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// pgBulkObjectPrivilegeRequest: PRevoke flips GRANT into REVOKE; PDatabase
// and PPreview behave as in pgGrantObjectPrivilegeRequest.
type pgBulkObjectPrivilegeRequest struct {
	baseRequest
	PRole       string   `json:"p_role"`
	PKind       string   `json:"p_kind"`
	PSchema     string   `json:"p_schema"`
	PPrivileges []string `json:"p_privileges"`
	PGrantable  bool     `json:"p_grantable"`
	PRevoke     bool     `json:"p_revoke"`
	PDatabase   string   `json:"p_database"`
	PPreview    bool     `json:"p_preview"`
}

func handleBulkObjectPrivilegePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgBulkObjectPrivilegeRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		stmt, err := buildBulkObjectPrivilegeSQL(db, reqBody.PRevoke, reqBody.PRole, reqBody.PKind, reqBody.PSchema, reqBody.PPrivileges, reqBody.PGrantable)
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

// pgAlterDefaultPrivilegesRequest: PRole is the grantee; PCreator ("" = the
// connecting user) and PSchema ("" = database-wide) scope the default.
type pgAlterDefaultPrivilegesRequest struct {
	baseRequest
	PRole       string   `json:"p_role"`
	PCreator    string   `json:"p_creator"`
	PSchema     string   `json:"p_schema"`
	PKind       string   `json:"p_kind"`
	PPrivileges []string `json:"p_privileges"`
	PGrantable  bool     `json:"p_grantable"`
	PRevoke     bool     `json:"p_revoke"`
	PDatabase   string   `json:"p_database"`
	PPreview    bool     `json:"p_preview"`
}

func handleAlterDefaultPrivilegesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgAlterDefaultPrivilegesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		stmt, err := buildAlterDefaultPrivilegesSQL(db, reqBody.PRevoke, reqBody.PRole, reqBody.PCreator, reqBody.PSchema, reqBody.PKind, reqBody.PPrivileges, reqBody.PGrantable)
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

type pgGetRoleDefaultPrivilegesRequest struct {
	baseRequest
	PRole     string `json:"p_role"`
	PDatabase string `json:"p_database"`
}

func handleGetRoleDefaultPrivilegesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleDefaultPrivilegesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		entries, err := postgresqlRoleDefaultPrivileges(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(entries))
		for _, e := range entries {
			privs := make([]map[string]any, 0, len(e.Privileges))
			for _, p := range e.Privileges {
				privs = append(privs, map[string]any{"v_privilege": p.Privilege, "v_grantable": p.Grantable})
			}
			out = append(out, map[string]any{
				"v_creator":    e.Creator,
				"v_schema":     e.Schema,
				"v_kind":       e.Kind,
				"v_grantee":    e.Grantee,
				"v_privileges": privs,
			})
		}
		writeEnvelope(w, out, false, -1)
	}
}
