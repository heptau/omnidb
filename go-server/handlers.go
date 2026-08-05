package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
)

// envelope mirrors the {v_data, v_error, v_error_id} shape every Django
// view in this app returns (see e.g. views/tree_sqlite.py), so a route
// migrated to Go is indistinguishable from the frontend's point of view.
type envelope struct {
	VData    any  `json:"v_data"`
	VError   bool `json:"v_error"`
	VErrorID int  `json:"v_error_id"`
}

func writeEnvelope(w http.ResponseWriter, data any, isError bool, errorID int) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(envelope{VData: data, VError: isError, VErrorID: errorID}); err != nil {
		log.Printf("writeEnvelope: %v", err)
	}
}

// writeUnauthenticated mirrors memory_objects.py's user_authenticated decorator.
func writeUnauthenticated(w http.ResponseWriter) {
	writeEnvelope(w, "", true, 1)
}

// writeBadRequest mirrors the _parse_post_data/_bad_request helper used
// throughout the Django views.
func writeBadRequest(w http.ResponseWriter) {
	writeEnvelope(w, "Invalid or missing request data.", true, -1)
}

// writeDatabaseError mirrors memory_objects.py's database_required decorator
// error shape — the frontend's properties.js checks p_data.password_timeout
// specifically, so the key name has to match even though nothing here is
// actually about a password timeout (SQLite files don't have credentials).
func writeDatabaseError(w http.ResponseWriter, message string) {
	writeEnvelope(w, map[string]any{"password_timeout": true, "message": message}, true, -1)
}

// baseRequest is the request envelope every tree_sqlite.py view starts by
// unpacking. PTabID is consulted by applyActiveDatabaseOverride (see
// active_database.go) for routes that support switching a tab's active
// database without opening a new connection (currently PostgreSQL).
type baseRequest struct {
	PDatabaseIndex json.Number `json:"p_database_index"`
	PTabID         string      `json:"p_tab_id"`
}

type tableRequest struct {
	baseRequest
	PTable string `json:"p_table"`
}

type fkeyColumnsRequest struct {
	baseRequest
	PFkey  string `json:"p_fkey"`
	PTable string `json:"p_table"`
}

type uniqueColumnsRequest struct {
	baseRequest
	PUnique string `json:"p_unique"`
	PTable  string `json:"p_table"`
}

type indexColumnsRequest struct {
	baseRequest
	PIndex string `json:"p_index"`
	PTable string `json:"p_table"`
}

type viewRequest struct {
	baseRequest
	PView string `json:"p_view"`
}

type templateSelectRequest struct {
	baseRequest
	PTable      string `json:"p_table"`
	PKind       string `json:"p_kind"`
	PIndentChar string `json:"p_indent_char"`
	PIndentSize int    `json:"p_indent_size"`
}

// templateDMLRequest is TemplateInsert/TemplateUpdate's request shape —
// like tableRequest, plus the user's indent Settings (see
// indentUnitFromCharSize) so the generated INSERT/UPDATE template's
// column-list indentation matches what they've configured, instead of a
// fixed number of hardcoded spaces.
type templateDMLRequest struct {
	baseRequest
	PTable      string `json:"p_table"`
	PIndentChar string `json:"p_indent_char"`
	PIndentSize int    `json:"p_indent_size"`
}

type propertiesRequestData struct {
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type getPropertiesRequest struct {
	baseRequest
	PData propertiesRequestData `json:"p_data"`
}

// readFormData reads and restores the request body (form-urlencoded, the
// jQuery $.ajax default) and returns the "data" field's raw JSON string.
// The body is always restored so a caller can still hand the request to the
// Django fallback proxy afterwards, whichever way this function returns.
func readFormData(r *http.Request) (string, error) {
	bodyBytes, err := io.ReadAll(r.Body)
	r.Body.Close()
	if err != nil {
		// Restoring r.Body here too used to defeat the point of this
		// check — a CHANGELOG entry claims this was already fixed, but
		// the code still did it: on a genuine read error (client
		// disconnect mid-body, network error), bodyBytes is a partial,
		// truncated read, and restoring it let a caller (e.g. dev-mode's
		// OMNIDB_PROXY_UPSTREAM fallback path) go on to forward that
		// truncated body to an upstream as if it were the real request.
		return "", err
	}
	r.Body = io.NopCloser(bytes.NewReader(bodyBytes))

	values, err := url.ParseQuery(string(bodyBytes))
	if err != nil {
		return "", err
	}
	return values.Get("data"), nil
}

// resolveSQLiteRequest does the auth + connection-ownership resolution every
// migrated sqlite route needs before touching a database file. On a
// non-nil, non-ok return it has already written the appropriate response
// (unauthenticated envelope, or falling back to Django for a foreign/non-
// sqlite/missing connection) — the caller should return immediately.
func resolveSQLiteRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || info.Technology != "sqlite" {
		// Not ours to handle (unknown connection, or some other engine
		// reusing the same generic request shape) — let Django handle it
		// like it always has.
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}

	db, err := openSQLiteTarget(info.Database)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

// handleGetPropertiesSQLite serves get_properties_sqlite natively — the
// first migrated route of migration-plan phase 2. Falls back to Django for
// anything it can't fully resolve itself, so nothing that used to work can
// start failing just because this handler exists.
func handleGetPropertiesSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}

		var reqBody getPropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}

		db, _, ok := resolveSQLiteRequest(w, r, upstream, fallback, reqBody.PDatabaseIndex.String())
		if !ok {
			return
		}
		defer db.Close()

		properties, err := sqliteProperties(db, reqBody.PData.PTable, reqBody.PData.PObject, reqBody.PData.PType)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		ddl, err := sqliteDDL(db, reqBody.PData.PTable, reqBody.PData.PObject, reqBody.PData.PType)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		writeEnvelope(w, map[string]any{
			"properties": properties,
			"ddl":        ddl,
		}, false, -1)
	}
}

