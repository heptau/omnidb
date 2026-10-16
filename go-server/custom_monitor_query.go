package main

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// This file replaces custom monitoring units' former Python-script
// execution (RestrictedPython sandbox, dropped in the Go migration — see
// monitoring_handlers.go's customMonitorScriptUnsupportedMessage) with a
// single user-authored SQL query per unit, run against the same connection
// the user already has full query-editor access to. There is no new
// security boundary being crossed — a monitoring unit can only do what the
// user could already type into the SQL editor by hand — but a monitor query
// re-runs unattended on a timer, so isReadOnlyQuery guards against an
// accidentally pasted destructive statement firing repeatedly.
//
// Query shape convention, by unit type (see saveCustomMonitorUnit's Type
// column and go-backend-migration memory's design discussion):
//   - grid: no convention, whatever columns/rows the query returns become
//     the grid directly.
//   - chart: one row per category, first column is the label, remaining
//     column(s) are one series each (series name = column name) — matches
//     go-server/static_assets/OmniDB_app/js/monitoring.js's replace-mode
//     rendering (diffs datasets/labels by name, see its "chart" branch).
//     Alternatively long format — exactly three columns (label, series,
//     value) — pivoted into one dataset per series, see
//     buildCustomMonitorChart.
//   - timeseries: exactly one row, one or more numeric columns, each column
//     becomes one continuously-appended line series — same shape every
//     built-in unit in monitoring_units.go already produces via dataResult.
//
// "graph" (Cytoscape network graphs) is deliberately not supported for
// custom units: no built-in unit ever used it, so there is no reference
// shape to design a SQL convention against.
const (
	customMonitorGridRowLimit = 500
	customMonitorQueryTimeout = 10 * time.Second
)

// isReadOnlyQuery mirrors a minimal "is this a SELECT" check — strips
// leading whitespace and SQL comments, then requires the query to start
// with SELECT or WITH (a CTE that itself must end in a SELECT to be valid
// SQL at all). Not a full parser — a user determined to run something
// destructive from inside an otherwise-valid SELECT (e.g. a volatile
// function call) still can, same as they already can from the SQL editor;
// this only blocks the common accidental paste of a bare DELETE/UPDATE/DROP
// into a unit that then re-fires unattended every refresh interval.
func isReadOnlyQuery(sqlText string) bool {
	s := sqlText
	for {
		s = strings.TrimLeft(s, " \t\r\n")
		switch {
		case strings.HasPrefix(s, "--"):
			idx := strings.IndexByte(s, '\n')
			if idx < 0 {
				return false
			}
			s = s[idx+1:]
			continue
		case strings.HasPrefix(s, "/*"):
			idx := strings.Index(s, "*/")
			if idx < 0 {
				return false
			}
			s = s[idx+2:]
			continue
		}
		break
	}
	upper := strings.ToUpper(s)
	return strings.HasPrefix(upper, "SELECT") || strings.HasPrefix(upper, "WITH")
}

// runCustomMonitorQuery executes sqlText and shapes the result into the
// v_object shape handleRefreshMonitorUnits/handleTestMonitorScript return,
// matching the exact conventions monitoring.js already knows how to render
// for built-in units (see monitoring_units.go's lineChart/dataResult).
func runCustomMonitorQuery(db *sql.DB, unitType, chartType, sqlText string, previous map[string]any) (map[string]any, error) {
	if !isReadOnlyQuery(sqlText) {
		return nil, fmt.Errorf("only SELECT (or WITH ... SELECT) queries are allowed in monitoring units")
	}

	ctx, cancel := context.WithTimeout(context.Background(), customMonitorQueryTimeout)
	defer cancel()

	rows, err := db.QueryContext(ctx, sqlText)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	switch unitType {
	case "grid":
		return buildCustomMonitorGrid(rows, cols)
	case "chart":
		return buildCustomMonitorChart(rows, cols, chartType, previous)
	case "timeseries":
		return buildCustomMonitorTimeseries(rows, cols, previous)
	default:
		return nil, fmt.Errorf("unknown monitoring unit type: %q", unitType)
	}
}

