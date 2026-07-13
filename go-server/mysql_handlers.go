package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
)

// isMySQLFamily reports whether a connection's technology is one this
// migration slice owns — MySQL and MariaDB share one Go implementation
// since they're wire- and SQL-compatible for everything OmniDB queries.
func isMySQLFamily(technology string) bool {
	return technology == "mysql" || technology == "mariadb"
}

// Request shapes — same field names tree_mysql.py's views unpack from
// their POST body.
type mysqlSchemaRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
}

type mysqlTableRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
}

type mysqlKeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKey    string `json:"p_key"`
}

type mysqlFkeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PFkey   string `json:"p_fkey"`
}

type mysqlUniqueColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PUnique string `json:"p_unique"`
}

type mysqlIndexColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PIndex  string `json:"p_index"`
}

type mysqlViewRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PView   string `json:"p_view"`
}

type mysqlFunctionRequest struct {
	baseRequest
	PSchema   string `json:"p_schema"`
	PFunction string `json:"p_function"`
}

type mysqlProcedureRequest struct {
	baseRequest
	PSchema    string `json:"p_schema"`
	PProcedure string `json:"p_procedure"`
}

type mysqlPropertiesRequestData struct {
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type mysqlPropertiesRequest struct {
	baseRequest
	PData mysqlPropertiesRequestData `json:"p_data"`
}

// mysqlSupportedPropertyTypes mirrors what MySQL.py's/MariaDB.py's own
// GetProperties dispatch actually supports — everything else (there is no
// "everything else" registered in urls.py today; pk/fk/unique/index never
// call get_properties_mysql from the tree) falls through to Django.
var mysqlSupportedPropertyTypes = map[string]bool{
	"table":     true,
	"view":      true,
	"function":  true,
	"procedure": true,
}

// resolveMySQLRequest is resolveSQLiteRequest's/resolvePostgreSQLRequest's
// MySQL+MariaDB counterpart.
func resolveMySQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || !isMySQLFamily(info.Technology) {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openMySQLTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

func decodeMySQLRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, *ConnectionInfo, bool) {
	return resolveMySQLRequest(w, r, upstream, fallback, dst.databaseIndex())
}

func handleGetTreeInfoMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, info, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		treeInfo, err := mysqlTreeInfo(db, info.Database, info.Technology)
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

func handleGetTablesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		tables, err := mysqlTables(db, reqBody.PSchema)
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

func handleGetColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := mysqlColumns(db, reqBody.PSchema, reqBody.PTable)
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
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPKMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mysqlPrimaryKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetPKColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlKeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mysqlPrimaryKeyColumns(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetFKsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := mysqlForeignKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetFKsColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlFkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mysqlForeignKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PFkey)
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

func handleGetUniquesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mysqlUniques(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetUniquesColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlUniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mysqlUniqueColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PUnique)
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

func handleGetIndexesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := mysqlIndexes(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetIndexesColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlIndexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := mysqlIndexColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PIndex)
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

func handleGetDatabasesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mysqlDatabases(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(names))
		for _, n := range names {
			data = append(data, map[string]any{"v_name": n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetRolesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		names, err := mysqlRoles(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(names))
		for _, n := range names {
			data = append(data, map[string]any{"v_name": n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		views, err := mysqlViews(db, reqBody.PSchema)
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

func handleGetViewsColumnsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := mysqlViewColumns(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetViewDefinitionMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlViewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := mysqlViewDefinition(db, reqBody.PSchema, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetFunctionsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fns, err := mysqlFunctions(db, reqBody.PSchema)
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

func handleGetFunctionFieldsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := mysqlFunctionFields(db, reqBody.PSchema, reqBody.PFunction)
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

func handleGetFunctionDefinitionMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		schema := reqBody.PSchema
		if schema == "" {
			schema = info.Database
		}
		definition, err := mysqlFunctionDefinition(db, schema, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetProceduresMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		procs, err := mysqlProcedures(db, reqBody.PSchema)
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

func handleGetProcedureFieldsMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := mysqlProcedureFields(db, reqBody.PSchema, reqBody.PProcedure)
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

func handleGetProcedureDefinitionMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		schema := reqBody.PSchema
		if schema == "" {
			schema = info.Database
		}
		definition, err := mysqlProcedureDefinition(db, schema, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetPropertiesMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlPropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !mysqlSupportedPropertyTypes[reqBody.PData.PType] {
			fallback.ServeHTTP(w, r)
			return
		}

		db, info, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		schema := reqBody.PData.PSchema
		object := reqBody.PData.PObject

		var properties [][2]string
		var propErr error
		switch reqBody.PData.PType {
		case "table":
			properties, propErr = mysqlPropertiesTable(db, schema, object)
		case "view":
			properties, propErr = mysqlPropertiesView(db, schema, object, info.Technology)
		case "function":
			properties, propErr = mysqlPropertiesRoutine(db, schema, object, "FUNCTION")
		case "procedure":
			properties, propErr = mysqlPropertiesRoutine(db, schema, object, "PROCEDURE")
		}
		if propErr != nil {
			writeDatabaseError(w, propErr.Error())
			return
		}

		ddl, err := mysqlDDL(db, schema, object, reqBody.PData.PType)
		if err != nil {
			writeDatabaseError(w, err.Error())
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

func handleTemplateSelectMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := mysqlTemplateSelect(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateInsertMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := mysqlTemplateInsert(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateUpdateMySQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody mysqlTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeMySQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := mysqlTemplateUpdate(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}