// handleGetTablesSQLite serves get_tables_sqlite natively. The v_has_*
// flags are static per SQLite.py's driver init — see sqliteTable's comment.
func handleGetTablesSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		db, _, ok := resolveSQLiteRequest(w, r, upstream, fallback, reqBody.PDatabaseIndex.String())
		if !ok {
			return
		}
		defer db.Close()

		tables, err := sqliteTables(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		data := make([]map[string]any, 0, len(tables))
		for _, t := range tables {
			data = append(data, map[string]any{
				"v_name":             t.Name,
				"v_has_primary_keys": true,
				"v_has_foreign_keys": true,
				"v_has_uniques":      true,
				"v_has_indexes":      true,
				"v_has_checks":       false,
				"v_has_excludes":     false,
				"v_has_rules":        false,
				"v_has_triggers":     true,
				"v_has_partitions":   true,
				"v_has_statistics":   false,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

// handleGetColumnsSQLite serves get_columns_sqlite natively.
func handleGetColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}

		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}

		db, _, ok := resolveSQLiteRequest(w, r, upstream, fallback, reqBody.PDatabaseIndex.String())
		if !ok {
			return
		}
		defer db.Close()

		columns, err := sqliteColumns(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": c.DataLength,
				"v_nullable":    c.Nullable,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

// handleGetTreeInfoSQLite serves get_tree_info_sqlite natively — fired once
// right after connecting, before the tree can render at all.
func handleGetTreeInfoSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		db, info, ok := resolveSQLiteRequest(w, r, upstream, fallback, reqBody.PDatabaseIndex.String())
		if !ok {
			return
		}
		defer db.Close()

		treeInfo, err := sqliteTreeInfo(db, info.Database)
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

// decodeTableRequest is the common request-parsing preamble shared by every
// handler below: read the form body, unmarshal into dst, resolve auth +
// connection. Returns the opened db and true on success; otherwise the
// response has already been written (bad request / unauthenticated /
// fallback to Django) and the caller should return immediately.
func decodeTableRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, bool) {
	db, _, ok := resolveSQLiteRequest(w, r, upstream, fallback, dst.databaseIndex())
	return db, ok
}

func (b baseRequest) databaseIndex() string { return b.PDatabaseIndex.String() }

func (b baseRequest) tabID() string { return b.PTabID }

func handleGetPKSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := sqlitePrimaryKeys(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(names))
		for _, n := range names {
			data = append(data, []string{n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPKColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := sqlitePrimaryKeyColumnNames(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(cols))
		for _, c := range cols {
			data = append(data, []string{c})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetFKsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := sqliteForeignKeys(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(fks))
		for _, fk := range fks {
			data = append(data, []string{fk.ConstraintName, fk.RTableName, fk.DeleteRule, fk.UpdateRule})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetFKsColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody fkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := sqliteForeignKeyColumns(db, reqBody.PTable, reqBody.PFkey)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(cols))
		for _, c := range cols {
			data = append(data, []string{c.RTableName, c.DeleteRule, c.UpdateRule, c.ColumnName, c.RColumnName})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetUniquesSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := sqliteUniques(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(names))
		for _, n := range names {
			data = append(data, []string{n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetUniquesColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody uniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := sqliteUniqueColumns(db, reqBody.PTable, reqBody.PUnique)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(cols))
		for _, c := range cols {
			data = append(data, []string{c})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetIndexesSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := sqliteIndexes(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(indexes))
		for _, idx := range indexes {
			data = append(data, []string{idx.Name, idx.Uniqueness})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetIndexesColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody indexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := sqliteIndexColumns(db, reqBody.PTable, reqBody.PIndex)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]string, 0, len(cols))
		for _, c := range cols {
			data = append(data, []string{c})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		views, err := sqliteViews(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(views))
		for _, v := range views {
			data = append(data, map[string]any{"v_name": v})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsColumnsSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := sqliteColumns(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": c.DataLength,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

// handleGetViewDefinitionSQLite serves get_view_definition_sqlite. Note:
// SQLite.py never actually defines GetViewDefinition (unlike the other
// three drivers), so this route 500s in the still-current Django app today
// — this Go handler is a genuine fix, not just a port, returning the same
// CREATE VIEW text GetDDL already exposes.
func handleGetViewDefinitionSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody viewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := sqliteDDL(db, "", reqBody.PView, "view")
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetTriggersSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody tableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		triggers, err := sqliteTriggers(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(triggers))
		for _, t := range triggers {
			data = append(data, map[string]any{"v_name": t})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleTemplateSelectSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody templateSelectRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := sqliteTemplateSelect(db, reqBody.PTable, reqBody.PKind, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateInsertSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody templateDMLRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := sqliteTemplateInsert(db, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateUpdateSQLite(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody templateDMLRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodeTableRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := sqliteTemplateUpdate(db, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}
