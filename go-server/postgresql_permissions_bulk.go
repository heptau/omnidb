package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// pgBulkKind describes one "ALL <kind> IN SCHEMA" bulk target. objectType is
// the pgValidPrivilegesByObjectType key its privileges are validated
// against, keyword the plural grammar word GRANT/REVOKE expect.
type pgBulkKind struct {
	keyword    string
	objectType string
}

// pgBulkKinds lists what GRANT/REVOKE ... ON ALL <kind> IN SCHEMA supports.
// TABLES also covers views, materialized views and foreign tables (that is
// how Postgres itself defines it), so there is no separate "views" kind.
var pgBulkKinds = map[string]pgBulkKind{
	"tables":     {"TABLES", "table"},
	"sequences":  {"SEQUENCES", "sequence"},
	"functions":  {"FUNCTIONS", "function"},
	"procedures": {"PROCEDURES", "procedure"},
}

// pgDefaultPrivilegeKinds lists what ALTER DEFAULT PRIVILEGES supports. There
// is no "procedures" kind -- FUNCTIONS covers routines too (PG 11+). SCHEMAS
// is the one kind that cannot be combined with IN SCHEMA.
var pgDefaultPrivilegeKinds = map[string]pgBulkKind{
	"tables":    {"TABLES", "table"},
	"sequences": {"SEQUENCES", "sequence"},
	"functions": {"FUNCTIONS", "function"},
	"types":     {"TYPES", "type"},
	"schemas":   {"SCHEMAS", "schema"},
}

// pgDefaultACLObjTypeToKind maps pg_default_acl.defaclobjtype to the kind
// keys above.
var pgDefaultACLObjTypeToKind = map[string]string{
	"r": "tables",
	"S": "sequences",
	"f": "functions",
	"T": "types",
	"n": "schemas",
}

// verifiedSchemaIdent confirms a schema exists and returns its safely quoted
// identifier; the schema arrives quote_ident()-quoted from the panel's
// pickers, same convention as verifyGrantableObject.
func verifiedSchemaIdent(db *sql.DB, schema string) (string, error) {
	kind, ident, err := verifyGrantableObject(db, "schema", "", schema)
	if err != nil {
		return "", err
	}
	if kind == "" {
		return "", fmt.Errorf("schema does not exist")
	}
	return ident, nil
}

// buildBulkObjectPrivilegeSQL renders GRANT/REVOKE ... ON ALL <kind> IN
// SCHEMA ... . Only objects that exist right now are affected; objects
// created later need ALTER DEFAULT PRIVILEGES (see
// buildAlterDefaultPrivilegesSQL).
func buildBulkObjectPrivilegeSQL(db *sql.DB, revoke bool, role, kind, schema string, privileges []string, grantable bool) (string, error) {
	spec, ok := pgBulkKinds[kind]
	if !ok {
		return "", fmt.Errorf("unsupported bulk object kind: %s", kind)
	}
	roleSQL, err := postgresRoleOrPublicSQL(db, role)
	if err != nil {
		return "", err
	}
	privs, err := validatePrivilegesForObjectType(spec.objectType, privileges)
	if err != nil {
		return "", err
	}
	schemaIdent, err := verifiedSchemaIdent(db, schema)
	if err != nil {
		return "", err
	}

	target := " ON ALL " + spec.keyword + " IN SCHEMA " + schemaIdent
	if revoke {
		return "REVOKE " + strings.Join(privs, ", ") + target + " FROM " + roleSQL, nil
	}
	stmt := "GRANT " + strings.Join(privs, ", ") + target + " TO " + roleSQL
	if grantable {
		stmt += " WITH GRANT OPTION"
	}
	return stmt, nil
}

