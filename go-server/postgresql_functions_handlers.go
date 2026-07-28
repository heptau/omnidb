package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// This file wires the HTTP layer for postgresql_functions.go — part of
// Fáze 8a's PostgreSQL long-tail port.

// routinesEnvelope matches get_functions/get_procedures/get_triggerfunctions/
// get_aggregates' response shape exactly — v_name/v_id/v_function_oid only
// (schema_name is selected by the SQL but never surfaced in Python's JSON).
func routinesEnvelope(items []postgresqlRoutine) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, r := range items {
		out = append(out, map[string]any{
			"v_id": r.ID, "v_name": r.Name, "v_function_oid": r.OID,
		})
	}
	return out
}

func handleGetFunctionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlFunctions(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, routinesEnvelope(items), false, -1)
	}
}

func handleGetProceduresPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlProcedures(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, routinesEnvelope(items), false, -1)
	}
}

func handleGetTriggerFunctionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlTriggerFunctions(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, routinesEnvelope(items), false, -1)
	}
}

func handleGetAggregatesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlAggregates(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, routinesEnvelope(items), false, -1)
	}
}

type pgFunctionFieldsRequest struct {
	baseRequest
	PFunction string `json:"p_function"`
	PSchema   string `json:"p_schema"`
}

// fieldsEnvelope matches get_function_fields/get_procedure_fields' response
// shape exactly — v_name/v_type only, ordering (not a v_seq key) is what
// conveys sequence. Python's "returns <type>" pseudo-row name comes back
// quote_ident-wrapped (literal double-quote characters, since quote_ident
// was reused there purely as an internal marker to detect the row later in
// TemplateSelectFunction) — this returns the same text unquoted, since
// nothing downstream of this JSON response (verified against the frontend)
// depends on the literal quote characters, only on IsReturns being
// distinguishable internally, which this port already handles explicitly.
func fieldsEnvelope(fields []postgresqlRoutineField) []map[string]any {
	out := make([]map[string]any, 0, len(fields))
	for _, f := range fields {
		out = append(out, map[string]any{"v_type": f.Type, "v_name": f.Name})
	}
	return out
}

func handleGetFunctionFieldsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgFunctionFieldsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := postgresqlRoutineFields(db, reqBody.PSchema, reqBody.PFunction, true)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, fieldsEnvelope(fields), false, -1)
	}
}

type pgProcedureFieldsRequest struct {
	baseRequest
	PProcedure string `json:"p_procedure"`
	PSchema    string `json:"p_schema"`
}

func handleGetProcedureFieldsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgProcedureFieldsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		fields, err := postgresqlRoutineFields(db, reqBody.PSchema, reqBody.PProcedure, false)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, fieldsEnvelope(fields), false, -1)
	}
}

func handleGetFunctionDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		def, err := postgresqlRoutineDefinition(db, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}

type pgProcedureRequest struct {
	baseRequest
	PProcedure string `json:"p_procedure"`
}

func handleGetProcedureDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		def, err := postgresqlRoutineDefinition(db, reqBody.PProcedure)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}

func handleGetTriggerFunctionDefinitionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		def, err := postgresqlRoutineDefinition(db, reqBody.PFunction)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, def, false, -1)
	}
}

type pgTemplateSelectFunctionRequest struct {
	baseRequest
	PFunction   string `json:"p_function"`
	PFunctionID string `json:"p_functionid"`
	PSchema     string `json:"p_schema"`
}

func handleTemplateSelectFunctionPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTemplateSelectFunctionRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		sql, err := postgresqlTemplateSelectFunction(db, reqBody.PSchema, reqBody.PFunction, reqBody.PFunctionID)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, sql, false, -1)
	}
}

type pgTemplateCallProcedureRequest struct {
	baseRequest
	PProcedure   string `json:"p_procedure"`
	PProcedureID string `json:"p_procedureid"`
	PSchema      string `json:"p_schema"`
}

func handleTemplateCallProcedurePostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgTemplateCallProcedureRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		sql, err := postgresqlTemplateCallProcedure(db, reqBody.PSchema, reqBody.PProcedure, reqBody.PProcedureID)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, sql, false, -1)
	}
}
