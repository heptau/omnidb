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

// Generated SQL for a table, offered by the tree's "Generate" menu: a SELECT
// that joins the tables its foreign keys point at, and a CRUD script written
// with :named parameters (which the query editor asks values for).

// rawIdent undoes the catalog form of an identifier (PostgreSQL's quote_ident
// output, Oracle's display wrapping), giving the plain name.
func rawIdent(technology, name string) string {
	switch {
	case technology == "postgresql" && len(name) >= 2 && name[0] == '"' && name[len(name)-1] == '"':
		return strings.ReplaceAll(name[1:len(name)-1], `""`, `"`)
	case technology == "oracle":
		return unwrapOracleDisplayIdent(name)
	}
	return name
}

var nonParamChars = regexp.MustCompile(`[^a-z0-9_]+`)

// paramNames turns column names into distinct :parameter names.
func paramNames(technology string, columns []string) []string {
	out := make([]string, len(columns))
	used := map[string]bool{}
	for i, c := range columns {
		base := strings.Trim(nonParamChars.ReplaceAllString(strings.ToLower(rawIdent(technology, c)), "_"), "_")
		if base == "" || (base[0] >= '0' && base[0] <= '9') {
			base = "p_" + base
		}
		name := base
		for n := 2; used[name]; n++ {
			name = fmt.Sprintf("%s_%d", base, n)
		}
		used[name] = true
		out[i] = name
	}
	return out
}

func quotedColumns(technology string, columns []editDataColumn) []string {
	out := make([]string, len(columns))
	for i, c := range columns {
		out[i] = quoteEditDataColumn(technology, c.Name)
	}
	return out
}

// generateSelectWithJoins builds a SELECT of the table's columns plus those of
// every table its foreign keys reference, each joined with LEFT JOIN so rows
// whose key is NULL are kept. A joined column whose name is already taken is
// aliased <table>_<column>.
func generateSelectWithJoins(db *sql.DB, technology, schema, table string) (string, error) {
	baseRef, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return "", err
	}
	baseCols, err := editDataColumns(technology, db, schema, table)
	if err != nil {
		return "", err
	}
	fks, err := editDataForeignKeys(technology, db, schema, table)
	if err != nil {
		return "", err
	}

	used := map[string]bool{}
	selectList := []string{}
	for _, c := range baseCols {
		used[strings.ToLower(rawIdent(technology, c.Name))] = true
		selectList = append(selectList, "t."+quoteEditDataColumn(technology, c.Name))
	}
	joins := []string{}
	for i, fk := range fks {
		alias := fmt.Sprintf("r%d", i+1)
		ref, err := editDataTableRef(db, technology, fk.RSchema, fk.RTable)
		if err != nil {
			return "", err
		}
		refCols, err := editDataColumns(technology, db, fk.RSchema, fk.RTable)
		if err != nil {
			return "", err
		}
		for _, c := range refCols {
			col := alias + "." + quoteEditDataColumn(technology, c.Name)
			raw := rawIdent(technology, c.Name)
			if used[strings.ToLower(raw)] {
				name := rawIdent(technology, fk.RTable) + "_" + raw
				for n := 2; used[strings.ToLower(name)]; n++ {
					name = fmt.Sprintf("%s_%s_%d", rawIdent(technology, fk.RTable), raw, n)
				}
				used[strings.ToLower(name)] = true
				col += " AS " + sqlExportIdent(name, technology)
			} else {
				used[strings.ToLower(raw)] = true
			}
			selectList = append(selectList, col)
		}
		conds := make([]string, len(fk.Columns))
		for k := range fk.Columns {
			conds[k] = "t." + quoteEditDataColumn(technology, fk.Columns[k]) + " = " + alias + "." + fk.RColumnSQL[k]
		}
		joins = append(joins, "LEFT JOIN "+ref+" "+alias+" ON "+strings.Join(conds, " AND "))
	}

	var b strings.Builder
	if len(fks) == 0 {
		b.WriteString("-- This table has no foreign keys, so there is nothing to join.\n")
	}
	b.WriteString("SELECT " + strings.Join(selectList, ",\n       ") + "\n")
	b.WriteString("FROM " + baseRef + " t\n")
	for _, j := range joins {
		b.WriteString(j + "\n")
	}
	return b.String(), nil
}

// generateCRUD builds INSERT / SELECT / UPDATE / DELETE statements for one
// row of the table, with :named parameters. Rows are addressed by the primary
// key; without one the WHERE clause is left for the user to fill in.
func generateCRUD(db *sql.DB, technology, schema, table string) (string, error) {
	ref, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return "", err
	}
	cols, err := editDataColumns(technology, db, schema, table)
	if err != nil {
		return "", err
	}
	pk, err := editDataPrimaryKeyColumns(technology, db, schema, table)
	if err != nil {
		return "", err
	}
	if len(cols) == 0 {
		return "", fmt.Errorf("table %s has no columns", table)
	}

	names := make([]string, len(cols))
	for i, c := range cols {
		names[i] = c.Name
	}
	params := paramNames(technology, names)
	quoted := quotedColumns(technology, cols)
	isPK := map[string]bool{}
	for _, p := range pk {
		isPK[p] = true
	}

	var where string
	if len(pk) == 0 {
		where = "WHERE /* no primary key: describe the row here */ 1 = 0"
	} else {
		conds := []string{}
		for i, c := range cols {
			if isPK[c.Name] {
				conds = append(conds, quoted[i]+" = :"+params[i])
			}
		}
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	var sets []string
	for i, c := range cols {
		if !isPK[c.Name] {
			sets = append(sets, quoted[i]+" = :"+params[i])
		}
	}
	if len(sets) == 0 { // every column is part of the key
		for i := range cols {
			sets = append(sets, quoted[i]+" = :"+params[i])
		}
	}
	values := make([]string, len(params))
	for i, p := range params {
		values[i] = ":" + p
	}

	var b strings.Builder
	b.WriteString("-- Create\n")
	b.WriteString("INSERT INTO " + ref + " (" + strings.Join(quoted, ", ") + ")\nVALUES (" + strings.Join(values, ", ") + ");\n\n")
	b.WriteString("-- Read\n")
	b.WriteString("SELECT " + strings.Join(quoted, ", ") + "\nFROM " + ref + "\n" + where + ";\n\n")
	b.WriteString("-- Update\n")
	b.WriteString("UPDATE " + ref + "\nSET " + strings.Join(sets, ",\n    ") + "\n" + where + ";\n\n")
	b.WriteString("-- Delete\n")
	b.WriteString("DELETE FROM " + ref + "\n" + where + ";\n")
	return b.String(), nil
}

type generateSQLRequest struct {
	baseRequest
	PSchema string `json:"p_schema"`
	PTable  string `json:"p_table"`
	PKind   string `json:"p_kind"`
}

func handleGenerateSQL(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req generateSQLRequest
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
		var text string
		switch req.PKind {
		case "select_joins":
			text, err = generateSelectWithJoins(db, info.Technology, schema, req.PTable)
		case "crud":
			text, err = generateCRUD(db, info.Technology, schema, req.PTable)
		default:
			writeBadRequest(w)
			return
		}
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, text, false, -1)
	}
}
