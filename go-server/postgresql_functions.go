package main

import (
	"database/sql"
	"strconv"
	"strings"
)

// This file mirrors tree_postgresql.py's function/procedure/aggregate
// surface — part of Fáze 8a's PostgreSQL long-tail port. "Debug" here
// (GetFunctionDebug/GetProcedureDebug) is NOT the real PostgreSQL debugger
// feature (that's polling.py's thread_debug, an entirely separate,
// stateful, session-scoped subsystem driven by an externally-installed
// 'omnidb' extension with no source in this repo — deliberately out of
// scope, unrelated to this file) — it's just a plain "select prosrc" raw
// source-body fetch, confirmed by reading PostgreSQL.py directly.

type postgresqlRoutine struct {
	ID     string
	Name   string
	Schema string
	OID    int64
}

func postgresqlRoutinesByKind(db *sql.DB, schema, prokind string, excludeReturnTypes ...string) ([]postgresqlRoutine, error) {
	query := `
		select quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' as id,
		       quote_ident(p.proname) as name,
		       quote_ident(n.nspname) as schema_name,
		       p.oid as function_oid
		from pg_proc p
		join pg_namespace n on p.pronamespace = n.oid
		where p.prokind = $1
	`
	args := []any{prokind}
	for i, rt := range excludeReturnTypes {
		query += " and format_type(p.prorettype, null) <> $" + strconv.Itoa(i+2)
		args = append(args, rt)
	}
	query += " and quote_ident(n.nspname) = $" + strconv.Itoa(len(args)+1) + " order by 1"
	args = append(args, schema)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoutine, 0)
	for rows.Next() {
		var r postgresqlRoutine
		if err := rows.Scan(&r.ID, &r.Name, &r.Schema, &r.OID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// postgresqlFunctions mirrors PostgreSQL.py's QueryFunctions — PG11+ uses
// prokind='f' excluding trigger/event_trigger return types; per this
// project's policy of not replicating long-EOL version branches (pre-PG11
// used proisagg instead of prokind), only the PG11+ query is ported.
func postgresqlFunctions(db *sql.DB, schema string) ([]postgresqlRoutine, error) {
	return postgresqlRoutinesByKind(db, schema, "f", "trigger", "event_trigger")
}

// postgresqlProcedures mirrors PostgreSQL.py's QueryProcedures (PG11+ only —
// procedures (prokind='p') didn't exist before PG11 at all).
func postgresqlProcedures(db *sql.DB, schema string) ([]postgresqlRoutine, error) {
	return postgresqlRoutinesByKind(db, schema, "p")
}

// postgresqlTriggerFunctions mirrors PostgreSQL.py's
// QueryTriggerFunctions — functions returning the pseudo-type "trigger".
func postgresqlTriggerFunctions(db *sql.DB, schema string) ([]postgresqlRoutine, error) {
	rows, err := db.Query(`
		select quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' as id,
		       quote_ident(p.proname) as name,
		       quote_ident(n.nspname) as schema_name,
		       p.oid as function_oid
		from pg_proc p
		join pg_namespace n on p.pronamespace = n.oid
		where format_type(p.prorettype, null) = 'trigger'
			and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoutine, 0)
	for rows.Next() {
		var r postgresqlRoutine
		if err := rows.Scan(&r.ID, &r.Name, &r.Schema, &r.OID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// postgresqlAggregates mirrors PostgreSQL.py's QueryAggregates (PG11+ only —
// pre-PG11 used pg_proc.proisagg; PG11+ uses prokind='a').
func postgresqlAggregates(db *sql.DB, schema string) ([]postgresqlRoutine, error) {
	rows, err := db.Query(`
		select quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' as id,
		       quote_ident(p.proname) as name,
		       quote_ident(n.nspname) as schema_name,
		       p.oid
		from pg_aggregate a
		inner join pg_proc p on a.aggfnoid = p.oid
		inner join pg_namespace n on p.pronamespace = n.oid
		where p.prokind = 'a'
			and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoutine, 0)
	for rows.Next() {
		var r postgresqlRoutine
		if err := rows.Scan(&r.ID, &r.Name, &r.Schema, &r.OID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type postgresqlRoutineField struct {
	Type      string // "I"/"O"/"X" (in/out/inout) for real arguments
	Name      string
	IsReturns bool // true for the synthetic "returns <type>" pseudo-row functions get
}

// postgresqlRoutineFields mirrors PostgreSQL.py's QueryFunctionFields (with
// the leading "returns <type>" pseudo-row) — pass includeReturns=true for
// functions, false for procedures (which have no return-type pseudo-row,
// matching QueryProcedureFields). Python detects its own pseudo-row later
// by string-matching a quote_ident-wrapped `"returns ...` prefix; this
// tags it with an explicit IsReturns column instead of replicating that
// string-matching fragility.
//
// The "returns" pseudo-row's routineID match used to compare against a
// raw, un-quote_ident'd `n.nspname || '.' || p.proname || ...` string,
// while every producer of a routineID (postgresqlRoutinesByKind,
// postgresqlTriggerFunctions, postgresqlAggregates, postgresqlRoutineSource)
// builds it with quote_ident() around both parts. For a schema/function
// needing quoting this match found zero rows, silently dropping the
// "returns" row from the Fields list. Fixed to quote_ident() both sides,
// consistent with every producer.
func postgresqlRoutineFields(db *sql.DB, schema, routineID string, includeReturns bool) ([]postgresqlRoutineField, error) {
	argsQuery := `
		select (case trim(substring((trim(x.name) || ' ') from 1 for position(' ' in (trim(x.name) || ' '))))
		          when 'OUT' then 'O'
		          when 'INOUT' then 'X'
		          else 'I'
		        end) as type,
		       trim(x.name) as name,
		       false as is_returns
		from (
			select unnest(regexp_split_to_array(pg_get_function_identity_arguments($1::regprocedure), ',')) as name
		) x
		where length(trim(x.name)) > 0
	`
	var rows *sql.Rows
	var err error
	if includeReturns {
		rows, err = db.Query(`
			select y.type, y.name, y.is_returns
			from (
				select 'O' as type,
				       'returns ' || format_type(p.prorettype, null) as name,
				       true as is_returns,
				       0 as seq
				from pg_proc p, pg_namespace n
				where p.pronamespace = n.oid
					and n.nspname = $2
					and quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' = $1
				union all
				select type, name, is_returns, 1 from (`+argsQuery+`) a
			) y
			order by y.seq
		`, routineID, schema)
	} else {
		rows, err = db.Query(argsQuery, routineID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoutineField, 0)
	for rows.Next() {
		var f postgresqlRoutineField
		if err := rows.Scan(&f.Type, &f.Name, &f.IsReturns); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// postgresqlFunctionDefinition/postgresqlProcedureDefinition mirror
// PostgreSQL.py's GetFunctionDefinition/GetProcedureDefinition — both are
// the exact same pg_get_functiondef() call (Postgres has one underlying
// catalog representation for both).
func postgresqlRoutineDefinition(db *sql.DB, routineID string) (string, error) {
	var def string
	if err := db.QueryRow(`select pg_get_functiondef($1::regprocedure)`, routineID).Scan(&def); err != nil {
		return "", err
	}
	return def, nil
}

// postgresqlRoutineSource mirrors GetFunctionDebug/GetProcedureDebug — the
// raw prosrc body text (not the full CREATE OR REPLACE FUNCTION DDL).
func postgresqlRoutineSource(db *sql.DB, routineID string) (string, error) {
	var src string
	err := db.QueryRow(`
		select p.prosrc
		from pg_proc p
		join pg_namespace n on p.pronamespace = n.oid
		where quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' = $1
	`, routineID).Scan(&src)
	if err != nil {
		return "", err
	}
	return src, nil
}

// postgresqlTemplateSelectFunction mirrors PostgreSQL.py's
// TemplateSelectFunction — builds a "SELECT <schema>.<function>(...)" (or
// "SELECT * FROM ..." for a set-returning function) editor snippet with one
// "? -- <name> <IN|OUT|INOUT>" placeholder per non-return argument.
//
// The functionID match below used to compare against a raw
// (non-quote_ident'd) identity string, same bug as
// postgresqlRoutineFields' "returns" row above — for a quoted schema/
// function name it found no row, so the sql.ErrNoRows branch silently left
// returnsSet false, generating a plain "SELECT schema.func(...)" instead of
// "SELECT * FROM schema.func(...)" for a set-returning function. Fixed to
// quote_ident() both sides of the match.
func postgresqlTemplateSelectFunction(db *sql.DB, schema, function, functionID string) (string, error) {
	var returnsSet bool
	err := db.QueryRow(`
		select p.proretset
		from pg_proc p, pg_namespace n
		where p.pronamespace = n.oid
			and n.nspname = $1
			and quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' = $2
	`, schema, functionID).Scan(&returnsSet)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}

	fields, err := postgresqlRoutineFields(db, schema, functionID, true)
	if err != nil {
		return "", err
	}

	// Fields beyond the leading "returns ..." pseudo-row are the real args.
	args := make([]postgresqlRoutineField, 0, len(fields))
	for _, f := range fields {
		if !f.IsReturns {
			args = append(args, f)
		}
	}

	prefix := "SELECT "
	if returnsSet {
		prefix = "SELECT * FROM "
	}
	call := schema + "." + function + "()"
	if len(args) == 0 {
		return prefix + call, nil
	}

	var b strings.Builder
	b.WriteString(prefix + schema + "." + function + "(\n    ")
	for i, a := range args {
		argType := "IN"
		switch a.Type {
		case "O":
			argType = "OUT"
		case "X":
			argType = "INOUT"
		}
		if i > 0 {
			b.WriteString("\n  , ")
		}
		b.WriteString("? -- " + a.Name + " " + argType)
	}
	b.WriteString("\n)")
	return b.String(), nil
}

// postgresqlTemplateCallProcedure mirrors PostgreSQL.py's
// TemplateCallProcedure — same shape, "CALL schema.name(...)" instead of
// SELECT, no returns-pseudo-row to skip.
func postgresqlTemplateCallProcedure(db *sql.DB, schema, procedure, procedureID string) (string, error) {
	fields, err := postgresqlRoutineFields(db, schema, procedureID, false)
	if err != nil {
		return "", err
	}
	if len(fields) == 0 {
		return "CALL " + schema + "." + procedure + "()", nil
	}

	var b strings.Builder
	b.WriteString("CALL " + schema + "." + procedure + "(\n    ")
	for i, f := range fields {
		argType := "IN"
		switch f.Type {
		case "O":
			argType = "OUT"
		case "X":
			argType = "INOUT"
		}
		if i > 0 {
			b.WriteString("\n  , ")
		}
		b.WriteString("? -- " + f.Name + " " + argType)
	}
	b.WriteString("\n)")
	return b.String(), nil
}
