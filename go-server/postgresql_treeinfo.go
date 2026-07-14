package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
)

// postgresqlTreeInfo mirrors tree_postgresql.py's get_tree_info: database
// name, version, and the 123 static DDL wizard templates (see
// postgresql_treeinfo_templates.go).
func postgresqlTreeInfo(db *sql.DB) (map[string]any, error) {
	var databaseName string
	if err := db.QueryRow(`select current_database()`).Scan(&databaseName); err != nil {
		return nil, err
	}
	version, err := postgresqlVersion(db)
	if err != nil {
		return nil, err
	}
	verNum, err := pgServerVersionNum(db)
	if err != nil {
		return nil, err
	}

	out := map[string]any{
		"v_database": databaseName,
		"version":    version,
	}
	for k, v := range postgresqlTreeInfoTemplates(verNum) {
		out[k] = v
	}
	return out, nil
}

// handleGetTreeInfoPostgreSQL mirrors tree_postgresql.py's get_tree_info —
// the DDL-wizard endpoint, deliberately deferred until now (see
// go-backend-migration memory for why: 123 templates, mostly static text
// version-gated on server_version_num, extracted mechanically from
// PostgreSQL.py rather than hand-transcribed).
func handleGetTreeInfoPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		treeInfo, err := postgresqlTreeInfo(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{
			"v_mode":            "database",
			"v_database_return": treeInfo,
		}, false, -1)
	}
}
