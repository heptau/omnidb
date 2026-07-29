package main

import (
	"database/sql"
	"errors"
	"strings"
)

// Every DDL helper in postgresql_ddl.go / postgresql_ddl2.go reproduces an
// object's own CREATE statement, but only the pg_class-backed ones
// (postgresqlDDLClass and the table field/trigger/constraint/rule helpers)
// also emit the object's COMMENT ON and GRANT statements. That left the DDL
// panel showing a bare CREATE for schemas, sequences, routines, domains,
// types, roles, databases, tablespaces, extensions, materialized views and
// the whole FDW/replication long tail — no comment, no privileges, even when
// both were set. This file fills that gap in one place, called from
// handleGetPropertiesPostgreSQL, rather than bolting the same two CTEs onto
// twenty separate queries.
//
// Identifier matching per type mirrors the sibling DDL helper, so an extras
// query never fails to find an object whose CREATE statement was just produced
// successfully. That means quote_ident(catalog value) = $n almost everywhere,
// since p_schema/p_object arrive already quote_ident()-quoted from the tree —
// except for foreign data wrappers and foreign servers, whose tree nodes carry
// a RAW name (see postgresqlForeignServers' comment), so those two match the
// raw catalog value instead.

// pgACLSelectList is the (grantee, privilege_type, is_grantable) select list
// every object-level grantQuery below shares. aclexplode() is what turns a
// catalog's aclitem[] into one row per granted privilege; grantee 0 is
// PUBLIC. Each query coalesces a NULL ACL to acldefault() the way
// information_schema's own views do, then drops the owner's own rows — those
// are implicit in ownership and are what a NULL ACL means in the first place,
// so pg_dump doesn't spell them out either.
const pgACLSelectList = `
		select case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee,
		       a.privilege_type,
		       a.is_grantable`

// pgDDLExtrasSpec describes how to build one object type's trailing COMMENT
// ON / GRANT statements. commentQuery returns (identifier, comment) with the
// comment already run through quote_literal() — escaping a comment's own
// quotes/backslashes correctly is exactly what that function is for, and it
// returns NULL (skipping the statement) when the object has no comment.
type pgDDLExtrasSpec struct {
	commentKind  string
	commentQuery string
	// grantKind is the keyword GRANT ... ON <kind> takes, empty for object
	// types Postgres keeps no ACL for (extensions, event triggers,
	// publications, subscriptions, statistics).
	grantKind  string
	grantQuery string
	// columns adds per-column COMMENT ON COLUMN / column GRANT statements,
	// for the relation-shaped types whose own DDL query doesn't already
	// include them (materialized views — postgresqlDDLClass covers tables,
	// views and foreign tables itself). commentQuery's identifier is reused
	// as the relation name, and its first argument must be regclass-castable.
	columns bool
	args    func(schema, table, object string) []any
}

func pgExtrasObjectArg(_, _, object string) []any             { return []any{object} }
func pgExtrasSchemaObjectArgs(schema, _, object string) []any { return []any{schema, object} }
func pgExtrasRegclassArg(schema, _, object string) []any      { return []any{schema + "." + object} }

// pgRoutineExtras is shared by every routine-shaped p_type: they all arrive
// as a regprocedure-castable identity string (p_object is the tree node's
// tag.id, e.g. `app.f1(integer)`), so only the COMMENT ON keyword differs.
// GRANT has no ON AGGREGATE form — an aggregate's EXECUTE privilege is
// granted ON FUNCTION, same as a plain function's.
func pgRoutineExtras(commentKind, grantKind string) pgDDLExtrasSpec {
	return pgDDLExtrasSpec{
		commentKind:  commentKind,
		commentQuery: `select $1::regprocedure::text, quote_literal(obj_description($1::regprocedure, 'pg_proc'))`,
		grantKind:    grantKind,
		grantQuery: pgACLSelectList + `
		from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
		where p.oid = $1::regprocedure and a.grantee <> p.proowner`,
		args: pgExtrasObjectArg,
	}
}

