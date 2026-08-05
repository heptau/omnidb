package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// mysqlTemplateSelect mirrors MySQL.py's/MariaDB.py's TemplateSelect —
// unlike Postgres/SQLite there's no separate view "kind": tree_mysql.py's
// template_select view never passes one, it always just calls
// TemplateSelect(schema, table) regardless of whether the target is a
// table or a view.
// indentUnit is the user's configured indent_char/indent_size Settings
// (see indentUnitFromCharSize) used for every continuation line.
func mysqlTemplateSelect(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mysqlColumns(db, schema, table)
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

	pks, err := mysqlPrimaryKeys(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(pks) > 0 {
		pkCols, err := mysqlPrimaryKeyColumns(db, schema, table)
		if err != nil {
			return "", err
		}
		if len(pkCols) > 0 {
			sb.WriteString("\nORDER BY t.")
			sb.WriteString(strings.Join(pkCols, ",\n"+indentUnit+"t."))
		}
	}
	return sb.String(), nil
}

func mysqlPKColumnSet(db *sql.DB, schema, table string) (map[string]bool, error) {
	pks, err := mysqlPrimaryKeys(db, schema, table)
	if err != nil {
		return nil, err
	}
	if len(pks) == 0 {
		return nil, nil
	}
	cols, err := mysqlPrimaryKeyColumns(db, schema, table)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c] = true
	}
	return set, nil
}

// mysqlTemplateInsert mirrors TemplateInsert. indentUnit is the user's
// configured indent_char/indent_size Settings.
func mysqlTemplateInsert(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mysqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := mysqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "?"
		comments[i] = mysqlColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s.%s (\n", schema, table))
	sb.WriteString(indentUnit + strings.Join(names, ",\n"+indentUnit))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString(indentUnit + formatTemplateColumnList(values, comments, indentUnit))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// mysqlTemplateUpdate mirrors TemplateUpdate. indentUnit is the user's
// configured indent_char/indent_size Settings.
func mysqlTemplateUpdate(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := mysqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := mysqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	cores := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		cores[i] = c.Name + " = ?"
		comments[i] = mysqlTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}
	return fmt.Sprintf("UPDATE %s.%s\nSET %s\nWHERE condition", schema, table, formatTemplateColumnList(cores, comments, indentUnit)), nil
}

func mysqlColumnComment(name, dataType string, isPK bool, nullable string) string {
	return name + " " + mysqlTypeComment(dataType, isPK, nullable)
}

func mysqlTypeComment(dataType string, isPK bool, nullable string) string {
	switch {
	case isPK:
		return dataType + " PRIMARY KEY"
	case nullable == "YES":
		return dataType + " NULLABLE"
	default:
		return dataType
	}
}
