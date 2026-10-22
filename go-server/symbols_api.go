package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// "Go to definition" and "find usages" in the SQL editor.

const (
	maxUsageHits    = 100
	usagePreviewLen = 160
	// maxUsageFullBytes caps the statement text sent with a history hit.
	maxUsageFullBytes = 20000
)

// --- resolve_symbol: what is the name under the cursor -----------------------------

type resolveSymbolRequest struct {
	PSQL string `json:"p_sql"`
	PPos int    `json:"p_pos"`
}

func rangeJSON(sql string, r symbolRange) map[string]any {
	row, col := byteToRowColumn(sql, r.Start)
	endRow, endCol := byteToRowColumn(sql, r.End)
	return map[string]any{"row": row, "column": col, "end_row": endRow, "end_column": endCol}
}

// handleResolveSymbol needs no database: the answer comes from the text alone.
func handleResolveSymbol(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req resolveSymbolRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		if len(req.PSQL) > maxInspectBytes {
			writeEnvelope(w, map[string]any{"kind": ""}, false, -1)
			return
		}
		info := resolveSymbol(req.PSQL, runeIndexToByte(req.PSQL, req.PPos))
		usages := make([]map[string]any, len(info.Usages))
		for i, u := range info.Usages {
			usages[i] = rangeJSON(req.PSQL, u)
		}
		out := map[string]any{"kind": info.Kind, "name": info.Name, "table": info.Table, "usages": usages}
		if info.Definition != nil {
			out["definition"] = rangeJSON(req.PSQL, *info.Definition)
		}
		writeEnvelope(w, out, false, -1)
	}
}

// --- table_ddl: the definition of a table or view ------------------------------------

type tableDDLRequest struct {
	baseRequest
	PTable string `json:"p_table"` // as written in the SQL, possibly schema-qualified and quoted
}

// definitionOf returns the DDL of a table or view named as written in SQL.
func definitionOf(db *sql.DB, info *ConnectionInfo, written string) (string, error) {
	schemaWritten, tableWritten := splitSchemaTable(written)
	tech := info.Technology
	schema := ""
	if technologyHasSchema(tech) {
		schema = catalogName(tech, defaultSchemaFor(info, schemaWritten))
	}
	table := catalogName(tech, tableWritten)
	if _, err := editDataTableRef(db, tech, schema, table); err != nil {
		return "", err
	}
	ddl, err := tableDDL(tech, db, schema, table)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(ddl) == "" && tech == "sqlite" {
		ddl, err = sqliteDDL(db, table, table, "view")
	}
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(ddl) == "" {
		return "", fmt.Errorf("no definition available for %s", written)
	}
	return ddl, nil
}

func handleTableDDL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req tableDDLRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()
		ddl, err := definitionOf(db, info, req.PTable)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, ddl, false, -1)
	}
}

// --- find_usages: where else is the name used ---------------------------------------

type usageHit struct {
	Source string // "snippet" or "history"
	ID     int64
	Title  string
	Line   int // 1-based line of the first mention
	Text   string
	Full   string // the whole statement, for history entries
}

// usageRegexp matches name as a whole identifier (optionally quoted), case-insensitively.
func usageRegexp(name string) *regexp.Regexp {
	return regexp.MustCompile(`(?i)(?:^|[^\w$])["` + "`" + `]?` + regexp.QuoteMeta(name) + `["` + "`" + `]?(?:$|[^\w$])`)
}

// firstMention returns the 1-based line and the trimmed text of the first line
// of text that mentions the name.
func firstMention(re *regexp.Regexp, text string) (int, string, bool) {
	for i, line := range strings.Split(text, "\n") {
		if re.MatchString(line) {
			line = strings.TrimSpace(line)
			if len([]rune(line)) > usagePreviewLen {
				line = string([]rune(line)[:usagePreviewLen]) + "…"
			}
			return i + 1, line, true
		}
	}
	return 0, "", false
}

// findUsages searches the user's snippets and query history for the name (the
// last part of a dotted name is what is looked for, so "public.customer" finds
// both spellings).
func findUsages(db *sql.DB, userID int64, written string) ([]usageHit, error) {
	name := lastNamePart(written)
	if strings.TrimSpace(name) == "" {
		return nil, nil
	}
	re := usageRegexp(name)
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(name) + "%"
	var hits []usageHit

	folders, err := fetchSnippetFolders(db, userID)
	if err != nil {
		return nil, err
	}
	byID := map[int64]snippetFolder{}
	for _, f := range folders {
		byID[f.ID] = f
	}
	pathOf := func(parent sql.NullInt64) string {
		var parts []string
		for guard := 0; parent.Valid && guard < 64; guard++ {
			f, ok := byID[parent.Int64]
			if !ok {
				break
			}
			parts = append([]string{f.Name}, parts...)
			parent = f.ParentID
		}
		return strings.Join(parts, " / ")
	}
	rows, err := db.Query(`select id, parent_id, name, text from OmniDB_app_snippetfile where user_id = ? and text like ? escape '\' order by name`, userID, like)
	if err != nil {
		return nil, err
	}
	for rows.Next() && len(hits) < maxUsageHits {
		var id int64
		var parent sql.NullInt64
		var title, text string
		if err := rows.Scan(&id, &parent, &title, &text); err != nil {
			rows.Close()
			return nil, err
		}
		if line, preview, ok := firstMention(re, text); ok {
			if p := pathOf(parent); p != "" {
				title = p + " / " + title
			}
			hits = append(hits, usageHit{Source: "snippet", ID: id, Title: title, Line: line, Text: preview})
		}
	}
	rows.Close()

	hrows, err := db.Query(`select id, start_time, snippet from OmniDB_app_queryhistory where user_id = ? and snippet like ? escape '\' order by id desc limit 500`, userID, like)
	if err != nil {
		return nil, err
	}
	defer hrows.Close()
	seen := map[string]bool{}
	for hrows.Next() && len(hits) < maxUsageHits {
		var id int64
		var when, text string
		if err := hrows.Scan(&id, &when, &text); err != nil {
			return nil, err
		}
		key := strings.TrimSpace(text)
		if seen[key] {
			continue
		}
		if line, preview, ok := firstMention(re, text); ok {
			seen[key] = true
			if len(text) > maxUsageFullBytes {
				text = text[:maxUsageFullBytes]
			}
			hits = append(hits, usageHit{Source: "history", ID: id, Title: editorVersionDate(when), Line: line, Text: preview, Full: text})
		}
	}
	return hits, hrows.Err()
}

type findUsagesRequest struct {
	PName string `json:"p_name"`
}

func handleFindUsages(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req findUsagesRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		hits, err := findUsages(db, int64(who.UserID), req.PName)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		out := make([]map[string]any, len(hits))
		for i, h := range hits {
			out[i] = map[string]any{"source": h.Source, "id": h.ID, "title": h.Title, "line": h.Line, "text": h.Text, "full": h.Full}
		}
		writeEnvelope(w, out, false, -1)
	}
}
