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

// Rename refactoring for tables and columns. Nothing here renames anything in
// the database by itself: the plan is the ALTER statement, which the user runs
// from a query tab, plus a preview of the snippets that mention the old name and
// would be rewritten on request.

// validNewName limits a new name to plain identifiers.
var validNewName = regexp.MustCompile(`^[\p{L}_][\p{L}\p{N}_$]{0,99}$`)

// newIdentifier writes a new name the way the engine expects an identifier of
// that spelling: folded to upper case where the engine does so unquoted
// (Oracle, Firebird), quoted only when needed elsewhere.
func newIdentifier(technology, name string) string {
	if (isOracle(technology) || isFirebird(technology)) && regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$]*$`).MatchString(name) {
		return strings.ToUpper(name)
	}
	return sqlExportIdent(name, technology)
}

// renameStatement builds the statement that renames a table (column == "") or
// one of its columns. schema and table are the verified plain names, oldColumn
// the catalog name of the column.
func renameStatement(technology, schema, table, oldColumn, newName string) (string, error) {
	ref := quotedSchemaTableRef(technology, schema, table)
	newID := newIdentifier(technology, newName)
	literal := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	if oldColumn == "" {
		switch {
		case technology == "sqlite", technology == "postgresql", isOracle(technology):
			return "ALTER TABLE " + ref + " RENAME TO " + newID + ";", nil
		case isMySQLFamily(technology):
			return "RENAME TABLE " + ref + " TO " + quoteMySQLIdent(schema) + "." + newID + ";", nil
		case isMSSQL(technology):
			return "EXEC sp_rename " + literal(schema+"."+table) + ", " + literal(newName) + ";", nil
		}
		return "", fmt.Errorf("renaming a table is not supported on this database")
	}
	oldID := quoteEditDataColumn(technology, oldColumn)
	switch {
	case technology == "sqlite", technology == "postgresql", isOracle(technology), isMySQLFamily(technology):
		return "ALTER TABLE " + ref + " RENAME COLUMN " + oldID + " TO " + newID + ";", nil
	case isMSSQL(technology):
		return "EXEC sp_rename " + literal(schema+"."+table+"."+oldColumn) + ", " + literal(newName) + ", 'COLUMN';", nil
	case isFirebird(technology):
		return "ALTER TABLE " + ref + " ALTER COLUMN " + oldID + " TO " + newID + ";", nil
	}
	return "", fmt.Errorf("renaming a column is not supported on this database")
}

// renameIdentifier replaces every identifier called oldName in SQL text with
// newName and returns the new text and how many were replaced. Strings and
// comments are left alone (they are not tokens of the scanner); a quoted
// identifier stays quoted. A name used as qualifier (old.col), after a schema
// (schema.old) or on its own is replaced alike; which of them really mean the
// object is for the user to judge in the preview.
func renameIdentifier(text, oldName, newName string) (string, int) {
	toks := tokenizeContext(text)
	var b strings.Builder
	last, count := 0, 0
	for _, t := range toks {
		if !t.isNamePart() || !strings.EqualFold(unquoteIdent(t.text), oldName) {
			continue
		}
		b.WriteString(text[last:t.start])
		if t.kind == ctxQuoted {
			q := t.text[:1]
			b.WriteString(q + strings.ReplaceAll(newName, q, q+q) + q)
		} else {
			b.WriteString(newName)
		}
		last = t.end
		count++
	}
	if count == 0 {
		return text, 0
	}
	b.WriteString(text[last:])
	return b.String(), count
}

type renameLine struct {
	Line          int
	Before, After string
}

// renamedLines pairs the lines of text that renameIdentifier changed.
func renamedLines(before, after string) []renameLine {
	bl, al := strings.Split(before, "\n"), strings.Split(after, "\n")
	var out []renameLine
	for i := range bl {
		if i < len(al) && bl[i] != al[i] {
			out = append(out, renameLine{Line: i + 1, Before: strings.TrimSpace(bl[i]), After: strings.TrimSpace(al[i])})
		}
	}
	return out
}

type snippetRename struct {
	ID    int64
	Title string
	Count int
	Lines []renameLine
}

const maxPreviewLines = 6

// snippetRenames lists the user's snippets in which oldName would change.
func snippetRenames(db *sql.DB, userID int64, oldName, newName string) ([]snippetRename, error) {
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(oldName) + "%"
	folders, err := fetchSnippetFolders(db, userID)
	if err != nil {
		return nil, err
	}
	byID := map[int64]snippetFolder{}
	for _, f := range folders {
		byID[f.ID] = f
	}
	rows, err := db.Query(`select id, parent_id, name, text from OmniDB_app_snippetfile where user_id = ? and text like ? escape '\' order by name`, userID, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []snippetRename
	for rows.Next() {
		var id int64
		var parent sql.NullInt64
		var name, text string
		if err := rows.Scan(&id, &parent, &name, &text); err != nil {
			return nil, err
		}
		after, n := renameIdentifier(text, oldName, newName)
		if n == 0 {
			continue
		}
		var parts []string
		for guard := 0; parent.Valid && guard < 64; guard++ {
			f, ok := byID[parent.Int64]
			if !ok {
				break
			}
			parts = append([]string{f.Name}, parts...)
			parent = f.ParentID
		}
		title := name
		if len(parts) > 0 {
			title = strings.Join(parts, " / ") + " / " + name
		}
		lines := renamedLines(text, after)
		if len(lines) > maxPreviewLines {
			lines = lines[:maxPreviewLines]
		}
		out = append(out, snippetRename{ID: id, Title: title, Count: n, Lines: lines})
	}
	return out, rows.Err()
}

