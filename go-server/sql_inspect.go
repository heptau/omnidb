package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Live inspections of the SQL in the query editor: mistakes that are legal SQL
// (so the database says nothing) or that would only show up when the statement
// is run. Built on the completion scanner (sql_context.go), so they work while
// the text is half typed and on every engine. Messages are not worded here: a
// diagnostic carries a code and the frontend translates it.

type sqlDiagnostic struct {
	Code     string
	Severity string // "error", "warning" or "info" (Ace annotation types)
	Arg      string // a name the message mentions
	Start    int    // byte offsets of the highlighted text
	End      int
}

func tokenAt(toks []ctxTok, i int) (ctxTok, bool) {
	if i < 0 || i >= len(toks) {
		return ctxTok{}, false
	}
	return toks[i], true
}

// statementsOf splits a token list into statements at top-level semicolons.
func statementsOf(all []ctxTok) [][]ctxTok {
	var out [][]ctxTok
	start := 0
	for i, t := range all {
		if t.isPunct(";") {
			if i > start {
				out = append(out, all[start:i])
			}
			start = i + 1
		}
	}
	if start < len(all) {
		out = append(out, all[start:])
	}
	return out
}

// statementVerb returns the index of the token that says what the statement
// does (UPDATE, DELETE, SELECT, INSERT, ...): the first one, or the one after a
// leading WITH clause.
func statementVerb(text string, toks []ctxTok) int {
	if len(toks) == 0 {
		return -1
	}
	if !toks[0].isKeyword("WITH") {
		return 0
	}
	// Skip the CTE bodies: the verb is the first depth-0 keyword after them.
	depth := 0
	for i, t := range toks {
		switch {
		case t.isPunct("("):
			depth++
		case t.isPunct(")"):
			depth--
		case depth == 0 && i > 0 && t.isKeyword("SELECT", "UPDATE", "DELETE", "INSERT", "MERGE", "VALUES"):
			return i
		}
	}
	return -1
}

// hasTopLevelWhere reports whether a depth-0 WHERE follows toks[from].
func hasTopLevelWhere(toks []ctxTok, from int) bool {
	depth := 0
	for _, t := range toks[from:] {
		switch {
		case t.isPunct("("):
			depth++
		case t.isPunct(")"):
			depth--
		case depth == 0 && t.isKeyword("WHERE"):
			return true
		}
	}
	return false
}

// inspectStatement applies the text-only rules to one statement.
func inspectStatement(text string, toks []ctxTok) []sqlDiagnostic {
	var out []sqlDiagnostic

	// UPDATE / DELETE that touches every row.
	if v := statementVerb(text, toks); v >= 0 && toks[v].isKeyword("UPDATE", "DELETE") && len(toks) > v+1 && !hasTopLevelWhere(toks, v) {
		code := "no_where_update"
		if toks[v].isKeyword("DELETE") {
			code = "no_where_delete"
		}
		out = append(out, sqlDiagnostic{Code: code, Severity: "warning", Start: toks[v].start, End: toks[v].end})
	}

	// "= NULL" / "<> NULL" in a condition.
	for i, t := range toks {
		if !t.isKeyword("NULL") || i == 0 {
			continue
		}
		op := toks[i-1]
		opStart := op.start
		isEq := op.isPunct("=")
		isNe := op.isPunct(">") && i >= 2 && toks[i-2].isPunct("<") && toks[i-2].end == op.start ||
			op.isPunct("=") && i >= 2 && toks[i-2].isPunct("!") && toks[i-2].end == op.start
		if isNe {
			opStart = toks[i-2].start
		}
		if !isEq && !isNe {
			continue
		}
		// "<=" / ">=" / ":=" are not comparisons with NULL we care about.
		if isEq && !isNe && i >= 2 && toks[i-2].end == op.start && (toks[i-2].isPunct("<") || toks[i-2].isPunct(">") || toks[i-2].isPunct(":")) {
			continue
		}
		switch clauseAt(toks, opStart) {
		case "where", "on", "having":
			out = append(out, sqlDiagnostic{Code: "null_comparison", Severity: "warning", Start: opStart, End: t.end})
		}
	}

	// JOIN with nothing to join on.
	for i, t := range toks {
		if !t.isKeyword("JOIN") {
			continue
		}
		if i > 0 && toks[i-1].isKeyword("CROSS", "NATURAL") {
			continue
		}
		j := i + 1
		if j < len(toks) && toks[j].isKeyword("LATERAL") {
			j++
		}
		if j < len(toks) && toks[j].isPunct("(") {
			k := matchingParen(toks, j)
			if k < 0 {
				continue
			}
			j = k + 1
		} else if end, ok := parseNameAt(toks, j); ok {
			j = end
		} else {
			continue // nothing typed after JOIN yet
		}
		if j < len(toks) && toks[j].isKeyword("AS") {
			j++
		}
		if j < len(toks) && toks[j].isNamePart() && !(toks[j].kind == ctxWord && reservedAfterTable[strings.ToUpper(toks[j].text)]) {
			j++
		}
		next, ok := tokenAt(toks, j)
		if ok && next.isKeyword("ON", "USING") {
			continue
		}
		if ok && next.kind != ctxWord { // a "(" or an operator: still being typed
			continue
		}
		out = append(out, sqlDiagnostic{Code: "join_without_on", Severity: "warning", Start: t.start, End: t.end})
	}

	// An alias nothing refers to.
	for _, ref := range tableRefs(text, toks) {
		if ref.Alias == "" {
			continue
		}
		used := false
		for i, t := range toks {
			if t.isNamePart() && strings.EqualFold(unquoteIdent(t.text), ref.Alias) && t.start != aliasStart(text, toks, ref) &&
				i+1 < len(toks) && toks[i+1].isPunct(".") {
				used = true
				break
			}
		}
		if !used {
			s := aliasStart(text, toks, ref)
			if s >= 0 {
				out = append(out, sqlDiagnostic{Code: "unused_alias", Severity: "info", Arg: ref.Alias, Start: s, End: s + len(ref.Alias)})
			}
		}
	}
	return out
}

