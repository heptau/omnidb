package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// This file backs GRANT/REVOKE execution for the Permissions panel's
// columns 3/4 (postgresql_permissions_effective.go): databases, schemas,
// tables, views, materialized views, sequences, functions, procedures,
// types, domains, tablespaces, foreign data wrappers and foreign servers.
// Foreign tables are a later phase (see the plan this was built from).
//
// The reverse-ACL *reads* this file used to also provide (columns 3/4's
// predecessor: column 2's now-removed "Object Privileges" section, direct
// grants only, no inheritance attribution) have been fully superseded by
// postgresql_permissions_effective.go's postgresqlRoleServerObjectGrants/
// postgresqlRoleDatabaseObjectGrants — see this file's git history for the
// old pgRoleObjectGrantsSQL/postgresqlRoleObjectGrants/groupObjectGrantRows
// if that's ever useful again.

// pgSystemSchemaExcludeSQL mirrors postgresqlSchemas' own noise filter
// (postgresql.go) — pg_catalog/information_schema/pg_toast and Postgres's
// own temp-schema naming convention carry no privileges anyone manages by
// hand (PUBLIC gets a default EXECUTE on hundreds of built-in pg_catalog
// functions alone), so every branch below excludes them the same way the
// object picker's own schema list will.
const pgSystemSchemaExcludeSQL = `n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg%temp%'`

// pgValidPrivilegesByObjectType is the GRANT-privilege allow-list per object
// type. Privilege keywords go straight into DDL text (GRANT's privilege
// list can't be bound as a parameter, same grammar restriction as every
// other clause this file's sibling postgresql_permissions.go ran into), so
// this whitelist is the injection defense in place of one — every incoming
// privilege string, whatever the caller (an arbitrary HTTP request, not
// necessarily this app's own picker UI), must match one of these exactly.
var pgValidPrivilegesByObjectType = map[string]map[string]bool{
	"database":             {"CREATE": true, "CONNECT": true, "TEMPORARY": true},
	"schema":               {"CREATE": true, "USAGE": true},
	"table":                {"SELECT": true, "INSERT": true, "UPDATE": true, "DELETE": true, "TRUNCATE": true, "REFERENCES": true, "TRIGGER": true},
	"view":                 {"SELECT": true, "INSERT": true, "UPDATE": true, "DELETE": true, "TRUNCATE": true, "REFERENCES": true, "TRIGGER": true},
	"materialized_view":    {"SELECT": true, "INSERT": true, "UPDATE": true, "DELETE": true, "TRUNCATE": true, "REFERENCES": true, "TRIGGER": true},
	"sequence":             {"USAGE": true, "SELECT": true, "UPDATE": true},
	"function":             {"EXECUTE": true},
	"procedure":            {"EXECUTE": true},
	"type":                 {"USAGE": true},
	"domain":               {"USAGE": true},
	"foreign_data_wrapper": {"USAGE": true},
	"foreign_server":       {"USAGE": true},
	"tablespace":           {"CREATE": true},
}

// validatePrivilegesForObjectType upper-cases/dedupes and checks every
// requested privilege against pgValidPrivilegesByObjectType, returning a
// descriptive error naming the first bad one rather than silently dropping
// it — an unrecognized privilege is either a UI/API version mismatch or a
// tampered request, both worth surfacing rather than hiding.
func validatePrivilegesForObjectType(objectType string, privileges []string) ([]string, error) {
	allowed, ok := pgValidPrivilegesByObjectType[objectType]
	if !ok {
		return nil, fmt.Errorf("unsupported object type: %s", objectType)
	}
	if len(privileges) == 0 {
		return nil, fmt.Errorf("no privileges selected")
	}
	out := make([]string, 0, len(privileges))
	seen := make(map[string]bool, len(privileges))
	for _, p := range privileges {
		up := strings.ToUpper(strings.TrimSpace(p))
		if !allowed[up] {
			return nil, fmt.Errorf("invalid privilege %q for object type %q", p, objectType)
		}
		// Emit the allow-list's own keyword, not the request-supplied text.
		for keyword := range allowed {
			if keyword == up && !seen[keyword] {
				seen[keyword] = true
				out = append(out, keyword)
			}
		}
	}
	return out, nil
}

