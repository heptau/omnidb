package main

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"net/http"
	"net/url"
)

//go:embed postgresql_export_dbml.sql
var postgresqlExportDBMLQuery string

// postgresqlExportDBML runs the embedded pg_dbml query and returns the
// generated DBML document as a single string. string_agg() returns NULL for
// a database with no user tables, which comes back as "" rather than an
// error — an empty schema is a perfectly valid (if boring) export.
func postgresqlExportDBML(db *sql.DB) (string, error) {
	var out sql.NullString
	if err := db.QueryRow(postgresqlExportDBMLQuery).Scan(&out); err != nil {
		return "", err
	}
	return out.String, nil
}

// exportDBMLRequest adds the right-clicked node's own database name to
// baseRequest. Needed because, unlike every other cm_database action (which
// either doesn't touch the database at all, e.g. Drop, or names the object
// explicitly in its own request, e.g. get_properties_postgresql's p_object),
// this one has to actually *connect to* the target database to introspect
// its catalog — and tree_postgresql.js's checkCurrentDatabase is a no-op for
// database-type nodes when called with p_complete_check=false (its guard
// condition is false whenever node.tag.type == "database"), so nothing ever
// switches the tab's "active database" just from right-clicking one in the
// tree. Relying on applyActiveDatabaseOverride's per-tab memory alone would
// silently export whatever database the tab happened to be pointed at
// instead — or, if nothing was ever explicitly switched to for this tab,
// the connection's own possibly-blank default Database field, producing an
// empty ".dbml" download name and the wrong document's contents.
type exportDBMLRequest struct {
	baseRequest
	PDatabase string `json:"p_database"`
}

// handleExportDBMLPostgreSQL runs postgresqlExportDBML against the
// requested connection, explicitly targeting p_database (see
// exportDBMLRequest), and writes the result to a temp file, mirroring
// runQueryExport (export.go) minus the tabular writer machinery — this is
// always exactly one text blob. The response shape
// (v_filename/v_filepath/v_downloadname) matches what export.go's own
// responses carry, so the frontend can drive the same /export_save_dialog/
// (desktop) / download-link (browser) flow unchanged.
func handleExportDBMLPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody exportDBMLRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil || reqBody.PDatabase == "" {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		info, err := resolveConnection(upstream, cookie, reqBody.databaseIndex())
		if err != nil || !info.Found || info.Technology != "postgresql" {
			fallback.ServeHTTP(w, r)
			return
		}
		applyRememberedPassword(r, reqBody.databaseIndex(), info)
		info.Database = reqBody.PDatabase

		db, err := openPostgreSQLTarget(info)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer db.Close()

		dbml, err := postgresqlExportDBML(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		writeExportTextFile(w, upstream, who.UserID, dbml, "dbml", info.Database+".dbml")
	}
}
