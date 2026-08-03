package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

func namedOIDEnvelope(items []postgresqlNamedOID) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, i := range items {
		out = append(out, map[string]any{"v_name": i.Name, "v_oid": i.OID})
	}
	return out
}

func roleEnvelope(items []postgresqlRole) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, i := range items {
		out = append(out, map[string]any{"v_name": i.Name, "v_oid": i.OID, "v_can_login": i.CanLogin})
	}
	return out
}

// handleGetDatabaseObjectsPostgreSQL mirrors get_database_objects — a
// pass-through stub in Python (`v_return['v_data'] = {}`, no query at all).
func handleGetDatabaseObjectsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		db.Close()
		writeEnvelope(w, map[string]any{}, false, -1)
	}
}

func handleGetDatabasesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlDatabases(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namedOIDEnvelope(items), false, -1)
	}
}

func handleGetTablespacesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlTablespaces(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namedOIDEnvelope(items), false, -1)
	}
}

func handleGetRolesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlRoles(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, roleEnvelope(items), false, -1)
	}
}

func handleGetExtensionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlExtensions(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namedOIDEnvelope(items), false, -1)
	}
}

func handleGetSequencesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlSequences(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		// Mirrors Python's get_sequences response key (v_sequence_name, not
		// v_name — confirmed from the catalog, unlike the other named-OID
		// listings above).
		out := make([]map[string]any, 0, len(items))
		for _, i := range items {
			out = append(out, map[string]any{"v_sequence_name": i.Name, "v_oid": i.OID})
		}
		writeEnvelope(w, out, false, -1)
	}
}

func handleGetTypesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlTypes(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(items))
		for _, i := range items {
			out = append(out, map[string]any{"v_type_name": i.Name, "v_oid": i.OID})
		}
		writeEnvelope(w, out, false, -1)
	}
}

func handleGetDomainsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlDomains(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(items))
		for _, i := range items {
			out = append(out, map[string]any{"v_domain_name": i.Name, "v_oid": i.OID})
		}
		writeEnvelope(w, out, false, -1)
	}
}

type pgKillBackendRequest struct {
	baseRequest
	PPid flexInt `json:"p_pid"`
}

func handleKillBackendPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgKillBackendRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if err := postgresqlKillBackend(db, int64(reqBody.PPid)); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgChangeRolePasswordRequest struct {
	baseRequest
	PRole     string `json:"p_role"`
	PPassword string `json:"p_password"`
}

func handleChangeRolePasswordPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgChangeRolePasswordRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if err := postgresqlChangeRolePassword(db, reqBody.PRole, reqBody.PPassword); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type pgObjectDescriptionRequest struct {
	baseRequest
	POid      int64  `json:"p_oid"`
	PType     string `json:"p_type"`
	PPosition int    `json:"p_position"`
}

func handleGetObjectDescriptionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgObjectDescriptionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		desc, err := postgresqlObjectDescription(db, reqBody.PType, reqBody.POid, reqBody.PPosition)
		if err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, desc, false, -1)
	}
}

// handleGetVersionPostgreSQL mirrors get_version — wraps postgresqlVersion
// (already implemented in postgresql.go for internal use, never wired to an
// HTTP route until now) in the {'v_version': ...} shape Python's view uses.
func handleGetVersionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody baseRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		version, err := postgresqlVersion(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_version": version}, false, -1)
	}
}
