package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// This file builds the DDL-tab text get_properties_firebird returns for each
// supported object type.
//
// Like SQL Server (see mssql_ddl.go's package comment), Firebird has no
// single built-in "give me the CREATE TABLE text" function, so
// firebirdTableDDL below manually reconstructs one from rdb$relation_fields/
// rdb$fields (column list, types, nullability, defaults) plus
// rdb$relation_constraints/rdb$ref_constraints (inline PRIMARY KEY/FOREIGN
// KEY) — the existing firebirdPrimaryKeys/firebirdForeignKeys/
// firebirdForeignKeyColumns helpers already query those, so this reuses them
// rather than duplicating the joins. Scoped no deeper than mssqlTableDDL's
// own stated limits: no computed/generated columns, no CHECK constraints,
// no triggers.
//
// Unlike view/function/procedure DDL on MSSQL/Oracle (OBJECT_DEFINITION/
// DBMS_METADATA.GET_DDL both hand back the *complete* original CREATE text),
// Firebird's rdb$view_source/rdb$function_source/rdb$procedure_source only
// ever store the object's body (the SELECT statement, or the BEGIN...END
// block) — see firebird_routines.go's firebirdFunctionDefinition/
// firebirdProcedureDefinition/firebirdViewDefinition comments for why. So
// firebirdViewDDL/firebirdFunctionDDL/firebirdProcedureDDL below don't just
// thinly wrap those the way mssqlViewDDL/mssqlFunctionDDL/mssqlProcedureDDL
// wrap mssql_routines.go's OBJECT_DEFINITION calls — they reconstruct a real
// CREATE header (name, parameter list, RETURNS clause / column list) from
// catalog metadata and append the stored body beneath it, the same
// "reconstruct what the engine doesn't hand back whole" spirit as
// firebirdTableDDL, just for a different reason (missing signature instead
// of missing statement entirely).
func firebirdViewDDL(db *sql.DB, view string) (string, error) {
	columns, err := firebirdViewColumns(db, view)
	if err != nil {
		return "", err
	}
	source, err := firebirdViewDefinition(db, view)
	if err != nil {
		return "", err
	}
	names := make([]string, len(columns))
	for i, c := range columns {
		names[i] = quoteFirebirdIdent(c.Name)
	}
	header := fmt.Sprintf("CREATE VIEW %s (%s)\nAS\n", quoteFirebirdIdent(view), strings.Join(names, ", "))
	return header + source, nil
}

func firebirdFunctionDDL(db *sql.DB, function string) (string, error) {
	fields, err := firebirdFunctionFields(db, function)
	if err != nil {
		return "", err
	}
	returnType, err := firebirdFunctionReturnType(db, function)
	if err != nil {
		return "", err
	}
	source, err := firebirdFunctionDefinition(db, function)
	if err != nil {
		return "", err
	}
	params := make([]string, len(fields))
	for i, f := range fields {
		params[i] = quoteFirebirdIdent(f.Name) + " " + f.Type
	}
	header := fmt.Sprintf("CREATE OR ALTER FUNCTION %s (%s)\nRETURNS %s\n", quoteFirebirdIdent(function), strings.Join(params, ", "), returnType)
	return header + source, nil
}

func firebirdProcedureDDL(db *sql.DB, procedure string) (string, error) {
	source, err := firebirdProcedureDefinition(db, procedure)
	if err != nil {
		return "", err
	}
	// The CREATE PROCEDURE header needs parameters split into two separate
	// parenthesized lists (input, then RETURNS output) rather than one
	// combined one, so this queries which of the two groups each parameter
	// belongs to directly, rather than reusing firebirdProcedureFields (which
	// mirrors mssqlRoutineField's direction-less depth — see that function's
	// own comment) and threading an extra direction flag through it just for
	// this one caller.
	inputs, outputs, err := firebirdProcedureParameterDirections(db, procedure)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE OR ALTER PROCEDURE %s (%s)\n", quoteFirebirdIdent(procedure), strings.Join(inputs, ", ")))
	if len(outputs) > 0 {
		sb.WriteString(fmt.Sprintf("RETURNS (%s)\n", strings.Join(outputs, ", ")))
	}
	sb.WriteString(source)
	return sb.String(), nil
}

