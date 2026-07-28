package main

import "database/sql"

// postgresqlAutocompleteRow mirrors one row of GetAutocompleteValues' big
// UNION ALL — unlike Python (which selects only the 5 columns the caller
// asked for via string-formatted column aliasing), this always selects
// every column and lets the caller (autocomplete.go) pick result vs
// result_complete / complement vs complement_complete afterward — avoids
// needing two slightly-different query strings for the two "num_dots"
// cases.
type postgresqlAutocompleteRow struct {
	Type               string
	Sequence           int
	NumDots            int
	Result             string
	ResultComplete     string
	SelectValue        string
	Complement         string
	ComplementComplete string
}

// postgresqlAutocompleteValues mirrors PostgreSQL.py's GetAutocompleteValues
// — the only engine that implements this search at all (MySQL/MariaDB/
// Oracle/SQLite's own GetAutocompleteValues just `return None`, i.e. no
// results, confirmed by reading all 4). filterClause is a WHERE clause
// against a virtual "search" table using bind placeholders (never string-
// interpolated values) — fixes a real SQL injection in the Python original,
// which built `where search.result like '{0}%'.format(v_value)` by direct
// string concatenation of user-typed text.
func postgresqlAutocompleteValues(db *sql.DB, filterClause string, args []any) ([]postgresqlAutocompleteRow, error) {
	branch := func(sequence, numDots int, selectList, from string) string {
		return "(select * from (select " + selectList + " from " + from + ") search " + filterClause + " LIMIT 500)"
	}

	query := "select * from (" +
		branch(0, 0, "'database' as type, 0 as sequence, 0 as num_dots, quote_ident(datname) as result, quote_ident(datname) as result_complete, quote_ident(datname) as select_value, '' as complement, '' as complement_complete", "pg_database") +
		" UNION ALL " +
		branch(2, 0, "'tablespace' as type, 2 as sequence, 0 as num_dots, quote_ident(spcname) as result, quote_ident(spcname) as result_complete, quote_ident(spcname) as select_value, '' as complement, '' as complement_complete", "pg_tablespace") +
		" UNION ALL " +
		branch(1, 0, "'role' as type, 1 as sequence, 0 as num_dots, quote_ident(rolname) as result, quote_ident(rolname) as result_complete, quote_ident(rolname) as select_value, '' as complement, '' as complement_complete", "pg_roles") +
		" UNION ALL " +
		branch(4, 0, "'extension' as type, 4 as sequence, 0 as num_dots, quote_ident(extname) as result, quote_ident(extname) as result_complete, quote_ident(extname) as select_value, '' as complement, '' as complement_complete", "pg_extension") +
		" UNION ALL " +
		"(select * from (select 'schema' as type, 3 as sequence, 0 as num_dots, quote_ident(nspname) as result, quote_ident(nspname) as result_complete, quote_ident(nspname) as select_value, '' as complement, '' as complement_complete " +
		"from pg_catalog.pg_namespace where nspname not in ('pg_toast') and nspname not like 'pg%temp%') search " + filterClause + " LIMIT 500)" +
		" UNION ALL " +
		"(select * from (select 'table' as type, 5 as sequence, 1 as num_dots, quote_ident(c.relname) as result, quote_ident(n.nspname) || '.' || quote_ident(c.relname) as result_complete, " +
		"quote_ident(n.nspname) || '.' || quote_ident(c.relname) as select_value, quote_ident(n.nspname) as complement, '' as complement_complete " +
		"from pg_class c inner join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p')) search " + filterClause + " LIMIT 500)" +
		" UNION ALL " +
		"(select * from (select 'view' as type, 6 as sequence, 1 as num_dots, quote_ident(table_name) as result, quote_ident(table_schema) || '.' || quote_ident(table_name) as result_complete, " +
		"quote_ident(table_schema) || '.' || quote_ident(table_name) as select_value, quote_ident(table_schema) as complement, '' as complement_complete " +
		"from information_schema.views) search " + filterClause + " LIMIT 500)" +
		" UNION ALL " +
		"(select * from (select 'function' as type, 8 as sequence, 1 as num_dots, quote_ident(p.proname) as result, quote_ident(n.nspname) || '.' || quote_ident(p.proname) as result_complete, " +
		"quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' as select_value, quote_ident(n.nspname) as complement, '' as complement_complete " +
		"from pg_proc p join pg_namespace n on p.pronamespace = n.oid where format_type(p.prorettype, null) not in ('trigger', 'event_trigger')) search " + filterClause + " LIMIT 500)" +
		" UNION ALL " +
		"(select * from (select 'index' as type, 9 as sequence, 1 as num_dots, quote_ident(i.indexname) as result, quote_ident(i.schemaname) || '.' || quote_ident(i.indexname) as result_complete, " +
		"quote_ident(i.schemaname) || '.' || quote_ident(i.indexname) as select_value, quote_ident(i.schemaname) || '.' || quote_ident(i.tablename) as complement, quote_ident(i.tablename) as complement_complete " +
		"from pg_indexes i) search " + filterClause + " LIMIT 500)" +
		") search " + filterClause + " order by sequence, result_complete"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []postgresqlAutocompleteRow
	for rows.Next() {
		var r postgresqlAutocompleteRow
		if err := rows.Scan(&r.Type, &r.Sequence, &r.NumDots, &r.Result, &r.ResultComplete, &r.SelectValue, &r.Complement, &r.ComplementComplete); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
