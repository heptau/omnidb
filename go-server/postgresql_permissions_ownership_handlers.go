package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

type pgGetRoleOwnedObjectsRequest struct {
	baseRequest
	PRole     string `json:"p_role"`
	PDatabase string `json:"p_database"`
}

func handleGetRoleOwnedObjectsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgGetRoleOwnedObjectsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		objects, truncated, err := postgresqlRoleOwnedObjects(db, reqBody.PRole)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(objects))
		for _, o := range objects {
			out = append(out, map[string]any{"v_object_type": o.ObjectType, "v_schema": o.Schema, "v_object": o.Object})
		}
		writeEnvelope(w, map[string]any{"v_objects": out, "v_truncated": truncated}, false, -1)
	}
}

// pgAlterObjectOwnerRequest: PRole is the *new* owner, consistent with the
// other Permissions requests where p_role is the role being acted on.
type pgAlterObjectOwnerRequest struct {
	baseRequest
	PRole       string `json:"p_role"`
	PObjectType string `json:"p_object_type"`
	PSchema     string `json:"p_schema"`
	PObject     string `json:"p_object"`
	PDatabase   string `json:"p_database"`
	PPreview    bool   `json:"p_preview"`
}

func handleAlterObjectOwnerPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgAlterObjectOwnerRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := resolvePostgreSQLRequestForDatabase(w, r, upstream, fallback, reqBody.databaseIndex(), reqBody.tabID(), reqBody.PDatabase)
		if !ok {
			return
		}
		defer db.Close()

		stmt, err := buildAlterObjectOwnerSQL(db, reqBody.PRole, reqBody.PObjectType, reqBody.PSchema, reqBody.PObject)
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
