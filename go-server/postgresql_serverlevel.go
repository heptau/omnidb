package main

import (
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"strings"
)

// This file mirrors the server-level (not schema/table-scoped) portion of
// tree_postgresql.py: databases, tablespaces, roles, extensions, sequences,
// types, domains, kill_backend, change_role_password, get_object_description
// — part of Fáze 8a's PostgreSQL long-tail port (see go-backend-migration
// memory for the full catalog this was built from).

type postgresqlNamedOID struct {
	Name string
	OID  int64
}

// postgresqlDatabases mirrors PostgreSQL.py's QueryDatabases — 'postgres'
// always sorts first, then every other non-template database alphabetically.
func postgresqlDatabases(db *sql.DB) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`
		select database_name, oid
		from (
			select quote_ident(datname) as database_name, 1 as sort, oid
			from pg_database
			where datname = 'postgres'
			union all
			select database_name, 1 + row_number() over() as sort, oid
			from (
				select quote_ident(datname) as database_name, oid
				from pg_database
				where not datistemplate and datname <> 'postgres'
				order by datname asc
			) x
		) y
		order by sort
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlTablespaces mirrors PostgreSQL.py's QueryTablespaces.
func postgresqlTablespaces(db *sql.DB) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`select quote_ident(spcname) as name, oid from pg_tablespace order by spcname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlRoles mirrors PostgreSQL.py's QueryRoles.
func postgresqlRoles(db *sql.DB) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`select quote_ident(rolname) as name, oid from pg_roles order by rolname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlExtensions mirrors PostgreSQL.py's QueryExtensions.
func postgresqlExtensions(db *sql.DB) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`select quote_ident(extname) as name, oid from pg_extension order by extname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

