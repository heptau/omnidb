package main

import (
	"database/sql"
	"fmt"
	"net/url"
	"strings"
)

// editDataColumnRef mirrors the {v_column, v_type} shape the frontend sends
// for both the PK-column list and the full column list in edit-data
// requests.
type editDataColumnRef struct {
	VColumn string `json:"v_column"`
	VType   string `json:"v_type"`
}

// recordsQuery mirrors each engine's QueryTableRecords, formatting its
// pieces directly into the query text, same as Python. columnList and
// tableRef are caller-verified against the connection's own catalog before
// reaching here (see verifyEditDataColumnRefs/editDataTableRef) — filter/
// order-by text is the one piece that stays a trusted, already-typed-by-
// the-authenticated-user SQL fragment (the same trust boundary as the SQL
// console itself), since a filter box has to accept arbitrary WHERE-clause
// expressions by design. Nothing about *data values* goes through this
// function — those are always bound parameters (see buildInsertCommand/
// buildUpdateCommand/buildDeleteCommand), unlike Python's original, which
// built INSERT/UPDATE/DELETE by string-concatenating cell values into the
// SQL text (safe-ish for its "quoted" types via naive ” escaping, but
// completely unescaped for "unquoted"/numeric types — a real SQL injection
// gap in the original that this port deliberately does not reproduce).
func recordsQuery(technology, columnList, tableRef, filter string, count int) string {
	switch technology {
	case "oracle":
		whereLimit := ""
		if count != -1 {
			whereLimit = fmt.Sprintf(" where rownum <= %d", count)
		}
		return fmt.Sprintf("select * from ( select %s from %s t %s ) %s", columnList, tableRef, filter, whereLimit)
	case "mysql", "mariadb":
		limit := ""
		if count != -1 {
			limit = fmt.Sprintf(" limit %d", count)
		}
		return fmt.Sprintf("select * from ( select %s from %s t %s ) t %s", columnList, tableRef, filter, limit)
	default: // postgresql, sqlite
		limit := ""
		if count != -1 {
			limit = fmt.Sprintf(" limit %d", count)
		}
		return fmt.Sprintf("select %s from %s t %s %s", columnList, tableRef, filter, limit)
	}
}

// bindPlaceholder returns the engine-appropriate bind parameter marker for
// a given 1-based position.
func bindPlaceholder(technology string, position int) string {
	switch technology {
	case "postgresql":
		return fmt.Sprintf("$%d", position)
	case "oracle":
		return fmt.Sprintf(":%d", position)
	default: // mysql, mariadb, sqlite
		return "?"
	}
}

// isNullCell mirrors the frontend's "[null]" sentinel convention for a
// deliberately-NULL grid cell (also used on the read side — see
// scanRowWithNullSentinel) — a missing/JSON-null value from the client is
// treated the same way.
func isNullCell(v *string) bool {
	return v == nil || *v == "[null]"
}

// scanRowWithNullSentinel mirrors thread_query_edit_data's row formatting —
// unlike scanRowAsStrings (which folds SQL NULL into ""), this needs to
// distinguish a real NULL from an empty string, since the frontend/save
// path round-trips NULL through the literal text "[null]".
func scanRowWithNullSentinel(rows *sql.Rows, numCols int) ([]string, error) {
	values := make([]any, numCols)
	ptrs := make([]any, numCols)
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	out := make([]string, numCols)
	for i, v := range values {
		if v == nil {
			out[i] = "[null]"
		} else {
			out[i] = formatSQLValue(v)
		}
	}
	return out, nil
}

// editDataTableRef verifies schema/table against the connection's own
// catalog before building the FROM/INTO fragment recordsQuery/
// buildInsertCommand/buildUpdateCommand/buildDeleteCommand splice straight
// into their SQL text — see verifiedSchemaTable's doc comment (schema_table_
// ref.go) for why a bool guard isn't enough here.
func editDataTableRef(db *sql.DB, technology, schema, table string) (string, error) {
	verifiedSchema, verifiedTable, err := verifiedSchemaTable(technology, db, schema, table)
	if err != nil {
		return "", err
	}
	if verifiedTable == "" {
		return "", fmt.Errorf("table %s does not exist anymore. Please refresh the tree view", table)
	}
	return quotedSchemaTableRef(technology, verifiedSchema, verifiedTable), nil
}

