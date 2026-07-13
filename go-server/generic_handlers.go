package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// resolveNativeRequest is the cross-engine counterpart of
// resolveSQLiteRequest/resolveMySQLRequest/etc — used by routes that are
// registered once for ALL engines (workspace.py's start_edit_data,
// refresh_monitoring, ...) rather than once per engine. Falls back to
// Django for any connection Go doesn't natively own (today that's just
// "terminal" — every real DB engine is covered by nativeQueryTechnology).
func resolveNativeRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openNativeQueryTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

type startEditDataRequest struct {
	baseRequest
	PTable  string `json:"p_table"`
	PSchema string `json:"p_schema"`
}

// handleStartEditData mirrors workspace.py's start_edit_data — dispatches
// across whichever engine the connection actually is, reusing each engine's
// already-ported column/PK introspection (no new SQL needed, unlike
// draw_graph's schema-wide FK requirement).
func handleStartEditData(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody startEditDataRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, reqBody.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		schema := ""
		if technologyHasSchema(info.Technology) {
			schema = reqBody.PSchema
		}
		table := reqBody.PTable

		pkCols, err := editDataPrimaryKeyColumns(info.Technology, db, schema, table)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		cols, err := editDataColumns(info.Technology, db, schema, table)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		pkSet := make(map[string]bool, len(pkCols))
		for _, c := range pkCols {
			pkSet[strings.ToLower(c)] = true
		}

		vPK := make([]map[string]any, 0)
		vCols := make([]map[string]any, 0, len(cols))
		for i, c := range cols {
			isPK := pkSet[strings.ToLower(c.Name)]
			vCols = append(vCols, map[string]any{"v_type": c.DataType, "v_column": c.Name, "v_is_pk": isPK})
			if isPK {
				vPK = append(vPK, map[string]any{"v_column": c.Name, "v_index": i, "v_type": c.DataType})
			}
		}

		orderBy := ""
		if len(pkCols) > 0 {
			parts := make([]string, len(pkCols))
			for i, c := range pkCols {
				parts[i] = "t." + c
			}
			orderBy = "ORDER BY " + strings.Join(parts, ", ")
		}

		writeEnvelope(w, map[string]any{
			"v_pk":          vPK,
			"v_cols":        vCols,
			"v_ini_orderby": orderBy,
		}, false, -1)
	}
}

type refreshMonitoringRequest struct {
	baseRequest
	PQuery string `json:"p_query"`
}

// handleRefreshMonitoring mirrors workspace.py's refresh_monitoring — a
// one-shot query execution, simpler than the paginated cursor path
// create_request/long_polling already handle.
func handleRefreshMonitoring(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody refreshMonitoringRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := resolveNativeRequest(w, r, upstream, fallback, reqBody.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		cols, rows, err := runGenericQuery(db, reqBody.PQuery)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{
			"v_col_names":  cols,
			"v_data":       rows,
			"v_query_info": fmt.Sprintf("Number of records: %d", len(rows)),
		}, false, -1)
	}
}

func completionTableRef(info *ConnectionInfo, schema, table string) string {
	if technologyHasSchema(info.Technology) {
		return schema + "." + table
	}
	return table
}

// completionList builds the {value, score, meta} triples both completion
// routes return — score starts at 0 and drops by 100 per column, matching
// Python's v_score=100; v_score-=100 (executed once before the loop) then
// append-then-decrement inside it.
func completionList(cols []completionColumn, valuePrefix string) []map[string]any {
	list := make([]map[string]any, 0, len(cols))
	score := 0
	for _, c := range cols {
		list = append(list, map[string]any{"value": valuePrefix + c.Name, "score": score, "meta": c.DataType})
		score -= 100
	}
	return list
}

type completionsTableRequest struct {
	baseRequest
	PTable  string `json:"p_table"`
	PSchema string `json:"p_schema"`
}

// handleGetCompletionsTable mirrors workspace.py's get_completions_table.
func handleGetCompletionsTable(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody completionsTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, reqBody.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		cols, err := columnMetadataForExpression(db, completionTableRef(info, reqBody.PSchema, reqBody.PTable))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, completionList(cols, "t."), false, -1)
	}
}

type completionsRequest struct {
	baseRequest
	PPrefix    string `json:"p_prefix"`
	PSQL       string `json:"p_sql"`
	PPrefixPos int    `json:"p_prefix_pos"`
}

// handleGetCompletions mirrors workspace.py's get_completions.
func handleGetCompletions(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody completionsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := resolveNativeRequest(w, r, upstream, fallback, reqBody.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		tableRef, found := findTableReferenceForCompletion(reqBody.PSQL, reqBody.PPrefix, reqBody.PPrefixPos)
		if !found {
			writeEnvelope(w, []map[string]any{}, false, -1)
			return
		}

		cols, err := columnMetadataForExpression(db, tableRef)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, completionList(cols, reqBody.PPrefix+"."), false, -1)
	}
}

type renewPasswordRequest struct {
	baseRequest
	PPassword string `json:"p_password"`
}

// handleRenewPassword mirrors workspace.py's renew_password — tests a
// candidate password the frontend collected via a prompt dialog (shown
// after some other native route's connection open failed with the
// password_timeout envelope shape) and, on success, remembers it for this
// browser session so subsequent native-route requests for the same
// connection stop trying the blank stored password. Unlike Python, this
// doesn't need to distinguish "has no stored password" — any connection
// can call this, but it's only useful for password-less ones, since
// applyRememberedPassword only ever consults the memory when
// info.Password is already empty.
func handleRenewPassword(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody renewPasswordRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		connID := reqBody.databaseIndex()
		info, err := resolveConnection(upstream, cookie, connID)
		if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
			fallback.ServeHTTP(w, r)
			return
		}

		info.Password = reqBody.PPassword
		db, err := openNativeQueryTarget(info)
		if err != nil {
			// Matches Python's `v_return['v_data'] = v_test` — the raw
			// connection error string, not the {password_timeout: true, ...}
			// shape (that shape means "please prompt", this route IS the
			// prompt response).
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		db.Close()

		rememberPassword(sessionCookieValue(r), connID, reqBody.PPassword)
		writeEnvelope(w, "", false, -1)
	}
}