// verifyGrantableObject confirms an object of the given type exists and
// returns the GRANT keyword for its kind plus its safely quoted identifier
// text, ready to splice into "GRANT ... ON <kind> <identifier> TO ...".
// schema/object arrive already quote_ident()-quoted from the Permissions
// panel's object picker — the same convention pgDDLExtrasSpecs' own queries
// assume (see postgresql_ddl_extras.go's module comment) — so each lookup
// below just matches quote_ident(catalog column) against the incoming
// value, exactly like those queries do. A "" grantKind (nil error) means
// the object was not found; the caller turns that into a normal error
// response rather than silently no-oping.
func verifyGrantableObject(db *sql.DB, objectType, schema, object string) (grantKind, identifier string, err error) {
	notFound := func(e error) (string, string, error) {
		if errors.Is(e, sql.ErrNoRows) {
			return "", "", nil
		}
		return "", "", e
	}

	switch objectType {
	case "database":
		var ident string
		if err := db.QueryRow(`select quote_ident(datname) from pg_database where quote_ident(datname) = $1`, object).Scan(&ident); err != nil {
			return notFound(err)
		}
		return "DATABASE", ident, nil
	case "schema":
		var ident string
		if err := db.QueryRow(`select quote_ident(nspname) from pg_namespace where quote_ident(nspname) = $1`, object).Scan(&ident); err != nil {
			return notFound(err)
		}
		return "SCHEMA", ident, nil
	case "table", "view":
		var s, o string
		err := db.QueryRow(`
			select quote_ident(n.nspname), quote_ident(c.relname)
			from pg_class c
			inner join pg_namespace n on n.oid = c.relnamespace
			where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
			  and c.relkind in ('r', 'p', 'v')
		`, schema, object).Scan(&s, &o)
		if err != nil {
			return notFound(err)
		}
		return "TABLE", s + "." + o, nil
	case "sequence":
		var s, o string
		err := db.QueryRow(`
			select quote_ident(n.nspname), quote_ident(c.relname)
			from pg_class c
			inner join pg_namespace n on n.oid = c.relnamespace
			where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
			  and c.relkind = 'S'
		`, schema, object).Scan(&s, &o)
		if err != nil {
			return notFound(err)
		}
		return "SEQUENCE", s + "." + o, nil
	case "function", "procedure":
		// object arrives as the routine's own regprocedure identity string
		// (e.g. "public.myfunc(integer)"), same as get_functions_postgresql/
		// get_procedures_postgresql's own v_id — schema is unused here. An
		// identity that doesn't resolve raises a real Postgres error (not
		// ErrNoRows), which is fine: it surfaces as-is to the caller.
		var ident string
		if err := db.QueryRow(`select $1::regprocedure::text`, object).Scan(&ident); err != nil {
			return "", "", err
		}
		if objectType == "procedure" {
			return "PROCEDURE", ident, nil
		}
		return "FUNCTION", ident, nil
	case "tablespace":
		var ident string
		if err := db.QueryRow(`select quote_ident(spcname) from pg_tablespace where quote_ident(spcname) = $1`, object).Scan(&ident); err != nil {
			return notFound(err)
		}
		return "TABLESPACE", ident, nil
	case "materialized_view":
		// GRANT/REVOKE have no separate MATERIALIZED VIEW keyword (confirmed
		// live: "GRANT ... ON TABLE a_matview" and the bare "ON a_matview"
		// form both work identically to a real table's) -- only relkind 'm'
		// differs from the "table", "view" case above.
		var s, o string
		err := db.QueryRow(`
			select quote_ident(n.nspname), quote_ident(c.relname)
			from pg_class c
			inner join pg_namespace n on n.oid = c.relnamespace
			where quote_ident(n.nspname) = $1 and quote_ident(c.relname) = $2
			  and c.relkind = 'm'
		`, schema, object).Scan(&s, &o)
		if err != nil {
			return notFound(err)
		}
		return "TABLE", s + "." + o, nil
	case "type", "domain":
		// Mirrors postgresqlTypes'/postgresqlDomains' (postgresql_
		// serverlevel.go) own filter exactly -- excluding a relation's
		// implicit row type and array types keeps this in lockstep with
		// what the object picker actually lists, so "not found" here always
		// means "not a real, pickable type/domain" rather than "found the
		// wrong kind of pg_type row". typtype's condition is the only thing
		// that differs between the two.
		var typtypeCond string
		var kind string
		if objectType == "domain" {
			typtypeCond, kind = "t.typtype = 'd'", "DOMAIN"
		} else {
			typtypeCond, kind = "t.typtype <> 'd'", "TYPE"
		}
		// Schema-qualified: a bare type name resolves through search_path,
		// so a same-named type in another schema (e.g. one planted in
		// public) would receive the GRANT/REVOKE instead.
		var ident string
		err := db.QueryRow(`
			select quote_ident(n.nspname) || '.' || quote_ident(t.typname)
			from pg_type t
			inner join pg_namespace n on n.oid = t.typnamespace
			where (t.typrelid = 0 or (select c.relkind = 'c' from pg_class c where c.oid = t.typrelid))
			  and not exists(select 1 from pg_type el where el.oid = t.typelem and el.typarray = t.oid)
			  and `+typtypeCond+`
			  and quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
		`, schema, object).Scan(&ident)
		if err != nil {
			return notFound(err)
		}
		return kind, ident, nil
	case "foreign_data_wrapper":
		var ident string
		if err := db.QueryRow(`select quote_ident(fdwname) from pg_foreign_data_wrapper where quote_ident(fdwname) = $1`, object).Scan(&ident); err != nil {
			return notFound(err)
		}
		return "FOREIGN DATA WRAPPER", ident, nil
	case "foreign_server":
		var ident string
		if err := db.QueryRow(`select quote_ident(srvname) from pg_foreign_server where quote_ident(srvname) = $1`, object).Scan(&ident); err != nil {
			return notFound(err)
		}
		return "FOREIGN SERVER", ident, nil
	default:
		return "", "", fmt.Errorf("unsupported object type: %s", objectType)
	}
}

