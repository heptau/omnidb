package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// oracleTemplateSelect mirrors Oracle.py's TemplateSelect.
func oracleTemplateSelect(db *sql.DB, schema, table string) (string, error) {
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
	sb.WriteString(strings.Join(names, "\n     , t."))
	sb.WriteString(fmt.Sprintf("\nFROM %s.%s t", schema, table))

	pkCols, err := oracleFirstPrimaryKeyColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(pkCols) > 0 {
		sb.WriteString("\nORDER BY t.")
		sb.WriteString(strings.Join(pkCols, "\n       , t."))
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

// oracleTemplateInsert mirrors TemplateInsert.
func oracleTemplateInsert(db *sql.DB, schema, table string) (string, error) {
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
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "? -- " + oracleColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s.%s (\n", schema, table))
	sb.WriteString("      " + strings.Join(names, "\n    , "))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString("      " + strings.Join(values, "\n    , "))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// oracleTemplateUpdate mirrors TemplateUpdate.
func oracleTemplateUpdate(db *sql.DB, schema, table string) (string, error) {
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

	parts := make([]string, len(columns))
	for i, c := range columns {
		parts[i] = c.Name + " = ? -- " + oracleTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}
	return fmt.Sprintf("UPDATE %s.%s\nSET %s\nWHERE condition", schema, table, strings.Join(parts, "\n    , ")), nil
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
