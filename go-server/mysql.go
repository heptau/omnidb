package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

// openMySQLTarget opens a connection to the user's saved MySQL/MariaDB
// database — both engines are wire-compatible and served by the same Go
// driver, so there's a single connection helper for both technologies. Each
// request gets its own short-lived connection, same rationale as
// openPostgreSQLTarget.
func openMySQLTarget(info *ConnectionInfo) (*sql.DB, error) {
	port := info.Port
	if port == "" {
		port = "3306"
	}
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=false",
		info.Username, info.Password, info.Server, port, info.Database)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// mysqlVersionPrefix mirrors MySQL.py's/MariaDB.py's GetVersion — same
// "select version()" call, just a different display prefix per engine.
func mysqlVersionPrefix(technology string) string {
	if technology == "mariadb" {
		return "MariaDB "
	}
	return "MySQL "
}

// mysqlVersion mirrors GetVersion for both engines.
func mysqlVersion(db *sql.DB, technology string) (string, error) {
	var version string
	if err := db.QueryRow(`select version()`).Scan(&version); err != nil {
		return "", err
	}
	return mysqlVersionPrefix(technology) + version, nil
}

type mysqlTable struct {
	Name string
}

// mysqlTables mirrors MySQL.py's/MariaDB.py's QueryTables scoped to one
// schema (tree_mysql.py always calls it that way).
func mysqlTables(db *sql.DB, schema string) ([]mysqlTable, error) {
	rows, err := db.Query(`
		select table_name
		from information_schema.tables
		where table_type in ('BASE TABLE', 'SYSTEM VIEW')
		  and table_schema = ?
		order by table_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []mysqlTable
	for rows.Next() {
		var t mysqlTable
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

type mysqlColumn struct {
	Name       string
	DataType   string
	Nullable   string
	DataLength sql.NullString
}

// mysqlColumns mirrors MySQL.py's/MariaDB.py's QueryTablesFields for one
// table (relies on table_type IN ('BASE TABLE', 'SYSTEM VIEW') the same way
// the Python query does — views use mysqlViewColumns instead).
func mysqlColumns(db *sql.DB, schema, table string) ([]mysqlColumn, error) {
	rows, err := db.Query(`
		select distinct c.column_name,
			   c.data_type,
			   c.is_nullable,
			   c.character_maximum_length,
			   c.ordinal_position
		from information_schema.columns c,
			 information_schema.tables t
		where t.table_name = c.table_name
		  and t.table_schema = c.table_schema
		  and t.table_type in ('BASE TABLE', 'SYSTEM VIEW')
		  and t.table_schema = ?
		  and t.table_name = ?
		order by c.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []mysqlColumn
	for rows.Next() {
		var c mysqlColumn
		var ordinal int
		if err := rows.Scan(&c.Name, &c.DataType, &c.Nullable, &c.DataLength, &ordinal); err != nil {
			return nil, err
		}
		columns = append(columns, c)
	}
	return columns, rows.Err()
}

// mysqlDatabases mirrors MySQL.py's/MariaDB.py's QueryDatabases.
func mysqlDatabases(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`show databases`)
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

// mariadbSequences mirrors MariaDB.py's QuerySequences — MariaDB-only
// (MySQL has no sequence concept at all, unlike every other object kind in
// this file, which is why this isn't dispatched through the shared
// mysql/mariadb suffix loop in main.go). Confirmed broken in the current
// Django source, not just unported: get_sequences_mariadb's view function
// only declares `request` but is wrapped by @database_required, which
// always calls it with a second v_database argument — every real call
// would 500 with a TypeError, independent of this migration. schema empty
// means "the connection's own database" (Python's self.v_schema fallback,
// always exercised in practice since tree_mariadb.js's
// getSequencesMariadb always sends p_schema: null), matched here with
// MariaDB's own database() function instead of needing the caller to pass
// the connection's database through separately.
func mariadbSequences(db *sql.DB, schema string) ([]string, error) {
	filter := "table_schema = database()"
	var args []any
	if schema != "" {
		filter = "table_schema = ?"
		args = append(args, schema)
	}
	rows, err := db.Query(`
		select table_name
		from information_schema.tables
		where table_type = 'SEQUENCE' and `+filter+`
		order by table_schema, table_name
	`, args...)
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

// mysqlRoles mirrors MySQL.py's/MariaDB.py's QueryRoles.
func mysqlRoles(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`
		select concat('''', user, '''', '@', '''', host, '''') as role_name
		from mysql.user
		order by role_name
	`)
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
