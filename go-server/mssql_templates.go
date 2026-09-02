package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// mssqlFirstPrimaryKey fetches the name and columns of a table's first
// primary key constraint, mirroring oracleFirstPrimaryKeyColumns/
// postgresqlTemplateSelect's "just take pks[0]" convention. SQL Server, like
// the other engines here, allows only one PRIMARY KEY per table anyway, so
// there's never more than one to pick from in practice — mssqlPrimaryKeys
// only returns more than one row for a table that's somehow in a corrupt
// state.
func mssqlFirstPrimaryKey(db *sql.DB, schema, table string) (name string, columns []string, err error) {
	pks, err := mssqlPrimaryKeys(db, schema, table)
	if err != nil || len(pks) == 0 {
		return "", nil, err
	}
	cols, err := mssqlPrimaryKeyColumns(db, schema, table, pks[0])
	if err != nil {
		return "", nil, err
	}
	return pks[0], cols, nil
}

// mssqlPKColumnSet returns the set of column names covered by a table's
// first primary key — used by TemplateInsert/TemplateUpdate to flag PK
// columns differently from ordinary ones, same as oraclePKColumnSet/
// postgresqlPKColumnSet.
func mssqlPKColumnSet(db *sql.DB, schema, table string) (map[string]bool, error) {
	_, cols, err := mssqlFirstPrimaryKey(db, schema, table)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c] = true
	}
	return set, nil
}

// mssqlTemplateSelect mirrors oracleTemplateSelect/postgresqlTemplateSelect's
// shape. indentUnit is the user's configured indent_char/indent_size
// Settings (see indentUnitFromCharSize) used for every continuation line.
//
// Unlike Oracle (ORA-00933: AS is rejected before a table alias),
// SQL Server accepts "AS" before a table alias fine, so this follows the
// Postgres/MySQL style of "FROM schema.table AS t" rather than Oracle's bare
// "FROM schema.table t".
func mssqlTemplateSelect(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mssqlColumns(db, schema, table)
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
	sb.WriteString(fmt.Sprintf("\nFROM %s.%s AS t", schema, table))

	_, pkCols, err := mssqlFirstPrimaryKey(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		sb.WriteString("\nORDER BY t.")
		sb.WriteString(strings.Join(pkCols, ",\n"+indentUnit+"t."))
	}
	return sb.String(), nil
}

