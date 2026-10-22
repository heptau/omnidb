package main

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// Comparing two databases: which tables and columns differ (schema diff) and
// which rows of a table differ (data compare), each with a script that makes
// the target match the source. The scripts are for the user to read and run;
// nothing here changes the target.

// --- schema ----------------------------------------------------------------------------

type tableModel struct {
	Name    string // catalog form
	Columns []editDataColumn
}

// schemaModel is the tables of one schema and their columns, keyed by lower-cased plain name.
type schemaModel struct {
	Technology string
	Schema     string // plain
	Tables     map[string]tableModel
}

func tableKey(technology, name string) string { return strings.ToLower(rawIdent(technology, name)) }

// readSchemaModel reads the tables of a schema (catalog form of the schema name).
func readSchemaModel(db *sql.DB, technology, schema string) (*schemaModel, error) {
	names, err := graphTableNames(technology, db, schema)
	if err != nil {
		return nil, err
	}
	m := &schemaModel{Technology: technology, Schema: rawIdent(technology, schema), Tables: map[string]tableModel{}}
	for _, n := range names {
		cols, err := editDataColumns(technology, db, schema, n)
		if err != nil {
			return nil, err
		}
		m.Tables[tableKey(technology, n)] = tableModel{Name: n, Columns: cols}
	}
	return m, nil
}

type columnDiff struct {
	Table  string // plain name
	Column string // plain name
	Source string // the column's type in the source ("" for a column only the target has)
	Target string // ... in the target ("" for a column only the source has)
}

type schemaDiff struct {
	MissingTables  []string // in the source, not in the target
	ExtraTables    []string // in the target, not in the source
	AddedColumns   []columnDiff
	RemovedColumns []columnDiff
	TypeChanges    []columnDiff
}

func (d schemaDiff) empty() bool {
	return len(d.MissingTables)+len(d.ExtraTables)+len(d.AddedColumns)+len(d.RemovedColumns)+len(d.TypeChanges) == 0
}

func normalizeType(t string) string { return strings.Join(strings.Fields(strings.ToLower(t)), " ") }

// diffSchemas compares two models name by name (ignoring case).
func diffSchemas(src, dst *schemaModel) schemaDiff {
	var d schemaDiff
	keys := func(m *schemaModel) []string {
		out := make([]string, 0, len(m.Tables))
		for k := range m.Tables {
			out = append(out, k)
		}
		sort.Strings(out)
		return out
	}
	for _, k := range keys(src) {
		st := src.Tables[k]
		dt, ok := dst.Tables[k]
		plain := rawIdent(src.Technology, st.Name)
		if !ok {
			d.MissingTables = append(d.MissingTables, plain)
			continue
		}
		dstCols := map[string]editDataColumn{}
		for _, c := range dt.Columns {
			dstCols[strings.ToLower(rawIdent(dst.Technology, c.Name))] = c
		}
		seen := map[string]bool{}
		for _, c := range st.Columns {
			ck := strings.ToLower(rawIdent(src.Technology, c.Name))
			seen[ck] = true
			dc, ok := dstCols[ck]
			switch {
			case !ok:
				d.AddedColumns = append(d.AddedColumns, columnDiff{Table: plain, Column: rawIdent(src.Technology, c.Name), Source: c.DataType})
			case normalizeType(dc.DataType) != normalizeType(c.DataType):
				d.TypeChanges = append(d.TypeChanges, columnDiff{Table: plain, Column: rawIdent(src.Technology, c.Name), Source: c.DataType, Target: dc.DataType})
			}
		}
		for _, c := range dt.Columns {
			if !seen[strings.ToLower(rawIdent(dst.Technology, c.Name))] {
				d.RemovedColumns = append(d.RemovedColumns, columnDiff{Table: plain, Column: rawIdent(dst.Technology, c.Name), Target: c.DataType})
			}
		}
	}
	for _, k := range keys(dst) {
		if _, ok := src.Tables[k]; !ok {
			d.ExtraTables = append(d.ExtraTables, rawIdent(dst.Technology, dst.Tables[k].Name))
		}
	}
	return d
}

