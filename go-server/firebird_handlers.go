package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

// This file mirrors mssql_handlers.go's structure for Firebird's tree/
// introspection routes plus the Properties/DDL/template routes (backed by
// firebird_properties.go/firebird_templates.go/firebird_ddl.go). Unlike
// MSSQL, every request shape here drops p_schema entirely — Firebird has no
// schema concept (see firebird.go's package comment) — and there is no
// Firebird equivalent of mssql_handlers.go's tablespace/role/sequence-route
// omission note to repeat, since this port's firebird tree, like its mssql
// one, goes only as deep as Tables/Views/Functions/Procedures.

// Request shapes — same field names as their mssql_handlers.go counterparts,
// minus PSchema.
type firebirdTableRequest struct {
	baseRequest
	PTable string `json:"p_table"`
}

type firebirdKeyColumnsRequest struct {
	baseRequest
	PTable string `json:"p_table"`
	PKey   string `json:"p_key"`
}

type firebirdFkeyColumnsRequest struct {
	baseRequest
	PTable string `json:"p_table"`
	PFkey  string `json:"p_fkey"`
}

type firebirdUniqueColumnsRequest struct {
	baseRequest
	PTable  string `json:"p_table"`
	PUnique string `json:"p_unique"`
}

type firebirdIndexColumnsRequest struct {
	baseRequest
	PTable string `json:"p_table"`
	PIndex string `json:"p_index"`
}

type firebirdViewRequest struct {
	baseRequest
	PView string `json:"p_view"`
}

type firebirdFunctionRequest struct {
	baseRequest
	PFunction string `json:"p_function"`
}

type firebirdProcedureRequest struct {
	baseRequest
	PProcedure string `json:"p_procedure"`
}

// firebirdTemplateRequest is TemplateSelect/TemplateInsert/TemplateUpdate's
// shared request shape, mirroring mssqlTemplateRequest minus PSchema.
type firebirdTemplateRequest struct {
	baseRequest
	PTable      string `json:"p_table"`
	PIndentChar string `json:"p_indent_char"`
	PIndentSize int    `json:"p_indent_size"`
}

