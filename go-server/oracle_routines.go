package main

import (
	"database/sql"
	"fmt"
)

type oracleRoutine struct {
	Name string
}

// oracleFunctions mirrors QueryFunctions (only the p_schema-given branch —
// tree_oracle.py always passes an explicit schema, never p_all_schemas).
func oracleFunctions(db *sql.DB, schema string) ([]oracleRoutine, error) {
	return oracleRoutines(db, schema, "FUNCTION")
}

// oracleProcedures mirrors QueryProcedures.
func oracleProcedures(db *sql.DB, schema string) ([]oracleRoutine, error) {
	return oracleRoutines(db, schema, "PROCEDURE")
}

func oracleRoutines(db *sql.DB, schema, objectType string) ([]oracleRoutine, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("object_name")+` as name
		from all_procedures
		where object_type = :1
		  and `+oracleIdentEq("owner")+` = :2
		order by object_name
	`, objectType, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []oracleRoutine
	for rows.Next() {
		var r oracleRoutine
		if err := rows.Scan(&r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type oracleRoutineField struct {
	Type string
	Name string
}

// oracleFunctionFields mirrors QueryFunctionFields — position 0 is the
// return type row, everything else is an IN/OUT/INOUT argument.
func oracleFunctionFields(db *sql.DB, schema, function string) ([]oracleRoutineField, error) {
	rows, err := db.Query(`
		select (case in_out when 'IN' then 'I' when 'OUT' then 'O' else 'R' end) as ptype,
			   (case when position = 0 then 'return ' || data_type else argument_name || ' ' || data_type end) as name,
			   position+1 as seq
		from all_arguments
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("object_name")+` = :2
		order by seq
	`, schema, function)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOracleRoutineFields(rows)
}

// oracleProcedureFields mirrors QueryProcedureFields.
func oracleProcedureFields(db *sql.DB, schema, procedure string) ([]oracleRoutineField, error) {
	rows, err := db.Query(`
		select (case in_out when 'IN' then 'I' when 'OUT' then 'O' else 'R' end) as ptype,
			   argument_name || ' ' || data_type as name,
			   position+1 as seq
		from all_arguments
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("object_name")+` = :2
		order by seq
	`, schema, procedure)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanOracleRoutineFields(rows)
}

func scanOracleRoutineFields(rows *sql.Rows) ([]oracleRoutineField, error) {
	var out []oracleRoutineField
	for rows.Next() {
		var f oracleRoutineField
		var seq int
		if err := rows.Scan(&f.Type, &f.Name, &seq); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// oracleFunctionDefinition mirrors GetFunctionDefinition.
func oracleFunctionDefinition(db *sql.DB, function string) (string, error) {
	var ddl string
	err := db.QueryRow(`select dbms_lob.substr(dbms_metadata.get_ddl('FUNCTION', :1), 4000, 1) from dual`, function).Scan(&ddl)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("-- DROP FUNCTION %s;\n%s", function, ddl), nil
}

// oracleProcedureDefinition mirrors GetProcedureDefinition.
func oracleProcedureDefinition(db *sql.DB, procedure string) (string, error) {
	var ddl string
	err := db.QueryRow(`select dbms_lob.substr(dbms_metadata.get_ddl('PROCEDURE', :1), 4000, 1) from dual`, procedure).Scan(&ddl)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("-- DROP PROCEDURE %s;\n%s", procedure, ddl), nil
}

type oracleSequence struct {
	Name string
}

// oracleSequences mirrors QuerySequences.
func oracleSequences(db *sql.DB, schema string) ([]oracleSequence, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("sequence_name")+` as sequence_name
		from all_sequences
		where `+oracleIdentEq("sequence_owner")+` = :1
		order by sequence_owner, sequence_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []oracleSequence
	for rows.Next() {
		var s oracleSequence
		if err := rows.Scan(&s.Name); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type oracleView struct {
	Name string
}

// oracleViews mirrors QueryViews.
func oracleViews(db *sql.DB, schema string) ([]oracleView, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("view_name")+` as table_name
		from all_views
		where `+oracleIdentEq("owner")+` = :1
		order by owner, view_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []oracleView
	for rows.Next() {
		var v oracleView
		if err := rows.Scan(&v.Name); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

type oracleViewColumn struct {
	Name          string
	DataType      string
	Nullable      string
	DataLength    sql.NullString
	DataPrecision sql.NullString
	DataScale     sql.NullString
}

// oracleViewFields mirrors QueryViewFields.
func oracleViewFields(db *sql.DB, schema, view string) ([]oracleViewColumn, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("column_name")+` as column_name,
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
	`, schema, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []oracleViewColumn
	for rows.Next() {
		var c oracleViewColumn
		var columnID int
		if err := rows.Scan(&c.Name, &c.DataType, &c.Nullable, &c.DataLength, &c.DataPrecision, &c.DataScale, &columnID); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// oracleViewDefinition mirrors GetViewDefinition.
func oracleViewDefinition(db *sql.DB, schema, view string) (string, error) {
	var text string
	err := db.QueryRow(`
		select text
		from all_views
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("view_name")+` = :2
	`, schema, view).Scan(&text)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("CREATE OR REPLACE VIEW %s.%s AS\n%s\n", schema, view, text), nil
}
