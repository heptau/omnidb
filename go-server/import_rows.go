package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// Import of rows parsed in the browser (CSV / JSON files) into an existing
// table: one transaction, every row inserted through bind parameters, the
// column names checked against the catalog before they reach SQL text.

// maxImportRows bounds one import; the request body is capped separately by
// maxRequestBodyBytes.
const maxImportRows = 200000

// importRows inserts rows (one []*string per row, nil meaning NULL, in the
// order of columns) into schema.table inside a single transaction, so a bad
// row leaves the table untouched. It returns how many rows were inserted; on
// failure the error names the 1-based row that failed.
func importRows(db *sql.DB, technology, schema, table string, columns []string, rows [][]*string) (int, error) {
	if len(columns) == 0 {
		return 0, fmt.Errorf("no columns to import into")
	}
	if len(rows) > maxImportRows {
		return 0, fmt.Errorf("too many rows: at most %d can be imported at once", maxImportRows)
	}
	tableRef, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return 0, err
	}
	catalogCols, err := editDataColumns(technology, db, schema, table)
	if err != nil {
		return 0, err
	}
	refs := make([]editDataColumnRef, len(columns))
	for i, c := range columns {
		refs[i] = editDataColumnRef{VColumn: c}
	}
	verified, err := verifyEditDataColumnRefs(technology, columnNameLookup(catalogCols), refs)
	if err != nil {
		return 0, err
	}
	seen := map[string]bool{}
	names := make([]string, len(verified))
	placeholders := make([]string, len(verified))
	for i, c := range verified {
		if seen[c.sqlName] {
			return 0, fmt.Errorf("column %s is mapped more than once", c.VColumn)
		}
		seen[c.sqlName] = true
		names[i] = c.sqlName
		placeholders[i] = bindPlaceholder(technology, i+1)
	}
	insertSQL := "insert into " + tableRef + " ( " + strings.Join(names, ", ") + " ) values ( " + strings.Join(placeholders, ", ") + " )"

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()
	for n, row := range rows {
		if len(row) != len(columns) {
			tx.Rollback()
			return 0, fmt.Errorf("row %d has %d values, expected %d", n+1, len(row), len(columns))
		}
		args := make([]any, len(row))
		for i, v := range row {
			if v != nil {
				args[i] = *v
			}
		}
		if _, err := stmt.Exec(args...); err != nil {
			tx.Rollback()
			return 0, fmt.Errorf("row %d: %w", n+1, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(rows), nil
}

type importRowsRequest struct {
	baseRequest
	PSchema  string      `json:"p_schema"`
	PTable   string      `json:"p_table"`
	PColumns []string    `json:"p_columns"`
	PRows    [][]*string `json:"p_rows"`
}

func handleImportRows(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req importRowsRequest
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
		schema := ""
		if technologyHasSchema(info.Technology) {
			schema = req.PSchema
		}
		n, err := importRows(db, info.Technology, schema, req.PTable, req.PColumns, req.PRows)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_inserted": n}, false, -1)
	}
}