func editDataColumnList(columns []editDataColumnRef) string {
	names := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.VColumn
	}
	return strings.Join(names, ",")
}

func normalizeColumnName(name string) string {
	return strings.ToLower(strings.ReplaceAll(name, `"`, ""))
}

// columnNameLookup builds a normalized-name -> catalog's-own-name map out of
// a table's real column list (editDataColumns) — the lookup
// verifyEditDataColumnRefs/verifyEditDataPKValues use to confirm a
// request-supplied column name is real before it's ever spliced into SQL
// text.
func columnNameLookup(cols []editDataColumn) map[string]string {
	m := make(map[string]string, len(cols))
	for _, c := range cols {
		m[normalizeColumnName(c.Name)] = c.Name
	}
	return m
}

// verifyEditDataColumnRefs confirms every requested column name is a real
// column of the table (byNormalized, built by columnNameLookup) and returns
// a copy using the catalog's own name for each — same "return the verified
// value" principle as editDataTableRef/verifiedSchemaTable, needed because
// editDataColumnList/buildInsertCommand/buildUpdateCommand all splice
// column names directly into SQL text with no bind-parameter form available
// for an identifier position.
func verifyEditDataColumnRefs(byNormalized map[string]string, columns []editDataColumnRef) ([]editDataColumnRef, error) {
	out := make([]editDataColumnRef, len(columns))
	for i, c := range columns {
		real, ok := byNormalized[normalizeColumnName(c.VColumn)]
		if !ok {
			return nil, fmt.Errorf("column %s does not exist anymore. Please refresh the tree view", c.VColumn)
		}
		out[i] = editDataColumnRef{VColumn: real, VType: c.VType}
	}
	return out, nil
}

// verifyEditDataPKValues is verifyEditDataColumnRefs' counterpart for
// editDataPKValue, which additionally carries the row's own PK cell value —
// data, not an identifier, so it's passed through unchanged and is always
// bound as a query parameter, never spliced into SQL text.
func verifyEditDataPKValues(byNormalized map[string]string, pk []editDataPKValue) ([]editDataPKValue, error) {
	out := make([]editDataPKValue, len(pk))
	for i, p := range pk {
		real, ok := byNormalized[normalizeColumnName(p.VColumn)]
		if !ok {
			return nil, fmt.Errorf("column %s does not exist anymore. Please refresh the tree view", p.VColumn)
		}
		out[i] = editDataPKValue{VColumn: real, VType: p.VType, VValue: p.VValue}
	}
	return out, nil
}

// fetchEditDataRows mirrors thread_query_edit_data.
func fetchEditDataRows(db *sql.DB, technology, schema, table, filter string, count int, pkList, columns []editDataColumnRef) (rows [][]string, rowPKs [][]map[string]any, queryInfo string, err error) {
	tableRef, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return nil, nil, "", err
	}
	catalogCols, err := editDataColumns(technology, db, schema, table)
	if err != nil {
		return nil, nil, "", err
	}
	byNormalized := columnNameLookup(catalogCols)
	verifiedColumns, err := verifyEditDataColumnRefs(byNormalized, columns)
	if err != nil {
		return nil, nil, "", err
	}
	verifiedPKList, err := verifyEditDataColumnRefs(byNormalized, pkList)
	if err != nil {
		return nil, nil, "", err
	}

	columnList := editDataColumnList(verifiedColumns)
	q := recordsQuery(technology, columnList, tableRef, filter, count)

	r, err := db.Query(q)
	if err != nil {
		return nil, nil, "", err
	}
	defer r.Close()

	cols, err := r.Columns()
	if err != nil {
		return nil, nil, "", err
	}
	colIndex := make(map[string]int, len(cols))
	for i, c := range cols {
		colIndex[normalizeColumnName(c)] = i
	}

	for r.Next() {
		rowValues, err := scanRowWithNullSentinel(r, len(cols))
		if err != nil {
			return nil, nil, "", err
		}

		rowPK := make([]map[string]any, 0, len(verifiedPKList))
		for _, pk := range verifiedPKList {
			idx, ok := colIndex[normalizeColumnName(pk.VColumn)]
			value := ""
			if ok {
				value = rowValues[idx]
			}
			rowPK = append(rowPK, map[string]any{"v_column": pk.VColumn, "v_type": pk.VType, "v_value": value})
		}
		rowPKs = append(rowPKs, rowPK)

		rowData := make([]string, 0, len(cols)+1)
		rowData = append(rowData, "")
		rowData = append(rowData, rowValues...)
		rows = append(rows, rowData)
	}
	return rows, rowPKs, fmt.Sprintf("%d", len(rows)), r.Err()
}

