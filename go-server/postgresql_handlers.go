package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
)

// Request shapes for the PostgreSQL routes — same baseRequest as SQLite's,
// plus p_schema, which every PostgreSQL tree_postgresql.py view requires
// (PostgreSQL, unlike SQLite, has schemas/namespaces).
type pgSchemaRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
}

type pgTableRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
}

type pgKeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKey    string `json:"p_key"`
}

type pgFkeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PFkey   string `json:"p_fkey"`
}

type pgUniqueColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PUnique string `json:"p_unique"`
}

type pgIndexColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PIndex  string `json:"p_index"`
}

type pgViewRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PView   string `json:"p_view"`
}

type pgTemplateSelectRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKind   string `json:"p_kind"`
}

type pgPropertiesRequestData struct {
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type pgPropertiesRequest struct {
	baseRequest
	PData pgPropertiesRequestData `json:"p_data"`
}

// pgSupportedPropertyTypes are the object kinds this migration slice can
// serve properties/DDL for natively — same set as the read-only
// introspection routes above. Every other p_type (sequence, function,
// check, exclude, rule, role, tablespace, ...) stays on Django; that's a
// deliberately separate, larger porting effort (see AGENTS.md / memory).
var pgSupportedPropertyTypes = map[string]bool{
	"table":       true,
	"table_field": true,
	"index":       true,
	"view":        true,
	"trigger":     true,
	"pk":          true,
	"foreign_key": true,
	"unique":      true,
}

// resolvePostgreSQLRequest is resolveSQLiteRequest's PostgreSQL counterpart —
// same auth + connection-ownership resolution, opening a native pgx
// connection instead of a SQLite file.
func resolvePostgreSQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || info.Technology != "postgresql" {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openPostgreSQLTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

func decodePostgreSQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, bool) {
	db, _, ok := resolvePostgreSQLRequest(w, r, upstream, fallback, dst.databaseIndex())
	return db, ok
}

func handleGetSchemasPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		schemas, err := postgresqlSchemas(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(schemas))
		for _, s := range schemas {
			data = append(data, map[string]any{"v_name": s.Name, "v_oid": s.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetTablesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		tables, err := postgresqlTables(db, reqBody.PSchema)
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
				"v_has_checks":       true,
				"v_has_excludes":     true,
				"v_has_rules":        true,
				"v_has_triggers":     true,
				"v_has_partitions":   true,
				"v_has_statistics":   true,
				"v_oid":              t.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := postgresqlColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": nullStringOrEmpty(c.DataLength),
				"v_nullable":    c.Nullable,
				"v_position":    c.Position,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func nullStringOrEmpty(s sql.NullString) string {
	if !s.Valid {
		return ""
	}
	return s.String
}

func handleGetPKPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		pks, err := postgresqlPrimaryKeys(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][2]any, 0, len(pks))
		data = append(data, pks...)
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPKColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgKeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := postgresqlPrimaryKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PKey)
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

func handleGetFKsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := postgresqlForeignKeys(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(fks))
		for _, fk := range fks {
			data = append(data, []any{fk.ConstraintName, fk.RTableName, fk.DeleteRule, fk.UpdateRule, fk.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetFKsColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgFkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := postgresqlForeignKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PFkey)
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

func handleGetUniquesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		uniques, err := postgresqlUniques(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, uniques, false, -1)
	}
}

func handleGetUniquesColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgUniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := postgresqlUniqueColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PUnique)
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

func handleGetIndexesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := postgresqlIndexes(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(indexes))
		for _, idx := range indexes {
			data = append(data, []any{idx.Name, idx.Uniqueness, idx.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetIndexesColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgIndexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := postgresqlIndexColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PIndex)
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

func handleGetViewsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		views, err := postgresqlViews(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(views))
		for _, v := range views {
			data = append(data, map[string]any{
				"v_name":         v.Name,
				"v_has_rules":    true,
				"v_has_triggers": true,
				"v_oid":          v.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := postgresqlViewColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(columns))
		for _, c := range columns {
			data = append(data, map[string]any{
				"v_column_name": c.Name,
				"v_data_type":   c.DataType,
				"v_data_length": nullStringOrEmpty(c.DataLength),
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgViewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := postgresqlViewDefinition(db, reqBody.PSchema, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetTriggersPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		triggers, err := postgresqlTriggers(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(triggers))
		for _, t := range triggers {
			data = append(data, map[string]any{
				"v_name":         t.Name,
				"v_enabled":      t.Enabled,
				"v_function":     t.Function,
				"v_id":           t.ID,
				"v_function_oid": t.FunctionOID,
				"v_oid":          t.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleTemplateSelectPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTemplateSelectRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := postgresqlTemplateSelect(db, reqBody.PSchema, reqBody.PTable, reqBody.PKind)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateInsertPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := postgresqlTemplateInsert(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateUpdatePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := postgresqlTemplateUpdate(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

// handleGetPropertiesPostgreSQL serves get_properties_postgresql for the
// object kinds listed in pgSupportedPropertyTypes; anything else (and
// get_tree_info_postgresql, registered nowhere in main.go) stays proxied to
// Django, matching every other "not ours to handle" fallback in this file.
func handleGetPropertiesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgPropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !pgSupportedPropertyTypes[reqBody.PData.PType] {
			fallback.ServeHTTP(w, r)
			return
		}

		db, _, ok := resolvePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest.databaseIndex())
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
			properties, propErr = postgresqlPropertiesTable(db, schema, object)
			ddl, ddlErr = postgresqlDDLClass(db, schema, object)
		case "table_field":
			properties, propErr = postgresqlPropertiesTableField(db, schema, table, object)
			ddl, ddlErr = postgresqlDDLTableField(db, schema, table, object)
		case "index":
			properties, propErr = postgresqlPropertiesIndex(db, schema, object)
			ddl, ddlErr = postgresqlDDLClass(db, schema, object)
		case "view":
			properties, propErr = postgresqlPropertiesView(db, schema, object)
			ddl, ddlErr = postgresqlDDLClass(db, schema, object)
		case "trigger":
			properties, propErr = postgresqlPropertiesTrigger(db, schema, table, object)
			ddl, ddlErr = postgresqlDDLTrigger(db, schema, table, object)
		case "pk":
			properties, propErr = postgresqlPropertiesPK(db, schema, table, object)
			ddl, ddlErr = postgresqlDDLConstraint(db, schema, table, object)
		case "foreign_key":
			properties, propErr = postgresqlPropertiesFK(db, schema, table, object)
			ddl, ddlErr = postgresqlDDLConstraint(db, schema, table, object)
		case "unique":
			properties, propErr = postgresqlPropertiesUnique(db, schema, table, object)
			ddl, ddlErr = postgresqlDDLConstraint(db, schema, table, object)
		}
		if propErr != nil {
			writeDatabaseError(w, propErr.Error())
			return
		}
		if ddlErr != nil {
			writeDatabaseError(w, ddlErr.Error())
			return
		}

		data := make([][2]string, 0, len(properties))
		data = append(data, properties...)
		writeEnvelope(w, map[string]any{
			"properties": data,
			"ddl":        ddl,
		}, false, -1)
	}
}
