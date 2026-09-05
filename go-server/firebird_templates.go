package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// firebirdFirstPrimaryKey fetches the name and columns of a table's first
// primary key constraint, mirroring mssqlFirstPrimaryKey/
// oracleFirstPrimaryKeyColumns' "just take pks[0]" convention — Firebird,
// like every other engine here, allows only one PRIMARY KEY per table
// anyway.
func firebirdFirstPrimaryKey(db *sql.DB, table string) (name string, columns []string, err error) {
	pks, err := firebirdPrimaryKeys(db, table)
	if err != nil || len(pks) == 0 {
		return "", nil, err
	}
	cols, err := firebirdPrimaryKeyColumns(db, table, pks[0])
	if err != nil {
		return "", nil, err
	}
	return pks[0], cols, nil
}

// firebirdPKColumnSet returns the set of column names covered by a table's
// first primary key — used by TemplateInsert/TemplateUpdate to flag PK
// columns differently from ordinary ones, same as mssqlPKColumnSet/
// oraclePKColumnSet.
func firebirdPKColumnSet(db *sql.DB, table string) (map[string]bool, error) {
	_, cols, err := firebirdFirstPrimaryKey(db, table)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c] = true
	}
	return set, nil
}

// firebirdTemplateSelect mirrors mssqlTemplateSelect's shape, minus the
// schema prefix — Firebird has no schema concept (see firebird.go's package
// comment). indentUnit is the user's configured indent_char/indent_size
// Settings (see indentUnitFromCharSize) used for every continuation line.
func firebirdTemplateSelect(db *sql.DB, table, indentUnit string) (string, error) {
	columns, err := firebirdColumns(db, table)
	if err != nil {
		return "", err
	}
	names := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
	}

	var sb strings.Builder
	sb.WriteString("SELECT t.")
	sb.WriteString(strings.Join(names, ",\n"+indentUnit+"t."))
	sb.WriteString(fmt.Sprintf("\nFROM %s AS t", table))

	_, pkCols, err := firebirdFirstPrimaryKey(db, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		sb.WriteString("\nORDER BY t.")
		sb.WriteString(strings.Join(pkCols, ",\n"+indentUnit+"t."))
	}
	return sb.String(), nil
}

