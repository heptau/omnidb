package main

import (
	"encoding/json"
	"net/http"
	"net/url"
)

// /compare/: schema diff or data compare between the connection of the current
// tab (the source) and another saved connection (the target).

type compareRequest struct {
	baseRequest
	PKind           string `json:"p_kind"` // "schema" or "data"
	PSourceSchema   string `json:"p_source_schema"`
	PTargetConn     string `json:"p_target_conn"`
	PTargetSchema   string `json:"p_target_schema"`
	PTable          string `json:"p_table"`
	PTargetTable    string `json:"p_target_table"`
	PIncludeDeletes bool   `json:"p_include_deletes"`
}

func columnDiffsJSON(list []columnDiff) []map[string]any {
	out := make([]map[string]any, len(list))
	for i, c := range list {
		out[i] = map[string]any{"table": c.Table, "column": c.Column, "source": c.Source, "target": c.Target}
	}
	return out
}

func handleCompare(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req compareRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil || req.PTargetConn == "" || (req.PKind != "schema" && req.PKind != "data") {
			writeBadRequest(w)
			return
		}
		srcDB, srcInfo, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer srcDB.Close()
		dstDB, dstInfo, ok := resolveNativeRequest(w, r, upstream, fallback, req.PTargetConn)
		if !ok {
			return
		}
		defer dstDB.Close()

		schemaOf := func(info *ConnectionInfo, written string) string {
			if !technologyHasSchema(info.Technology) {
				return ""
			}
			return catalogName(info.Technology, defaultSchemaFor(info, written))
		}
		srcSchema, dstSchema := schemaOf(srcInfo, req.PSourceSchema), schemaOf(dstInfo, req.PTargetSchema)

		if req.PKind == "schema" {
			src, err := readSchemaModel(srcDB, srcInfo.Technology, srcSchema)
			if err != nil {
				writeDatabaseError(w, "source: "+err.Error())
				return
			}
			dst, err := readSchemaModel(dstDB, dstInfo.Technology, dstSchema)
			if err != nil {
				writeDatabaseError(w, "target: "+err.Error())
				return
			}
			d := diffSchemas(src, dst)
			writeEnvelope(w, map[string]any{
				"missing_tables":  d.MissingTables,
				"extra_tables":    d.ExtraTables,
				"added_columns":   columnDiffsJSON(d.AddedColumns),
				"removed_columns": columnDiffsJSON(d.RemovedColumns),
				"type_changes":    columnDiffsJSON(d.TypeChanges),
				"script":          schemaSyncScript(srcDB, src, dst, d),
			}, false, -1)
			return
		}

		srcWritten, srcTable := splitSchemaTable(req.PTable)
		_ = srcWritten
		dstTable := req.PTargetTable
		if dstTable == "" {
			dstTable = req.PTable
		}
		_, dstTableName := splitSchemaTable(dstTable)
		diff, err := compareTableData(srcDB, srcInfo.Technology, srcSchema, catalogName(srcInfo.Technology, srcTable),
			dstDB, dstInfo.Technology, dstSchema, catalogName(dstInfo.Technology, dstTableName), req.PIncludeDeletes)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{
			"inserts": diff.Inserts, "updates": diff.Updates, "deletes": diff.Deletes,
			"keys": diff.KeyColumns, "samples": diff.Samples, "script": diff.Script,
		}, false, -1)
	}
}