var pgDDLExtrasSpecs = map[string]pgDDLExtrasSpec{
	"database": {
		commentKind:  "DATABASE",
		commentQuery: `select quote_ident(datname), quote_literal(shobj_description(oid, 'pg_database')) from pg_database where quote_ident(datname) = $1`,
		grantKind:    "DATABASE",
		grantQuery: pgACLSelectList + `
		from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
		where quote_ident(d.datname) = $1 and a.grantee <> d.datdba`,
		args: pgExtrasObjectArg,
	},
	"schema": {
		commentKind:  "SCHEMA",
		commentQuery: `select quote_ident(nspname), quote_literal(obj_description(oid, 'pg_namespace')) from pg_namespace where quote_ident(nspname) = $1`,
		grantKind:    "SCHEMA",
		grantQuery: pgACLSelectList + `
		from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
		where quote_ident(n.nspname) = $1 and a.grantee <> n.nspowner`,
		args: pgExtrasObjectArg,
	},
	// shobj_description's catalog argument has to be pg_authid, the catalog
	// role comments are actually keyed to, not the pg_roles view over it —
	// see postgresqlObjectDescriptionSpecs' "role" entry, which had exactly
	// this bug.
	"role": {
		commentKind:  "ROLE",
		commentQuery: `select quote_ident(rolname), quote_literal(shobj_description(oid, 'pg_authid')) from pg_roles where quote_ident(rolname) = $1`,
		args:         pgExtrasObjectArg,
	},
	"tablespace": {
		commentKind:  "TABLESPACE",
		commentQuery: `select quote_ident(spcname), quote_literal(shobj_description(oid, 'pg_tablespace')) from pg_tablespace where quote_ident(spcname) = $1`,
		grantKind:    "TABLESPACE",
		grantQuery: pgACLSelectList + `
		from pg_tablespace t, aclexplode(coalesce(t.spcacl, acldefault('t', t.spcowner))) a
		where quote_ident(t.spcname) = $1 and a.grantee <> t.spcowner`,
		args: pgExtrasObjectArg,
	},
	"extension": {
		commentKind:  "EXTENSION",
		commentQuery: `select quote_ident(extname), quote_literal(obj_description(oid, 'pg_extension')) from pg_extension where quote_ident(extname) = $1`,
		args:         pgExtrasObjectArg,
	},
	"sequence": {
		commentKind: "SEQUENCE",
		commentQuery: `select format('%s.%s', quote_ident(n.nspname), quote_ident(c.relname)),
		       quote_literal(obj_description(c.oid, 'pg_class'))
		from pg_class c
		inner join pg_namespace n on n.oid = c.relnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2`,
		grantKind: "SEQUENCE",
		grantQuery: pgACLSelectList + `
		from pg_class c
		inner join pg_namespace n on n.oid = c.relnamespace
		cross join aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
		where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2 and a.grantee <> c.relowner`,
		args: pgExtrasSchemaObjectArgs,
	},
	"mview": {
		commentKind:  "MATERIALIZED VIEW",
		commentQuery: `select $1::regclass::text, quote_literal(obj_description($1::regclass, 'pg_class'))`,
		grantKind:    "TABLE",
		grantQuery: pgACLSelectList + `
		from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
		where c.oid = $1::regclass and a.grantee <> c.relowner`,
		columns: true,
		args:    pgExtrasRegclassArg,
	},
	"function":                    pgRoutineExtras("FUNCTION", "FUNCTION"),
	"procedure":                   pgRoutineExtras("PROCEDURE", "PROCEDURE"),
	"triggerfunction":             pgRoutineExtras("FUNCTION", "FUNCTION"),
	"direct_triggerfunction":      pgRoutineExtras("FUNCTION", "FUNCTION"),
	"eventtriggerfunction":        pgRoutineExtras("FUNCTION", "FUNCTION"),
	"direct_eventtriggerfunction": pgRoutineExtras("FUNCTION", "FUNCTION"),
	"aggregate":                   pgRoutineExtras("AGGREGATE", "FUNCTION"),
	"domain": {
		commentKind: "DOMAIN",
		commentQuery: `select format('%s.%s', quote_ident(n.nspname), quote_ident(t.typname)),
		       quote_literal(obj_description(t.oid, 'pg_type'))
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2`,
		grantKind: "DOMAIN",
		grantQuery: pgACLSelectList + `
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		cross join aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2 and a.grantee <> t.typowner`,
		args: pgExtrasSchemaObjectArgs,
	},
	// A composite type's DDL comes from postgresqlDDLClass, which emits its
	// attributes' COMMENT ON COLUMN statements but not the type's own comment
	// (its createtable branch only covers relkind r/p/f) and reads relacl,
	// where a type's privileges live in pg_type.typacl — so both halves below
	// are additive for every typtype, composite included.
	"type": {
		commentKind: "TYPE",
		commentQuery: `select format('%s.%s', quote_ident(n.nspname), quote_ident(t.typname)),
		       quote_literal(obj_description(t.oid, 'pg_type'))
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2`,
		grantKind: "TYPE",
		grantQuery: pgACLSelectList + `
		from pg_type t
		inner join pg_namespace n on n.oid = t.typnamespace
		cross join aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2 and a.grantee <> t.typowner`,
		args: pgExtrasSchemaObjectArgs,
	},
	"fdw": {
		commentKind:  "FOREIGN DATA WRAPPER",
		commentQuery: `select quote_ident(fdwname), quote_literal(obj_description(oid, 'pg_foreign_data_wrapper')) from pg_foreign_data_wrapper where fdwname = $1`,
		grantKind:    "FOREIGN DATA WRAPPER",
		grantQuery: pgACLSelectList + `
		from pg_foreign_data_wrapper w, aclexplode(coalesce(w.fdwacl, acldefault('F', w.fdwowner))) a
		where w.fdwname = $1 and a.grantee <> w.fdwowner`,
		args: pgExtrasObjectArg,
	},
	"foreign_server": {
		commentKind:  "SERVER",
		commentQuery: `select quote_ident(srvname), quote_literal(obj_description(oid, 'pg_foreign_server')) from pg_foreign_server where srvname = $1`,
		grantKind:    "FOREIGN SERVER",
		grantQuery: pgACLSelectList + `
		from pg_foreign_server s, aclexplode(coalesce(s.srvacl, acldefault('S', s.srvowner))) a
		where s.srvname = $1 and a.grantee <> s.srvowner`,
		args: pgExtrasObjectArg,
	},
	"eventtrigger": {
		commentKind:  "EVENT TRIGGER",
		commentQuery: `select quote_ident(evtname), quote_literal(obj_description(oid, 'pg_event_trigger')) from pg_event_trigger where quote_ident(evtname) = $1`,
		args:         pgExtrasObjectArg,
	},
	"publication": {
		commentKind:  "PUBLICATION",
		commentQuery: `select quote_ident(pubname), quote_literal(obj_description(oid, 'pg_publication')) from pg_publication where quote_ident(pubname) = $1`,
		args:         pgExtrasObjectArg,
	},
	"subscription": {
		commentKind: "SUBSCRIPTION",
		commentQuery: `select quote_ident(s.subname), quote_literal(obj_description(s.oid, 'pg_subscription'))
		from pg_subscription s
		inner join pg_database d on d.oid = s.subdbid
		where d.datname = current_database() and quote_ident(s.subname) = $1`,
		args: pgExtrasObjectArg,
	},
	"statistic": {
		commentKind: "STATISTICS",
		commentQuery: `select format('%s.%s', quote_ident(n.nspname), quote_ident(se.stxname)),
		       quote_literal(obj_description(se.oid, 'pg_statistic_ext'))
		from pg_statistic_ext se
		inner join pg_namespace n on n.oid = se.stxnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(se.stxname) = $2`,
		args: pgExtrasSchemaObjectArgs,
	},
}