type editDataPKValue struct {
	VColumn string `json:"v_column"`
	VType   string `json:"v_type"`
	VValue  string `json:"v_value"`
}

type editDataRowInfo struct {
	Mode        int               `json:"mode"`
	Index       int               `json:"index"`
	PK          []editDataPKValue `json:"pk"`
	ChangedCols []int             `json:"changed_cols"`
}

type editDataRowResult struct {
	Mode    int    `json:"mode"`
	Index   int    `json:"index"`
	Command string `json:"command"`
	Error   bool   `json:"error"`
	Message string `json:"v_message"`
}

func buildDeleteCommand(technology, tableRef string, pk []editDataPKValue) (string, []any) {
	whereParts := make([]string, len(pk))
	args := make([]any, len(pk))
	for i, p := range pk {
		whereParts[i] = p.VColumn + " = " + bindPlaceholder(technology, i+1)
		args[i] = p.VValue
	}
	return "delete from " + tableRef + " where " + strings.Join(whereParts, " and "), args
}

// buildInsertCommand mirrors the "Inserting new row" branch — dataRow[0] is
// a leading UI placeholder column, real values start at dataRow[1],
// matching Python's `for j in range(1, len(v_data_rows[i]))`.
func buildInsertCommand(technology, tableRef string, columns []editDataColumnRef, dataRow []*string) (string, []any) {
	names := make([]string, len(columns))
	placeholders := make([]string, len(columns))
	args := make([]any, len(columns))
	for i, c := range columns {
		names[i] = c.VColumn
		placeholders[i] = bindPlaceholder(technology, i+1)
		v := dataRow[i+1]
		if isNullCell(v) {
			args[i] = nil
		} else {
			args[i] = *v
		}
	}
	sqlText := "insert into " + tableRef + " ( " + strings.Join(names, ", ") + " ) values ( " + strings.Join(placeholders, ", ") + " )"
	return sqlText, args
}

// buildUpdateCommand mirrors the "Updating existing row" branch —
// changedCols holds 0-based indexes into columns/dataRow[1:], matching
// Python's `v_data_rows[i][v_col_index+1]`.
func buildUpdateCommand(technology, tableRef string, columns []editDataColumnRef, dataRow []*string, changedCols []int, pk []editDataPKValue) (string, []any) {
	setParts := make([]string, 0, len(changedCols))
	args := make([]any, 0, len(changedCols)+len(pk))
	pos := 1
	for _, colIdx := range changedCols {
		setParts = append(setParts, columns[colIdx].VColumn+" = "+bindPlaceholder(technology, pos))
		v := dataRow[colIdx+1]
		if isNullCell(v) {
			args = append(args, nil)
		} else {
			args = append(args, *v)
		}
		pos++
	}
	whereParts := make([]string, 0, len(pk))
	for _, p := range pk {
		whereParts = append(whereParts, p.VColumn+" = "+bindPlaceholder(technology, pos))
		args = append(args, p.VValue)
		pos++
	}
	sqlText := "update " + tableRef + " set " + strings.Join(setParts, ", ") + " where " + strings.Join(whereParts, " and ")
	return sqlText, args
}

