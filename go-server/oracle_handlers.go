package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

// Request shapes — same field names tree_oracle.py's views unpack from their
// POST body.
type oracleSchemaRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
}

type oracleTableRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
}

type oracleKeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKey    string `json:"p_key"`
}

type oracleFkeyColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PFkey   string `json:"p_fkey"`
}

type oracleUniqueColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PUnique string `json:"p_unique"`
}

type oracleIndexColumnsRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PIndex  string `json:"p_index"`
}

type oracleViewRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PView   string `json:"p_view"`
}

type oracleFunctionRequest struct {
	baseRequest
	PSchema   string `json:"p_schema"`
	PFunction string `json:"p_function"`
}

type oracleProcedureRequest struct {
	baseRequest
	PSchema    string `json:"p_schema"`
	PProcedure string `json:"p_procedure"`
}

type oraclePropertiesRequestData struct {
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PObject string `json:"p_object"`
	PType   string `json:"p_type"`
}

type oraclePropertiesRequest struct {
	baseRequest
	PData oraclePropertiesRequestData `json:"p_data"`
}

// oracleSupportedPropertyTypes mirrors what this migration slice's Oracle
// introspection actually covers — GetProperties/GetDDL in Oracle.py
// structurally support any object_type all_objects knows about (plus the
// role/tablespace special cases), but only these kinds have a corresponding
// tree route in this Go slice; everything else falls through to Django, same
// deferral pattern as the other engines' triggers/mviews/etc.
var oracleSupportedPropertyTypes = map[string]bool{
	"table":      true,
	"view":       true,
	"index":      true,
	"function":   true,
	"procedure":  true,
	"sequence":   true,
	"role":       true,
	"tablespace": true,
}

func isOracle(technology string) bool {
	return technology == "oracle"
}

func resolveOracleRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, databaseIndex string) (*sql.DB, *ConnectionInfo, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}

	info, err := resolveConnection(upstream, cookie, databaseIndex)
	if err != nil || !info.Found || !isOracle(info.Technology) {
		fallback.ServeHTTP(w, r)
		return nil, nil, false
	}
	applyRememberedPassword(r, databaseIndex, info)

	db, err := openOracleTarget(info)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, info, true
}

func decodeOracleRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL, fallback http.Handler, dst interface{ databaseIndex() string }) (*sql.DB, *ConnectionInfo, bool) {
	return resolveOracleRequest(w, r, upstream, fallback, dst.databaseIndex())
}

func handleGetTreeInfoOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, info, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		treeInfo, err := oracleTreeInfo(db, info.Database, strings.ToUpper(info.Username))
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

func handleGetTablesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		tables, err := oracleTables(db, reqBody.PSchema)
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

func handleGetColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := oracleColumns(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetPKOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := oraclePrimaryKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetPKColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleKeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := oraclePrimaryKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PKey)
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

func handleGetFKsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fks, err := oracleForeignKeys(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetFKsColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleFkeyColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := oracleForeignKeyColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PFkey)
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

func handleGetUniquesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := oracleUniques(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetUniquesColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleUniqueColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := oracleUniqueColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PUnique)
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

func handleGetIndexesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		indexes, err := oracleIndexes(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetIndexesColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleIndexColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		cols, err := oracleIndexColumns(db, reqBody.PSchema, reqBody.PTable, reqBody.PIndex)
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

func handleGetTablespacesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		names, err := oracleTablespaces(db)
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

func handleGetRolesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody)
		if !ok {
			return
		}
		defer db.Close()

		names, err := oracleRoles(db)
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

func handleGetFunctionsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fns, err := oracleFunctions(db, reqBody.PSchema)
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

func handleGetFunctionFieldsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := oracleFunctionFields(db, reqBody.PSchema, reqBody.PFunction)
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

func handleGetFunctionDefinitionOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := oracleFunctionDefinition(db, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetProceduresOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		procs, err := oracleProcedures(db, reqBody.PSchema)
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

func handleGetProcedureFieldsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := oracleProcedureFields(db, reqBody.PSchema, reqBody.PProcedure)
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

func handleGetProcedureDefinitionOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := oracleProcedureDefinition(db, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetSequencesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		seqs, err := oracleSequences(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(seqs))
		for _, s := range seqs {
			data = append(data, map[string]any{"v_sequence_name": s.Name})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetViewsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleSchemaRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		views, err := oracleViews(db, reqBody.PSchema)
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

func handleGetViewsColumnsOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		columns, err := oracleViewFields(db, reqBody.PSchema, reqBody.PTable)
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

func handleGetViewDefinitionOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleViewRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		definition, err := oracleViewDefinition(db, reqBody.PSchema, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, definition, false, -1)
	}
}

func handleGetPropertiesOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oraclePropertiesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		if !oracleSupportedPropertyTypes[reqBody.PData.PType] {
			fallback.ServeHTTP(w, r)
			return
		}

		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		schema := reqBody.PData.PSchema
		object := reqBody.PData.PObject
		pType := reqBody.PData.PType

		var properties [][2]string
		var propErr error
		switch pType {
		case "role":
			properties, propErr = oraclePropertiesRole(db, object)
		case "tablespace":
			properties, propErr = oraclePropertiesTablespace(db, object)
		default:
			properties, propErr = oraclePropertiesGeneric(db, schema, object, pType)
		}
		if propErr != nil {
			writeDatabaseError(w, propErr.Error())
			return
		}

		var ddl string
		if pType == "role" || pType == "tablespace" || pType == "database" {
			ddl = " "
		} else {
			ddl, err = oracleDDL(db, schema, object)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
		}

		writeEnvelope(w, map[string]any{
			"properties": properties,
			"ddl":        ddl,
		}, false, -1)
	}
}

func handleTemplateSelectOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := oracleTemplateSelect(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateInsertOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := oracleTemplateInsert(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}

func handleTemplateUpdateOracle(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody oracleTableRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := decodeOracleRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		template, err := oracleTemplateUpdate(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_template": template}, false, -1)
	}
}
