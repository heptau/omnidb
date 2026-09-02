package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// This file builds the DDL-tab text get_properties_mssql returns for each
// supported object type.
//
// Unlike Oracle (DBMS_METADATA.GET_DDL) or Postgres/MySQL (which this port's
// other engines reconstruct from full catalog detail), SQL Server has no
// built-in "give me the CREATE TABLE text" function, so mssqlTableDDL below
// manually reconstructs one from sys.columns/sys.types/sys.default_constraints
// (column list, types, nullability, defaults) plus sys.key_constraints
// (inline PRIMARY KEY) and sys.foreign_keys (inline FOREIGN KEY) — the
// existing mssqlPrimaryKeys/mssqlPrimaryKeyColumns/mssqlForeignKeys/
// mssqlForeignKeyColumns helpers already query those, so this reuses them
// rather than duplicating the joins.
//
// This is deliberately scoped no deeper than that, mirroring how
// postgresql_ddl2.go documents its own type-reconstruction limits: no
// computed columns, temporal tables (SYSTEM_VERSIONING), partitioning,
// row/page compression, or extended properties/comments. A foreign key's
// referenced table is assumed to live in the same schema as the table being
// scripted — the only schema this port's tree ever has in hand for either
// side of a constraint (see mssqlForeignKey's own comment on RTableName).
//
// View/function/procedure DDL need none of this — OBJECT_DEFINITION already
// returns their verbatim CREATE text (mssql_routines.go), so
// mssqlViewDDL/mssqlFunctionDDL/mssqlProcedureDDL below are thin wrappers
// kept only so handleGetPropertiesMSSQL's dispatch reads uniformly across
// every object type.

func mssqlViewDDL(db *sql.DB, schema, view string) (string, error) {
	return mssqlViewDefinition(db, schema, view)
}

func mssqlFunctionDDL(db *sql.DB, schema, function string) (string, error) {
	return mssqlFunctionDefinition(db, schema, function)
}

func mssqlProcedureDDL(db *sql.DB, schema, procedure string) (string, error) {
	return mssqlProcedureDefinition(db, schema, procedure)
}

// mssqlTableDDL reconstructs a CREATE TABLE statement for schema.table. See
// this file's package comment for exactly what it does and doesn't cover.
func mssqlTableDDL(db *sql.DB, schema, table string) (string, error) {
	columns, err := mssqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", fmt.Errorf("table %s.%s not found or has no columns", schema, table)
	}

	lines := make([]string, 0, len(columns)+2)
	for _, c := range columns {
		line := "\t" + quoteMSSQLIdent(c.Name) + " " + mssqlColumnTypeDDL(c)
		if c.Nullable == "YES" {
			line += " NULL"
		} else {
			line += " NOT NULL"
		}
		if c.DefaultValue.Valid {
			line += " DEFAULT " + c.DefaultValue.String
		}
		lines = append(lines, line)
	}

	pkName, pkCols, err := mssqlFirstPrimaryKey(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		quoted := make([]string, len(pkCols))
		for i, c := range pkCols {
			quoted[i] = quoteMSSQLIdent(c)
		}
		lines = append(lines, fmt.Sprintf("\tCONSTRAINT %s PRIMARY KEY (%s)", quoteMSSQLIdent(pkName), strings.Join(quoted, ", ")))
	}

	fks, err := mssqlForeignKeys(db, schema, table)
	if err != nil {
		return "", err
	}
	for _, fk := range fks {
		cols, err := mssqlForeignKeyColumns(db, schema, table, fk.ConstraintName)
		if err != nil {
			return "", err
		}
		if len(cols) == 0 {
			continue
		}
		colNames := make([]string, len(cols))
		rColNames := make([]string, len(cols))
		for i, c := range cols {
			colNames[i] = quoteMSSQLIdent(c.ColumnName)
			rColNames[i] = quoteMSSQLIdent(c.RColumnName)
		}
		line := fmt.Sprintf("\tCONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s.%s (%s)",
			quoteMSSQLIdent(fk.ConstraintName), strings.Join(colNames, ", "),
			quoteMSSQLIdent(schema), quoteMSSQLIdent(fk.RTableName), strings.Join(rColNames, ", "))
		if action := mssqlFKActionKeyword(fk.DeleteRule); action != "" {
			line += " ON DELETE " + action
		}
		if action := mssqlFKActionKeyword(fk.UpdateRule); action != "" {
			line += " ON UPDATE " + action
		}
		lines = append(lines, line)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE TABLE %s.%s (\n", quoteMSSQLIdent(schema), quoteMSSQLIdent(table)))
	sb.WriteString(strings.Join(lines, ",\n"))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// mssqlFKActionKeyword translates delete_referential_action_desc/
// update_referential_action_desc (NO_ACTION/CASCADE/SET_NULL/SET_DEFAULT —
// see mssqlForeignKeys' own comment) into the T-SQL keywords ON DELETE/
// ON UPDATE take. NO_ACTION is SQL Server's default behavior, so it's
// omitted from the DDL entirely rather than spelled out as "NO ACTION".
func mssqlFKActionKeyword(rule string) string {
	if rule == "" || rule == "NO_ACTION" {
		return ""
	}
	return strings.ReplaceAll(rule, "_", " ")
}

// mssqlColumnTypeDDL formats one column's data type with the length/
// precision/scale it needs, if any. sys.columns.max_length for the
// national (Unicode) character types is a *byte* length — twice the
// character count — while every other length/binary type's max_length is
// already the character/byte count the DDL wants, hence nvarchar/nchar
// dividing by 2 and varchar/char/varbinary/binary not. -1 is SQL Server's
// sentinel for MAX (e.g. varchar(max)/nvarchar(max)).
func mssqlColumnTypeDDL(c mssqlColumn) string {
	switch strings.ToLower(c.DataType) {
	case "varchar", "char", "varbinary", "binary":
		if c.MaxLength == -1 {
			return c.DataType + "(MAX)"
		}
		return fmt.Sprintf("%s(%d)", c.DataType, c.MaxLength)
	case "nvarchar", "nchar":
		if c.MaxLength == -1 {
			return c.DataType + "(MAX)"
		}
		return fmt.Sprintf("%s(%d)", c.DataType, c.MaxLength/2)
	case "decimal", "numeric":
		return fmt.Sprintf("%s(%d,%d)", c.DataType, c.Precision, c.Scale)
	case "datetime2", "datetimeoffset", "time":
		return fmt.Sprintf("%s(%d)", c.DataType, c.Scale)
	default:
		return c.DataType
	}
}

// mssqlIndexDDL generates a CREATE INDEX statement for one index. Scoped the
// same as this file's other DDL generators: a plain column list, no
// INCLUDE/filtered/compressed/filegroup clauses.
func mssqlIndexDDL(db *sql.DB, schema, table, index string) (string, error) {
	indexes, err := mssqlIndexes(db, schema, table)
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
		return "", fmt.Errorf("index %s not found on table %s.%s", index, schema, table)
	}

	cols, err := mssqlIndexColumns(db, schema, table, index)
	if err != nil {
		return "", err
	}
	quoted := make([]string, len(cols))
	for i, c := range cols {
		quoted[i] = quoteMSSQLIdent(c)
	}

	unique := ""
	if uniqueness == "UNIQUE" {
		unique = "UNIQUE "
	}
	return fmt.Sprintf("CREATE %sINDEX %s ON %s.%s (%s)",
		unique, quoteMSSQLIdent(index), quoteMSSQLIdent(schema), quoteMSSQLIdent(table), strings.Join(quoted, ", ")), nil
}
