package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// editDataFK is one foreign key of an Edit Data table, in the shape the grid
// needs to jump from a referencing row to the referenced one. Every name is in
// the same "catalog form" as editDataColumns' (for PostgreSQL that is
// quote_ident's output), so the frontend can match columns by plain string
// comparison and hand RTable/RSchema straight back to start_edit_data.
type editDataFK struct {
	Columns    []string
	RSchema    string
	RTable     string
	RColumns   []string
	RColumnSQL []string // RColumns quoted for splicing into a WHERE clause
}

// fkPart is one (local column -> referenced column) pair of a constraint.
type fkPart struct {
	column, rTable, rColumn string
}

// groupForeignKeyParts turns per-constraint column pairs into editDataFK
// values. A constraint is dropped when its columns point at more than one
// table, which no real foreign key does.
func groupForeignKeyParts(technology, schema string, constraints []string, partsFor func(name string) ([]fkPart, error)) ([]editDataFK, error) {
	var out []editDataFK
	seen := map[string]bool{}
	for _, name := range constraints {
		// Some engines list a composite key once per column.
		if seen[name] {
			continue
		}
		seen[name] = true
		parts, err := partsFor(name)
		if err != nil {
			return nil, err
		}
		if len(parts) == 0 {
			continue
		}
		fk := editDataFK{RSchema: schema, RTable: parts[0].rTable}
		consistent := true
		for _, p := range parts {
			if p.rTable != fk.RTable {
				consistent = false
				break
			}
			fk.Columns = append(fk.Columns, p.column)
			fk.RColumns = append(fk.RColumns, p.rColumn)
			fk.RColumnSQL = append(fk.RColumnSQL, quoteEditDataColumn(technology, p.rColumn))
		}
		if consistent {
			out = append(out, fk)
		}
	}
	return out, nil
}

// editDataForeignKeys dispatches to each engine's already-ported single-table
// foreign key introspection. Only PostgreSQL reports the referenced table's
// own schema; elsewhere it is taken to be the table's schema.
func editDataForeignKeys(technology string, db *sql.DB, schema, table string) ([]editDataFK, error) {
	switch technology {
	case "postgresql":
		return postgresqlEditDataForeignKeys(db, schema, table)
	case "sqlite":
		fks, err := sqliteForeignKeys(db, table)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(fks))
		for i, fk := range fks {
			names[i] = fk.ConstraintName
		}
		return groupForeignKeyParts(technology, "", names, func(n string) ([]fkPart, error) {
			cols, err := sqliteForeignKeyColumns(db, table, n)
			parts := make([]fkPart, len(cols))
			for i, c := range cols {
				parts[i] = fkPart{c.ColumnName, c.RTableName, c.RColumnName}
			}
			return parts, err
		})
	case "mysql", "mariadb":
		fks, err := mysqlForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(fks))
		for i, fk := range fks {
			names[i] = fk.ConstraintName
		}
		return groupForeignKeyParts(technology, schema, names, func(n string) ([]fkPart, error) {
			cols, err := mysqlForeignKeyColumns(db, schema, table, n)
			parts := make([]fkPart, len(cols))
			for i, c := range cols {
				parts[i] = fkPart{c.ColumnName, c.RTableName, c.RColumnName}
			}
			return parts, err
		})
	case "oracle":
		fks, err := oracleForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(fks))
		for i, fk := range fks {
			names[i] = fk.ConstraintName
		}
		return groupForeignKeyParts(technology, schema, names, func(n string) ([]fkPart, error) {
			cols, err := oracleForeignKeyColumns(db, schema, table, n)
			parts := make([]fkPart, len(cols))
			for i, c := range cols {
				parts[i] = fkPart{c.ColumnName, c.RTableName, c.RColumnName}
			}
			return parts, err
		})
	case "mssql":
		fks, err := mssqlForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(fks))
		for i, fk := range fks {
			names[i] = fk.ConstraintName
		}
		return groupForeignKeyParts(technology, schema, names, func(n string) ([]fkPart, error) {
			cols, err := mssqlForeignKeyColumns(db, schema, table, n)
			parts := make([]fkPart, len(cols))
			for i, c := range cols {
				parts[i] = fkPart{c.ColumnName, c.RTableName, c.RColumnName}
			}
			return parts, err
		})
	case "firebird":
		fks, err := firebirdForeignKeys(db, table)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(fks))
		for i, fk := range fks {
			names[i] = fk.ConstraintName
		}
		return groupForeignKeyParts(technology, "", names, func(n string) ([]fkPart, error) {
			cols, err := firebirdForeignKeyColumns(db, table, n)
			parts := make([]fkPart, len(cols))
			for i, c := range cols {
				parts[i] = fkPart{c.ColumnName, c.RTableName, c.RColumnName}
			}
			return parts, err
		})
	default:
		return nil, fmt.Errorf("unsupported technology %q", technology)
	}
}

// postgresqlEditDataForeignKeys reads pg_constraint directly rather than
// reusing postgresqlForeignKeys/-Columns, because those report the referenced
// table without its schema, which would send a cross-schema foreign key to
// the wrong table.
func postgresqlEditDataForeignKeys(db *sql.DB, schema, table string) ([]editDataFK, error) {
	rows, err := db.Query(`
		SELECT quote_ident(nr.nspname), quote_ident(cr.relname),
		       (SELECT string_agg(quote_ident(a.attname), chr(31) ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
		             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
		       (SELECT string_agg(quote_ident(a.attname), chr(31) ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
		             JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum)
		FROM pg_constraint c
		JOIN pg_class cl ON cl.oid = c.conrelid
		JOIN pg_namespace n ON n.oid = cl.relnamespace
		JOIN pg_class cr ON cr.oid = c.confrelid
		JOIN pg_namespace nr ON nr.oid = cr.relnamespace
		WHERE c.contype = 'f' AND quote_ident(n.nspname) = $1 AND quote_ident(cl.relname) = $2
		ORDER BY c.conname`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []editDataFK
	for rows.Next() {
		var fk editDataFK
		var cols, rcols sql.NullString
		if err := rows.Scan(&fk.RSchema, &fk.RTable, &cols, &rcols); err != nil {
			return nil, err
		}
		fk.Columns = strings.Split(cols.String, "\x1f")
		fk.RColumns = strings.Split(rcols.String, "\x1f")
		for _, c := range fk.RColumns {
			fk.RColumnSQL = append(fk.RColumnSQL, c) // already quote_ident'd
		}
		if cols.Valid && rcols.Valid && len(fk.Columns) == len(fk.RColumns) {
			out = append(out, fk)
		}
	}
	return out, rows.Err()
}
