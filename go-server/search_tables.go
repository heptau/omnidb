package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
)

// Search Everywhere's table lookup: the tables of one connection whose name
// contains the typed text.

const searchTablesLimit = 50

type searchTablesRequest struct {
	baseRequest
	PQuery string `json:"p_query"`
}

type tableHit struct {
	Schema string
	Name   string
}

// searchSchemas lists the schemas to look in: every user schema on PostgreSQL
// and SQL Server, the connection's own database on MySQL/MariaDB, its own user
// on Oracle, and the single implicit one on SQLite and Firebird.
func searchSchemas(info *ConnectionInfo, db *sql.DB) ([]string, error) {
	switch {
	case info.Technology == "postgresql":
		schemas, err := postgresqlSchemas(db)
		if err != nil {
			return nil, err
		}
		var out []string
		for _, s := range schemas {
			if s.Name != "pg_catalog" && s.Name != "information_schema" {
				out = append(out, s.Name)
			}
		}
		return out, nil
	case isMSSQL(info.Technology):
		schemas, err := mssqlSchemas(db)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(schemas))
		for i, s := range schemas {
			out[i] = s.Name
		}
		return out, nil
	case isMySQLFamily(info.Technology):
		if info.Database != "" {
			return []string{info.Database}, nil
		}
		return nil, nil
	case isOracle(info.Technology):
		return []string{strings.ToUpper(info.Username)}, nil
	default:
		return []string{""}, nil
	}
}

// matchTables returns the names containing needle (case-insensitively, with
// PostgreSQL's identifier quoting ignored), up to limit.
func matchTables(names []string, needle string, limit int) []string {
	needle = strings.ToLower(strings.TrimSpace(needle))
	var out []string
	for _, n := range names {
		if len(out) >= limit {
			break
		}
		if strings.Contains(strings.ToLower(strings.ReplaceAll(n, `"`, "")), needle) {
			out = append(out, n)
		}
	}
	return out
}

func handleSearchTables(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req searchTablesRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		out := []map[string]any{}
		if strings.TrimSpace(req.PQuery) == "" {
			writeEnvelope(w, out, false, -1)
			return
		}
		schemas, err := searchSchemas(info, db)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		for _, schema := range schemas {
			names, err := graphTableNames(info.Technology, db, schema)
			if err != nil {
				// One unreadable schema must not hide the hits of the others.
				continue
			}
			for _, n := range matchTables(names, req.PQuery, searchTablesLimit-len(out)) {
				out = append(out, map[string]any{"schema": schema, "name": n})
			}
			if len(out) >= searchTablesLimit {
				break
			}
		}
		writeEnvelope(w, out, false, -1)
	}
}