// columnClause is how a column is added or retyped on the target's engine.
func addColumnStatement(technology, ref, column, dataType string) string {
	col := newIdentifier(technology, column)
	switch {
	case isOracle(technology):
		return "ALTER TABLE " + ref + " ADD (" + col + " " + dataType + ");"
	case isMSSQL(technology), isFirebird(technology):
		return "ALTER TABLE " + ref + " ADD " + col + " " + dataType + ";"
	}
	return "ALTER TABLE " + ref + " ADD COLUMN " + col + " " + dataType + ";"
}

func changeTypeStatement(technology, ref, column, dataType string) string {
	col := newIdentifier(technology, column)
	switch {
	case technology == "postgresql":
		return "ALTER TABLE " + ref + " ALTER COLUMN " + col + " TYPE " + dataType + ";"
	case isMySQLFamily(technology):
		return "ALTER TABLE " + ref + " MODIFY COLUMN " + col + " " + dataType + ";"
	case isOracle(technology):
		return "ALTER TABLE " + ref + " MODIFY (" + col + " " + dataType + ");"
	case isMSSQL(technology):
		return "ALTER TABLE " + ref + " ALTER COLUMN " + col + " " + dataType + ";"
	case isFirebird(technology):
		return "ALTER TABLE " + ref + " ALTER COLUMN " + col + " TYPE " + dataType + ";"
	}
	return "" // SQLite cannot change a column's type
}

// schemaSyncScript writes the statements that make the target schema have the
// source's tables and columns. Destructive ones (dropping a table or column the
// source lacks) are written as comments.
func schemaSyncScript(srcDB *sql.DB, src, dst *schemaModel, d schemaDiff) string {
	var b strings.Builder
	b.WriteString("-- Schema sync: make the " + dst.Technology + " target" + schemaSuffix(dst.Schema) + " like the source" + schemaSuffix(src.Schema) + ".\n")
	b.WriteString("-- Compared: tables, columns and their types. Not compared: nullability, defaults, indexes, constraints, views, routines.\n")
	ref := func(table string) string { return quotedSchemaTableRef(dst.Technology, dst.Schema, table) }

	for _, table := range d.MissingTables {
		st := src.Tables[strings.ToLower(table)]
		b.WriteString("\n-- Missing table " + table + "\n")
		if src.Technology == dst.Technology {
			if ddl, err := tableDDL(src.Technology, srcDB, schemaOfModel(src), st.Name); err == nil && strings.TrimSpace(ddl) != "" {
				ddl = strings.TrimSpace(ddl)
				if !strings.HasSuffix(ddl, ";") {
					ddl += ";"
				}
				if src.Schema != dst.Schema && src.Schema != "" {
					b.WriteString("-- NOTE: this DDL names the source schema " + src.Schema + "; adjust it for " + dst.Schema + ".\n")
				}
				b.WriteString(ddl + "\n")
				continue
			}
		}
		b.WriteString("-- The source is on another engine; columns and type names are copied as they are and may need adjusting.\n")
		cols := make([]string, len(st.Columns))
		for i, c := range st.Columns {
			cols[i] = "    " + newIdentifier(dst.Technology, rawIdent(src.Technology, c.Name)) + " " + c.DataType
		}
		b.WriteString("CREATE TABLE " + ref(table) + " (\n" + strings.Join(cols, ",\n") + "\n);\n")
	}
	for _, c := range d.AddedColumns {
		b.WriteString("\n" + addColumnStatement(dst.Technology, ref(c.Table), c.Column, c.Source) + "\n")
	}
	for _, c := range d.TypeChanges {
		stmt := changeTypeStatement(dst.Technology, ref(c.Table), c.Column, c.Source)
		if stmt == "" {
			b.WriteString("\n-- " + dst.Technology + " cannot change the type of " + c.Table + "." + c.Column + " (" + c.Target + " -> " + c.Source + ") in place.\n")
			continue
		}
		b.WriteString("\n-- " + c.Table + "." + c.Column + ": " + c.Target + " -> " + c.Source + " (check data and constraints first)\n" + stmt + "\n")
	}
	if len(d.RemovedColumns)+len(d.ExtraTables) > 0 {
		b.WriteString("\n-- Only in the target (dropping them loses data, so they are commented out):\n")
		for _, c := range d.RemovedColumns {
			b.WriteString("-- ALTER TABLE " + ref(c.Table) + " DROP COLUMN " + newIdentifier(dst.Technology, c.Column) + ";\n")
		}
		for _, t := range d.ExtraTables {
			b.WriteString("-- DROP TABLE " + ref(t) + ";\n")
		}
	}
	if d.empty() {
		b.WriteString("\n-- The schemas match.\n")
	}
	return b.String()
}

