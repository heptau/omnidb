package main

import (
	"database/sql"
	"strings"
)

// This file continues postgresql_constraints.go with the constraint kinds
// PK/FK/unique/index didn't already cover: check constraints, exclude
// constraints, and rules — part of Fáze 8a's PostgreSQL long-tail port.

type postgresqlCheckConstraint struct {
	Name   string
	Source string
	OID    int64
}

// postgresqlChecks mirrors PostgreSQL.py's QueryTablesChecks.
func postgresqlChecks(db *sql.DB, schema, table string) ([]postgresqlCheckConstraint, error) {
	rows, err := db.Query(`
		select quote_ident(c.conname) as constraint_name,
		       pg_get_constraintdef(c.oid) as constraint_source,
		       c.oid
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on t.relnamespace = n.oid
		where c.contype = 'c'
			and quote_ident(n.nspname) = $1 and quote_ident(t.relname) = $2
		order by 1
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlCheckConstraint, 0)
	for rows.Next() {
		var c postgresqlCheckConstraint
		if err := rows.Scan(&c.Name, &c.Source, &c.OID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type postgresqlExcludeConstraint struct {
	Name       string
	Attributes string
	Operations string
	OID        int64
}

// postgresqlExcludes mirrors PostgreSQL.py's QueryTablesExcludes. The
// original builds two session-scoped pg_temp helper functions
// (fnc_omnidb_exclude_ops/fnc_omnidb_exclude_attrs) that re-look-up the
// constraint by name; this inlines the same result as correlated
// subqueries directly against the constraint row's own conkey/conexclop
// array columns — simpler, no CREATE FUNCTION round trip needed, same
// output.
//
// Both array-derived columns use `unnest(...) with ordinality` + an
// explicit `order by` in their string_agg, not a plain unnest — conkey[i]
// and conexclop[i] are position-paired (attribute i goes with operator i),
// and neither a bare `attnum = any(conkey)` correlated subquery nor an
// unordered join back to pg_operator is guaranteed by Postgres to preserve
// that array order. Without it, `EXCLUDE (b WITH &&, a WITH =)` could
// render as attributes "a,b" against operations "&&,=", scrambling which
// operator applies to which column.
func postgresqlExcludes(db *sql.DB, schema, table string) ([]postgresqlExcludeConstraint, error) {
	rows, err := db.Query(`
		select quote_ident(c.conname) as constraint_name,
		       coalesce((
		           select string_agg(a.attname, ',' order by k.ord)
		           from unnest(c.conkey) with ordinality as k(attnum, ord)
		           inner join pg_attribute a on a.attnum = k.attnum and a.attrelid = c.conrelid
		       ), '') as attributes,
		       coalesce((
		           select string_agg(o.oprname, ',' order by op.ord)
		           from unnest(c.conexclop) with ordinality as op(oid, ord)
		           inner join pg_operator o on o.oid = op.oid
		       ), '') as operations,
		       c.oid
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on t.relnamespace = n.oid
		where c.contype = 'x'
			and quote_ident(n.nspname) = $1 and quote_ident(t.relname) = $2
		order by 1
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlExcludeConstraint, 0)
	for rows.Next() {
		var e postgresqlExcludeConstraint
		if err := rows.Scan(&e.Name, &e.Attributes, &e.Operations, &e.OID); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

type postgresqlRule struct {
	Name string
	OID  int64
}

// postgresqlRules mirrors PostgreSQL.py's QueryTablesRules.
func postgresqlRules(db *sql.DB, schema, table string) ([]postgresqlRule, error) {
	rows, err := db.Query(`
		select quote_ident(r.rulename) as rule_name,
		       rw.oid
		from pg_rules r
		inner join pg_rewrite rw on r.rulename = rw.rulename
		where quote_ident(r.schemaname) = $1 and quote_ident(r.tablename) = $2
		order by 1
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRule, 0)
	for rows.Next() {
		var rr postgresqlRule
		if err := rows.Scan(&rr.Name, &rr.OID); err != nil {
			return nil, err
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

// postgresqlRuleDefinition mirrors PostgreSQL.py's GetRuleDefinition — the
// stored `r.definition` already ends in `;`, with an optional appended
// COMMENT ON RULE statement if the rule has a description. Python replaces
// "CREATE RULE" with "CREATE OR REPLACE RULE" in the returned text; mirrored
// verbatim here via strings.Replace after the query.
func postgresqlRuleDefinition(db *sql.DB, schema, table, rule string) (string, error) {
	var def string
	err := db.QueryRow(`
		select r.definition ||
		       (case when obj_description(rw.oid, 'pg_rewrite') is not null
		             then format(E'\n\nCOMMENT ON RULE %s ON %s IS %s;',
		                  quote_ident(r.rulename),
		                  quote_ident(rw.ev_class::regclass::text),
		                  quote_literal(obj_description(rw.oid, 'pg_rewrite')))
		             else ''
		        end)
		from pg_rules r
		inner join pg_rewrite rw on r.rulename = rw.rulename
		where quote_ident(r.schemaname) = $1
			and quote_ident(r.tablename) = $2
			and quote_ident(r.rulename) = $3
	`, schema, table, rule).Scan(&def)
	if err != nil {
		return "", err
	}
	return strings.Replace(def, "CREATE RULE", "CREATE OR REPLACE RULE", 1), nil
}