// postgresqlDDLExtras returns the COMMENT ON / GRANT block to append under an
// object's CREATE statement, already separated from it by a blank line, or ""
// for the object types that carry both in their own DDL query (every
// pg_class-backed kind) and for those Postgres supports neither on (indexes,
// user mappings). A missing catalog row yields "" rather than an error: the
// object's own DDL query has already run by this point, so anything that
// could legitimately not be found there is a race, not a reason to replace a
// perfectly good CREATE statement with an error dialog.
func postgresqlDDLExtras(db *sql.DB, objType, schema, table, object string) (string, error) {
	if objType == "role" {
		return postgresqlDDLRoleExtras(db, object)
	}
	spec, ok := pgDDLExtrasSpecs[objType]
	if !ok {
		return "", nil
	}
	args := spec.args(schema, table, object)

	var ident string
	var comment sql.NullString
	if err := db.QueryRow(spec.commentQuery, args...).Scan(&ident, &comment); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	var statements []string
	if comment.Valid {
		statements = append(statements, "COMMENT ON "+spec.commentKind+" "+ident+"\nIS "+comment.String+";")
	}
	if spec.columns {
		columnComments, err := postgresqlColumnComments(db, args[0])
		if err != nil {
			return "", err
		}
		for _, c := range columnComments {
			statements = append(statements, "COMMENT ON COLUMN "+ident+"."+c.name+"\nIS "+c.comment+";")
		}
	}
	if spec.grantQuery != "" {
		entries, err := postgresqlACLEntries(db, spec.grantQuery, args)
		if err != nil {
			return "", err
		}
		statements = append(statements, pgFormatGrants(spec.grantKind, ident, entries)...)
	}
	if spec.columns {
		entries, err := postgresqlColumnACLEntries(db, args[0])
		if err != nil {
			return "", err
		}
		statements = append(statements, pgFormatGrants("TABLE", ident, entries)...)
	}
	return pgJoinDDLExtras(statements), nil
}

