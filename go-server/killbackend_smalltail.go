package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
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
// not a regular statement), so this pattern plus verifiedOracleSessionID's
// int round-trip below is the injection defense in place of a bind
// parameter, tighter than Python's original raw `.format()` interpolation.
var oracleSessionIDPattern = regexp.MustCompile(`^([0-9]+),([0-9]+)$`)

// verifiedOracleSessionID parses raw's two capture groups as actual
// integers and rebuilds the "sid,serial#" string from those parsed numbers
// rather than reusing raw itself — a regex match followed by string-
// concatenating the still-tainted original still leaves that original,
// unchanged, flowing into the `alter system kill session` text; static
// analysis (CodeQL's go/sql-injection in particular) has no way to know the
// preceding MatchString call constrains its shape and keeps flagging it,
// same class of gap as sqliteVerifiedTableName's doc comment describes.
// Round-tripping through strconv.ParseInt + fmt.Sprintf makes the
// "this can only ever be two integers" property visible to the analysis,
// not just true at runtime.
func verifiedOracleSessionID(raw string) (string, bool) {
	m := oracleSessionIDPattern.FindStringSubmatch(raw)
	if m == nil {
		return "", false
	}
	sid, err := strconv.ParseInt(m[1], 10, 64)
	if err != nil {
		return "", false
	}
	serial, err := strconv.ParseInt(m[2], 10, 64)
	if err != nil {
		return "", false
	}
	return fmt.Sprintf("%d,%d", sid, serial), true
}

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
		verifiedSessionID, ok := verifiedOracleSessionID(reqBody.PPid)
		if !ok {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if _, err := db.Exec(`alter system kill session '` + verifiedSessionID + `' immediate`); err != nil {
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