// schemaOfModel returns the schema in catalog form for helpers that take one
// (PostgreSQL wants its quote_ident form).
func schemaOfModel(m *schemaModel) string {
	if m.Technology == "postgresql" {
		return sqlExportIdent(m.Schema, m.Technology)
	}
	return m.Schema
}

// --- data ----------------------------------------------------------------------------------

// maxCompareRows bounds how many rows of one table are held in memory per side.
const maxCompareRows = 200000

type dataDiff struct {
	Inserts, Updates, Deletes int
	Script                    string
	KeyColumns                []string
	Samples                   []string
}

type sideRows struct {
	cols []string         // plain, lower-cased column names, in query order
	rows map[string][]any // key -> values in cols order
	keys []string         // keys in read order, to keep the script deterministic
}

func canonical(v any) string {
	if v == nil {
		return "\x00NULL"
	}
	return formatSQLValue(v)
}

// readSide reads the named columns of a table, indexed by the primary key.
func readSide(db *sql.DB, technology, ref string, catalogNames, keyNames []string) (*sideRows, error) {
	quoted := make([]string, len(catalogNames))
	for i, n := range catalogNames {
		quoted[i] = quoteEditDataColumn(technology, n)
	}
	rows, err := db.Query("select " + strings.Join(quoted, ", ") + " from " + ref)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := &sideRows{rows: map[string][]any{}}
	for _, n := range catalogNames {
		out.cols = append(out.cols, strings.ToLower(rawIdent(technology, n)))
	}
	keyIdx := make([]int, len(keyNames))
	for i, k := range keyNames {
		for j, c := range out.cols {
			if c == strings.ToLower(k) {
				keyIdx[i] = j
			}
		}
	}
	for rows.Next() {
		if len(out.rows) >= maxCompareRows {
			return nil, fmt.Errorf("the table has more than %d rows, too many to compare here", maxCompareRows)
		}
		vals, err := scanRowNative(rows, len(catalogNames))
		if err != nil {
			return nil, err
		}
		parts := make([]string, len(keyIdx))
		for i, j := range keyIdx {
			parts[i] = canonical(vals[j])
		}
		key := strings.Join(parts, "\x1f")
		if _, dup := out.rows[key]; !dup {
			out.keys = append(out.keys, key)
		}
		out.rows[key] = vals
	}
	return out, rows.Err()
}