// mssqlTemplateInsert mirrors oracleTemplateInsert/postgresqlTemplateInsert.
// indentUnit is the user's configured indent_char/indent_size Settings.
func mssqlTemplateInsert(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mssqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := mssqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "?"
		comments[i] = mssqlColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s.%s (\n", schema, table))
	sb.WriteString(indentUnit + strings.Join(names, ",\n"+indentUnit))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString(indentUnit + formatTemplateColumnList(values, comments, indentUnit))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// mssqlTemplateUpdate mirrors oracleTemplateUpdate/postgresqlTemplateUpdate.
// indentUnit is the user's configured indent_char/indent_size Settings.
func mssqlTemplateUpdate(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mssqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := mssqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	cores := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		cores[i] = c.Name + " = ?"
		comments[i] = mssqlTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}
	return fmt.Sprintf("UPDATE %s.%s\nSET %s\nWHERE condition", schema, table, formatTemplateColumnList(cores, comments, indentUnit)), nil
}

func mssqlColumnComment(name, dataType string, isPK bool, nullable string) string {
	return name + " " + mssqlTypeComment(dataType, isPK, nullable)
}

func mssqlTypeComment(dataType string, isPK bool, nullable string) string {
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
// actions — T-SQL equivalents of oracle_treeinfo.go's oracleTemplate*
// constants, using the same "#placeholder#" token convention tree_mssql.js
// already does .replace() calls against (grep tree_mssql.js for
// "#schema_name#"/"#table_name#"/etc. to see each call site).
//
// Two token quirks are carried over verbatim from tree_mssql.js's existing
// (unmodified — out of this phase's scope) wiring rather than "fixed" here:
//
//   - drop_procedure's context-menu handler replaces "#function_name#", not
//     "#procedure_name#" — the same token oracleTemplateDropProcedure uses
//     for the same reason (procedures and functions share one DROP-target
//     placeholder name in this tree). mssqlTemplateDropProcedure below uses
//     "#function_name#" to match.
//   - alter_index/drop_index substitute "#index_name#" with
//     "<schema>.<bare index name>" (no table qualifier — see tree_mssql.js's
//     cm_index handlers), but SQL Server's ALTER/DROP INDEX statements are
//     always table-scoped ("... ON table_name"); there is no schema-qualified
//     index object to alter or drop directly. Since the frontend substitution
//     itself is out of scope to change here, these two templates spell out an
//     explicit "ON table_name" line for the user to fill in — same spirit as
//     Oracle's own templates, which are hint scaffolding to finish by hand,
//     not directly executable SQL as generated.
const (
	mssqlTemplateCreateFunction = "CREATE OR ALTER FUNCTION #schema_name#.name\n--(\n--    @param datatype = default_value\n--)\nRETURNS return_type\n--AS\nBEGIN\n\t-- definition\n\tRETURN\nEND\n"
	mssqlTemplateDropFunction   = "DROP FUNCTION #function_name#"

	mssqlTemplateCreateProcedure = "CREATE OR ALTER PROCEDURE #schema_name#.name\n--@param datatype = default_value\nAS\nBEGIN\n\t-- definition\nEND\n"
	mssqlTemplateDropProcedure   = "DROP PROCEDURE #function_name#"

	mssqlTemplateCreateView = "CREATE OR ALTER VIEW #schema_name#.name AS\nSELECT ...\n"
	mssqlTemplateDropView   = "DROP VIEW #view_name#"

	mssqlTemplateCreateTable = "CREATE TABLE #schema_name#.table_name (\n\tcolumn_name data_type NOT NULL\n\t--DEFAULT expr\n\t--IDENTITY(1,1)\n\t--NULL\n\t--CONSTRAINT constraint_name PRIMARY KEY [CLUSTERED | NONCLUSTERED]\n\t--CONSTRAINT constraint_name UNIQUE\n\t--CONSTRAINT constraint_name REFERENCES reftable ( refcolumn ) [ON DELETE { CASCADE | SET NULL | SET DEFAULT | NO ACTION }] [ON UPDATE { CASCADE | SET NULL | SET DEFAULT | NO ACTION }]\n\t--CONSTRAINT constraint_name CHECK ( condition )\n)\n--ON filegroup\n--WITH (DATA_COMPRESSION = { NONE | ROW | PAGE })\n"
	mssqlTemplateAlterTable  = "ALTER TABLE #table_name#\n--ADD column_name data_type [ NULL | NOT NULL ] [ DEFAULT expr ]\n--ALTER COLUMN column_name data_type [ NULL | NOT NULL ]\n--ADD CONSTRAINT constraint_name PRIMARY KEY ( column_name [, ... ] )\n--ADD CONSTRAINT constraint_name UNIQUE ( column_name [, ... ] )\n--ADD CONSTRAINT constraint_name FOREIGN KEY ( column_name [, ... ] ) REFERENCES reftable ( refcolumn [, ... ] )\n--ADD CONSTRAINT constraint_name CHECK ( condition )\n--DROP CONSTRAINT constraint_name\n--DROP COLUMN column_name\n--EXEC sp_rename '#table_name#.old_name', 'new_name', 'COLUMN'\n"
	mssqlTemplateDropTable   = "DROP TABLE #table_name#"

	mssqlTemplateCreateColumn = "ALTER TABLE #table_name#\nADD name data_type\n--NULL\n--NOT NULL\n--DEFAULT expr\n--IDENTITY(1,1)\n"
	mssqlTemplateAlterColumn  = "ALTER TABLE #table_name#\nALTER COLUMN #column_name# data_type\n--NULL\n--NOT NULL\n--EXEC sp_rename '#table_name#.#column_name#', 'new_name', 'COLUMN'\n"
	mssqlTemplateDropColumn   = "ALTER TABLE #table_name#\nDROP COLUMN #column_name#"

	mssqlTemplateCreatePrimaryKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nPRIMARY KEY ( column_name [, ... ] )\n--CLUSTERED | NONCLUSTERED\n--WITH (FILLFACTOR = value)\n--ON filegroup\n"
	mssqlTemplateDropPrimaryKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	mssqlTemplateCreateUnique = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nUNIQUE ( column_name [, ... ] )\n--CLUSTERED | NONCLUSTERED\n--WITH (FILLFACTOR = value)\n--ON filegroup\n"
	mssqlTemplateDropUnique   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	mssqlTemplateCreateForeignKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nFOREIGN KEY ( column_name [, ... ] )\nREFERENCES reftable ( refcolumn [, ... ] )\n--ON DELETE { CASCADE | SET NULL | SET DEFAULT | NO ACTION }\n--ON UPDATE { CASCADE | SET NULL | SET DEFAULT | NO ACTION }\n--NOT FOR REPLICATION\n"
	mssqlTemplateDropForeignKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#"

	mssqlTemplateCreateIndex = "CREATE [ UNIQUE ] [ CLUSTERED | NONCLUSTERED ] INDEX name\nON #table_name# ( column_name [ ASC | DESC ] [, ... ] )\n--INCLUDE ( column_name [, ... ] )\n--WHERE filter_predicate\n--WITH (FILLFACTOR = value, ONLINE = ON)\n--ON filegroup\n"
	mssqlTemplateAlterIndex  = "ALTER INDEX #index_name#\nON table_name\n--REBUILD\n--REORGANIZE\n--DISABLE\n--SET ( STATISTICS_NORECOMPUTE = { ON | OFF } )\n"
	mssqlTemplateDropIndex   = "DROP INDEX #index_name#\nON table_name\n"

	mssqlTemplateDelete = "DELETE FROM #table_name#\nWHERE condition\n"
)
