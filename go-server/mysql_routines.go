package main

import (
	"database/sql"
	"fmt"
	"strings"
)

type mysqlView struct {
	Name string
}

// mysqlViews mirrors MySQL.py's/MariaDB.py's QueryViews scoped to one
// schema.
func mysqlViews(db *sql.DB, schema string) ([]mysqlView, error) {
	rows, err := db.Query(`
		select table_name
		from information_schema.views
		where table_schema = ?
		order by table_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []mysqlView
	for rows.Next() {
		var v mysqlView
		if err := rows.Scan(&v.Name); err != nil {
			return nil, err
		}
		views = append(views, v)
	}
	return views, rows.Err()
}

type mysqlViewColumn struct {
	Name       string
	DataType   string
	DataLength sql.NullString
}

// mysqlViewColumns mirrors QueryViewFields.
func mysqlViewColumns(db *sql.DB, schema, view string) ([]mysqlViewColumn, error) {
	rows, err := db.Query(`
		select distinct c.column_name,
			   c.data_type,
			   c.character_maximum_length,
			   c.ordinal_position
		from information_schema.columns c,
			 information_schema.tables t
		where t.table_name = c.table_name
		  and t.table_schema = c.table_schema
		  and t.table_type = 'VIEW'
		  and t.table_schema = ?
		  and t.table_name = ?
		order by c.ordinal_position
	`, schema, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []mysqlViewColumn
	for rows.Next() {
		var c mysqlViewColumn
		var ordinal int
		if err := rows.Scan(&c.Name, &c.DataType, &c.DataLength, &ordinal); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// mysqlViewDefinition mirrors GetViewDefinition — MySQL/MariaDB reconstruct
// DDL natively via SHOW CREATE, same trick GetDDL uses for everything else.
// schema/view are verified against the catalog inside mysqlShowCreate
// itself, right before the query that uses them — see its comment.
func mysqlViewDefinition(db *sql.DB, schema, view string) (string, error) {
	return mysqlShowCreate(db, "view", schema, view, 1)
}

type mysqlRoutine struct {
	Name string
}

// mysqlFunctions mirrors QueryFunctions.
func mysqlFunctions(db *sql.DB, schema string) ([]mysqlRoutine, error) {
	return mysqlRoutines(db, schema, "FUNCTION")
}

// mysqlProcedures mirrors QueryProcedures.
func mysqlProcedures(db *sql.DB, schema string) ([]mysqlRoutine, error) {
	return mysqlRoutines(db, schema, "PROCEDURE")
}

func mysqlRoutines(db *sql.DB, schema, routineType string) ([]mysqlRoutine, error) {
	rows, err := db.Query(`
		select t.routine_name
		from information_schema.routines t
		where t.routine_type = ?
		  and t.routine_schema = ?
		order by t.routine_name
	`, routineType, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []mysqlRoutine
	for rows.Next() {
		var r mysqlRoutine
		if err := rows.Scan(&r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type mysqlRoutineField struct {
	Name string
	Type string
}

// mysqlFunctionFields mirrors QueryFunctionFields — the return type comes
// first (type "O", matching the Python query's UNION), then IN/OUT/INOUT
// parameters in declared order.
//
// `order by seq` (ascending), not `desc` — seq is 0 for the return-type
// row and ordinal_position+1 (ascending as declared) for each parameter;
// `desc` reversed this to emit the last-declared parameter first and the
// return type dead last, the opposite of what this comment always
// claimed. mysqlProcedureFields below had the identical copy-paste
// inversion; Oracle's equivalents (oracle_routines.go) use plain ascending
// `order by seq` and were the tell this was a mistake, not intentional.
func mysqlFunctionFields(db *sql.DB, schema, function string) ([]mysqlRoutineField, error) {
	rows, err := db.Query(`
		select 'O' as ptype, concat('returns ', t.data_type) as name, 0 as seq
		from information_schema.routines t
		where t.routine_type = 'FUNCTION'
		  and t.routine_schema = ?
		  and t.specific_name = ?
		union
		select (case t.parameter_mode when 'IN' then 'I' when 'OUT' then 'O' else 'R' end) as ptype,
			   concat(t.parameter_name, ' ', t.data_type) as name,
			   t.ordinal_position + 1 as seq
		from information_schema.parameters t
		where t.ordinal_position > 0
		  and t.specific_schema = ?
		  and t.specific_name = ?
		order by seq
	`, schema, function, schema, function)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRoutineFields(rows)
}

// mysqlProcedureFields mirrors QueryProcedureFields.
func mysqlProcedureFields(db *sql.DB, schema, procedure string) ([]mysqlRoutineField, error) {
	rows, err := db.Query(`
		select (case t.parameter_mode when 'IN' then 'I' when 'OUT' then 'O' else 'R' end) as ptype,
			   concat(t.parameter_name, ' ', t.data_type) as name,
			   t.ordinal_position + 1 as seq
		from information_schema.parameters t
		where t.specific_schema = ?
		  and t.specific_name = ?
		order by seq
	`, schema, procedure)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRoutineFields(rows)
}

func scanRoutineFields(rows *sql.Rows) ([]mysqlRoutineField, error) {
	var out []mysqlRoutineField
	for rows.Next() {
		var f mysqlRoutineField
		var seq int
		if err := rows.Scan(&f.Type, &f.Name, &seq); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// mysqlFunctionDefinition mirrors GetFunctionDefinition. function isn't
// verified here (see mysqlShowCreate's comment for why) — the DROP FUNCTION
// comment line uses the raw request value same as Python did, cosmetic only.
func mysqlFunctionDefinition(db *sql.DB, schema, function string) (string, error) {
	body, err := mysqlShowCreate(db, "function", schema, function, 2)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("--DROP FUNCTION %s;\n%s", function, body), nil
}

// mysqlProcedureDefinition mirrors GetProcedureDefinition.
func mysqlProcedureDefinition(db *sql.DB, schema, procedure string) (string, error) {
	body, err := mysqlShowCreate(db, "procedure", schema, procedure, 2)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("--DROP PROCEDURE %s;\n%s", procedure, body), nil
}

// mysqlVerifiedSchemaRoutine is mysqlVerifiedSchemaTable's counterpart for
// functions/procedures — confirms schema/routine refer to a real routine of
// the given type via a parameterized information_schema.routines lookup and
// returns the catalog's own copy of both strings, for the same reason
// verifiedSchemaTable's doc comment (schema_table_ref.go) gives.
func mysqlVerifiedSchemaRoutine(db *sql.DB, schema, routine, routineType string) (string, string, error) {
	var s, r string
	err := db.QueryRow(`
		select routine_schema, routine_name from information_schema.routines
		where routine_type = ? and routine_schema = ? and routine_name = ?
	`, routineType, schema, routine).Scan(&s, &r)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return s, r, err
}

// mysqlShowCreate runs "SHOW CREATE <kind> <schema>.<object>" and returns
// the column at colIndex (0-based) — MySQL.py's own GetDDL/GetViewDefinition/
// GetFunctionDefinition/GetProcedureDefinition all just index into
// SHOW CREATE's result columns directly (column 1 for tables/views, column
// 2 for functions/procedures, which also return a "Create Function" style
// header column first).
//
// schema/object are verified against the catalog right here, immediately
// before the query that uses them, rather than by a caller — SHOW CREATE
// has no bind-parameter form for its target, so quoteMySQLIdent's escaping
// is the only thing standing between a request-controlled schema/object and
// this query text otherwise. Verifying (and using the catalog's own
// returned copy) in the same function as the sink mirrors
// sqliteVerifiedTableName/postgresVerifiedRoleName's proven pattern
// (sqlite_constraints.go/postgresql_serverlevel.go) — doing the lookup one
// function away, in each caller, left this exact sink still flagged.
func mysqlShowCreate(db *sql.DB, kind, schema, object string, colIndex int) (string, error) {
	var vSchema, vObject string
	var err error
	switch kind {
	case "table", "view":
		vSchema, vObject, err = mysqlVerifiedSchemaTable(db, schema, object)
	case "function", "procedure":
		routineType := "FUNCTION"
		if kind == "procedure" {
			routineType = "PROCEDURE"
		}
		vSchema, vObject, err = mysqlVerifiedSchemaRoutine(db, schema, object, routineType)
	default:
		return "", fmt.Errorf("unsupported SHOW CREATE kind: %q", kind)
	}
	if err != nil {
		return "", err
	}
	if vObject == "" {
		return "", fmt.Errorf("object %s.%s does not exist anymore. Please refresh the tree view", schema, object)
	}

	rows, err := db.Query(fmt.Sprintf("show create %s %s.%s", kind, quoteMySQLIdent(vSchema), quoteMySQLIdent(vObject)))
	if err != nil {
		return "", err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return "", err
	}
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return "", err
		}
		return "", fmt.Errorf("object %s.%s does not exist anymore. Please refresh the tree view", schema, object)
	}

	values := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return "", err
	}
	if colIndex >= len(values) {
		return "", fmt.Errorf("unexpected SHOW CREATE %s result shape", kind)
	}
	return formatSQLValue(values[colIndex]), nil
}

// quoteMySQLIdent backtick-quotes an identifier for use in statements that
// don't accept bound parameters (SHOW CREATE doesn't). Schema/table names
// reaching this function already came from our own introspection routes,
// which never contain backticks, but escape defensively anyway.
func quoteMySQLIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}
