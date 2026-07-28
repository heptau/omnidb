package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// postgresqlTemplateSelect mirrors PostgreSQL.py's TemplateSelect for kind
// "t" (table) and "v" (view) — the only two kinds this migration slice
// supports (functions/materialized views/foreign tables stay on Django).
func postgresqlTemplateSelect(db *sql.DB, schema, table, kind string) (string, error) {
	var names []string
	if kind == "v" {
		columns, err := postgresqlViewColumns(db, schema, table)
		if err != nil {
			return "", err
		}
		for _, c := range columns {
			names = append(names, c.Name)
		}
	} else {
		columns, err := postgresqlColumns(db, schema, table)
		if err != nil {
			return "", err
		}
		for _, c := range columns {
			names = append(names, c.Name)
		}
	}

	var sb strings.Builder
	sb.WriteString("SELECT t.")
	sb.WriteString(strings.Join(names, "\n     , t."))
	sb.WriteString(fmt.Sprintf("\nFROM %s.%s t", schema, table))

	if kind != "v" {
		pks, err := postgresqlPrimaryKeys(db, schema, table)
		if err != nil {
			return "", err
		}
		if len(pks) > 0 {
			pkCols, err := postgresqlPrimaryKeyColumns(db, schema, table, pks[0][0].(string))
			if err != nil {
				return "", err
			}
			if len(pkCols) > 0 {
				sb.WriteString("\nORDER BY t.")
				sb.WriteString(strings.Join(pkCols, "\n       , t."))
			}
		}
	}

	return sb.String(), nil
}

// postgresqlPKColumnSet returns the set of column names covered by a table's
// (first) primary key — used by TemplateInsert/TemplateUpdate to flag PK
// columns differently from ordinary ones, same as PostgreSQL.py does.
func postgresqlPKColumnSet(db *sql.DB, schema, table string) (map[string]bool, error) {
	pks, err := postgresqlPrimaryKeys(db, schema, table)
	if err != nil {
		return nil, err
	}
	if len(pks) == 0 {
		return nil, nil
	}
	cols, err := postgresqlPrimaryKeyColumns(db, schema, table, pks[0][0].(string))
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(cols))
	for _, c := range cols {
		set[c] = true
	}
	return set, nil
}

// postgresqlTemplateInsert mirrors PostgreSQL.py's TemplateInsert.
func postgresqlTemplateInsert(db *sql.DB, schema, table string) (string, error) {
	columns, err := postgresqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}

	pkSet, err := postgresqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	names := make([]string, len(columns))
	values := make([]string, len(columns))
	for i, c := range columns {
		names[i] = c.Name
		values[i] = "? -- " + postgresqlColumnComment(c.Name, c.DataType, pkSet[c.Name], c.Nullable)
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s.%s (\n", schema, table))
	sb.WriteString("      " + strings.Join(names, "\n    , "))
	sb.WriteString("\n) VALUES (\n")
	sb.WriteString("      " + strings.Join(values, "\n    , "))
	sb.WriteString("\n)")
	return sb.String(), nil
}

// postgresqlTemplateUpdate mirrors PostgreSQL.py's TemplateUpdate.
func postgresqlTemplateUpdate(db *sql.DB, schema, table string) (string, error) {
	columns, err := postgresqlColumns(db, schema, table)
	if err != nil {
		return "", err
	}
	if len(columns) == 0 {
		return "", nil
	}

	pkSet, err := postgresqlPKColumnSet(db, schema, table)
	if err != nil {
		return "", err
	}

	parts := make([]string, len(columns))
	for i, c := range columns {
		parts[i] = c.Name + " = ? -- " + postgresqlTypeComment(c.DataType, pkSet[c.Name], c.Nullable)
	}

	return fmt.Sprintf("UPDATE %s.%s\nSET %s\nWHERE condition", schema, table, strings.Join(parts, "\n    , ")), nil
}

// postgresqlColumnComment formats the "-- name type [PRIMARY KEY|NULLABLE]"
// hint TemplateInsert appends after each bind placeholder, matching
// PostgreSQL.py's TemplateInsert exactly.
func postgresqlColumnComment(name, dataType string, isPK bool, nullable string) string {
	return name + " " + postgresqlTypeComment(dataType, isPK, nullable)
}

// postgresqlTypeComment formats the "type [PRIMARY KEY|NULLABLE]" hint
// TemplateUpdate appends after each bind placeholder — unlike
// TemplateInsert, PostgreSQL.py's TemplateUpdate doesn't repeat the column
// name here (it's already the left-hand side of the "= ?").
func postgresqlTypeComment(dataType string, isPK bool, nullable string) string {
	switch {
	case isPK:
		return dataType + " PRIMARY KEY"
	case nullable == "YES":
		return dataType + " NULLABLE"
	default:
		return dataType
	}
}
