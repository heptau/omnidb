package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// This file wires the HTTP layer for postgresql_constraints2.go,
// postgresql_eventtriggers.go, postgresql_inheritance.go,
// postgresql_statistics.go, and postgresql_mviews.go — part of Fáze 8a's
// PostgreSQL long-tail port.

func handleGetChecksPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlChecks(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(items))
		for _, c := range items {
			data = append(data, []any{c.Name, c.Source, c.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetExcludesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlExcludes(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(items))
		for _, e := range items {
			data = append(data, []any{e.Name, e.Attributes, e.Operations, e.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetRulesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlRules(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(items))
		for _, rr := range items {
			data = append(data, []any{rr.Name, rr.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgRuleDefinitionRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PRule   string `json:"p_rule"`
}

func handleGetRuleDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgRuleDefinitionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		def, err := postgresqlRuleDefinition(db, reqBody.PSchema, reqBody.PTable, reqBody.PRule)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}

func handleGetEventTriggersPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlEventTriggers(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, t := range items {
			data = append(data, map[string]any{
				"v_name": t.Name, "v_enabled": t.Enabled, "v_event": t.Event,
				"v_function": t.Function, "v_id": t.ID, "v_function_oid": t.FunctionOID, "v_oid": t.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetEventTriggerFunctionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlEventTriggerFunctions(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, f := range items {
			data = append(data, map[string]any{"v_name": f.Name, "v_function_oid": f.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgFunctionRequest struct {
	baseRequest
	PFunction string `json:"p_function"`
}

func handleGetEventTriggerFunctionDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		def, err := postgresqlEventTriggerFunctionDefinition(db, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}

func handleGetInheritedsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlInheritedChildNames(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(names))
		for _, n := range names {
			data = append(data, []any{n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetInheritedsParentsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlInheritedParents(db, reqBody.PSchema)
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

func writeInheritedOrPartitionChildren(w http.ResponseWriter, items []postgresqlInheritedOrPartitionChild) {
	data := make([]map[string]any, 0, len(items))
	for _, c := range items {
		data = append(data, map[string]any{
			"v_name": c.Name, "v_has_primary_keys": true, "v_has_foreign_keys": true,
			"v_has_uniques": true, "v_has_indexes": true, "v_has_checks": true,
			"v_has_excludes": true, "v_has_rules": true, "v_has_triggers": true,
			"v_has_partitions": true, "v_has_statistics": true, "v_oid": c.OID,
		})
	}
	writeEnvelope(w, data, false, -1)
}

func handleGetInheritedsChildrenPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlInheritedChildren(db, reqBody.PTable, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeInheritedOrPartitionChildren(w, items)
	}
}

func handleGetPartitionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlPartitionChildNames(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(names))
		for _, n := range names {
			data = append(data, []any{n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetPartitionsParentsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlPartitionParents(db, reqBody.PSchema)
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

func handleGetPartitionsChildrenPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlPartitionChildren(db, reqBody.PTable, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeInheritedOrPartitionChildren(w, items)
	}
}

func handleGetStatisticsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlStatistics(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([][]any, 0, len(items))
		for _, s := range items {
			data = append(data, []any{s.Name, s.Schema, s.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgStatisticsColumnsRequest struct {
	baseRequest
	PSchema     string `json:"p_schema"`
	PStatistics string `json:"p_statistics"`
}

func handleGetStatisticsColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgStatisticsColumnsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := postgresqlStatisticsColumns(db, reqBody.PSchema, reqBody.PStatistics)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(names))
		for _, n := range names {
			data = append(data, map[string]any{"v_column_name": n})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetMaterializedViewsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlMaterializedViews(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, v := range items {
			data = append(data, map[string]any{
				"v_name": v.Name, "v_has_indexes": true, "v_has_statistics": true, "v_oid": v.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetMaterializedViewColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlMaterializedViewColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, c := range items {
			data = append(data, map[string]any{
				"v_column_name": c.Name, "v_data_type": c.DataType, "v_data_length": nullStringOrEmpty(c.DataLength),
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetMaterializedViewDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		def, err := postgresqlMaterializedViewDefinition(db, reqBody.PSchema, reqBody.PView)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}