func scanNamedOIDs(rows *sql.Rows) ([]postgresqlNamedOID, error) {
	out := make([]postgresqlNamedOID, 0)
	for rows.Next() {
		var r postgresqlNamedOID
		if err := rows.Scan(&r.Name, &r.OID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// postgresqlSequences mirrors PostgreSQL.py's QuerySequences, scoped to one
// schema (matches how tree_postgresql.py's get_sequences always calls it).
func postgresqlSequences(db *sql.DB, schema string) ([]postgresqlNamedOID, error) {
	// Joins pg_namespace for the raw nspname rather than filtering on
	// `relnamespace::regnamespace::text` — same double-quoting bug (and
	// fix) as postgresqlPrimaryKeys/postgresqlUniques in
	// postgresql_constraints.go: that cast already self-quotes a schema
	// needing quoting, so wrapping it in quote_ident() again never matched
	// the plain schema string callers pass. Silently returned zero
	// sequences for any schema needing identifier quoting.
	rows, err := db.Query(`
		select quote_ident(c.relname) as name, c.oid
		from pg_class c
		inner join pg_namespace n on n.oid = c.relnamespace
		where c.relkind = 'S' and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlTypes mirrors PostgreSQL.py's QueryTypes, scoped to one schema —
// excludes domains (typtype <> 'd') and array-element shadow types.
func postgresqlTypes(db *sql.DB, schema string) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`
		select quote_ident(t.typname) as name, t.oid
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		where (t.typrelid = 0 or (select c.relkind = 'c' from pg_class c where c.oid = t.typrelid))
			and not exists(select 1 from pg_type el where el.oid = t.typelem and el.typarray = t.oid)
			and t.typtype <> 'd'
			and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlDomains mirrors PostgreSQL.py's QueryDomains — same shape as
// postgresqlTypes but the flipped typtype condition (domains only).
func postgresqlDomains(db *sql.DB, schema string) ([]postgresqlNamedOID, error) {
	rows, err := db.Query(`
		select quote_ident(t.typname) as name, t.oid
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		where (t.typrelid = 0 or (select c.relkind = 'c' from pg_class c where c.oid = t.typrelid))
			and not exists(select 1 from pg_type el where el.oid = t.typelem and el.typarray = t.oid)
			and t.typtype = 'd'
			and quote_ident(n.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNamedOIDs(rows)
}

// postgresqlKillBackend mirrors PostgreSQL.py's Terminate — bound as a real
// parameter (Python's original splices the pid into the SQL text via
// .format(), not a real injection risk in practice since pids are numeric,
// but binding costs nothing and matches this migration's established
// no-string-concatenation standard).
func postgresqlKillBackend(db *sql.DB, pid int64) error {
	_, err := db.Exec(`select pg_terminate_backend($1)`, pid)
	return err
}

// postgresqlChangeRolePassword mirrors PostgreSQL.py's ChangeRolePassword —
// pre-hashes to Postgres's own md5-verifier wire format
// ("md5" + md5hex(password || role)) client-side, exactly like the Python
// original, so the plaintext password is never sent as literal SQL text
// (only the hash is). The ALTER ROLE target name itself still can't be
// bind-parameterized (identifiers aren't valid bind targets in Postgres) —
// unlike Python's original, which spliced p_role in completely unescaped,
// this quotes it as a proper Postgres identifier (doubling any embedded
// double-quote) rather than reproducing that injection gap.
//
// role arrives already quote_ident()-quoted, same as every identifier this
// app hands to the frontend: postgresqlRoles (above) lists role names via
// `quote_ident(rolname)`, and tree_postgresql.js's "Change Password" action
// echoes that same node.text back as p_role. This used to be re-quoted via
// quotePostgresIdentifierDoubleQuoted() a SECOND time — for a role name
// that actually needed quoting (mixed case, reserved word), that produced
// an ALTER ROLE statement targeting a role that doesn't exist (verified
// live against a real role "WeirdRole": `ALTER ROLE """WeirdRole"""`
// errors "role does not exist"). It also fed the still-quoted string
// straight into the md5 verifier hash, which needs the actual role name,
// not its quoted display form — even if the ALTER ROLE syntax had
// happened to succeed, the stored verifier would never have matched the
// typed password at login. unquotePostgresIdentifier reverses quote_ident
// back to the raw name for the hash, and quotePostgresIdentifierDoubleQuoted
// re-quotes that raw name (not the original, possibly-already-quoted
// input) for the DDL text — the re-quoting step also means a caller
// hitting this route directly over HTTP with an arbitrary, non-tree-
// sourced string still gets it safely quoted as a single identifier
// rather than spliced in raw.
func postgresqlChangeRolePassword(db *sql.DB, role, password string) error {
	rawRole := unquotePostgresIdentifier(role)
	hash := postgresMD5PasswordHash(password, rawRole)
	_, err := db.Exec(`ALTER ROLE ` + quotePostgresIdentifierDoubleQuoted(rawRole) + ` WITH PASSWORD '` + hash + `'`)
	return err
}

// unquotePostgresIdentifier reverses quote_ident()'s quoting: if s is
// wrapped in a double-quote pair, strips them and un-doubles any embedded
// "" back to a single " (quote_ident's own escaping rule); otherwise
// returns s unchanged, matching quote_ident's behavior for a name that
// never needed quoting in the first place.
func unquotePostgresIdentifier(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return strings.ReplaceAll(s[1:len(s)-1], `""`, `"`)
	}
	return s
}

// quotePostgresIdentifierDoubleQuoted double-quotes a Postgres identifier,
// doubling any embedded double-quote character — the standard Postgres
// identifier-quoting rule, needed here since ALTER ROLE's target name can't
// be a bind parameter.
func quotePostgresIdentifierDoubleQuoted(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// postgresMD5PasswordHash mirrors Postgres's own md5 password-verifier wire
// format: "md5" followed by the hex md5 digest of (password || username).
// This is Postgres's OWN scheme (unrelated to Django's PBKDF2 hasher used
// elsewhere in this migration for OmniDB's own app-level users) — Postgres
// recognizes a stored password value already in this exact shape as
// pre-hashed and stores it verbatim rather than hashing it again.
func postgresMD5PasswordHash(password, role string) string {
	sum := md5.Sum([]byte(password + role))
	return "md5" + hex.EncodeToString(sum[:])
}

// postgresqlObjectDescriptionSpec is one row of GetObjectDescription's
// dispatch table — a query producing either (id, description) or, for the
// constraint/rule/trigger kinds, (id, table_id, description).
type postgresqlObjectDescriptionSpec struct {
	commentKind string
	query       string
	onTable     bool // true for the "COMMENT ON <kind> <id> ON <table_id> IS ..." shape
	args        func(oid int64, position int) []any
}

func oidArg(oid int64, _ int) []any                 { return []any{oid} }
func oidPositionArgs(oid int64, position int) []any { return []any{oid, position} }

var postgresqlObjectDescriptionSpecs = map[string]postgresqlObjectDescriptionSpec{
	"aggregate":                   {commentKind: "AGGREGATE", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"table_field":                 {commentKind: "COLUMN", args: oidPositionArgs, query: `select format('%s.%s', $1::regclass, attname) as id, coalesce(col_description($1, $2), '') as description from pg_attribute where attrelid = $1::regclass and attnum = $2`},
	"check":                       {commentKind: "CONSTRAINT", onTable: true, args: oidArg, query: `select conname as id, conrelid::regclass as table_id, coalesce(obj_description($1, 'pg_constraint'), '') as description from pg_constraint c where oid = $1`},
	"foreign_key":                 {commentKind: "CONSTRAINT", onTable: true, args: oidArg, query: `select conname as id, conrelid::regclass as table_id, coalesce(obj_description($1, 'pg_constraint'), '') as description from pg_constraint c where oid = $1`},
	"pk":                          {commentKind: "CONSTRAINT", onTable: true, args: oidArg, query: `select conname as id, conrelid::regclass as table_id, coalesce(obj_description($1, 'pg_constraint'), '') as description from pg_constraint c where oid = $1`},
	"unique":                      {commentKind: "CONSTRAINT", onTable: true, args: oidArg, query: `select conname as id, conrelid::regclass as table_id, coalesce(obj_description($1, 'pg_constraint'), '') as description from pg_constraint c where oid = $1`},
	"exclude":                     {commentKind: "CONSTRAINT", onTable: true, args: oidArg, query: `select conname as id, conrelid::regclass as table_id, coalesce(obj_description($1, 'pg_constraint'), '') as description from pg_constraint c where oid = $1`},
	"database":                    {commentKind: "DATABASE", args: oidArg, query: `select quote_ident(datname) as id, coalesce(shobj_description($1, 'pg_database'), '') as description from pg_database where oid = $1`},
	"domain":                      {commentKind: "DOMAIN", args: oidArg, query: `select $1::regtype as id, coalesce(obj_description($1, 'pg_type'), '') as description`},
	"extension":                   {commentKind: "EXTENSION", args: oidArg, query: `select quote_ident(extname) as id, coalesce(obj_description($1, 'pg_extension'), '') as description from pg_extension where oid = $1`},
	"eventtrigger":                {commentKind: "EVENT TRIGGER", args: oidArg, query: `select quote_ident(evtname) as id, coalesce(obj_description($1, 'pg_event_trigger'), '') as description from pg_event_trigger where oid = $1`},
	"fdw":                         {commentKind: "FOREIGN DATA WRAPPER", args: oidArg, query: `select quote_ident(fdwname) as id, coalesce(obj_description($1, 'pg_foreign_data_wrapper'), '') as description from pg_foreign_data_wrapper where oid = $1`},
	"foreign_server":              {commentKind: "SERVER", args: oidArg, query: `select quote_ident(srvname) as id, coalesce(obj_description($1, 'pg_foreign_server'), '') as description from pg_foreign_server where oid = $1`},
	"foreign_table":               {commentKind: "FOREIGN TABLE", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
	"function":                    {commentKind: "FUNCTION", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"triggerfunction":             {commentKind: "FUNCTION", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"direct_triggerfunction":      {commentKind: "FUNCTION", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"eventtriggerfunction":        {commentKind: "FUNCTION", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"direct_eventtriggerfunction": {commentKind: "FUNCTION", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"index":                       {commentKind: "INDEX", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
	"mview":                       {commentKind: "MATERIALIZED VIEW", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
	"procedure":                   {commentKind: "PROCEDURE", args: oidArg, query: `select $1::regprocedure as id, coalesce(obj_description($1, 'pg_proc'), '') as description`},
	"publication":                 {commentKind: "PUBLICATION", args: oidArg, query: `select quote_ident(pubname) as id, coalesce(obj_description($1, 'pg_publication'), '') as description from pg_publication where oid = $1`},
	// shobj_description's catalog arg must be the catalog that actually
	// backs the object's comment storage, not just any view that lists
	// it — "pg_roles" is a view over pg_authid, and role comments are
	// stored keyed to pg_authid's OID (compare "database"/"tablespace"
	// above, both real catalog tables). Using "pg_roles" here always
	// returned an empty description regardless of whether `COMMENT ON
	// ROLE` had actually been used. Fixed to "pg_authid".
	"role": {commentKind: "ROLE", args: oidArg, query: `select $1::regrole as id, coalesce(shobj_description($1, 'pg_authid'), '') as description`},
	// Reads rulename/table straight off pg_rewrite (matched only by its own
	// oid, already unique) instead of joining to the pg_rules view on
	// rulename alone — rule names are only unique per-table, so two
	// different tables with an identically-named rule used to make the
	// old rulename-only join pick an arbitrary matching row and could
	// misattribute the comment to the wrong table.
	"rule":         {commentKind: "RULE", onTable: true, args: oidArg, query: `select quote_ident(rw.rulename) as id, rw.ev_class::regclass as table_id, coalesce(obj_description($1, 'pg_rewrite'), '') as description from pg_rewrite rw where rw.oid = $1`},
	"schema":       {commentKind: "SCHEMA", args: oidArg, query: `select $1::regnamespace as id, coalesce(obj_description($1, 'pg_namespace'), '') as description`},
	"sequence":     {commentKind: "SEQUENCE", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
	"statistic":    {commentKind: "STATISTICS", args: oidArg, query: `select format('%s.%s', quote_ident(stxnamespace::regnamespace::text), quote_ident(stxname)) as id, coalesce(obj_description($1, 'pg_statistic_ext'), '') as description from pg_statistic_ext where oid = $1`},
	"subscription": {commentKind: "SUBSCRIPTION", args: oidArg, query: `select quote_ident(subname) as id, coalesce(obj_description($1, 'pg_subscription'), '') as description from pg_subscription where oid = $1`},
	"table":        {commentKind: "TABLE", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
	"tablespace":   {commentKind: "TABLESPACE", args: oidArg, query: `select quote_ident(spcname) as id, coalesce(shobj_description($1, 'pg_tablespace'), '') as description from pg_tablespace where oid = $1`},
	"trigger":      {commentKind: "TRIGGER", onTable: true, args: oidArg, query: `select tgname as id, tgrelid::regclass as table_id, coalesce(obj_description($1, 'pg_trigger'), '') as description from pg_trigger where oid = $1`},
	"type":         {commentKind: "TYPE", args: oidArg, query: `select $1::regtype as id, coalesce(obj_description($1, 'pg_type'), '') as description`},
	"view":         {commentKind: "VIEW", args: oidArg, query: `select $1::regclass as id, coalesce(obj_description($1, 'pg_class'), '') as description`},
}

// postgresqlObjectDescription mirrors PostgreSQL.py's GetObjectDescription
// dispatch table, producing a "COMMENT ON <KIND> <id> [ON <table_id>] IS
// '<description>'" string per object kind. Unknown p_type (matching
// Python's fallthrough) returns "", nil.
func postgresqlObjectDescription(db *sql.DB, objType string, oid int64, position int) (string, error) {
	spec, ok := postgresqlObjectDescriptionSpecs[objType]
	if !ok {
		return "", nil
	}
	args := spec.args(oid, position)
	if spec.onTable {
		var id, tableID, description string
		if err := db.QueryRow(spec.query, args...).Scan(&id, &tableID, &description); err != nil {
			return "", err
		}
		return "COMMENT ON " + spec.commentKind + " " + id + " ON " + tableID + " is '" + description + "'", nil
	}
	var id, description string
	if err := db.QueryRow(spec.query, args...).Scan(&id, &description); err != nil {
		return "", err
	}
	return "COMMENT ON " + spec.commentKind + " " + id + " is '" + description + "'", nil
}
