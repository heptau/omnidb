package main

import (
	"database/sql"
)

// This file mirrors tree_postgresql.py's event-trigger surface: event
// triggers themselves, event trigger functions, and their definitions —
// part of Fáze 8a's PostgreSQL long-tail port.

type postgresqlEventTrigger struct {
	Name        string
	Enabled     string
	Event       string
	Function    string
	ID          string
	FunctionOID int64
	OID         int64
}

// postgresqlEventTriggers mirrors PostgreSQL.py's QueryEventTriggers —
// database-global, no schema/table filter.
func postgresqlEventTriggers(db *sql.DB) ([]postgresqlEventTrigger, error) {
	rows, err := db.Query(`
		select quote_ident(t.evtname) as trigger_name,
		       t.evtenabled as trigger_enabled,
		       t.evtevent as event_name,
		       quote_ident(np.nspname) || '.' || quote_ident(p.proname) as trigger_function,
		       quote_ident(np.nspname) || '.' || quote_ident(p.proname) || '()' as id,
		       p.oid as function_oid,
		       t.oid
		from pg_event_trigger t
		inner join pg_proc p on p.oid = t.evtfoid
		inner join pg_namespace np on np.oid = p.pronamespace
		order by 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlEventTrigger, 0)
	for rows.Next() {
		var t postgresqlEventTrigger
		if err := rows.Scan(&t.Name, &t.Enabled, &t.Event, &t.Function, &t.ID, &t.FunctionOID, &t.OID); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// postgresqlEventTriggerFunctions mirrors PostgreSQL.py's
// QueryEventTriggerFunctions, scoped to one schema.
func postgresqlEventTriggerFunctions(db *sql.DB, schema string) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`
		select quote_ident(p.proname) as name, p.oid
		from pg_proc p
		join pg_namespace n on p.pronamespace = n.oid
		where format_type(p.prorettype, null) = 'event_trigger'
			and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlEventTriggerFunctionDefinition mirrors PostgreSQL.py's
// GetEventTriggerFunctionDefinition — p_function is the
// "schema.name(argtypes)" id string, cast directly to ::regprocedure.
func postgresqlEventTriggerFunctionDefinition(db *sql.DB, function string) (string, error) {
	var def string
	if err := db.QueryRow(`select pg_get_functiondef($1::regprocedure)`, function).Scan(&def); err != nil {
		return "", err
	}
	return def, nil
}