// postgresqlDDLRoleExtras is the "role" spec's hand-written half: a role has
// no ACL of its own, so what stands in for its privileges is the set of roles
// it is a member of — the GRANT statements needed to reproduce it alongside
// the CREATE ROLE from postgresqlDDLRole.
func postgresqlDDLRoleExtras(db *sql.DB, name string) (string, error) {
	spec := pgDDLExtrasSpecs["role"]
	var ident string
	var comment sql.NullString
	if err := db.QueryRow(spec.commentQuery, name).Scan(&ident, &comment); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}

	var statements []string
	if comment.Valid {
		statements = append(statements, "COMMENT ON ROLE "+ident+"\nIS "+comment.String+";")
	}

	// Grouped by granted role rather than listed per pg_auth_members row:
	// PostgreSQL 16 made a membership recordable once per grantor, so the same
	// "GRANT parent TO role" can have several rows behind it.
	rows, err := db.Query(`
		select quote_ident(g.rolname), bool_or(am.admin_option)
		from pg_auth_members am
		inner join pg_roles g on g.oid = am.roleid
		inner join pg_roles m on m.oid = am.member
		where quote_ident(m.rolname) = $1
		group by 1
		order by 1
	`, name)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var parent string
		var adminOption bool
		if err := rows.Scan(&parent, &adminOption); err != nil {
			return "", err
		}
		statement := "GRANT " + parent + " TO " + ident
		if adminOption {
			statement += " WITH ADMIN OPTION"
		}
		statements = append(statements, statement+";")
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return pgJoinDDLExtras(statements), nil
}

type pgColumnComment struct {
	name    string
	comment string
}

// postgresqlColumnComments lists the COMMENT ON COLUMN payloads for a
// relation, in column order.
func postgresqlColumnComments(db *sql.DB, relation any) ([]pgColumnComment, error) {
	rows, err := db.Query(`
		select quote_ident(a.attname), quote_literal(col_description(a.attrelid, a.attnum))
		from pg_attribute a
		where a.attrelid = $1::regclass
		  and a.attnum > 0
		  and not a.attisdropped
		  and col_description(a.attrelid, a.attnum) is not null
		order by a.attnum
	`, relation)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]pgColumnComment, 0)
	for rows.Next() {
		var c pgColumnComment
		if err := rows.Scan(&c.name, &c.comment); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func postgresqlACLEntries(db *sql.DB, query string, args []any) ([]grantEntry, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]grantEntry, 0)
	for rows.Next() {
		var e grantEntry
		if err := rows.Scan(&e.grantee, &e.privilege, &e.grantable); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// postgresqlColumnACLEntries explodes the per-column ACLs of a relation.
// attacl is NULL unless a column-level GRANT was actually issued, and
// aclexplode(NULL) yields no rows, so there's no acldefault()/owner filtering
// to do here the way the object-level queries need.
func postgresqlColumnACLEntries(db *sql.DB, relation any) ([]grantEntry, error) {
	rows, err := db.Query(`
		select case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
		       a.privilege_type,
		       a.is_grantable,
		       quote_ident(c.attname)
		from pg_attribute c, aclexplode(c.attacl) a
		where c.attrelid = $1::regclass
		  and c.attnum > 0
		  and not c.attisdropped
	`, relation)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]grantEntry, 0)
	for rows.Next() {
		var e grantEntry
		if err := rows.Scan(&e.grantee, &e.privilege, &e.grantable, &e.column); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// pgFormatGrants writes one GRANT statement per group groupGrantEntries
// produces — the shape GRANT itself accepts and pg_dump emits, rather than a
// separate statement per privilege.
func pgFormatGrants(kind, ident string, entries []grantEntry) []string {
	groups := groupGrantEntries(entries)
	statements := make([]string, 0, len(groups))
	for _, group := range groups {
		var b strings.Builder
		b.WriteString("GRANT " + strings.Join(group.privileges, ", "))
		if group.column != "" {
			b.WriteString(" (" + group.column + ")")
		}
		b.WriteString(" ON " + kind + " " + ident + " TO " + group.grantee)
		if group.grantable {
			b.WriteString(" WITH GRANT OPTION")
		}
		b.WriteString(";")
		statements = append(statements, b.String())
	}
	return statements
}

// pgJoinDDLExtras assembles the block appended to an object's CREATE
// statement: a blank line, then the COMMENT ON statements, then a blank line
// before the GRANTs — laid out like postgresqlDDLClass's own output, so a
// table's DDL and a schema's read the same way.
func pgJoinDDLExtras(statements []string) string {
	if len(statements) == 0 {
		return ""
	}
	var b strings.Builder
	previousWasGrant := false
	for i, statement := range statements {
		isGrant := strings.HasPrefix(statement, "GRANT ")
		switch {
		case i == 0:
			b.WriteString("\n\n")
		case isGrant && !previousWasGrant:
			b.WriteString("\n\n")
		default:
			b.WriteString("\n")
		}
		b.WriteString(statement)
		previousWasGrant = isGrant
	}
	b.WriteString("\n")
	return b.String()
}