// firebirdProcedureParameterDirections splits a procedure's parameters into
// their CREATE PROCEDURE (...) input list and RETURNS (...) output list —
// see firebirdProcedureDDL's own comment on why this is a separate query
// rather than a field on firebirdRoutineField.
func firebirdProcedureParameterDirections(db *sql.DB, procedure string) (inputs, outputs []string, err error) {
	rows, err := db.Query(`
		select pp.rdb$parameter_type, trim(pp.rdb$parameter_name) as name, f.rdb$field_type, coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0), coalesce(f.rdb$field_precision, 0), coalesce(f.rdb$field_scale, 0)
		from rdb$procedure_parameters pp
		join rdb$fields f on f.rdb$field_name = pp.rdb$field_source
		where trim(pp.rdb$procedure_name) = ?
		order by pp.rdb$parameter_type, pp.rdb$parameter_number
	`, procedure)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var direction int
		var name string
		var fieldType, subType int
		var length, precision, scale int64
		if err := rows.Scan(&direction, &name, &fieldType, &subType, &length, &precision, &scale); err != nil {
			return nil, nil, err
		}
		typeDDL := firebirdColumnTypeDDL(firebirdColumn{DataType: firebirdSQLTypeName(fieldType, subType), Length: length, Precision: precision, Scale: scale})
		entry := quoteFirebirdIdent(name) + " " + typeDDL
		if direction == 1 {
			outputs = append(outputs, entry)
		} else {
			inputs = append(inputs, entry)
		}
	}
	return inputs, outputs, rows.Err()
}

// firebirdFunctionReturnType reads a PSQL function's RETURNS type — the
// rdb$function_arguments row at rdb$argument_position = 0, the same
// return-value convention firebirdFunctionFields' own comment describes
// (and filters out of the ordinary parameter list).
func firebirdFunctionReturnType(db *sql.DB, function string) (string, error) {
	var fieldType, subType int
	var length, precision, scale int64
	err := db.QueryRow(`
		select f.rdb$field_type, coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0), coalesce(f.rdb$field_precision, 0), coalesce(f.rdb$field_scale, 0)
		from rdb$function_arguments fa
		join rdb$fields f on f.rdb$field_name = fa.rdb$field_source
		where trim(fa.rdb$function_name) = ? and fa.rdb$argument_position = 0
	`, function).Scan(&fieldType, &subType, &length, &precision, &scale)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return firebirdColumnTypeDDL(firebirdColumn{DataType: firebirdSQLTypeName(fieldType, subType), Length: length, Precision: precision, Scale: scale}), nil
}