// buildCustomMonitorGrid mirrors the query editor's own generic row
// scanning (scanRowAsStrings/formatSQLValue, querycursor.go) — a monitoring
// grid displays everything as text, same as the query result grid does.
func buildCustomMonitorGrid(rows *sql.Rows, cols []string) (map[string]any, error) {
	data := make([][]string, 0)
	for rows.Next() {
		if len(data) >= customMonitorGridRowLimit {
			break
		}
		row, err := scanRowAsStrings(rows, len(cols))
		if err != nil {
			return nil, err
		}
		data = append(data, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{"columns": cols, "data": data}, nil
}

// scanCustomMonitorRow scans one row preserving native numeric/bool/nil
// types (via jsonSafeValue, export.go) rather than stringifying everything
// — chart/timeseries values need to be real JSON numbers for Chart.js.
func scanCustomMonitorRow(rows *sql.Rows, numCols int) ([]any, error) {
	values := make([]any, numCols)
	ptrs := make([]any, numCols)
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	out := make([]any, numCols)
	for i, v := range values {
		out[i] = jsonSafeValue(v)
	}
	return out, nil
}

// buildCustomMonitorTimeseries expects exactly one row; each column becomes
// one continuously-appended line series (dataset), matching every built-in
// unit's dataResult shape exactly (single-element labels/data arrays — the
// frontend's "Append data" branch takes labels[0]/data[0] each poll).
func buildCustomMonitorTimeseries(rows *sql.Rows, cols []string, previous map[string]any) (map[string]any, error) {
	if !rows.Next() {
		return nil, fmt.Errorf("timeseries query returned no rows (expected exactly one)")
	}
	values, err := scanCustomMonitorRow(rows, len(cols))
	if err != nil {
		return nil, err
	}
	if rows.Next() {
		return nil, fmt.Errorf("timeseries query returned more than one row (expected exactly one — each column becomes one series)")
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	labels := []any{nowLabel()}
	datasets := make([]any, len(cols))
	for i, name := range cols {
		datasets[i] = map[string]any{
			"label":           name,
			"backgroundColor": chartColorAt(i, 0.4),
			"borderColor":     chartColorAt(i, 1),
			"tension":         0,
			"pointRadius":     0,
			"borderWidth":     1,
			"data":            []any{values[i]},
		}
	}

	if previous == nil {
		chart := lineChart(false, "", "", nil, false)
		chart["data"] = map[string]any{"labels": labels, "datasets": datasets}
		return chart, nil
	}
	return map[string]any{"labels": labels, "datasets": datasets}, nil
}

// buildCustomMonitorChart accepts two row shapes:
//   - wide: one row per category, the first column is the label, remaining
//     column(s) are one series each across all rows — matches
//     monitoring.js's "chart" replace-mode branch, which reads
//     v_object.labels/v_object.datasets directly (flat, not nested under
//     v_object.data) on every call after the first.
//   - long: exactly three columns (label, series, value), one row per
//     label+series pair, pivoted here into one dataset per distinct series.
//     Lets a query produce a dynamic set of series (e.g. one per table)
//     that plain SQL can't express as columns. See isLongFormatChart.
func buildCustomMonitorChart(rows *sql.Rows, cols []string, chartType string, previous map[string]any) (map[string]any, error) {
	if len(cols) < 2 {
		return nil, fmt.Errorf("chart query must return at least 2 columns: a label column followed by one or more value columns")
	}

	allRows := make([][]any, 0)
	for rows.Next() {
		if len(allRows) >= customMonitorGridRowLimit {
			break
		}
		values, err := scanCustomMonitorRow(rows, len(cols))
		if err != nil {
			return nil, err
		}
		allRows = append(allRows, values)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	effectiveType := chartType
	if effectiveType == "" {
		effectiveType = "bar"
	}

	var labels []any
	var datasets []any
	longFormat := isLongFormatChart(cols, allRows)
	if longFormat {
		labels, datasets = pivotLongFormatChart(allRows, effectiveType)
	} else {
		labels, datasets = wideFormatChart(cols, allRows)
	}

	if previous == nil {
		return map[string]any{
			"type": effectiveType,
			"data": map[string]any{"labels": labels, "datasets": datasets},
			"options": map[string]any{
				"responsive": true,
				"plugins": map[string]any{
					// Long format's series are discovered from the data, so the
					// legend is the only place their names show up.
					"legend": map[string]any{"display": longFormat},
					"title":  mkTitle(false, ""),
				},
			},
		}, nil
	}
	return map[string]any{"labels": labels, "datasets": datasets}, nil
}

func wideFormatChart(cols []string, allRows [][]any) ([]any, []any) {
	seriesNames := cols[1:]
	labels := make([]any, len(allRows))
	seriesData := make([][]any, len(seriesNames))
	for i := range seriesData {
		seriesData[i] = make([]any, len(allRows))
	}
	for r, values := range allRows {
		labels[r] = values[0]
		for i := range seriesNames {
			seriesData[i][r] = values[i+1]
		}
	}
	datasets := make([]any, len(seriesNames))
	for i, name := range seriesNames {
		datasets[i] = map[string]any{
			"label":           name,
			"backgroundColor": chartSliceColors(len(labels), i),
			"data":            seriesData[i],
		}
	}
	return labels, datasets
}

// isLongFormatChart reports whether a chart result is in long format:
// exactly three columns whose middle column holds text that isn't a number
// in every row. A wide-format query's value columns are numeric (some
// drivers, e.g. pgx's NUMERIC, deliver numbers as strings, hence the parse
// check), so a non-numeric middle column can't be a plottable series.
func isLongFormatChart(cols []string, allRows [][]any) bool {
	if len(cols) != 3 || len(allRows) == 0 {
		return false
	}
	for _, values := range allRows {
		s, ok := values[1].(string)
		if !ok {
			return false
		}
		if _, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return false
		}
	}
	return true
}

// pivotLongFormatChart turns (label, series, value) rows into one dataset
// per distinct series, both labels and series kept in first-seen order so
// the query's ORDER BY decides the layout. A series has null for every
// label it has no row for; skipNull stops bar charts from reserving an
// empty slot for those. Each series gets one color (so e.g. all partitions
// of one table share it), except pie/doughnut, where every slice needs its
// own color to be told apart.
func pivotLongFormatChart(allRows [][]any, chartType string) ([]any, []any) {
	labels := make([]any, 0)
	labelIndex := map[string]int{}
	seriesNames := make([]string, 0)
	seriesIndex := map[string]int{}
	for _, values := range allRows {
		lk := fmt.Sprint(values[0])
		if _, ok := labelIndex[lk]; !ok {
			labelIndex[lk] = len(labels)
			labels = append(labels, values[0])
		}
		sk := values[1].(string)
		if _, ok := seriesIndex[sk]; !ok {
			seriesIndex[sk] = len(seriesNames)
			seriesNames = append(seriesNames, sk)
		}
	}

	seriesData := make([][]any, len(seriesNames))
	for i := range seriesData {
		seriesData[i] = make([]any, len(labels))
	}
	for _, values := range allRows {
		seriesData[seriesIndex[values[1].(string)]][labelIndex[fmt.Sprint(values[0])]] = values[2]
	}

	perSlice := chartType == "pie" || chartType == "doughnut"
	datasets := make([]any, len(seriesNames))
	for i, name := range seriesNames {
		ds := map[string]any{
			"label":    name,
			"data":     seriesData[i],
			"skipNull": true,
		}
		if perSlice {
			ds["backgroundColor"] = chartSliceColors(len(labels), i)
		} else {
			ds["backgroundColor"] = chartColorAt(i, 0.6)
			ds["borderColor"] = chartColorAt(i, 1)
		}
		datasets[i] = ds
	}
	return labels, datasets
}

// chartPalette is a small, fixed set of colors cycled for custom-unit
// series/slices — deterministic (unlike the original Python templates'
// random.randint colors) so a unit's coloring doesn't shuffle every refresh.
var chartPalette = [][3]int{
	{129, 223, 129}, // green
	{129, 178, 223}, // blue
	{223, 129, 129}, // red
	{223, 199, 129}, // orange
	{178, 129, 223}, // purple
	{129, 223, 213}, // teal
}

func chartColorAt(i int, alpha float64) string {
	c := chartPalette[i%len(chartPalette)]
	return fmt.Sprintf("rgba(%d,%d,%d,%v)", c[0], c[1], c[2], alpha)
}

// chartSliceColors returns n colors (one per row/slice) for dataset index
// seriesIndex, offsetting the palette per series so multiple series don't
// look identical.
func chartSliceColors(n, seriesIndex int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = chartColorAt(i+seriesIndex*3, 0.6)
	}
	return out
}
