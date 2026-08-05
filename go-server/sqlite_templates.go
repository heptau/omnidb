package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// primaryKeySet is a small helper shared by the two DML template builders
// below, both of which need to flag PK columns differently from ordinary
// ones.
func primaryKeySet(db *sql.DB, table string) (map[string]bool, error) {
	pkCols, err := sqlitePrimaryKeyColumnNames(db, table)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(pkCols))
	for _, c := range pkCols {
		set[c] = true
	}
	return set, nil
}

// sqliteTemplateSelect mirrors SQLite.py's TemplateSelect. kind is "t"
// (table) or "v" (view) — PRAGMA table_info works identically on both, so
// the only behavioral difference is the ORDER BY clause tables get from
// their primary key. indentUnit is the user's configured
// indent_char/indent_size Settings (see indentUnitFromCharSize) used for
// every continuation line.
func sqliteTemplateSelect(db *sql.DB, table, kind, indentUnit string) (string, error) {
	columns, err := sqliteColumns(db, table)
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

	if kind == "t" {
		pkCols, err := sqlitePrimaryKeyColumnNames(db, table)
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

// columnComment formats the "-- name type [PRIMARY KEY|NULLABLE]" hint
// TemplateInsert/TemplateUpdate append after each bind placeholder.
func columnComment(name, dataType string, isPK bool, nullable string) string {
	switch {
	case isPK:
		return fmt.Sprintf("%s %s PRIMARY KEY", name, dataType)
	case nullable == "YES":
		return fmt.Sprintf("%s %s NULLABLE", name, dataType)
	default:
		return fmt.Sprintf("%s %s", name, dataType)
	}
}

// sqliteTemplateInsert mirrors SQLite.py's TemplateInsert. indentUnit is
// the user's configured indent_char/indent_size Settings.
func sqliteTemplateInsert(db *sql.DB, table, indentUnit string) (string, error) {
	columns, err := sqliteColumns(db, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}

	pkSet, err := primaryKeySet(db, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "?"
		comments[i] = columnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s (\n", table))
	sb.WriteString(indentUnit + strings.Join(names, ",\n"+indentUnit))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString(indentUnit + formatTemplateColumnList(values, comments, indentUnit))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// sqliteTemplateUpdate mirrors SQLite.py's TemplateUpdate. indentUnit is
// the user's configured indent_char/indent_size Settings.
func sqliteTemplateUpdate(db *sql.DB, table, indentUnit string) (string, error) {
	columns, err := sqliteColumns(db, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}

	pkSet, err := primaryKeySet(db, table)
	if err != nil {
		return "", err
	}

	cores := make([]string, len(columns))
	comments := make([]string, len(columns))
	for i, c := range columns {
		cores[i] = c.Name + " = ?"
		comments[i] = columnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	return fmt.Sprintf("UPDATE %s\nSET %s\nWHERE condition", table, formatTemplateColumnList(cores, comments, indentUnit)), nil
}
