package main

import (
	"database/sql"
)

// This file mirrors tree_postgresql.py's SQL/MED foreign-data surface
// (foreign data wrappers, foreign servers, user mappings, foreign tables +
// columns) — part of Fáze 8a's PostgreSQL long-tail port.

// postgresqlForeignDataWrappers mirrors PostgreSQL.py's
// QueryForeignDataWrappers.
func postgresqlForeignDataWrappers(db *sql.DB) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`select fdwname as name, oid from pg_foreign_data_wrapper order by 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

type postgresqlForeignServer struct {
	Name    string
	Type    sql.NullString
	Version sql.NullString
	Options string
	OID     int64
}

// postgresqlForeignServers mirrors PostgreSQL.py's QueryForeignServers —
// filters on the raw (not quote_ident'd) fdwname, matching Python's own
// asymmetry exactly (every other identifier comparison in this file wraps
// both sides in quote_ident; this one doesn't, and that's preserved rather
// than "fixed", since the actual filtered value is what matters, not the
// stylistic inconsistency).
func postgresqlForeignServers(db *sql.DB, fdw string) ([]postgresqlForeignServer, error) {
	rows, err := db.Query(`
		select s.srvname, s.srvtype, s.srvversion, array_to_string(s.srvoptions, ',') as srvoptions, s.oid
		from pg_foreign_server s
		inner join pg_foreign_data_wrapper w on w.oid = s.srvfdw
		where w.fdwname = $1
		order by 1
	`, fdw)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlForeignServer, 0)
	for rows.Next() {
		var s postgresqlForeignServer
		if err := rows.Scan(&s.Name, &s.Type, &s.Version, &s.Options, &s.OID); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type postgresqlUserMapping struct {
	RoleName string
	Options  string
}

// postgresqlUserMappings mirrors PostgreSQL.py's QueryUserMappings —
// per-option-key password masking (any option key matching
// password/passwd/passw/pass/pwd, case-insensitive, has its value replaced
// with '*****') is done in SQL, preserved verbatim rather than
// reimplemented as Go post-processing, to keep it byte-identical.
func postgresqlUserMappings(db *sql.DB, foreignServer string) ([]postgresqlUserMapping, error) {
	rows, err := db.Query(`
		select rolname, umoptions
		from (
			select seq, rolname, string_agg(umoption, ','::text) as umoptions
			from (
				select seq, rolname,
				       (case when lower(umoption[1]) in ('password', 'passwd', 'passw', 'pass', 'pwd')
				             then umoption[1] || '=' || '*****'
				             else umoption[1] || '=' || umoption[2]
				        end) as umoption
				from (
					select seq, rolname, string_to_array(umoption, '=') as umoption
					from (
						select 1 as seq, 'PUBLIC' as rolname, unnest(coalesce(u.umoptions, '{null}')) as umoption
						from pg_user_mapping u
						inner join pg_foreign_server s on s.oid = u.umserver
						where u.umuser = 0 and s.srvname = $1
						union
						select 1 + row_number() over(order by r.rolname) as seq, r.rolname,
						       unnest(coalesce(u.umoptions, '{null}')) as umoption
						from pg_user_mapping u
						inner join pg_foreign_server s on s.oid = u.umserver
						inner join pg_roles r on r.oid = u.umuser
						where s.srvname = $1
					) x
				) x
			) x
			group by seq, rolname
		) x
		order by seq
	`, foreignServer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlUserMapping, 0)
	for rows.Next() {
		var m postgresqlUserMapping
		if err := rows.Scan(&m.RoleName, &m.Options); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type postgresqlForeignTable struct {
	Name string
	OID  int64
}

// postgresqlForeignTables mirrors PostgreSQL.py's QueryForeignTables —
// PG10+ uses c.relispartition (always false for foreign tables today, but
// selected for parity); per this project's version-floor policy, the
// pre-PG10 fallback isn't ported. Ordered by table_name only — the Python
// original also selects table_schema and orders "2, 1" (schema-then-name),
// but this port's SELECT list drops the already-constrained-by-WHERE
// schema column, so ordering by name alone is equivalent for a single
// fixed schema.
func postgresqlForeignTables(db *sql.DB, schema string) ([]postgresqlForeignTable, error) {
	rows, err := db.Query(`
		select quote_ident(c.relname) as table_name, c.oid
		from pg_class c
		inner join pg_namespace n on n.oid = c.relnamespace
		where c.relkind = 'f' and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlForeignTable, 0)
	for rows.Next() {
		var t postgresqlForeignTable
		if err := rows.Scan(&t.Name, &t.OID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type postgresqlForeignColumn struct {
	Name          string
	DataType      string
	DataLength    sql.NullString
	Nullable      string
	ColumnOptions string
	TableOptions  string
	Server        string
	FDW           string
}

// postgresqlForeignColumns mirrors PostgreSQL.py's
// QueryForeignTablesFields — column-level metadata for a foreign table,
// including per-column and per-table FDW options. Deliberately uses raw
// t.typname (not format_type/ARRAY-or-USER-DEFINED normalization), matching
// the Python original's own inconsistency with regular-table columns — this
// is a genuine difference in the source, not an oversight to unify.
func postgresqlForeignColumns(db *sql.DB, schema, table string) ([]postgresqlForeignColumn, error) {
	rows, err := db.Query(`
		select quote_ident(a.attname) as column_name,
		       t.typname as data_type,
		       (case when a.attnotnull or t.typtype = 'd'::char and t.typnotnull then 'NO' else 'YES' end) as nullable,
		       (select case when x.truetypmod = -1 then null
		                    when x.truetypid in (1042, 1043) then x.truetypmod - 4
		                    when x.truetypid in (1560, 1562) then x.truetypmod
		                    else null
		               end
		        from (
		            select (case when t.typtype = 'd' then t.typbasetype else a.atttypid end) as truetypid,
		                   (case when t.typtype = 'd' then t.typtypmod else a.atttypmod end) as truetypmod
		        ) x
		       ) as data_length,
		       array_to_string(a.attfdwoptions, ',') as attfdwoptions,
		       array_to_string(f.ftoptions, ',') as ftoptions,
		       s.srvname,
		       w.fdwname
		from pg_attribute a
		inner join pg_class c on c.oid = a.attrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		inner join pg_type t on t.oid = a.atttypid
		inner join pg_foreign_table f on f.ftrelid = c.oid
		inner join pg_foreign_server s on s.oid = f.ftserver
		inner join pg_foreign_data_wrapper w on w.oid = s.srvfdw
		where a.attnum > 0
			and not a.attisdropped
			and c.relkind = 'f'
			and quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
		order by quote_ident(c.relname), a.attnum
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlForeignColumn, 0)
	for rows.Next() {
		var c postgresqlForeignColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.Nullable, &c.DataLength, &c.ColumnOptions, &c.TableOptions, &c.Server, &c.FDW); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
