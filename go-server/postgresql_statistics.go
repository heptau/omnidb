package main

import (
	"database/sql"
)

// This file mirrors tree_postgresql.py's extended-statistics-object
// surface (pg_statistic_ext, PG10+) — part of Fáze 8a's PostgreSQL
// long-tail port.

type postgresqlStatistic struct {
	Name   string
	Schema string
	OID    int64
}

// postgresqlStatistics mirrors PostgreSQL.py's QueryTablesStatistics.
func postgresqlStatistics(db *sql.DB, schema, table string) ([]postgresqlStatistic, error) {
	rows, err := db.Query(`
		select quote_ident(se.stxname) as statistic_name,
		       quote_ident(n2.nspname) as schema_name,
		       se.oid
		from pg_statistic_ext se
		inner join pg_class c on se.stxrelid = c.oid
		inner join pg_namespace n on c.relnamespace = n.oid
		inner join pg_namespace n2 on se.stxnamespace = n2.oid
		where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
		order by 1, 2
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlStatistic, 0)
	for rows.Next() {
		var s postgresqlStatistic
		if err := rows.Scan(&s.Name, &s.Schema, &s.OID); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// postgresqlStatisticsColumns mirrors PostgreSQL.py's
// QueryStatisticsFields — the columns a given extended-statistics object
// covers.
func postgresqlStatisticsColumns(db *sql.DB, schema, statistic string) ([]string, error) {
	rows, err := db.Query(`
		select quote_ident(a.attname) as column_name
		from pg_statistic_ext se
		inner join pg_class c on se.stxrelid = c.oid
		inner join pg_namespace n on c.relnamespace = n.oid
		inner join pg_namespace n2 on se.stxnamespace = n2.oid
		inner join pg_attribute a on c.oid = a.attrelid and a.attnum = any(se.stxkeys)
		where quote_ident(n2.nspname) = $1 and quote_ident(se.stxname) = $2
		order by 1
	`, schema, statistic)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}
