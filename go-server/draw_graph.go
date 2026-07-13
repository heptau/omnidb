package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

type graphNode struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Group int    `json:"group"`
}

type graphEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Label  string `json:"label"`
	Arrows string `json:"arrows"`
}

// buildGraph mirrors draw_graph's node/edge assembly. tableColumns holds
// pre-formatted "name : type" lines per table (used only when complete is
// true), tableForeignKeys holds each table's referenced-table names.
//
// Deliberately drops any FK edge to a table outside tableNames instead of
// creating Python's separate labeled node for it (its "FK referencing other
// schema" branch) — a documented simplification for the uncommon cross-
// schema/cross-database FK case. The vast majority of real usage draws one
// schema's own relationships; a stray cross-schema reference just isn't
// drawn as an edge here rather than growing a second node type.
func buildGraph(tableNames []string, tableColumns map[string][]string, tableForeignKeys map[string][]string, complete bool) ([]graphNode, []graphEdge) {
	inSchema := make(map[string]bool, len(tableNames))
	for _, t := range tableNames {
		inSchema[t] = true
	}

	nodes := make([]graphNode, 0, len(tableNames))
	for _, t := range tableNames {
		label := t
		if complete {
			label += "\n"
			for _, col := range tableColumns[t] {
				label += col + "\n"
			}
		}
		nodes = append(nodes, graphNode{ID: t, Label: label, Group: 1})
	}

	edges := make([]graphEdge, 0)
	for _, t := range tableNames {
		for _, rTable := range tableForeignKeys[t] {
			if !inSchema[rTable] {
				continue
			}
			edges = append(edges, graphEdge{From: t, To: rTable, Label: "", Arrows: "to"})
		}
	}
	return nodes, edges
}

type drawGraphRequest struct {
	baseRequest
	PSchema   string `json:"p_schema"`
	PComplete bool   `json:"p_complete"`
}

// handleDrawGraph mirrors workspace.py's draw_graph — cross-engine, same
// dispatch shape as start_edit_data/refresh_monitoring (resolveNativeRequest).
func handleDrawGraph(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req drawGraphRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		schema := ""
		if technologyHasSchema(info.Technology) {
			schema = req.PSchema
		}

		tableNames, err := graphTableNames(info.Technology, db, schema)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		tableColumns := map[string][]string{}
		if req.PComplete {
			for _, t := range tableNames {
				cols, err := editDataColumns(info.Technology, db, schema, t)
				if err != nil {
					writeDatabaseError(w, err.Error())
					return
				}
				lines := make([]string, len(cols))
				for i, c := range cols {
					lines[i] = fmt.Sprintf("%s : %s", c.Name, c.DataType)
				}
				tableColumns[t] = lines
			}
		}

		tableForeignKeys := map[string][]string{}
		for _, t := range tableNames {
			targets, err := graphForeignKeyTargets(info.Technology, db, schema, t)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
			tableForeignKeys[t] = targets
		}

		nodes, edges := buildGraph(tableNames, tableColumns, tableForeignKeys, req.PComplete)
		writeEnvelope(w, map[string]any{
			"v_nodes": nodes,
			"v_edges": edges,
		}, false, -1)
	}
}
