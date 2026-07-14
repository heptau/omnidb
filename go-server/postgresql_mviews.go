package main

import (
	"database/sql"
	"strings"
)

// This file mirrors tree_postgresql.py's materialized-view surface — part
// of Fáze 8a's PostgreSQL long-tail port.

// postgresqlMaterializedViews mirrors PostgreSQL.py's
// QueryMaterializedViews. v_has_indexes/v_has_statistics are always true
// (matching the hardcoded PostgreSQL.py instance attributes, no query
// needed) — left to the HTTP handler to add, same as postgresqlTables.
func postgresqlMaterializedViews(db *sql.DB, schema string) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`
		select quote_ident(t.relname) as name, t.oid
		from pg_class t
		inner join pg_namespace n on n.oid = t.relnamespace
		where t.relkind = 'm' and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

type postgresqlMaterializedViewColumn struct {
	Name       string
	DataType   string
	DataLength sql.NullString
}

// postgresqlMaterializedViewColumns mirrors PostgreSQL.py's
// QueryMaterializedViewFields — same shape as postgresqlColumns
// (postgresql.go) but `c.relkind = 'm'` and using the raw `t.typname`
// (not format_type) for data_type, matching the Python original.
func postgresqlMaterializedViewColumns(db *sql.DB, schema, table string) ([]postgresqlMaterializedViewColumn, error) {
	rows, err := db.Query(`
		select quote_ident(a.attname) as column_name,
		       t.typname as data_type,
		       (select case when x.truetypmod = -1 then null
		                    when x.truetypid in (1042, 1043) then x.truetypmod - 4
		                    when x.truetypid in (1560, 1562) then x.truetypmod
		                    else null
		               end
		        from (
		            select (case when t.typtype = 'd' then t.typbasetype else a.atttypid end) as truetypid,
		                   (case when t.typtype = 'd' then t.typtypmod else a.atttypmod end) as truetypmod
		        ) x
		       ) as data_length
		from pg_attribute a
		inner join pg_class c on c.oid = a.attrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		inner join pg_type t on t.oid = a.atttypid
		where a.attnum > 0
			and not a.attisdropped
			and c.relkind = 'm'
			and quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
		order by quote_ident(c.relname), a.attnum
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlMaterializedViewColumn, 0)
	for rows.Next() {
		var c postgresqlMaterializedViewColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.DataLength); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// postgresqlMaterializedViewIndexDefs mirrors PostgreSQL.py's
// QueryTablesIndexesHelper as used inside GetMaterializedViewDefinition —
// each valid, live index's definition text (already ";"-terminated).
func postgresqlMaterializedViewIndexDefs(db *sql.DB, schema, view string) ([]string, error) {
	rows, err := db.Query(`
		select format('%s;', pg_get_indexdef(i.indexrelid)) as definition
		from pg_index i
		inner join pg_class ci on ci.oid = i.indexrelid
		inner join pg_namespace ni on ni.oid = ci.relnamespace
		inner join pg_class c on c.oid = i.indrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		where i.indisvalid and i.indislive
			and quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
		order by quote_ident(c.relname), quote_ident(ci.relname)
	`, schema, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}

// postgresqlMaterializedViewDefinition mirrors PostgreSQL.py's
// GetMaterializedViewDefinition — composes a DROP + CREATE MATERIALIZED
// VIEW script followed by its indexes' definitions, matching the exact
// Python string template (including the blank line before the joined index
// defs).
func postgresqlMaterializedViewDefinition(db *sql.DB, schema, view string) (string, error) {
	var viewDef string
	if err := db.QueryRow(`select pg_get_viewdef($1::regclass)`, schema+"."+view).Scan(&viewDef); err != nil {
		return "", err
	}
	indexDefs, err := postgresqlMaterializedViewIndexDefs(db, schema, view)
	if err != nil {
		return "", err
	}
	return "DROP MATERIALIZED VIEW " + schema + "." + view + ";\n\n" +
		"CREATE MATERIALIZED VIEW " + schema + "." + view + " AS\n" + viewDef +
		"\n\n" + strings.Join(indexDefs, "\n"), nil
}
