package main

import (
	"database/sql"
	"net/url"

	_ "github.com/microsoft/go-mssqldb"
)

func isMSSQL(technology string) bool {
	return technology == "mssql"
}

// openMSSQLTarget opens a connection to the user's saved SQL Server database,
// same one-connection-per-request shape as openPostgreSQLTarget/
// openOracleTarget.
func openMSSQLTarget(info *ConnectionInfo) (*sql.DB, error) {
	db, err := sql.Open("sqlserver", mssqlDSN(info))
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// mssqlDSN builds the connection string opened above, mirroring
// postgresqlDSN's ConnString-vs-discrete-fields precedence (see that
// function's comment for the full rationale — same applies here verbatim).
// Unlike postgres/mysql, go-mssqldb's sqlserver:// URLs carry the database
// name as a query parameter rather than the URL path.
func mssqlDSN(info *ConnectionInfo) string {
	if info.Server == "" && info.ConnString != "" {
		if info.Database == "" {
			return info.ConnString
		}
		if u, err := url.Parse(info.ConnString); err == nil {
			q := u.Query()
			q.Set("database", info.Database)
			u.RawQuery = q.Encode()
			return u.String()
		}
		return info.ConnString
	}
	port := info.Port
	if port == "" {
		port = "1433"
	}
	dsn := url.URL{
		Scheme:   "sqlserver",
		User:     url.UserPassword(info.Username, info.Password),
		Host:     info.Server + ":" + port,
		RawQuery: "database=" + url.QueryEscape(info.Database) + "&encrypt=disable",
	}
	return dsn.String()
}

// mssqlVersion mirrors PostgreSQL.py's GetVersion — @@VERSION returns a
// multi-line banner ("Microsoft SQL Server 2022 (RTM) - 16.0.1000.6 ...\n\tOn
// Linux ..."), so keep only the first line.
func mssqlVersion(db *sql.DB) (string, error) {
	var version string
	if err := db.QueryRow(`select @@VERSION`).Scan(&version); err != nil {
		return "", err
	}
	for i, c := range version {
		if c == '\n' || c == '\r' {
			version = version[:i]
			break
		}
	}
	return version, nil
}

// mssqlUserSuper is a capability probe (member of the sysadmin fixed server
// role), same "not really is-DBA, just a permission probe" semantics as
// oracleUserSuper/postgresqlUserSuper.
func mssqlUserSuper(db *sql.DB) bool {
	var dummy int
	err := db.QueryRow(`select 1 where is_srvrolemember('sysadmin') = 1`).Scan(&dummy)
	return err == nil
}

type mssqlSchema struct {
	Name string
}

// mssqlSchemas lists user schemas, excluding the built-in system/guest ones
// nobody wants cluttering the tree — same filtering intent as
// postgresqlSchemas excluding pg_catalog/information_schema, though MSSQL's
// list of built-ins is longer (one per fixed database role, e.g. db_owner).
func mssqlSchemas(db *sql.DB) ([]mssqlSchema, error) {
	rows, err := db.Query(`
		select name
		from sys.schemas
		where name not in ('sys', 'INFORMATION_SCHEMA', 'guest')
		  and name not like 'db[_]%'
		order by name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schemas []mssqlSchema
	for rows.Next() {
		var s mssqlSchema
		if err := rows.Scan(&s.Name); err != nil {
			return nil, err
		}
		schemas = append(schemas, s)
	}
	return schemas, rows.Err()
}

type mssqlTable struct {
	Name string
}

// mssqlTables mirrors oracleTables/postgresqlTables scoped to one schema.
func mssqlTables(db *sql.DB, schema string) ([]mssqlTable, error) {
	rows, err := db.Query(`
		select t.name
		from sys.tables t
		join sys.schemas s on s.schema_id = t.schema_id
		where s.name = @p1
		order by t.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []mssqlTable
	for rows.Next() {
		var t mssqlTable
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

type mssqlColumn struct {
	Name         string
	DataType     string
	MaxLength    int64
	Precision    int64
	Scale        int64
	Nullable     string
	DefaultValue sql.NullString
}

// mssqlColumns mirrors oracleColumns/postgresqlColumns for one table —
// sys.columns joined to sys.types (via user_type_id, so both built-in and
// user-defined/alias types resolve to their real name) and, left-joined, the
// column's own default constraint definition text (NULL when the column has
// no default).
func mssqlColumns(db *sql.DB, schema, table string) ([]mssqlColumn, error) {
	rows, err := db.Query(`
		select c.name,
		       ty.name as data_type,
		       c.max_length,
		       c.precision,
		       c.scale,
		       case when c.is_nullable = 1 then 'YES' else 'NO' end as nullable,
		       dc.definition as default_value
		from sys.columns c
		join sys.tables t on t.object_id = c.object_id
		join sys.schemas s on s.schema_id = t.schema_id
		join sys.types ty on ty.user_type_id = c.user_type_id
		left join sys.default_constraints dc
		       on dc.parent_object_id = c.object_id and dc.parent_column_id = c.column_id
		where s.name = @p1 and t.name = @p2
		order by c.column_id
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []mssqlColumn
	for rows.Next() {
		var c mssqlColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.MaxLength, &c.Precision, &c.Scale, &c.Nullable, &c.DefaultValue); err != nil {
			return nil, err
		}
		columns = append(columns, c)
	}
	return columns, rows.Err()
}

// mssqlDatabases lists user databases, skipping the four fixed system
// databases (master/tempdb/model/msdb always occupy database_id 1-4) — used
// by console_meta.go's \l, the one meta-command where MSSQL behaves like
// Postgres (multiple databases per server) rather than Oracle (one database
// per instance/service).
func mssqlDatabases(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`select name from sys.databases where database_id > 4 order by name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