// isPublicPseudoRole reports whether a role-targeting request names
// PostgreSQL's PUBLIC pseudo-role rather than a real one. PUBLIC is never a
// row in pg_roles — it's a grammar keyword aclexplode() surfaces as grantee
// 0 (see pgServerObjectGrantsSQL/pgDatabaseObjectGrantsSQL,
// postgresql_permissions_effective.go) — so postgresVerifiedRoleName would
// always report it as "does not exist". Case-insensitive/trimmed to match
// how Postgres itself recognizes the keyword regardless of case.
func isPublicPseudoRole(name string) bool {
	return strings.EqualFold(strings.TrimSpace(name), "PUBLIC")
}

// postgresRoleOrPublicSQL resolves a GRANT/REVOKE target into the exact text
// to splice after TO/FROM: PUBLIC is emitted as the bare, unquoted keyword
// (quoting it — "PUBLIC" — would instead target a real role literally named
// "PUBLIC" if one ever existed, which is not what the pseudo-role means),
// while an ordinary role name still goes through the usual verified-and-
// quoted lookup every other role-targeting statement in this package uses.
func postgresRoleOrPublicSQL(db *sql.DB, role string) (string, error) {
	if isPublicPseudoRole(role) {
		return "PUBLIC", nil
	}
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(role))
	if err != nil {
		return "", err
	}
	if verified == "" {
		return "", fmt.Errorf("role does not exist")
	}
	return quotePostgresIdentifierDoubleQuoted(verified), nil
}

// postgresqlGrantObjectPrivilege executes GRANT directly — the Permissions
// panel's "add object privilege" action. role may be PUBLIC (see
// postgresRoleOrPublicSQL) — granting directly to PUBLIC is how the
// Permissions panel lets PUBLIC itself be the focused/edited role.
func postgresqlGrantObjectPrivilege(db *sql.DB, role, objectType, schema, object string, privileges []string, grantable bool) error {
	roleSQL, err := postgresRoleOrPublicSQL(db, role)
	if err != nil {
		return err
	}

	privs, err := validatePrivilegesForObjectType(objectType, privileges)
	if err != nil {
		return err
	}

	kind, ident, err := verifyGrantableObject(db, objectType, schema, object)
	if err != nil {
		return err
	}
	if kind == "" {
		return fmt.Errorf("object does not exist")
	}

	stmt := "GRANT " + strings.Join(privs, ", ") + " ON " + kind + " " + ident + " TO " + roleSQL
	if grantable {
		stmt += " WITH GRANT OPTION"
	}
	_, err = db.Exec(stmt)
	return err
}

// postgresqlRevokeObjectPrivilege executes REVOKE directly — the
// Permissions panel's "remove object privilege" action. Always revokes the
// full privilege (and any grant option on it), matching the panel's "remove
// this grant row" UX rather than exposing REVOKE GRANT OPTION FOR's
// narrower "keep the privilege, strip only re-grant rights" form.
func postgresqlRevokeObjectPrivilege(db *sql.DB, role, objectType, schema, object string, privileges []string) error {
	roleSQL, err := postgresRoleOrPublicSQL(db, role)
	if err != nil {
		return err
	}

	privs, err := validatePrivilegesForObjectType(objectType, privileges)
	if err != nil {
		return err
	}

	kind, ident, err := verifyGrantableObject(db, objectType, schema, object)
	if err != nil {
		return err
	}
	if kind == "" {
		return fmt.Errorf("object does not exist")
	}

	stmt := "REVOKE " + strings.Join(privs, ", ") + " ON " + kind + " " + ident + " FROM " + roleSQL
	_, err = db.Exec(stmt)
	return err
}