// saveEditDataRows mirrors thread_save_edit_data's row loop — executes each
// row's delete/insert/update independently (matching Python's
// per-row try/except, one row's failure doesn't abort the rest) and
// collects a result per row.
func saveEditDataRows(db *sql.DB, technology, schema, table string, dataRows [][]*string, rowsInfo []editDataRowInfo, columns []editDataColumnRef) ([]editDataRowResult, error) {
	tableRef, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return nil, err
	}
	catalogCols, err := editDataColumns(technology, db, schema, table)
	if err != nil {
		return nil, err
	}
	byNormalized := columnNameLookup(catalogCols)
	verifiedColumns, err := verifyEditDataColumnRefs(byNormalized, columns)
	if err != nil {
		return nil, err
	}
	results := make([]editDataRowResult, 0, len(rowsInfo))

	for i, info := range rowsInfo {
		verifiedPK, err := verifyEditDataPKValues(byNormalized, info.PK)
		if err != nil {
			results = append(results, editDataRowResult{Mode: info.Mode, Index: info.Index, Error: true, Message: err.Error()})
			continue
		}

		var sqlText string
		var args []any
		switch info.Mode {
		case -1:
			sqlText, args = buildDeleteCommand(technology, tableRef, verifiedPK)
		case 2:
			sqlText, args = buildInsertCommand(technology, tableRef, verifiedColumns, dataRows[i])
		case 1:
			sqlText, args = buildUpdateCommand(technology, tableRef, verifiedColumns, dataRows[i], info.ChangedCols, verifiedPK)
		default:
			continue
		}

		result := editDataRowResult{Mode: info.Mode, Index: info.Index, Command: sqlText}
		if _, err := db.Exec(sqlText, args...); err != nil {
			result.Error = true
			result.Message = err.Error()
		} else {
			result.Message = "Success."
		}
		results = append(results, result)
	}
	return results, nil
}

// runEditDataFetch delivers thread_query_edit_data's result via Django's
// real long-polling queue, same pattern as runNativeQuery.
func runEditDataFetch(upstream *url.URL, cookie string, q editDataFetchRequestData, contextCode int, info *ConnectionInfo) {
	db, err := openNativeQueryTarget(info)
	if err != nil {
		queueNativeResponse(cookie, map[string]any{
			"v_code":         responseQueryEditDataResult,
			"v_context_code": contextCode,
			"v_error":        true,
			"v_data":         err.Error(),
		})
		return
	}
	defer db.Close()

	schema := ""
	if technologyHasSchema(info.Technology) {
		schema = q.VSchema
	}

	rows, rowPKs, queryInfo, err := fetchEditDataRows(db, info.Technology, schema, q.VTable, q.VFilter, q.VCount, q.VPKList, q.VColumns)
	if err != nil {
		queueNativeResponse(cookie, map[string]any{
			"v_code":         responseQueryEditDataResult,
			"v_context_code": contextCode,
			"v_error":        true,
			"v_data":         err.Error(),
		})
		return
	}

	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseQueryEditDataResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data": map[string]any{
			"v_data":       rows,
			"v_row_pk":     rowPKs,
			"v_query_info": queryInfo,
		},
	})
}

// runEditDataSave delivers thread_save_edit_data's result via Django's real
// long-polling queue, same pattern as runNativeQuery.
func runEditDataSave(upstream *url.URL, cookie string, q editDataSaveRequestData, contextCode int, info *ConnectionInfo) {
	db, err := openNativeQueryTarget(info)
	if err != nil {
		queueNativeResponse(cookie, map[string]any{
			"v_code":         responseSaveEditDataResult,
			"v_context_code": contextCode,
			"v_error":        true,
			"v_data":         err.Error(),
		})
		return
	}
	defer db.Close()

	schema := ""
	if technologyHasSchema(info.Technology) {
		schema = q.VSchema
	}

	results, err := saveEditDataRows(db, info.Technology, schema, q.VTable, q.VDataRows, q.VRowsInfo, q.VColumns)
	if err != nil {
		queueNativeResponse(cookie, map[string]any{
			"v_code":         responseSaveEditDataResult,
			"v_context_code": contextCode,
			"v_error":        true,
			"v_data":         err.Error(),
		})
		return
	}

	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseSaveEditDataResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data":         results,
	})
}
