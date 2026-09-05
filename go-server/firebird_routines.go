package main

import "database/sql"

// firebirdRoutine mirrors mssqlRoutine/oracleRoutine.
type firebirdRoutine struct {
	Name string
}

// firebirdFunctions mirrors mssqlFunctions. Firebird 3+ unifies external
// UDFs and PSQL (SQL-body) functions into a single rdb$functions catalog
// (older Firebird's separate rdb$functions-is-UDFs-only / no PSQL functions
// split predates every version this port targets), so — unlike mssql's
// three-way FN/IF/TF type filter — there's just one rdb$system_flag = 0
// filter here.
func firebirdFunctions(db *sql.DB) ([]firebirdRoutine, error) {
	rows, err := db.Query(`
		select trim(rdb$function_name) as name
		from rdb$functions
		where rdb$system_flag = 0
		order by rdb$function_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFirebirdRoutines(rows)
}

// firebirdProcedures mirrors mssqlProcedures.
func firebirdProcedures(db *sql.DB) ([]firebirdRoutine, error) {
	rows, err := db.Query(`
		select trim(rdb$procedure_name) as name
		from rdb$procedures
		where rdb$system_flag = 0
		order by rdb$procedure_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFirebirdRoutines(rows)
}

func scanFirebirdRoutines(rows *sql.Rows) ([]firebirdRoutine, error) {
	var out []firebirdRoutine
	for rows.Next() {
		var r firebirdRoutine
		if err := rows.Scan(&r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// firebirdRoutineField mirrors mssqlRoutineField's field names/shape — Type
// holds the parameter's resolved SQL data type, Name its bare name, no
// direction marker (see this function's own comment below for why).
type firebirdRoutineField struct {
	Type string
	Name string
}

// firebirdFunctionFields mirrors oracleFunctionFields more than
// mssqlFunctionFields: unlike sys.parameters (MSSQL), which carries no
// return-value row at all for a scalar function, rdb$function_arguments
// *does* have one (rdb$argument_position = 0), the same "position 0 is the
// special one" shape as Oracle's ALL_ARGUMENTS — so this filters
// rdb$argument_position > 0 to keep only the real input parameters, mirroring
// how oracleFunctionFields special-cases Oracle's own position-0 row rather
// than mssqlFunctionFields' "every row is real" comment (which doesn't apply
// here). This port's routine-field struct still carries no IN/OUT direction
// marker of its own, matching mssqlRoutineField's depth rather than
// Oracle's I/O/R letter — Firebird PSQL parameters have no direction either
// (a PSQL function's parameters are always input; only its RETURNS clause,
// already excluded here, produces a value).
func firebirdFunctionFields(db *sql.DB, function string) ([]firebirdRoutineField, error) {
	rows, err := db.Query(`
		select trim(fa.rdb$argument_name) as name, f.rdb$field_type, coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0), coalesce(f.rdb$field_precision, 0), coalesce(f.rdb$field_scale, 0)
		from rdb$function_arguments fa
		join rdb$fields f on f.rdb$field_name = fa.rdb$field_source
		where trim(fa.rdb$function_name) = ? and fa.rdb$argument_position > 0
		order by fa.rdb$argument_position
	`, function)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFirebirdRoutineFields(rows)
}

// firebirdProcedureFields mirrors mssqlProcedureFields. rdb$procedure_parameters
// has no return-value row the way rdb$function_arguments does (a procedure's
// output parameters are just rows with rdb$parameter_type = 1, ordered
// alongside the input ones by rdb$parameter_number within their own type),
// so — unlike firebirdFunctionFields above — there's no position/type filter
// needed here, only the ordering: input parameters (0) before output ones
// (1), matching the order CREATE PROCEDURE's own parameter list and RETURNS
// clause appear in.
func firebirdProcedureFields(db *sql.DB, procedure string) ([]firebirdRoutineField, error) {
	rows, err := db.Query(`
		select trim(pp.rdb$parameter_name) as name, f.rdb$field_type, coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0), coalesce(f.rdb$field_precision, 0), coalesce(f.rdb$field_scale, 0)
		from rdb$procedure_parameters pp
		join rdb$fields f on f.rdb$field_name = pp.rdb$field_source
		where trim(pp.rdb$procedure_name) = ?
		order by pp.rdb$parameter_type, pp.rdb$parameter_number
	`, procedure)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFirebirdRoutineFields(rows)
}

func scanFirebirdRoutineFields(rows *sql.Rows) ([]firebirdRoutineField, error) {
	var out []firebirdRoutineField
	for rows.Next() {
		var f firebirdRoutineField
		var name sql.NullString
		var fieldType, subType int
		var length, precision, scale int64
		if err := rows.Scan(&name, &fieldType, &subType, &length, &precision, &scale); err != nil {
			return nil, err
		}
		if name.Valid && name.String != "" {
			f.Name = name.String
		} else {
			f.Name = "(unnamed)"
		}
		f.Type = firebirdColumnTypeDDL(firebirdColumn{DataType: firebirdSQLTypeName(fieldType, subType), Length: length, Precision: precision, Scale: scale})
		out = append(out, f)
	}
	return out, rows.Err()
}

// firebirdFunctionDefinition mirrors mssqlFunctionDefinition's role, but
// returns body-only text, not a full verbatim CREATE statement: unlike
// MSSQL's OBJECT_DEFINITION()/Oracle's DBMS_METADATA.GET_DDL (both of which
// hand back the complete original CREATE text), Firebird's
// rdb$function_source only ever stores the function's *body* — everything
// after its parameter list and RETURNS clause — because that's genuinely
// all the engine keeps; the signature itself has to be reconstructed from
// rdb$function_arguments/rdb$fields, which is what firebirdFunctionDDL
// (firebird_ddl.go) does for the Properties/DDL tab. This function backs
// only the tree's "Edit Function" action (open the body text in a query
// tab), same limited scope sqliteDDL's raw `sql` passthrough has.
func firebirdFunctionDefinition(db *sql.DB, function string) (string, error) {
	return firebirdRoutineSource(db, `select rdb$function_source from rdb$functions where trim(rdb$function_name) = ?`, function)
}

// firebirdProcedureDefinition mirrors firebirdFunctionDefinition's own
// comment — body-only text from rdb$procedure_source.
func firebirdProcedureDefinition(db *sql.DB, procedure string) (string, error) {
	return firebirdRoutineSource(db, `select rdb$procedure_source from rdb$procedures where trim(rdb$procedure_name) = ?`, procedure)
}

// firebirdViewDefinition mirrors firebirdFunctionDefinition's own comment —
// rdb$view_source holds only the view's SELECT statement, not a full
// "CREATE VIEW name (columns) AS" header (see firebirdViewDDL,
// firebird_ddl.go, for the reconstructed version used by the Properties/DDL
// tab).
func firebirdViewDefinition(db *sql.DB, view string) (string, error) {
	return firebirdRoutineSource(db, `select rdb$view_source from rdb$relations where trim(rdb$relation_name) = ?`, view)
}

func firebirdRoutineSource(db *sql.DB, query, name string) (string, error) {
	var source sql.NullString
	if err := db.QueryRow(query, name).Scan(&source); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	if !source.Valid {
		return "", nil
	}
	return source.String, nil
}

// firebirdView mirrors mssqlView.
type firebirdView struct {
	Name string
}

// firebirdViews mirrors mssqlViews — see firebirdTables' own comment on
// rdb$view_blr being the null/not-null distinguisher between a table and a
// view.
func firebirdViews(db *sql.DB) ([]firebirdView, error) {
	rows, err := db.Query(`
		select trim(rdb$relation_name) as name
		from rdb$relations
		where rdb$system_flag = 0 and rdb$view_blr is not null
		order by rdb$relation_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []firebirdView
	for rows.Next() {
		var v firebirdView
		if err := rows.Scan(&v.Name); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
