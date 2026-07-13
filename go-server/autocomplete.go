package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

type autocompleteRequest struct {
	baseRequest
	PTabID string `json:"p_tab_id"`
	PSQL   string `json:"p_sql"`
	PValue string `json:"p_value"`
	PPos   int    `json:"p_pos"`
}

type autocompleteElement struct {
	Value       string `json:"value"`
	SelectValue string `json:"select_value"`
	Complement  string `json:"complement"`
}

type autocompleteGroup struct {
	Type     string                `json:"type"`
	Elements []autocompleteElement `json:"elements"`
}

// handleGetAutocompleteResults mirrors workspace.py's get_autocomplete_results.
//
// Two independent paths, exactly like Python:
//  1. "alias." dot-completion (p_value ends with '.') — resolves what table
//     the alias refers to and lists its columns. Python does this via
//     get_alias(), a full sqlparse-AST alias walk; this reuses
//     findTableReferenceForCompletion/columnMetadataForExpression instead
//     (already shipped for get_completions) — a deliberate, documented
//     simplification: a heuristic backward-text-scan instead of a real SQL
//     parser's alias table, close enough for the common "FROM table alias"
//     case, not a byte-for-byte port of sqlparse's alias resolution.
//  2. Catalog-wide fuzzy search (database/tablespace/role/extension/schema/
//     table/view/function/index) — Postgres-only; confirmed by reading all
//     4 engines' GetAutocompleteValues that MySQL/MariaDB/Oracle/SQLite
//     simply `return None` (no results at all), so this is skipped
//     entirely for those technologies rather than needing a port.
func handleGetAutocompleteResults(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req autocompleteRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		numDots := strings.Count(req.PValue, ".")
		var groups []autocompleteGroup
		maxResultWord := ""
		maxComplementWord := ""
		trackMax := func(result, complement string) {
			if len(result) > len(maxResultWord) {
				maxResultWord = result
			}
			if len(complement) > len(maxComplementWord) {
				maxComplementWord = complement
			}
		}

		aliasHandled := false
		if req.PValue != "" && strings.HasSuffix(req.PValue, ".") {
			alias := strings.TrimSuffix(req.PValue, ".")
			if tableRef, found := findTableReferenceForCompletion(req.PSQL, alias, req.PPos); found {
				cols, err := columnMetadataForExpression(db, tableRef)
				if err == nil {
					group := autocompleteGroup{Type: "column"}
					for _, c := range cols {
						val := req.PValue + c.Name
						group.Elements = append(group.Elements, autocompleteElement{Value: val, SelectValue: val, Complement: c.DataType})
						trackMax(val, c.DataType)
					}
					if len(group.Elements) > 0 {
						groups = append(groups, group)
						aliasHandled = true
					}
				}
			}
		}

		if !aliasHandled && info.Technology == "postgresql" {
			var filterClause string
			var args []any
			switch {
			case req.PValue == "":
				filterClause = "where search.num_dots = 0"
			case numDots > 0:
				filterClause = "where search.result_complete like $1 and search.num_dots <= $2"
				args = []any{req.PValue + "%", numDots}
			default:
				filterClause = "where search.result like $1"
				args = []any{req.PValue + "%"}
			}

			rows, err := postgresqlAutocompleteValues(db, filterClause, args)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}

			var current *autocompleteGroup
			for _, row := range rows {
				result, complement := row.Result, row.Complement
				if numDots > 0 {
					result, complement = row.ResultComplete, row.ComplementComplete
				}
				if current == nil || current.Type != row.Type {
					if current != nil {
						groups = append(groups, *current)
					}
					current = &autocompleteGroup{Type: row.Type}
				}
				selectValue := row.SelectValue
				current.Elements = append(current.Elements, autocompleteElement{Value: result, SelectValue: selectValue, Complement: complement})
				trackMax(result, complement)
			}
			if current != nil && len(current.Elements) > 0 {
				groups = append(groups, *current)
			}
		}

		if groups == nil {
			groups = []autocompleteGroup{}
		}
		writeEnvelope(w, map[string]any{
			"data":                groups,
			"max_result_word":     maxResultWord,
			"max_complement_word": maxComplementWord,
		}, false, -1)
	}
}
