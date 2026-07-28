package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
)

// This file finishes off Fáze 8a's small remaining long-tail: kill_backend
// for MySQL/MariaDB/Oracle, and SQLite's version route (sqliteVersion
// already existed, unwired, since an earlier phase — same situation as
// postgresqlVersion before this segment).

type killBackendRequest struct {
	baseRequest
	PPid int64 `json:"p_pid"`
}

// handleKillBackendMySQL mirrors tree_mysql.py's/tree_mariadb.py's
// kill_backend — both engines share the identical `KILL <pid>` command
// (confirmed by reading Spartacus/Database.py's MySQL and MariaDB
// connection classes: byte-for-byte identical Terminate() bodies), so one
// handler serves both URL suffixes, same pattern as every other
// MySQL+MariaDB route in this codebase.
func handleKillBackendMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody killBackendRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if _, err := db.Exec("KILL ?", reqBody.PPid); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// oracleSessionIDPattern validates Oracle's "sid,serial#" kill-session
// identifier (see tree_oracle.js's oracleTerminateBackend:
// `v_pid = p_row[1] + "," + p_row[2]`) — both parts are always numeric.
// `ALTER SYSTEM KILL SESSION` has no bind-parameter form (it's DDL-shaped,
// not a regular statement), so this whitelist is the injection defense in
// place of a bind parameter, tighter than Python's original raw
// `.format()` interpolation.
var oracleSessionIDPattern = regexp.MustCompile(`^[0-9]+,[0-9]+$`)

type killBackendOracleRequest struct {
	baseRequest
	PPid string `json:"p_pid"`
}

// handleKillBackendOracle mirrors tree_oracle.py's kill_backend —
// `ALTER SYSTEM KILL SESSION '<sid>,<serial#>' IMMEDIATE`.
func handleKillBackendOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody killBackendOracleRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !oracleSessionIDPattern.MatchString(reqBody.PPid) {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if _, err := db.Exec(`alter system kill session '` + reqBody.PPid + `' immediate`); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// handleGetVersionSQLite mirrors tree_sqlite.py's get_version — wraps the
// already-implemented (but previously unwired) sqliteVersion in the
// {'v_version': ...} shape Python's view uses.
func handleGetVersionSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := resolveSQLiteRequest(w, r, upstream, fallback, reqBody.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		version, err := sqliteVersion(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_version": version}, false, -1)
	}
}