// firebirdTemplateInsert mirrors mssqlTemplateInsert. indentUnit is the
// user's configured indent_char/indent_size Settings.
func firebirdTemplateInsert(db *sql.DB, table, indentUnit string) (string, error) {
	columns, err := firebirdColumns(db, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := firebirdPKColumnSet(db, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "?"
		comments[i] = firebirdColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s (\n", table))
	sb.WriteString(indentUnit + strings.Join(names, ",\n"+indentUnit))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString(indentUnit + formatTemplateColumnList(values, comments, indentUnit))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// firebirdTemplateUpdate mirrors mssqlTemplateUpdate. indentUnit is the
// user's configured indent_char/indent_size Settings.
func firebirdTemplateUpdate(db *sql.DB, table, indentUnit string) (string, error) {
	columns, err := firebirdColumns(db, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := firebirdPKColumnSet(db, table)
	if err != nil {
		return "", err
	}

	cores := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		cores[i] = c.Name + " = ?"
		comments[i] = firebirdTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}
	return fmt.Sprintf("UPDATE %s\nSET %s\nWHERE condition", table, formatTemplateColumnList(cores, comments, indentUnit)), nil
}

func firebirdColumnComment(name, dataType string, isPK bool, nullable string) string {
	return name + " " + firebirdTypeComment(dataType, isPK, nullable)
}

func firebirdTypeComment(dataType string, isPK bool, nullable string) string {
	switch {
	case isPK:
		return dataType + " PRIMARY KEY"
	case nullable == "YES":
		return dataType + " NULLABLE"
	default:
		return dataType
	}
}

// DDL wizard templates shown in the tree's "create/alter/drop" context menu
// actions — Firebird PSQL/DDL equivalents of mssql_templates.go's
// mssqlTemplate* constants, using the same "#placeholder#" token convention
// tree_firebird.js does .replace() calls against (grep tree_firebird.js for
// "#table_name#"/etc. to see each call site). There is no "#schema_name#"
// token here at all — every mssqlTemplate* constant that carries one is
// simply missing it below, since Firebird has no schema to substitute into
// (see firebird.go's package comment).
//
// alter_index/drop_index deliberately don't offer mssqlTemplateAlterIndex's
// REBUILD/REORGANIZE/DISABLE options — Firebird's ALTER INDEX only ever
// toggles ACTIVE/INACTIVE (rebuilding an index's statistics is a separate
// SET STATISTICS INDEX statement, not an ALTER INDEX option), so the
// template reflects what Firebird actually supports rather than mirroring
// MSSQL's options verbatim.
const (
	firebirdTemplateCreateFunction = "CREATE OR ALTER FUNCTION name (\n\t--param datatype = default_value\n)\nRETURNS return_type\nAS\nBEGIN\n\t-- definition\n\tRETURN value;\nEND\n"
	firebirdTemplateDropFunction   = "DROP FUNCTION #function_name#"

	firebirdTemplateCreateProcedure = "CREATE OR ALTER PROCEDURE name (\n\t--param datatype = default_value\n)\n--RETURNS (\n--\tcolumn_name datatype\n--)\nAS\nBEGIN\n\t-- definition\nEND\n"
	firebirdTemplateDropProcedure   = "DROP PROCEDURE #function_name#"

	firebirdTemplateCreateView = "CREATE VIEW name (\n\t--column_name, ...\n)\nAS\nSELECT ...\n"
	firebirdTemplateDropView   = "DROP VIEW #view_name#"

	firebirdTemplateCreateTable = "CREATE TABLE table_name (\n\tcolumn_name data_type\n\t--DEFAULT expr\n\t--NOT NULL\n\t--GENERATED BY DEFAULT AS IDENTITY\n\t--CONSTRAINT constraint_name PRIMARY KEY\n\t--CONSTRAINT constraint_name UNIQUE\n\t--CONSTRAINT constraint_name REFERENCES reftable ( refcolumn ) [ON DELETE {CASCADE | SET NULL | SET DEFAULT | NO ACTION}] [ON UPDATE {CASCADE | SET NULL | SET DEFAULT | NO ACTION}]\n\t--CONSTRAINT constraint_name CHECK ( condition )\n)\n"
	firebirdTemplateAlterTable  = "ALTER TABLE #table_name#\n--ADD column_name data_type\n--ALTER COLUMN column_name TYPE data_type\n--ALTER COLUMN column_name TO new_name\n--ADD CONSTRAINT constraint_name PRIMARY KEY ( column_name [, ...] )\n--ADD CONSTRAINT constraint_name UNIQUE ( column_name [, ...] )\n--ADD CONSTRAINT constraint_name FOREIGN KEY ( column_name [, ...] ) REFERENCES reftable ( refcolumn [, ...] )\n--ADD CONSTRAINT constraint_name CHECK ( condition )\n--DROP CONSTRAINT constraint_name\n--DROP column_name\n"
	firebirdTemplateDropTable   = "DROP TABLE #table_name#"

	firebirdTemplateCreateColumn = "ALTER TABLE #table_name#\nADD name data_type\n--DEFAULT expr\n--NOT NULL\n"
	firebirdTemplateAlterColumn  = "ALTER TABLE #table_name#\nALTER COLUMN #column_name# TYPE data_type\n--ALTER COLUMN #column_name# TO new_name\n"
	firebirdTemplateDropColumn   = "ALTER TABLE #table_name#\nDROP #column_name#"

	firebirdTemplateCreatePrimaryKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nPRIMARY KEY ( column_name [, ...] )\n"
	firebirdTemplateDropPrimaryKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	firebirdTemplateCreateUnique = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nUNIQUE ( column_name [, ...] )\n"
	firebirdTemplateDropUnique   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	firebirdTemplateCreateForeignKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nFOREIGN KEY ( column_name [, ...] )\nREFERENCES reftable ( refcolumn [, ...] )\n--ON DELETE {CASCADE | SET NULL | SET DEFAULT | NO ACTION}\n--ON UPDATE {CASCADE | SET NULL | SET DEFAULT | NO ACTION}\n"
	firebirdTemplateDropForeignKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	firebirdTemplateCreateIndex = "CREATE [ UNIQUE ] [ ASC | DESC ] INDEX name\nON #table_name# ( column_name [, ...] )\n"
	firebirdTemplateAlterIndex  = "ALTER INDEX #index_name#\n--ACTIVE\n--INACTIVE\n"
	firebirdTemplateDropIndex   = "DROP INDEX #index_name#"

	firebirdTemplateDelete = "DELETE FROM #table_name#\nWHERE condition\n"
)