// aliasStart finds the byte offset of a reference's alias token (the name-part
// token right after the reference, possibly after AS), or -1.
func aliasStart(text string, toks []ctxTok, ref tableRef) int {
	for i, t := range toks {
		if t.start != ref.Start {
			continue
		}
		j := i
		if t.isPunct("(") {
			k := matchingParen(toks, i)
			if k < 0 {
				return -1
			}
			j = k + 1
		} else if end, ok := parseNameAt(toks, i); ok {
			j = end
		} else {
			return -1
		}
		if j < len(toks) && toks[j].isKeyword("AS") {
			j++
		}
		if j < len(toks) && toks[j].isNamePart() {
			return toks[j].start
		}
		return -1
	}
	return -1
}

// inspectSQL runs the rules that need nothing but the text.
func inspectSQL(text string) []sqlDiagnostic {
	var out []sqlDiagnostic
	for _, stmt := range statementsOf(tokenizeContext(text)) {
		out = append(out, inspectStatement(text, stmt)...)
	}
	return out
}

// --- tables that do not exist -------------------------------------------------

// missingObjectRe matches the "no such table or view" errors of the supported
// engines; any other error (permissions, a dropped connection) is not a reason
// to call the name wrong.
var missingObjectRe = regexp.MustCompile(`(?i)does not exist|doesn't exist|no such table|invalid object name|ora-00942|table unknown|object .* not found|relation .* not found`)

const probeCacheTTL = 30 * time.Second

type probeEntry struct {
	missing bool
	at      time.Time
}

var probeCache sync.Map // "connID|name" -> probeEntry

// objectMissing asks the database whether a table or view can be selected from.
func objectMissing(db *sql.DB, connKey, name string) bool {
	key := connKey + "|" + strings.ToLower(name)
	if v, ok := probeCache.Load(key); ok {
		if e := v.(probeEntry); time.Since(e.at) < probeCacheTTL {
			return e.missing
		}
	}
	rows, err := db.Query("select 1 from " + name + " where 1 = 0")
	missing := false
	if err != nil {
		missing = missingObjectRe.MatchString(err.Error())
	} else {
		rows.Close()
	}
	probeCache.Store(key, probeEntry{missing: missing, at: time.Now()})
	return missing
}

// inspectTables reports FROM / JOIN / UPDATE targets (and INSERT INTO targets)
// that the database does not know. CTE names and subqueries are skipped, and so
// is a SELECT ... INTO target, which is created by the statement.
func inspectTables(db *sql.DB, connKey, text string) []sqlDiagnostic {
	var out []sqlDiagnostic
	checked := 0
	for _, stmt := range statementsOf(tokenizeContext(text)) {
		verb := statementVerb(text, stmt)
		insert := verb >= 0 && stmt[verb].isKeyword("INSERT")
		defs, clause := cteClause(text, stmt)
		ctes := map[string]bool{}
		for _, d := range defs {
			ctes[strings.ToLower(d.Name)] = true
		}
		if clause != "" && checkReadOnlySQL(clause+" select 1") != nil {
			continue // a data-modifying CTE: not worth probing around
		}
		for _, ref := range tableRefs(text, stmt) {
			if ref.Name == "" || ref.Kind == "into" && !insert {
				continue
			}
			if _, table := splitSchemaTable(ref.Name); ctes[strings.ToLower(unquoteIdent(table))] && !strings.Contains(ref.Name, ".") {
				continue
			}
			if checked >= maxCompletionRefs*2 {
				return out
			}
			checked++
			if objectMissing(db, connKey, ref.Name) {
				out = append(out, sqlDiagnostic{Code: "unknown_table", Severity: "error", Arg: ref.Name, Start: ref.Start, End: ref.Start + len(ref.Name)})
			}
		}
	}
	return out
}

// --- HTTP ----------------------------------------------------------------------

// byteToRowColumn converts a byte offset into a 0-based line and a column
// counted in characters.
func byteToRowColumn(text string, offset int) (row, column int) {
	if offset > len(text) {
		offset = len(text)
	}
	before := text[:offset]
	row = strings.Count(before, "\n")
	line := before[strings.LastIndex(before, "\n")+1:]
	return row, utf8.RuneCountInString(line)
}

type inspectSQLRequest struct {
	baseRequest
	PSQL         string `json:"p_sql"`
	PCheckTables bool   `json:"p_check_tables"`
}

// maxInspectBytes is the longest text inspected; beyond it the editor is
// holding a script, not a query being written.
const maxInspectBytes = 200000

func handleInspectSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req inspectSQLRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, _, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		var diags []sqlDiagnostic
		if len(req.PSQL) <= maxInspectBytes {
			diags = inspectSQL(req.PSQL)
			if req.PCheckTables {
				diags = append(diags, inspectTables(db, req.databaseIndex(), req.PSQL)...)
			}
		}
		out := make([]map[string]any, 0, len(diags))
		for _, d := range diags {
			row, col := byteToRowColumn(req.PSQL, d.Start)
			endRow, endCol := byteToRowColumn(req.PSQL, d.End)
			out = append(out, map[string]any{
				"code": d.Code, "severity": d.Severity, "arg": d.Arg,
				"row": row, "column": col, "end_row": endRow, "end_column": endCol,
			})
		}
		writeEnvelope(w, out, false, -1)
	}
}
