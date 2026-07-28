package main

import (
	"database/sql"
	"fmt"
)

// mysqlPropertiesFromRow mirrors pgPropertiesFromRow — same generic
// single-row-to-Property/Value transpose, just against a *sql.DB opened
// with the mysql driver instead of pgx.
func mysqlPropertiesFromRow(db *sql.DB, query string, args ...any) ([][2]string, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("object does not exist anymore. Please refresh the tree view")
	}

	values := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}

	out := make([][2]string, len(cols))
	for i, c := range cols {
		out[i] = [2]string{c, formatSQLValue(values[i])}
	}
	return out, nil
}

// mysqlPropertiesTable mirrors MySQL.py's/MariaDB.py's GetProperties for
// p_type == 'table'.
func mysqlPropertiesTable(db *sql.DB, schema, table string) ([][2]string, error) {
	return mysqlPropertiesFromRow(db, `
		select table_schema as "Table Schema",
			   table_name as "Table Name",
			   table_type as "Table Type",
			   engine as "Engine",
			   version as "Version",
			   row_format as "Row Format",
			   table_rows as "Table Rows",
			   avg_row_length as "Average Row Length",
			   data_length as "Data Length",
			   max_data_length as "Max Data Length",
			   index_length as "Index Length",
			   data_free as "Data Free",
			   auto_increment as "Auto Increment",
			   create_time as "Create Time",
			   update_time as "Update Time",
			   check_time as "Check Time",
			   table_collation as "Table Collaction",
			   checksum as "Checksum"
		from information_schema.tables
		where table_schema = ?
		  and table_name = ?
	`, schema, table)
}

// mysqlPropertiesView mirrors GetProperties for p_type == 'view'. The
// "Algorithm" column only exists in MariaDB's information_schema.views —
// MySQL 8 doesn't have it (confirmed against a live MySQL 8 server; this
// isn't in either Python driver file, it was an incorrect addition made
// while porting and caught by testing against a real server).
func mysqlPropertiesView(db *sql.DB, schema, view, technology string) ([][2]string, error) {
	algorithmColumn := ""
	if technology == "mariadb" {
		algorithmColumn = ",\n\t\t\t   algorithm as \"Algorithm\""
	}
	return mysqlPropertiesFromRow(db, `
		select table_schema as "View Schema",
			   table_name as "View Name",
			   check_option as "Check Option",
			   is_updatable as "Is Updatable",
			   security_type as "Security Type",
			   character_set_client as "Character Set Client",
			   collation_connection as "Collation Connection"`+algorithmColumn+`
		from information_schema.views
		where table_schema = ?
		  and table_name = ?
	`, schema, view)
}

// mysqlPropertiesRoutine mirrors GetProperties for p_type in
// ('function', 'procedure').
func mysqlPropertiesRoutine(db *sql.DB, schema, routine, routineType string) ([][2]string, error) {
	return mysqlPropertiesFromRow(db, `
		select routine_schema as "Routine Schema",
			   routine_name as "Routine Name",
			   routine_type as "Routine Type",
			   data_type as "Data Type",
			   character_maximum_length as "Character Maximum Length",
			   character_octet_length as "Character Octet Length",
			   numeric_precision as "Numeric Precision",
			   numeric_scale as "Numeric Scale",
			   datetime_precision as "Datetime Precision",
			   character_set_name as "Character Set Name",
			   collation_name as "Collation Name",
			   routine_body as "Routine Body",
			   external_name as "External Name",
			   external_language as "External Language",
			   parameter_style as "Parameter Style",
			   is_deterministic as "Is Deterministic",
			   sql_data_access as "SQL Data Access",
			   sql_path as "SQL Path",
			   security_type as "Security Type",
			   created as "Created",
			   last_altered as "Last Altered",
			   character_set_client as "Character Set Client",
			   collation_connection as "Collation Connection",
			   database_collation as "Database Collation"
		from information_schema.routines
		where routine_type = ?
		  and routine_schema = ?
		  and routine_name = ?
	`, routineType, schema, routine)
}

// mysqlDDL mirrors MySQL.py's/MariaDB.py's GetDDL — every supported kind
// resolves to a plain SHOW CREATE, same as mysqlShowCreate already does for
// views/functions/procedures.
func mysqlDDL(db *sql.DB, schema, object, kind string) (string, error) {
	colIndex := 1
	if kind == "function" || kind == "procedure" {
		colIndex = 2
	}
	return mysqlShowCreate(db, kind, schema, object, colIndex)
}
