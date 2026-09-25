package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// PDatabase is optional and empty for every caller except the Permissions
// panel's column 4 (see resolvePostgreSQLRequestForDatabase's comment,
// postgresql_handlers.go) -- when set, the grant runs against that specific
// database rather than the tab's own remembered active one, exactly like
// handleGetRoleDatabaseGrantsPostgreSQL reads from it.
type pgGrantObjectPrivilegeRequest struct {
	baseRequest
	PRole       string   `json:"p_role"`
	PObjectType string   `json:"p_object_type"`
	PSchema     string   `json:"p_schema"`
	PObject     string   `json:"p_object"`
	PPrivileges []string `json:"p_privileges"`
	PGrantable  bool     `json:"p_grantable"`
	PDatabase   string   `json:"p_database"`
}

func handleGrantObjectPrivilegePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGrantObjectPrivilegeRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		if err := postgresqlGrantObjectPrivilege(db, reqBody.PRole, reqBody.PObjectType, reqBody.PSchema, reqBody.PObject, reqBody.PPrivileges, reqBody.PGrantable); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// PDatabase: see pgGrantObjectPrivilegeRequest's comment.
type pgRevokeObjectPrivilegeRequest struct {
	baseRequest
	PRole       string   `json:"p_role"`
	PObjectType string   `json:"p_object_type"`
	PSchema     string   `json:"p_schema"`
	PObject     string   `json:"p_object"`
	PPrivileges []string `json:"p_privileges"`
	PDatabase   string   `json:"p_database"`
}

func handleRevokeObjectPrivilegePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgRevokeObjectPrivilegeRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		if err := postgresqlRevokeObjectPrivilege(db, reqBody.PRole, reqBody.PObjectType, reqBody.PSchema, reqBody.PObject, reqBody.PPrivileges); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
