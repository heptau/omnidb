package main

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	go_ora "github.com/sijms/go-ora/v2"
)

// oracleIdentEq mirrors the "(case when upper(replace(x, ' ', ”)) <> x then
// '"' || x || '"' else x end)" expression Oracle.py wraps around nearly
// every identifier column — Oracle uppercases unquoted identifiers, so this
// is how the driver tells "needs its original mixed/lower case preserved
// with quotes" apart from "plain uppercase, display as-is". Every p_schema/
// p_table/... value coming from the frontend is already in this same
// display form (it was produced by this exact expression in an earlier
// SELECT), so filters compare the expression directly against the bind
// parameter rather than against the raw column.
func oracleIdentEq(column string) string {
	return fmt.Sprintf("(case when upper(replace(%s, ' ', '')) <> %s then '\"' || %s || '\"' else %s end)", column, column, column, column)
}

// openOracleTarget opens a connection to the user's saved Oracle database via
// go-ora, a pure-Go driver — no Oracle Instant Client dependency, unlike the
// cx_Oracle/python-oracledb driver the Django app relies on today. info.Database
// holds the Oracle service name (what Oracle.py calls p_service).
func openOracleTarget(info *ConnectionInfo) (*sql.DB, error) {
	port := 1521
	if info.Port != "" {
		if p, err := strconv.Atoi(info.Port); err == nil {
			port = p
		}
	}
	dsn := go_ora.BuildUrl(info.Server, port, info.Database, info.Username, info.Password, nil)
	db, err := sql.Open("oracle", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// oracleVersion mirrors Oracle.py's GetVersion.
func oracleVersion(db *sql.DB) (string, error) {
	var version string
	err := db.QueryRow(`
		select (case when product like '%Express%' then 'Oracle XE ' else 'Oracle ' end) || version
		from product_component_version
		where product like 'Oracle%'
	`).Scan(&version)
	return version, err
}

// oracleUserSuper mirrors GetUserSuper — it's a capability probe (can this
// user see v$session at all), not a real "is DBA" check, same as the Python
// original.
func oracleUserSuper(db *sql.DB) bool {
	var dummy int
	err := db.QueryRow(`select 1 from v$session where rownum <= 1`).Scan(&dummy)
	return err == nil
}

// oracleExpress mirrors GetExpress.
func oracleExpress(db *sql.DB) (bool, error) {
	var dummy int
	err := db.QueryRow(`select 1 from product_component_version where product like '%Express%' and rownum <= 1`).Scan(&dummy)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

type oracleTable struct {
	Name string
}

// oracleTables mirrors QueryTables scoped to one schema (tree_oracle.py
// always calls it that way).
func oracleTables(db *sql.DB, schema string) ([]oracleTable, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("table_name")+` as table_name
		from all_tables
		where `+oracleIdentEq("owner")+` = :1
		order by owner, table_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []oracleTable
	for rows.Next() {
		var t oracleTable
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

type oracleColumn struct {
	Name          string
	DataType      string
	Nullable      string
	DataLength    sql.NullString
	DataPrecision sql.NullString
	DataScale     sql.NullString
}

// oracleColumns mirrors QueryTablesFields for one table.
func oracleColumns(db *sql.DB, schema, table string) ([]oracleColumn, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("table_name")+` as table_name,
			   `+oracleIdentEq("column_name")+` as column_name,
			   case when data_type = 'NUMBER' and data_scale = '0' then 'INTEGER' else data_type end as data_type,
			   case nullable when 'Y' then 'YES' else 'NO' end as nullable,
			   data_length,
			   data_precision,
			   data_scale,
			   column_id
		from all_tab_columns
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("table_name")+` = :2
		order by table_name, column_id
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []oracleColumn
	for rows.Next() {
		var c oracleColumn
		var tableName string
		var columnID int
		if err := rows.Scan(&tableName, &c.Name, &c.DataType, &c.Nullable, &c.DataLength, &c.DataPrecision, &c.DataScale, &columnID); err != nil {
			return nil, err
		}
		columns = append(columns, c)
	}
	return columns, rows.Err()
}

// oracleRoles mirrors QueryRoles.
func oracleRoles(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`
		select ` + oracleIdentEq("username") + ` as role_name
		from all_users
		order by username
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

// oracleTablespaces mirrors QueryTablespaces.
func oracleTablespaces(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`
		select ` + oracleIdentEq("tablespace_name") + ` as tablespace_name
		from dba_tablespaces
		order by tablespace_name
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

// oracleServiceUpper mirrors GetName's "return self.v_service" — the service
// name Oracle.py stores upper-cased at connection time.
func oracleServiceUpper(service string) string {
	return strings.ToUpper(service)
}
