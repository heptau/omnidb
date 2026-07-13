package main

import (
	"database/sql"
	"net/url"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// openPostgreSQLTarget opens a connection to the user's saved PostgreSQL
// database (not OmniDB's own app database). Each request gets its own
// short-lived connection — unlike Django's Session, which keeps one
// long-lived connection per (browser session, connection id) alive in
// memory, these read-only introspection queries are stateless and always
// schema-qualify what they touch, so there's no session state (search_path,
// temp objects, etc.) that needs to carry across requests.
func openPostgreSQLTarget(info *ConnectionInfo) (*sql.DB, error) {
	port := info.Port
	if port == "" {
		port = "5432"
	}
	dsn := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(info.Username, info.Password),
		Host:     info.Server + ":" + port,
		Path:     "/" + info.Database,
		RawQuery: "sslmode=prefer",
	}
	db, err := sql.Open("pgx", dsn.String())
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// postgresqlVersion mirrors PostgreSQL.py's GetVersion.
func postgresqlVersion(db *sql.DB) (string, error) {
	var version string
	if err := db.QueryRow(`show server_version`).Scan(&version); err != nil {
		return "", err
	}
	// Django's GetVersion keeps only the leading token ("14.9" out of
	// "14.9 (Homebrew)"), so mirror that instead of the raw server string.
	for i, c := range version {
		if c == ' ' {
			version = version[:i]
			break
		}
	}
	return "PostgreSQL " + version, nil
}

type postgresqlSchema struct {
	Name string
	OID  int64
}

// postgresqlSchemas mirrors PostgreSQL.py's QuerySchemas — public/pg_catalog/
// information_schema first (in that fixed order), then every other
// user-created schema alphabetically.
func postgresqlSchemas(db *sql.DB) ([]postgresqlSchema, error) {
	rows, err := db.Query(`
		SELECT schema_name, oid
		FROM (
			SELECT schema_name, row_number() over() AS sort, oid
			FROM (
				SELECT quote_ident(nspname) AS schema_name, oid
				FROM pg_catalog.pg_namespace
				WHERE nspname IN ('public', 'pg_catalog', 'information_schema')
				ORDER BY nspname desc
			) AS x
			UNION ALL
			SELECT schema_name, 3 + row_number() over() AS sort, oid
			FROM (
				SELECT quote_ident(nspname) AS schema_name, oid
				FROM pg_catalog.pg_namespace
				WHERE nspname NOT IN ('public', 'pg_catalog', 'information_schema', 'pg_toast')
					AND nspname NOT LIKE 'pg%temp%'
				ORDER BY nspname
			) AS x
		) AS y
		ORDER BY sort
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schemas []postgresqlSchema
	for rows.Next() {
		var s postgresqlSchema
		if err := rows.Scan(&s.Name, &s.OID); err != nil {
			return nil, err
		}
		schemas = append(schemas, s)
	}
	return schemas, rows.Err()
}

type postgresqlTable struct {
	Name string
	OID  int64
}

// postgresqlTables mirrors PostgreSQL.py's QueryTables scoped to one schema
// (tree_postgresql.py always calls it that way) — the parents/children CTEs
// exclude partition child tables, which are shown nested under their parent
// instead of as top-level tables.
func postgresqlTables(db *sql.DB, schema string) ([]postgresqlTable, error) {
	rows, err := db.Query(`
		WITH parents AS (
			SELECT
				distinct quote_ident(c.relname) AS table_name,
				quote_ident(n.nspname) AS table_schema
			FROM pg_inherits AS i
			INNER JOIN pg_class AS c ON c.oid = i.inhparent
			INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
			INNER JOIN pg_class AS cc ON cc.oid = i.inhrelid
			INNER JOIN pg_namespace AS nc ON nc.oid = cc.relnamespace
			WHERE c.relkind IN ('r', 'p')
				AND quote_ident(n.nspname) = $1
		),
		children AS (
			SELECT
				distinct quote_ident(c.relname) AS table_name,
				quote_ident(n.nspname) AS table_schema
			FROM pg_inherits AS i
			INNER JOIN pg_class AS cp ON cp.oid = i.inhparent
			INNER JOIN pg_namespace AS np ON np.oid = cp.relnamespace
			INNER JOIN pg_class AS c ON c.oid = i.inhrelid
			INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
			WHERE quote_ident(n.nspname) = $1
		)
		SELECT
			quote_ident(c.relname) AS table_name,
			c.oid
		FROM pg_class AS c
		INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
		LEFT JOIN parents AS p ON p.table_name = quote_ident(c.relname)
			AND p.table_schema = quote_ident(n.nspname)
		LEFT JOIN children AS ch ON ch.table_name = quote_ident(c.relname)
			AND ch.table_schema = quote_ident(n.nspname)
		WHERE ch.table_name IS NULL
			AND c.relkind IN ('r', 'p')
			AND quote_ident(n.nspname) = $1
		ORDER BY 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []postgresqlTable
	for rows.Next() {
		var t postgresqlTable
		if err := rows.Scan(&t.Name, &t.OID); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

type postgresqlColumn struct {
	Name       string
	DataType   string
	DataLength sql.NullString
	Nullable   string
	Position   int
}

// postgresqlColumns mirrors PostgreSQL.py's QueryTablesFields for one table
// (relkind 'r'/'f'/'p' — plain, foreign, and partitioned tables), including
// the same ARRAY/USER-DEFINED/domain-unwrapping logic as the Python query.
func postgresqlColumns(db *sql.DB, schema, table string) ([]postgresqlColumn, error) {
	rows, err := db.Query(`
		SELECT
			quote_ident(a.attname) AS column_name,
			CASE WHEN t.typtype = 'd'::"char"
				THEN
					CASE
						WHEN bt.typelem <> 0::oid AND bt.typlen = '-1'::integer
							THEN 'ARRAY'::text
						WHEN nbt.nspname = 'pg_catalog'::name
							THEN format_type(t.typbasetype, NULL::integer)
							ELSE 'USER-DEFINED'::text
					END
				ELSE
					CASE
						WHEN t.typelem <> 0::oid AND t.typlen = '-1'::integer
							THEN 'ARRAY'::text
						WHEN nt.nspname = 'pg_catalog'::name
							THEN format_type(a.atttypid, NULL::integer)
							ELSE 'USER-DEFINED'::text
					END
			END AS data_type,
			CASE WHEN a.attnotnull OR t.typtype = 'd'::char AND t.typnotnull
				THEN 'NO'
				ELSE 'YES'
			END AS nullable,
			(
				SELECT
					CASE
						WHEN x.truetypmod = -1
							THEN NULL
						WHEN x.truetypid IN (1042, 1043)
							THEN x.truetypmod - 4
						WHEN x.truetypid IN (1560, 1562)
							THEN x.truetypmod
							ELSE NULL
					END
				FROM (
					SELECT
						CASE
							WHEN t.typtype = 'd'
								THEN t.typbasetype
								ELSE a.atttypid
						END AS truetypid,
						CASE
							WHEN t.typtype = 'd'
								THEN t.typtypmod
								ELSE a.atttypmod
						END AS truetypmod
				) AS x
			) AS data_length,
			a.attnum AS position
		FROM pg_attribute AS a
		INNER JOIN pg_class AS c ON c.oid = a.attrelid
		INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
		INNER JOIN (
			pg_type AS t
			INNER JOIN pg_namespace AS nt
			ON t.typnamespace = nt.oid
		) ON a.atttypid = t.oid
		LEFT JOIN (
			pg_type AS bt
			INNER JOIN pg_namespace AS nbt
			ON bt.typnamespace = nbt.oid
		) ON t.typtype = 'd'::"char" AND t.typbasetype = bt.oid
		WHERE a.attnum > 0
			AND NOT a.attisdropped
			AND c.relkind IN ('r', 'f', 'p')
			AND quote_ident(n.nspname) = $1
			AND quote_ident(c.relname) = $2
		ORDER BY a.attnum
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []postgresqlColumn
	for rows.Next() {
		var c postgresqlColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.Nullable, &c.DataLength, &c.Position); err != nil {
			return nil, err
		}
		columns = append(columns, c)
	}
	return columns, rows.Err()
}