// firebirdTableDDL reconstructs a CREATE TABLE statement for table. See this
// file's package comment for exactly what it does and doesn't cover.
func firebirdTableDDL(db *sql.DB, table string) (string, error) {
	columns, err := firebirdColumns(db, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", fmt.Errorf("table %s not found or has no columns", table)
	}

	lines := make([]string, 0, len(columns)+2)
	for _, c := range columns {
		line := "\t" + quoteFirebirdIdent(c.Name) + " " + firebirdColumnTypeDDL(c)
		if c.Nullable != "YES" {
			line += " NOT NULL"
		}
		if c.DefaultValue.Valid {
			// rdb$default_source already reads as a full "DEFAULT <expr>"
			// string — see firebirdColumns' own comment — so this appends
			// it verbatim rather than re-prepending "DEFAULT " the way
			// mssqlTableDDL has to for sys.default_constraints' bare
			// expression text.
			line += " " + strings.TrimSpace(c.DefaultValue.String)
		}
		lines = append(lines, line)
	}

	pkName, pkCols, err := firebirdFirstPrimaryKey(db, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		quoted := make([]string, len(pkCols))
		for i, c := range pkCols {
			quoted[i] = quoteFirebirdIdent(c)
		}
		lines = append(lines, fmt.Sprintf("\tCONSTRAINT %s PRIMARY KEY (%s)", quoteFirebirdIdent(pkName), strings.Join(quoted, ", ")))
	}

	fks, err := firebirdForeignKeys(db, table)
	if err != nil {
		return "", err
	}
	for _, fk := range fks {
		cols, err := firebirdForeignKeyColumns(db, table, fk.ConstraintName)
		if err != nil {
			return "", err
		}
		if len(cols) == 0 {
			continue
		}
		colNames := make([]string, len(cols))
		rColNames := make([]string, len(cols))
		for i, c := range cols {
			colNames[i] = quoteFirebirdIdent(c.ColumnName)
			rColNames[i] = quoteFirebirdIdent(c.RColumnName)
		}
		line := fmt.Sprintf("\tCONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)",
			quoteFirebirdIdent(fk.ConstraintName), strings.Join(colNames, ", "),
			quoteFirebirdIdent(fk.RTableName), strings.Join(rColNames, ", "))
		if action := firebirdFKActionKeyword(fk.DeleteRule); action != "" {
			line += " ON DELETE " + action
		}
		if action := firebirdFKActionKeyword(fk.UpdateRule); action != "" {
			line += " ON UPDATE " + action
		}
		lines = append(lines, line)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE TABLE %s (\n", quoteFirebirdIdent(table)))
	sb.WriteString(strings.Join(lines, ",\n"))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// firebirdFKActionKeyword translates rdb$delete_rule/rdb$update_rule
// (RESTRICT/CASCADE/SET NULL/SET DEFAULT/NO ACTION — already full SQL
// keywords, unlike mssql's underscored NO_ACTION/SET_NULL text) into the
// clause ON DELETE/ON UPDATE take. RESTRICT is Firebird's own default
// behavior (the same role NO_ACTION plays for MSSQL), so it's omitted from
// the DDL entirely, mirroring mssqlFKActionKeyword's own NO_ACTION handling.
func firebirdFKActionKeyword(rule string) string {
	if rule == "" || rule == "RESTRICT" {
		return ""
	}
	return rule
}

// firebirdColumnTypeDDL formats one column's data type with the
// length/precision/scale it needs, if any. Length is already the *character*
// length for CHAR/VARCHAR (firebirdColumns/firebirdViewColumns both select
// rdb$character_length in preference to rdb$field_length — the latter is a
// byte length, which only matches the character count for a single-byte
// character set), so unlike mssqlColumnTypeDDL's nvarchar/nchar special
// case, there's no unit conversion needed here. rdb$field_scale is stored as
// zero or negative (see firebirdColumn's own comment), hence the negation
// below to get an actual decimal place count.
func firebirdColumnTypeDDL(c firebirdColumn) string {
	switch c.DataType {
	case "VARCHAR", "CHAR":
		return fmt.Sprintf("%s(%d)", c.DataType, c.Length)
	case "NUMERIC", "DECIMAL":
		return fmt.Sprintf("%s(%d,%d)", c.DataType, c.Precision, -c.Scale)
	default:
		return c.DataType
	}
}

// firebirdIndexDDL generates a CREATE INDEX statement for one index. Scoped
// the same as this file's other DDL generators: a plain column list, no
// COMPUTED BY/expression indexes.
func firebirdIndexDDL(db *sql.DB, table, index string) (string, error) {
	indexes, err := firebirdIndexes(db, table)
	if err != nil {
		return "", err
	}
	var uniqueness string
	found := false
	for _, idx := range indexes {
		if idx.Name == index {
			uniqueness = idx.Uniqueness
			found = true
			break
		}
	}
	if !found {
		return "", fmt.Errorf("index %s not found on table %s", index, table)
	}

	cols, err := firebirdIndexColumns(db, table, index)
	if err != nil {
		return "", err
	}
	quoted := make([]string, len(cols))
	for i, c := range cols {
		quoted[i] = quoteFirebirdIdent(c)
	}

	unique := ""
	if uniqueness == "UNIQUE" {
		unique = "UNIQUE "
	}
	return fmt.Sprintf("CREATE %sINDEX %s ON %s (%s)",
		unique, quoteFirebirdIdent(index), quoteFirebirdIdent(table), strings.Join(quoted, ", ")), nil
}
