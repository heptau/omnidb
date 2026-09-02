package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

// This file mirrors oracle_handlers.go's structure for SQL Server's tree/
// introspection routes (migration-plan Phase 3 — "Tree browsing") plus the
// Properties/DDL/template routes (Phase 5, backed by mssql_properties.go/
// mssql_templates.go/mssql_ddl.go). Unlike Oracle, this phase's mssql tree
// has no tablespace or role nodes (SQL Server's closest analogues —
// filegroups and server/database principals — aren't part of this port's
// scope) and no sequence node (see mssql.go's package comment: sequences are
// deliberately skipped even though SQL Server has had CREATE SEQUENCE since
// 2012).

// Request shapes — same field names as their oracle_handlers.go counterparts
// (tree_mssql.js's future views will unpack the same p_schema/p_table/...
// keys the frontend already sends for every other engine).
type mssqlSchemaRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
}

type mssqlTableRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
}

type mssqlKeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKey    string `json:"p_key"`
}

type mssqlFkeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PFkey   string `json:"p_fkey"`
}

type mssqlUniqueColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PUnique string `json:"p_unique"`
}

type mssqlIndexColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PIndex  string `json:"p_index"`
}

type mssqlViewRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PView   string `json:"p_view"`
}

type mssqlFunctionRequest struct {
	baseRequest
	PSchema   string `json:"p_schema"`
	PFunction string `json:"p_function"`
}

type mssqlProcedureRequest struct {
	baseRequest
	PSchema    string `json:"p_schema"`
	PProcedure string `json:"p_procedure"`
}

// mssqlTemplateRequest is TemplateSelect/TemplateInsert/TemplateUpdate's
// shared request shape, mirroring oracleTemplateRequest — the table
// coordinates plus the user's indent Settings (see indentUnitFromCharSize)
// so the generated template's column-list indentation matches what they've
// configured, instead of a fixed number of hardcoded spaces.
type mssqlTemplateRequest struct {
	baseRequest
	PSchema     string `json:"p_schema"`
	PTable      string `json:"p_table"`
	PIndentChar string `json:"p_indent_char"`
	PIndentSize int    `json:"p_indent_size"`
}

// mssqlPropertiesRequestData/mssqlPropertiesRequest mirror
// oraclePropertiesRequestData/oraclePropertiesRequest exactly —
// getPropertiesMssql (tree_mssql.js) posts the same p_schema/p_table/
// p_object/p_type shape, wrapped in p_data, that every other engine's
// properties.js call does.
type mssqlPropertiesRequestData struct {
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type mssqlPropertiesRequest struct {
	baseRequest
	PData mssqlPropertiesRequestData `json:"p_data"`
}

// mssqlSupportedPropertyTypes mirrors oracleSupportedPropertyTypes, scoped to
// the object kinds this port's mssql tree actually has nodes for — no
// role/tablespace/sequence, per this file's package comment.
var mssqlSupportedPropertyTypes = map[string]bool{
	"table":     true,
	"view":      true,
	"function":  true,
	"procedure": true,
	"index":     true,
}

func resolveMSSQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || !isMSSQL(info.Technology) {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openMSSQLTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

func decodeMSSQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, *ConnectionInfo, bool) {
	return resolveMSSQLRequest(w, r, upstream, fallback, dst.databaseIndex())
}

func handleGetTreeInfoMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, info, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		treeInfo, err := mssqlTreeInfo(db, info.Database, info.Username)
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

func handleGetTablesMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		tables, err := mssqlTables(db, reqBody.PSchema)
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
				"v_has_triggers":     false,
				"v_has_partitions":   false,
				"v_has_statistics":   false,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := mssqlColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": strconv.FormatInt(c.MaxLength, 10),
				"v_nullable":    c.Nullable,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPKMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mssqlPrimaryKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetPKColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlKeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mssqlPrimaryKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PKey)
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

func handleGetFKsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := mssqlForeignKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetFKsColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlFkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mssqlForeignKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PFkey)
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

func handleGetUniquesMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mssqlUniques(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetUniquesColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlUniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mssqlUniqueColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PUnique)
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

func handleGetIndexesMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := mssqlIndexes(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetIndexesColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlIndexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mssqlIndexColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PIndex)
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

func handleGetFunctionsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fns, err := mssqlFunctions(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(fns))
		for _, f := range fns {
			data = append(data, map[string]any{"v_name": f.Name, "v_id": f.Name})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetFunctionFieldsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := mssqlFunctionFields(db, reqBody.PSchema, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(fields))
		for _, f := range fields {
			data = append(data, map[string]any{"v_name": f.Name, "v_type": f.Type})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetFunctionDefinitionMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := mssqlFunctionDefinition(db, reqBody.PSchema, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetProceduresMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		procs, err := mssqlProcedures(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(procs))
		for _, p := range procs {
			data = append(data, map[string]any{"v_name": p.Name, "v_id": p.Name})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetProcedureFieldsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := mssqlProcedureFields(db, reqBody.PSchema, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(fields))
		for _, f := range fields {
			data = append(data, map[string]any{"v_name": f.Name, "v_type": f.Type})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetProcedureDefinitionMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := mssqlProcedureDefinition(db, reqBody.PSchema, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetViewsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		views, err := mssqlViews(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(views))
		for _, v := range views {
			data = append(data, map[string]any{"v_name": v.Name, "v_has_triggers": false})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsColumnsMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := mssqlViewColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": strconv.FormatInt(c.MaxLength, 10),
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewDefinitionMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlViewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := mssqlViewDefinition(db, reqBody.PSchema, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

// handleGetPropertiesMSSQL mirrors handleGetPropertiesOracle's shape:
// decode -> check mssqlSupportedPropertyTypes -> dispatch on p_type for both
// the Properties grid rows and the DDL text -> writeEnvelope. Unlike Oracle
// (one DBMS_METADATA.GET_DDL call handles every object type), each type here
// has its own DDL generator (mssql_ddl.go) since SQL Server has no built-in
// "get me the CREATE statement" function for tables/indexes.
func handleGetPropertiesMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlPropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !mssqlSupportedPropertyTypes[reqBody.PData.PType] {
			fallback.ServeHTTP(w, r)
			return
		}

		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		schema := reqBody.PData.PSchema
		table := reqBody.PData.PTable
		object := reqBody.PData.PObject

		var properties [][2]string
		var ddl string
		var propErr, ddlErr error

		switch reqBody.PData.PType {
		case "table":
			properties, propErr = mssqlPropertiesObject(db, schema, object)
			if propErr == nil {
				ddl, ddlErr = mssqlTableDDL(db, schema, object)
			}
		case "view":
			properties, propErr = mssqlPropertiesObject(db, schema, object)
			if propErr == nil {
				ddl, ddlErr = mssqlViewDDL(db, schema, object)
			}
		case "function":
			properties, propErr = mssqlPropertiesObject(db, schema, object)
			if propErr == nil {
				ddl, ddlErr = mssqlFunctionDDL(db, schema, object)
			}
		case "procedure":
			properties, propErr = mssqlPropertiesObject(db, schema, object)
			if propErr == nil {
				ddl, ddlErr = mssqlProcedureDDL(db, schema, object)
			}
		case "index":
			properties, propErr = mssqlPropertiesIndex(db, schema, table, object)
			if propErr == nil {
				ddl, ddlErr = mssqlIndexDDL(db, schema, table, object)
			}
		}
		if propErr != nil {
			writeDatabaseError(w, propErr.Error())
			return
		}
		if ddlErr != nil {
			writeDatabaseError(w, ddlErr.Error())
			return
		}

		writeEnvelope(w, map[string]any{
			"properties": properties,
			"ddl":        ddl,
		}, false, -1)
	}
}

// handleTemplateSelectMSSQL mirrors handleTemplateSelectOracle.
func handleTemplateSelectMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := mssqlTemplateSelect(db, reqBody.PSchema, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// handleTemplateInsertMSSQL mirrors handleTemplateInsertOracle.
func handleTemplateInsertMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := mssqlTemplateInsert(db, reqBody.PSchema, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// handleTemplateUpdateMSSQL mirrors handleTemplateUpdateOracle.
func handleTemplateUpdateMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mssqlTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := mssqlTemplateUpdate(db, reqBody.PSchema, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// mssqlKillSessionIDPattern validates the incoming session id is a plain
// positive integer before it gets spliced into `KILL <id>` — T-SQL's KILL
// statement, like Oracle's ALTER SYSTEM KILL SESSION, has no bind-parameter
// form (it's DDL-shaped, not a regular statement). Mirrors
// verifiedOracleSessionID's "round-trip through strconv, don't just trust
// the regex" defense in killbackend_smalltail.go, for the same reason: a
// plain regex match still leaves the still-tainted original string flowing
// into the query text as far as static analysis (e.g. CodeQL's
// go/sql-injection) can tell.
func mssqlVerifiedSessionID(raw string) (int64, bool) {
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

type killBackendMSSQLRequest struct {
	baseRequest
	PPid string `json:"p_pid"`
}

// handleKillBackendMSSQL mirrors handleKillBackendOracle — `KILL <session_id>`.
func handleKillBackendMSSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody killBackendMSSQLRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		sessionID, ok := mssqlVerifiedSessionID(reqBody.PPid)
		if !ok {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMSSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if _, err := db.Exec(`kill ` + strconv.FormatInt(sessionID, 10)); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
