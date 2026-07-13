package main

import (
	"database/sql"
	"fmt"
)

// technologyHasSchema mirrors OmniDatabase's v_has_schema flag — every
// engine except SQLite organizes tables under a schema.
func technologyHasSchema(technology string) bool {
	return technology != "sqlite"
}

// editDataColumn is the common shape start_edit_data needs out of any
// engine's column introspection — every per-engine column struct already
// has Name/DataType fields, just under a different concrete type.
type editDataColumn struct {
	Name     string
	DataType string
}

// editDataColumns dispatches to whichever engine's already-ported column
// introspection applies — mirrors workspace.py's start_edit_data calling
// v_database.QueryTablesFields(...) polymorphically.
func editDataColumns(technology string, db *sql.DB, schema, table string) ([]editDataColumn, error) {
	switch technology {
	case "sqlite":
		cols, err := sqliteColumns(db, table)
		if err != nil {
			return nil, err
		}
		out := make([]editDataColumn, len(cols))
		for i, c := range cols {
			out[i] = editDataColumn{c.Name, c.DataType}
		}
		return out, nil
	case "postgresql":
		cols, err := postgresqlColumns(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]editDataColumn, len(cols))
		for i, c := range cols {
			out[i] = editDataColumn{c.Name, c.DataType}
		}
		return out, nil
	case "mysql", "mariadb":
		cols, err := mysqlColumns(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]editDataColumn, len(cols))
		for i, c := range cols {
			out[i] = editDataColumn{c.Name, c.DataType}
		}
		return out, nil
	case "oracle":
		cols, err := oracleColumns(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]editDataColumn, len(cols))
		for i, c := range cols {
			out[i] = editDataColumn{c.Name, c.DataType}
		}
		return out, nil
	default:
		return nil, fmt.Errorf("unsupported technology %q", technology)
	}
}

// editDataPrimaryKeyColumns dispatches to whichever engine's already-ported
// PK introspection applies, resolving "the first PK constraint's columns"
// the same way start_edit_data does (v_pk.Rows[0]).
func editDataPrimaryKeyColumns(technology string, db *sql.DB, schema, table string) ([]string, error) {
	switch technology {
	case "sqlite":
		pks, err := sqlitePrimaryKeys(db, table)
		if err != nil || len(pks) == 0 {
			return nil, err
		}
		return sqlitePrimaryKeyColumnNames(db, table)
	case "postgresql":
		pks, err := postgresqlPrimaryKeys(db, schema, table)
		if err != nil || len(pks) == 0 {
			return nil, err
		}
		name, _ := pks[0][0].(string)
		return postgresqlPrimaryKeyColumns(db, schema, table, name)
	case "mysql", "mariadb":
		pks, err := mysqlPrimaryKeys(db, schema, table)
		if err != nil || len(pks) == 0 {
			return nil, err
		}
		return mysqlPrimaryKeyColumns(db, schema, table)
	case "oracle":
		pks, err := oraclePrimaryKeys(db, schema, table)
		if err != nil || len(pks) == 0 {
			return nil, err
		}
		return oraclePrimaryKeyColumns(db, schema, table, pks[0])
	default:
		return nil, fmt.Errorf("unsupported technology %q", technology)
	}
}

// graphTableNames dispatches to whichever engine's already-ported table
// listing applies — mirrors draw_graph's v_database.QueryTables(False,
// v_schema) call, returning just the names (draw_graph doesn't need
// anything else from that query).
func graphTableNames(technology string, db *sql.DB, schema string) ([]string, error) {
	switch technology {
	case "sqlite":
		tables, err := sqliteTables(db)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(tables))
		for i, t := range tables {
			names[i] = t.Name
		}
		return names, nil
	case "postgresql":
		tables, err := postgresqlTables(db, schema)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(tables))
		for i, t := range tables {
			names[i] = t.Name
		}
		return names, nil
	case "mysql", "mariadb":
		tables, err := mysqlTables(db, schema)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(tables))
		for i, t := range tables {
			names[i] = t.Name
		}
		return names, nil
	case "oracle":
		tables, err := oracleTables(db, schema)
		if err != nil {
			return nil, err
		}
		names := make([]string, len(tables))
		for i, t := range tables {
			names[i] = t.Name
		}
		return names, nil
	default:
		return nil, fmt.Errorf("unsupported technology %q", technology)
	}
}

// graphForeignKeyTargets dispatches to whichever engine's already-ported
// single-table FK introspection applies, returning just the list of
// referenced table names for one table — mirrors one table's contribution
// to draw_graph's v_database.QueryTablesForeignKeys(None, False, v_schema)
// (called per-table here instead of as one schema-wide query — see
// draw_graph.go's package comment for why that's a safe, deliberate
// simplification).
func graphForeignKeyTargets(technology string, db *sql.DB, schema, table string) ([]string, error) {
	switch technology {
	case "sqlite":
		fks, err := sqliteForeignKeys(db, table)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(fks))
		for i, fk := range fks {
			out[i] = fk.RTableName
		}
		return out, nil
	case "postgresql":
		fks, err := postgresqlForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(fks))
		for i, fk := range fks {
			out[i] = fk.RTableName
		}
		return out, nil
	case "mysql", "mariadb":
		fks, err := mysqlForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(fks))
		for i, fk := range fks {
			out[i] = fk.RTableName
		}
		return out, nil
	case "oracle":
		fks, err := oracleForeignKeys(db, schema, table)
		if err != nil {
			return nil, err
		}
		out := make([]string, len(fks))
		for i, fk := range fks {
			out[i] = fk.RTableName
		}
		return out, nil
	default:
		return nil, fmt.Errorf("unsupported technology %q", technology)
	}
}

// runGenericQuery mirrors refresh_monitoring's v_database.Query(sql, True, True)
// — run a query against any native-technology connection and return every
// row/column as display strings, the same generic shape querycursor.go's
// scanRowAsStrings already produces for the native create_request/
// long_polling path.
func runGenericQuery(db *sql.DB, sqlText string) (cols []string, rows [][]string, err error) {
	r, err := db.Query(sqlText)
	if err != nil {
		return nil, nil, err
	}
	defer r.Close()

	cols, err = r.Columns()
	if err != nil {
		return nil, nil, err
	}
	for r.Next() {
		row, err := scanRowAsStrings(r, len(cols))
		if err != nil {
			return nil, nil, err
		}
		rows = append(rows, row)
	}
	return cols, rows, r.Err()
}
