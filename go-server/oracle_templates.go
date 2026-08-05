package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// oracleTemplateSelect mirrors Oracle.py's TemplateSelect. indentUnit is
// the user's configured indent_char/indent_size Settings (see
// indentUnitFromCharSize) used for every continuation line.
//
// Unlike the other three engines' TemplateSelect, this deliberately does
// NOT write "FROM schema.table AS t" — Oracle rejects the AS keyword
// before a table/view alias (ORA-00933), unlike a column alias where AS
// is accepted (if optional). "AS" stays valid Oracle SQL everywhere else
// this template package uses it; this is the one place it can't be used.
func oracleTemplateSelect(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := oracleColumns(db, schema, table)
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
	sb.WriteString(fmt.Sprintf("\nFROM %s.%s t", schema, table))

	pkCols, err := oracleFirstPrimaryKeyColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		sb.WriteString("\nORDER BY t.")
		sb.WriteString(strings.Join(pkCols, ",\n"+indentUnit+"t."))
	}
	return sb.String(), nil
}

// oracleFirstPrimaryKeyColumns fetches the columns of the table's first
// primary key constraint, mirroring how Oracle.py's Template* methods pick
// v_pk.Rows[0].
func oracleFirstPrimaryKeyColumns(db *sql.DB, schema, table string) ([]string, error) {
	pks, err := oraclePrimaryKeys(db, schema, table)
	if err != nil || len(pks) == 0 {
		return nil, err
	}
	return oraclePrimaryKeyColumns(db, schema, table, pks[0])
}

// oracleTemplateInsert mirrors TemplateInsert. indentUnit is the user's
// configured indent_char/indent_size Settings.
func oracleTemplateInsert(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := oracleColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := oraclePKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "?"
		comments[i] = oracleColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s.%s (\n", schema, table))
	sb.WriteString(indentUnit + strings.Join(names, ",\n"+indentUnit))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString(indentUnit + formatTemplateColumnList(values, comments, indentUnit))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// oracleTemplateUpdate mirrors TemplateUpdate. indentUnit is the user's
// configured indent_char/indent_size Settings.
func oracleTemplateUpdate(db *sql.DB, schema, table, indentUnit string) (string, error) {
	columns, err := oracleColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}
	pkSet, err := oraclePKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	cores := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		cores[i] = c.Name + " = ?"
		comments[i] = oracleTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}
	return fmt.Sprintf("UPDATE %s.%s\nSET %s\nWHERE condition", schema, table, formatTemplateColumnList(cores, comments, indentUnit)), nil
}

func oraclePKColumnSet(db *sql.DB, schema, table string) (map[string]bool, error) {
	cols, err := oracleFirstPrimaryKeyColumns(db, schema, table)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c] = true
	}
	return set, nil
}

func oracleColumnComment(name, dataType string, isPK bool, nullable string) string {
	return name + " " + oracleTypeComment(dataType, isPK, nullable)
}

func oracleTypeComment(dataType string, isPK bool, nullable string) string {
	switch {
	case isPK:
		return dataType + " PRIMARY KEY"
	case nullable == "YES":
		return dataType + " NULLABLE"
	default:
		return dataType
	}
}