// buildAlterDefaultPrivilegesSQL renders ALTER DEFAULT PRIVILEGES [FOR ROLE
// creator] [IN SCHEMA schema] GRANT/REVOKE ... . An empty creator means
// "the current user" (Postgres's own default); an empty schema means the
// database-wide default.
func buildAlterDefaultPrivilegesSQL(db *sql.DB, revoke bool, role, creator, schema, kind string, privileges []string, grantable bool) (string, error) {
	spec, ok := pgDefaultPrivilegeKinds[kind]
	if !ok {
		return "", fmt.Errorf("unsupported default privilege kind: %s", kind)
	}
	if kind == "schemas" && strings.TrimSpace(schema) != "" {
		return "", fmt.Errorf("default privileges on schemas cannot be limited to a schema")
	}
	roleSQL, err := postgresRoleOrPublicSQL(db, role)
	if err != nil {
		return "", err
	}
	privs, err := validatePrivilegesForObjectType(spec.objectType, privileges)
	if err != nil {
		return "", err
	}

	stmt := "ALTER DEFAULT PRIVILEGES"
	if strings.TrimSpace(creator) != "" {
		verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(creator))
		if err != nil {
			return "", err
		}
		if verified == "" {
			return "", fmt.Errorf("role does not exist")
		}
		stmt += " FOR ROLE " + quotePostgresIdentifierDoubleQuoted(verified)
	}
	if strings.TrimSpace(schema) != "" {
		schemaIdent, err := verifiedSchemaIdent(db, schema)
		if err != nil {
			return "", err
		}
		stmt += " IN SCHEMA " + schemaIdent
	}

	if revoke {
		return stmt + " REVOKE " + strings.Join(privs, ", ") + " ON " + spec.keyword + " FROM " + roleSQL, nil
	}
	stmt += " GRANT " + strings.Join(privs, ", ") + " ON " + spec.keyword + " TO " + roleSQL
	if grantable {
		stmt += " WITH GRANT OPTION"
	}
	return stmt, nil
}

// postgresqlDefaultPrivilegeEntry is one (creator, schema, kind, grantee)
// default-ACL slot with the privileges it grants.
type postgresqlDefaultPrivilegeEntry struct {
	Creator    string
	Schema     string // "" = database-wide
	Kind       string // key of pgDefaultPrivilegeKinds
	Grantee    string // "PUBLIC" for the pseudo-role
	Privileges []postgresqlDefaultPrivilege
}

type postgresqlDefaultPrivilege struct {
	Privilege string
	Grantable bool
}

// postgresqlRoleDefaultPrivileges lists the current database's default
// privileges that involve the role -- either as grantee ("new tables get
// SELECT for this role") or as creator ("objects this role creates get these
// grants"). pg_default_acl is per database, hence the caller connecting to
// the database being inspected.
func postgresqlRoleDefaultPrivileges(db *sql.DB, role string) ([]postgresqlDefaultPrivilegeEntry, error) {
	isPublic := isPublicPseudoRole(role)
	rolName := ""
	if !isPublic {
		rolName = unquotePostgresIdentifier(role)
	}
	rows, err := db.Query(`
		select pg_get_userbyid(d.defaclrole),
		       coalesce(quote_ident(n.nspname), ''),
		       d.defaclobjtype::text,
		       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
		       a.privilege_type,
		       a.is_grantable
		from pg_default_acl d
		left join pg_namespace n on n.oid = d.defaclnamespace
		cross join lateral aclexplode(d.defaclacl) a
		where ($1::boolean and a.grantee = 0)
		   or (not $1::boolean and (pg_get_userbyid(a.grantee) = $2 or pg_get_userbyid(d.defaclrole) = $2))
		order by 1, 2, 3, 4, 5
	`, isPublic, rolName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []postgresqlDefaultPrivilegeEntry
	index := map[string]int{}
	for rows.Next() {
		var creator, schema, objType, grantee, privilege string
		var grantable bool
		if err := rows.Scan(&creator, &schema, &objType, &grantee, &privilege, &grantable); err != nil {
			return nil, err
		}
		kind, ok := pgDefaultACLObjTypeToKind[objType]
		if !ok {
			continue // a kind newer than this panel knows (e.g. large objects)
		}
		key := creator + "\x00" + schema + "\x00" + kind + "\x00" + grantee
		i, seen := index[key]
		if !seen {
			i = len(out)
			index[key] = i
			out = append(out, postgresqlDefaultPrivilegeEntry{Creator: creator, Schema: schema, Kind: kind, Grantee: grantee})
		}
		out[i].Privileges = append(out[i].Privileges, postgresqlDefaultPrivilege{Privilege: privilege, Grantable: grantable})
	}
	return out, rows.Err()
}
