package main

import "database/sql"

// mssqlRoutine mirrors oracleRoutine.
type mssqlRoutine struct {
	Name string
}

// mssqlFunctions mirrors oracleFunctions — sys.objects' o.type is 'FN'
// (scalar function), 'IF' (inline table-valued) or 'TF' (multi-statement
// table-valued); all three show up as "functions" in the tree, same as
// Oracle's ALL_PROCEDURES OBJECT_TYPE = 'FUNCTION' bucket.
func mssqlFunctions(db *sql.DB, schema string) ([]mssqlRoutine, error) {
	rows, err := db.Query(`
		select o.name
		from sys.objects o
		join sys.schemas s on s.schema_id = o.schema_id
		where s.name = @p1 and o.type in ('FN', 'IF', 'TF')
		order by o.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMSSQLRoutines(rows)
}

// mssqlProcedures mirrors oracleProcedures.
func mssqlProcedures(db *sql.DB, schema string) ([]mssqlRoutine, error) {
	rows, err := db.Query(`
		select o.name
		from sys.objects o
		join sys.schemas s on s.schema_id = o.schema_id
		where s.name = @p1 and o.type = 'P'
		order by o.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMSSQLRoutines(rows)
}

func scanMSSQLRoutines(rows *sql.Rows) ([]mssqlRoutine, error) {
	var out []mssqlRoutine
	for rows.Next() {
		var r mssqlRoutine
		if err := rows.Scan(&r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// mssqlRoutineField mirrors oracleRoutineField's field names — unlike
// ALL_ARGUMENTS, sys.parameters carries no IN/OUT/return marker this port
// surfaces (see mssqlRoutineFields below), so Type here holds the
// parameter's data type rather than Oracle's I/O/R direction letter; Name is
// just the bare parameter name rather than Oracle's combined "name TYPE"
// string, since the type already has its own column.
type mssqlRoutineField struct {
	Type string
	Name string
}

// mssqlFunctionFields mirrors oracleFunctionFields's parameter introspection.
// Unlike ALL_ARGUMENTS, sys.parameters has no dedicated "this is the return
// value" row for scalar functions, so there's nothing equivalent to Oracle's
// position=0 special case here — every row is a real parameter.
func mssqlFunctionFields(db *sql.DB, schema, function string) ([]mssqlRoutineField, error) {
	return mssqlRoutineFields(db, schema, function)
}

// mssqlProcedureFields mirrors oracleProcedureFields.
func mssqlProcedureFields(db *sql.DB, schema, procedure string) ([]mssqlRoutineField, error) {
	return mssqlRoutineFields(db, schema, procedure)
}

func mssqlRoutineFields(db *sql.DB, schema, name string) ([]mssqlRoutineField, error) {
	rows, err := db.Query(`
		select p.name, ty.name as data_type
		from sys.parameters p
		join sys.objects o on o.object_id = p.object_id
		join sys.schemas s on s.schema_id = o.schema_id
		join sys.types ty on ty.user_type_id = p.user_type_id
		where s.name = @p1 and o.name = @p2
		order by p.parameter_id
	`, schema, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []mssqlRoutineField
	for rows.Next() {
		var f mssqlRoutineField
		if err := rows.Scan(&f.Name, &f.Type); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// mssqlFunctionDefinition mirrors oracleFunctionDefinition — OBJECT_DEFINITION
// returns NULL when the object doesn't exist or the caller lacks VIEW
// DEFINITION permission; that comes back as an empty string, same "no rows /
// no permission collapses to empty text" handling as
// oracleFunctionDefinition's underlying dbms_metadata.get_ddl call, which
// simply surfaces whatever Oracle itself returns (an error, in that case) —
// here NULL isn't an error, so it's mapped to "" rather than invented text.
func mssqlFunctionDefinition(db *sql.DB, schema, function string) (string, error) {
	return mssqlObjectDefinition(db, schema, function)
}

// mssqlProcedureDefinition mirrors oracleProcedureDefinition.
func mssqlProcedureDefinition(db *sql.DB, schema, procedure string) (string, error) {
	return mssqlObjectDefinition(db, schema, procedure)
}

// mssqlViewDefinition mirrors oracleViewDefinition, but via OBJECT_DEFINITION
// like the routines above rather than a catalog TEXT column — sys.views has
// no equivalent of ALL_VIEWS.TEXT, OBJECT_DEFINITION is the standard way to
// get a view's verbatim CREATE VIEW text back from SQL Server.
func mssqlViewDefinition(db *sql.DB, schema, view string) (string, error) {
	return mssqlObjectDefinition(db, schema, view)
}

func mssqlObjectDefinition(db *sql.DB, schema, name string) (string, error) {
	var definition sql.NullString
	err := db.QueryRow(`
		select OBJECT_DEFINITION(OBJECT_ID(QUOTENAME(@p1) + '.' + QUOTENAME(@p2)))
	`, schema, name).Scan(&definition)
	if err != nil {
		return "", err
	}
	if !definition.Valid {
		return "", nil
	}
	return definition.String, nil
}

// mssqlView mirrors oracleView.
type mssqlView struct {
	Name string
}

// mssqlViews mirrors oracleViews.
func mssqlViews(db *sql.DB, schema string) ([]mssqlView, error) {
	rows, err := db.Query(`
		select v.name
		from sys.views v
		join sys.schemas s on s.schema_id = v.schema_id
		where s.name = @p1
		order by v.name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []mssqlView
	for rows.Next() {
		var v mssqlView
		if err := rows.Scan(&v.Name); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