// firebirdPropertiesRequestData/firebirdPropertiesRequest mirror
// mssqlPropertiesRequestData/mssqlPropertiesRequest minus PSchema.
type firebirdPropertiesRequestData struct {
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type firebirdPropertiesRequest struct {
	baseRequest
	PData firebirdPropertiesRequestData `json:"p_data"`
}

// firebirdSupportedPropertyTypes mirrors mssqlSupportedPropertyTypes.
var firebirdSupportedPropertyTypes = map[string]bool{
	"table":     true,
	"view":      true,
	"function":  true,
	"procedure": true,
	"index":     true,
}

func resolveFirebirdRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || !isFirebird(info.Technology) {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openFirebirdTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

func decodeFirebirdRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, *ConnectionInfo, bool) {
	return resolveFirebirdRequest(w, r, upstream, fallback, dst.databaseIndex())
}

func handleGetTreeInfoFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, info, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		treeInfo, err := firebirdTreeInfo(db, info.Database, info.Username)
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

func handleGetTablesFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		tables, err := firebirdTables(db)
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

func handleGetColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := firebirdColumns(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": strconv.FormatInt(c.Length, 10),
				"v_nullable":    c.Nullable,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPKFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := firebirdPrimaryKeys(db, reqBody.PTable)
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

func handleGetPKColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdKeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := firebirdPrimaryKeyColumns(db, reqBody.PTable, reqBody.PKey)
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

func handleGetFKsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := firebirdForeignKeys(db, reqBody.PTable)
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

func handleGetFKsColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdFkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := firebirdForeignKeyColumns(db, reqBody.PTable, reqBody.PFkey)
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

func handleGetUniquesFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := firebirdUniques(db, reqBody.PTable)
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

func handleGetUniquesColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdUniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := firebirdUniqueColumns(db, reqBody.PTable, reqBody.PUnique)
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

func handleGetIndexesFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := firebirdIndexes(db, reqBody.PTable)
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

func handleGetIndexesColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdIndexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := firebirdIndexColumns(db, reqBody.PTable, reqBody.PIndex)
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

func handleGetFunctionsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		fns, err := firebirdFunctions(db)
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

func handleGetFunctionFieldsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := firebirdFunctionFields(db, reqBody.PFunction)
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

func handleGetFunctionDefinitionFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := firebirdFunctionDefinition(db, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetProceduresFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		procs, err := firebirdProcedures(db)
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

func handleGetProcedureFieldsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := firebirdProcedureFields(db, reqBody.PProcedure)
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

func handleGetProcedureDefinitionFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := firebirdProcedureDefinition(db, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetViewsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		views, err := firebirdViews(db)
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

func handleGetViewsColumnsFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := firebirdViewColumns(db, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": strconv.FormatInt(c.Length, 10),
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewDefinitionFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdViewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := firebirdViewDefinition(db, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

// handleGetPropertiesFirebird mirrors handleGetPropertiesMSSQL's shape:
// decode -> check firebirdSupportedPropertyTypes -> dispatch on p_type for
// both the Properties grid rows and the DDL text -> writeEnvelope.
func handleGetPropertiesFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdPropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !firebirdSupportedPropertyTypes[reqBody.PData.PType] {
			fallback.ServeHTTP(w, r)
			return
		}

		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		table := reqBody.PData.PTable
		object := reqBody.PData.PObject

		var properties [][2]string
		var ddl string
		var propErr, ddlErr error

		switch reqBody.PData.PType {
		case "table":
			properties, propErr = firebirdPropertiesRelation(db, object)
			if propErr == nil {
				ddl, ddlErr = firebirdTableDDL(db, object)
			}
		case "view":
			properties, propErr = firebirdPropertiesRelation(db, object)
			if propErr == nil {
				ddl, ddlErr = firebirdViewDDL(db, object)
			}
		case "function":
			properties, propErr = firebirdPropertiesFunction(db, object)
			if propErr == nil {
				ddl, ddlErr = firebirdFunctionDDL(db, object)
			}
		case "procedure":
			properties, propErr = firebirdPropertiesProcedure(db, object)
			if propErr == nil {
				ddl, ddlErr = firebirdProcedureDDL(db, object)
			}
		case "index":
			properties, propErr = firebirdPropertiesIndex(db, table, object)
			if propErr == nil {
				ddl, ddlErr = firebirdIndexDDL(db, table, object)
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

// handleTemplateSelectFirebird mirrors handleTemplateSelectMSSQL.
func handleTemplateSelectFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := firebirdTemplateSelect(db, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// handleTemplateInsertFirebird mirrors handleTemplateInsertMSSQL.
func handleTemplateInsertFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := firebirdTemplateInsert(db, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// handleTemplateUpdateFirebird mirrors handleTemplateUpdateMSSQL.
func handleTemplateUpdateFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody firebirdTemplateRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indentUnit := indentUnitFromCharSize(reqBody.PIndentChar, reqBody.PIndentSize)
		template, err := firebirdTemplateUpdate(db, reqBody.PTable, indentUnit)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// firebirdVerifiedAttachmentID validates the incoming session id is a plain
// positive integer before it gets bound into the MON$ATTACHMENTS delete
// below — mirrors mssqlVerifiedSessionID's "round-trip through strconv,
// don't just trust the regex" defense for the same reason (see that
// function's own comment).
func firebirdVerifiedAttachmentID(raw string) (int64, bool) {
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

type killBackendFirebirdRequest struct {
	baseRequest
	PPid string `json:"p_pid"`
}

// handleKillBackendFirebird mirrors handleKillBackendMSSQL's role, but
// Firebird has no KILL-style statement at all (unlike MSSQL's `KILL
// <session_id>` or Oracle's `ALTER SYSTEM KILL SESSION`) — the documented
// way to force-detach another connection is deleting its row from the
// monitoring table `MON$ATTACHMENTS`, which the engine special-cases as a
// "disconnect this attachment" instruction rather than an ordinary DML
// delete (see Firebird's own MON$ tables documentation). Unlike the KILL
// statement this replaces, the attachment id genuinely is a bind parameter
// here (a real DELETE ... WHERE, not DDL-shaped text), but it's still
// verified the same way for defense in depth.
func handleKillBackendFirebird(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody killBackendFirebirdRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		attachmentID, ok := firebirdVerifiedAttachmentID(reqBody.PPid)
		if !ok {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeFirebirdRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		if _, err := db.Exec(`delete from mon$attachments where mon$attachment_id = ?`, attachmentID); err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