// compareTableData compares table `table` of the source with the same-named (or
// given) table of the target by primary key and writes the statements that make
// the target's rows equal the source's, over the columns both tables have.
func compareTableData(srcDB *sql.DB, srcTech, srcSchema, srcTable string, dstDB *sql.DB, dstTech, dstSchema, dstTable string, includeDeletes bool) (dataDiff, error) {
	srcRef, err := editDataTableRef(srcDB, srcTech, srcSchema, srcTable)
	if err != nil {
		return dataDiff{}, fmt.Errorf("source: %w", err)
	}
	dstRef, err := editDataTableRef(dstDB, dstTech, dstSchema, dstTable)
	if err != nil {
		return dataDiff{}, fmt.Errorf("target: %w", err)
	}
	srcCols, err := editDataColumns(srcTech, srcDB, srcSchema, srcTable)
	if err != nil {
		return dataDiff{}, err
	}
	dstCols, err := editDataColumns(dstTech, dstDB, dstSchema, dstTable)
	if err != nil {
		return dataDiff{}, err
	}
	dstByName := map[string]string{}
	for _, c := range dstCols {
		dstByName[strings.ToLower(rawIdent(dstTech, c.Name))] = c.Name
	}
	var common, srcNames, dstNames []string
	for _, c := range srcCols {
		low := strings.ToLower(rawIdent(srcTech, c.Name))
		if dn, ok := dstByName[low]; ok {
			common = append(common, low)
			srcNames = append(srcNames, c.Name)
			dstNames = append(dstNames, dn)
		}
	}
	if len(common) == 0 {
		return dataDiff{}, fmt.Errorf("the tables have no column in common")
	}
	pk, err := editDataPrimaryKeyColumns(srcTech, srcDB, srcSchema, srcTable)
	if err != nil {
		return dataDiff{}, err
	}
	if len(pk) == 0 {
		return dataDiff{}, fmt.Errorf("the source table has no primary key, so its rows cannot be matched")
	}
	var keys []string
	commonSet := map[string]bool{}
	for _, c := range common {
		commonSet[c] = true
	}
	for _, p := range pk {
		low := strings.ToLower(rawIdent(srcTech, p))
		if !commonSet[low] {
			return dataDiff{}, fmt.Errorf("the primary key column %s is missing from the target table", low)
		}
		keys = append(keys, low)
	}

	src, err := readSide(srcDB, srcTech, srcRef, srcNames, keys)
	if err != nil {
		return dataDiff{}, fmt.Errorf("source: %w", err)
	}
	dst, err := readSide(dstDB, dstTech, dstRef, dstNames, keys)
	if err != nil {
		return dataDiff{}, fmt.Errorf("target: %w", err)
	}

	isKey := map[string]bool{}
	for _, k := range keys {
		isKey[k] = true
	}
	colSQL := make([]string, len(common))
	for i, c := range common {
		colSQL[i] = newIdentifier(dstTech, c)
	}
	where := func(vals []any) string {
		var conds []string
		for i, c := range common {
			if isKey[c] {
				conds = append(conds, colSQL[i]+" = "+sqlExportLiteral(vals[i], dstTech))
			}
		}
		return strings.Join(conds, " AND ")
	}
	label := func(vals []any) string {
		var parts []string
		for i, c := range common {
			if isKey[c] {
				parts = append(parts, c+"="+canonical(vals[i]))
			}
		}
		return strings.Join(parts, ", ")
	}

	var diff dataDiff
	diff.KeyColumns = keys
	var script strings.Builder
	script.WriteString("-- Data sync of " + dstRef + ": make the target rows equal the source's (" + strings.Join(common, ", ") + ").\n")
	sample := func(s string) {
		if len(diff.Samples) < 60 {
			diff.Samples = append(diff.Samples, s)
		}
	}

	srcKeys := append([]string(nil), src.keys...)
	sort.Strings(srcKeys)
	for _, k := range srcKeys {
		sv := src.rows[k]
		dv, found := dst.rows[k]
		if !found {
			diff.Inserts++
			lits := make([]string, len(sv))
			for i, v := range sv {
				lits[i] = sqlExportLiteral(v, dstTech)
			}
			script.WriteString("INSERT INTO " + dstRef + " (" + strings.Join(colSQL, ", ") + ") VALUES (" + strings.Join(lits, ", ") + ");\n")
			sample("+ " + label(sv))
			continue
		}
		var sets, changed []string
		for i, c := range common {
			if !isKey[c] && canonical(sv[i]) != canonical(dv[i]) {
				sets = append(sets, colSQL[i]+" = "+sqlExportLiteral(sv[i], dstTech))
				changed = append(changed, c)
			}
		}
		if len(sets) > 0 {
			diff.Updates++
			script.WriteString("UPDATE " + dstRef + " SET " + strings.Join(sets, ", ") + " WHERE " + where(sv) + ";\n")
			sample("~ " + label(sv) + " (" + strings.Join(changed, ", ") + ")")
		}
	}
	dstKeys := append([]string(nil), dst.keys...)
	sort.Strings(dstKeys)
	for _, k := range dstKeys {
		if _, found := src.rows[k]; found {
			continue
		}
		diff.Deletes++
		sample("- " + label(dst.rows[k]))
		stmt := "DELETE FROM " + dstRef + " WHERE " + where(dst.rows[k]) + ";"
		if includeDeletes {
			script.WriteString(stmt + "\n")
		} else {
			script.WriteString("-- " + stmt + "\n")
		}
	}
	if diff.Inserts+diff.Updates+diff.Deletes == 0 {
		script.WriteString("-- The tables match.\n")
	} else if diff.Deletes > 0 && !includeDeletes {
		script.WriteString("-- The DELETE statements above are commented out; uncomment them to remove rows the source does not have.\n")
	}
	diff.Script = script.String()
	return diff, nil
}

// schemaSuffix renders " (schema x)" for a comment, or nothing for engines/defaults without a schema name.
func schemaSuffix(schema string) string {
	if schema == "" {
		return ""
	}
	return " (schema " + schema + ")"
}