// applySnippetRename rewrites the chosen snippets; the text is renamed here,
// from what is stored, never from anything the client sends.
func applySnippetRename(db *sql.DB, userID int64, ids []int64, oldName, newName string) (int, error) {
	updated := 0
	for _, id := range ids {
		var text string
		if err := db.QueryRow(`select text from OmniDB_app_snippetfile where id = ? and user_id = ?`, id, userID).Scan(&text); err != nil {
			if err == sql.ErrNoRows {
				continue
			}
			return updated, err
		}
		after, n := renameIdentifier(text, oldName, newName)
		if n == 0 {
			continue
		}
		if _, err := db.Exec(`update OmniDB_app_snippetfile set text = ? where id = ? and user_id = ?`, after, id, userID); err != nil {
			return updated, err
		}
		updated++
	}
	return updated, nil
}

// renamePlan is what the rename dialog shows.
type renamePlan struct {
	SQL      string
	OldName  string
	NewName  string
	Snippets []snippetRename
}

// buildRenamePlan checks the rename is possible and writes its statement. The
// snippets are filled in by the caller (they live in the app database).
func buildRenamePlan(db *sql.DB, technology, schema, table, column, newName string) (renamePlan, error) {
	if !validNewName.MatchString(newName) {
		return renamePlan{}, fmt.Errorf("%q is not a valid name: use letters, digits and underscores, starting with a letter or underscore", newName)
	}
	vSchema, vTable, err := verifiedSchemaTable(technology, db, schema, table)
	if err != nil {
		return renamePlan{}, err
	}
	if vTable == "" {
		return renamePlan{}, fmt.Errorf("table %s does not exist", table)
	}
	plan := renamePlan{NewName: newName}
	if column == "" {
		plan.OldName = vTable
		if strings.EqualFold(vTable, newName) {
			return renamePlan{}, fmt.Errorf("the new name is the same as the old one")
		}
		if !probeMissing(db, quotedSchemaTableRef(technology, vSchema, newName)) {
			return renamePlan{}, fmt.Errorf("a table or view called %s already exists", newName)
		}
	} else {
		cols, err := editDataColumns(technology, db, vSchema, vTable)
		if err != nil {
			return renamePlan{}, err
		}
		found := ""
		for _, c := range cols {
			if strings.EqualFold(rawIdent(technology, c.Name), rawIdent(technology, column)) {
				found = c.Name
			}
			if strings.EqualFold(rawIdent(technology, c.Name), newName) {
				return renamePlan{}, fmt.Errorf("the table already has a column called %s", newName)
			}
		}
		if found == "" {
			return renamePlan{}, fmt.Errorf("column %s does not exist", column)
		}
		plan.OldName = rawIdent(technology, found)
		column = found
	}
	stmt, err := renameStatement(technology, vSchema, vTable, column, newName)
	if err != nil {
		return renamePlan{}, err
	}
	plan.SQL = stmt
	return plan, nil
}

// probeMissing reports whether "select from <ref>" fails with a missing-object error.
func probeMissing(db *sql.DB, ref string) bool {
	rows, err := db.Query("select 1 from " + ref + " where 1 = 0")
	if err != nil {
		return missingObjectRe.MatchString(err.Error())
	}
	rows.Close()
	return false
}

// --- HTTP --------------------------------------------------------------------------

type renamePlanRequest struct {
	baseRequest
	PTable   string `json:"p_table"`  // as written in the SQL
	PColumn  string `json:"p_column"` // "" to rename the table
	PNewName string `json:"p_new_name"`
	PText    string `json:"p_text"` // the editor's text, to offer renaming its mentions of a table too
}

func handleRenamePlan(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req renamePlanRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()
		if info.ReadOnly {
			writeDatabaseError(w, readOnlyError().Error())
			return
		}
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		schemaWritten, tableWritten := splitSchemaTable(req.PTable)
		schema := ""
		if technologyHasSchema(info.Technology) {
			schema = catalogName(info.Technology, defaultSchemaFor(info, schemaWritten))
		}
		plan, err := buildRenamePlan(db, info.Technology, schema, catalogName(info.Technology, tableWritten), req.PColumn, req.PNewName)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		out := map[string]any{"sql": plan.SQL, "old_name": plan.OldName, "new_name": plan.NewName, "snippets": []map[string]any{}}
		// Snippets only follow a table's name: a column's name is shared by too many tables to rewrite blindly.
		if req.PColumn == "" {
			appdb, err := openAppDB(upstream)
			if err == nil {
				defer appdb.Close()
				if list, err := snippetRenames(appdb, int64(who.UserID), plan.OldName, plan.NewName); err == nil {
					snippets := make([]map[string]any, len(list))
					for i, s := range list {
						lines := make([]map[string]any, len(s.Lines))
						for k, l := range s.Lines {
							lines[k] = map[string]any{"line": l.Line, "before": l.Before, "after": l.After}
						}
						snippets[i] = map[string]any{"id": s.ID, "title": s.Title, "count": s.Count, "lines": lines}
					}
					out["snippets"] = snippets
				}
			}
		}
		if req.PColumn == "" && req.PText != "" && len(req.PText) <= maxInspectBytes {
			text, count := renameIdentifier(req.PText, plan.OldName, plan.NewName)
			out["editor_text"], out["editor_count"] = text, count
		}
		writeEnvelope(w, out, false, -1)
	}
}

type applySnippetRenameRequest struct {
	POld string  `json:"p_old"`
	PNew string  `json:"p_new"`
	PIDs []int64 `json:"p_ids"`
}

func handleApplySnippetRename(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req applySnippetRenameRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil || !validNewName.MatchString(req.PNew) || strings.TrimSpace(req.POld) == "" {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		n, err := applySnippetRename(db, int64(who.UserID), req.PIDs, req.POld, req.PNew)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, map[string]any{"updated": n}, false, -1)
	}
}
