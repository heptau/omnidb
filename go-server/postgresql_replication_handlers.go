package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// This file wires the HTTP layer for postgresql_replication.go and
// postgresql_foreigndata.go — part of Fáze 8a's PostgreSQL long-tail port.

func namesEnvelope(names []string) []map[string]any {
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{"v_name": n})
	}
	return out
}

func handleGetPhysicalReplicationSlotsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlPhysicalReplicationSlots(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namesEnvelope(names), false, -1)
	}
}

func handleGetLogicalReplicationSlotsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		names, err := postgresqlLogicalReplicationSlots(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namesEnvelope(names), false, -1)
	}
}

func handleGetPublicationsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlPublications(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, p := range items {
			data = append(data, map[string]any{
				"v_name": p.Name, "v_alltables": p.AllTables, "v_insert": p.Insert,
				"v_update": p.Update, "v_delete": p.Delete, "v_truncate": p.Truncate, "v_oid": p.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgPublicationTablesRequest struct {
	baseRequest
	PPub string `json:"p_pub"`
}

func handleGetPublicationTablesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgPublicationTablesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := postgresqlPublicationTables(db, reqBody.PPub)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namesEnvelope(names), false, -1)
	}
}

func handleGetSubscriptionsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlSubscriptions(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, s := range items {
			data = append(data, map[string]any{
				"v_name": s.Name, "v_enabled": s.Enabled, "v_conninfo": s.ConnInfo,
				"v_publications": s.Publications, "v_oid": s.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgSubscriptionTablesRequest struct {
	baseRequest
	PSub string `json:"p_sub"`
}

func handleGetSubscriptionTablesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgSubscriptionTablesRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		names, err := postgresqlSubscriptionTables(db, reqBody.PSub)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namesEnvelope(names), false, -1)
	}
}

func handleGetForeignDataWrappersPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlForeignDataWrappers(db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, namedOIDEnvelope(items), false, -1)
	}
}

type pgForeignServersRequest struct {
	baseRequest
	PFdw string `json:"p_fdw"`
}

func handleGetForeignServersPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgForeignServersRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlForeignServers(db, reqBody.PFdw)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, s := range items {
			data = append(data, map[string]any{
				"v_name": s.Name, "v_type": nullStringOrEmpty(s.Type), "v_version": nullStringOrEmpty(s.Version),
				"v_options": s.Options, "v_oid": s.OID,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

type pgUserMappingsRequest struct {
	baseRequest
	PForeignServer string `json:"p_foreign_server"`
}

func handleGetUserMappingsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody pgUserMappingsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, ok := decodePostgreSQLRequest(w, r, upstream, fallback, reqBody.baseRequest)
		if !ok {
			return
		}
		defer db.Close()

		items, err := postgresqlUserMappings(db, reqBody.PForeignServer)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, m := range items {
			data = append(data, map[string]any{
				"v_name": m.RoleName, "v_options": m.Options, "v_foreign_server": reqBody.PForeignServer,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetForeignTablesPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlForeignTables(db, reqBody.PSchema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, t := range items {
			data = append(data, map[string]any{"v_name": t.Name, "v_has_statistics": true, "v_oid": t.OID})
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleGetForeignColumnsPostgreSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
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

		items, err := postgresqlForeignColumns(db, reqBody.PSchema, reqBody.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		data := make([]map[string]any, 0, len(items))
		for _, c := range items {
			data = append(data, map[string]any{
				"v_column_name": c.Name, "v_data_type": c.DataType, "v_data_length": nullStringOrEmpty(c.DataLength),
				"v_nullable": c.Nullable, "v_options": c.ColumnOptions, "v_tableoptions": c.TableOptions,
				"v_server": c.Server, "v_fdw": c.FDW,
			})
		}
		writeEnvelope(w, data, false, -1)
	}
}
