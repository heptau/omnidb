package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// pgAccessSpec describes how "who can access this object" is computed for one
// object type: the has_*_privilege function that answers effectively
// (ownership, superuser, membership inheritance and PUBLIC all included), how
// the object is passed to it, and the query yielding its ACL and owner.
type pgAccessSpec struct {
	hasFunc    string   // has_table_privilege, ...
	objectExpr string   // expression over $1 handed to hasFunc as the object
	byName     bool     // $1 is the plain (unquoted) object name, not a quoted identifier
	aclSQL     string   // select acl (aclitem[], NULL acldefault-expanded), owner name; $1 as above
	privileges []string // display order
}

// pgRelationAccess covers tables, views and materialized views, which all
// share has_table_privilege and pg_class's ACL.
func pgRelationAccess() pgAccessSpec {
	return pgAccessSpec{
		hasFunc:    "has_table_privilege",
		objectExpr: "$1::regclass",
		aclSQL:     `select coalesce(c.relacl, acldefault('r', c.relowner)), pg_get_userbyid(c.relowner) from pg_class c where c.oid = $1::regclass`,
		privileges: []string{"SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"},
	}
}

// pgAccessSpecs is keyed like pgValidPrivilegesByObjectType. The expressions
// and function names are constants, never request text; only $1 carries the
// (already verified) object.
var pgAccessSpecs = map[string]pgAccessSpec{
	"database": {
		hasFunc: "has_database_privilege", objectExpr: "$1::text", byName: true,
		aclSQL:     `select coalesce(d.datacl, acldefault('d', d.datdba)), pg_get_userbyid(d.datdba) from pg_database d where d.datname = $1`,
		privileges: []string{"CREATE", "CONNECT", "TEMPORARY"},
	},
	"schema": {
		hasFunc: "has_schema_privilege", objectExpr: "$1::text", byName: true,
		aclSQL:     `select coalesce(n.nspacl, acldefault('n', n.nspowner)), pg_get_userbyid(n.nspowner) from pg_namespace n where n.nspname = $1`,
		privileges: []string{"CREATE", "USAGE"},
	},
	"table":             pgRelationAccess(),
	"view":              pgRelationAccess(),
	"materialized_view": pgRelationAccess(),
	"sequence": {
		hasFunc: "has_sequence_privilege", objectExpr: "$1::regclass",
		aclSQL:     `select coalesce(c.relacl, acldefault('s', c.relowner)), pg_get_userbyid(c.relowner) from pg_class c where c.oid = $1::regclass`,
		privileges: []string{"USAGE", "SELECT", "UPDATE"},
	},
	"function": {
		hasFunc: "has_function_privilege", objectExpr: "$1::regprocedure",
		aclSQL:     `select coalesce(p.proacl, acldefault('f', p.proowner)), pg_get_userbyid(p.proowner) from pg_proc p where p.oid = $1::regprocedure`,
		privileges: []string{"EXECUTE"},
	},
	"procedure": {
		hasFunc: "has_function_privilege", objectExpr: "$1::regprocedure",
		aclSQL:     `select coalesce(p.proacl, acldefault('f', p.proowner)), pg_get_userbyid(p.proowner) from pg_proc p where p.oid = $1::regprocedure`,
		privileges: []string{"EXECUTE"},
	},
	"type": {
		hasFunc: "has_type_privilege", objectExpr: "$1::regtype",
		aclSQL:     `select coalesce(t.typacl, acldefault('T', t.typowner)), pg_get_userbyid(t.typowner) from pg_type t where t.oid = $1::regtype`,
		privileges: []string{"USAGE"},
	},
	"domain": {
		hasFunc: "has_type_privilege", objectExpr: "$1::regtype",
		aclSQL:     `select coalesce(t.typacl, acldefault('T', t.typowner)), pg_get_userbyid(t.typowner) from pg_type t where t.oid = $1::regtype`,
		privileges: []string{"USAGE"},
	},
	"foreign_data_wrapper": {
		hasFunc: "has_foreign_data_wrapper_privilege", objectExpr: "$1::text", byName: true,
		aclSQL:     `select coalesce(f.fdwacl, acldefault('F', f.fdwowner)), pg_get_userbyid(f.fdwowner) from pg_foreign_data_wrapper f where f.fdwname = $1`,
		privileges: []string{"USAGE"},
	},
	"foreign_server": {
		hasFunc: "has_server_privilege", objectExpr: "$1::text", byName: true,
		aclSQL:     `select coalesce(s.srvacl, acldefault('S', s.srvowner)), pg_get_userbyid(s.srvowner) from pg_foreign_server s where s.srvname = $1`,
		privileges: []string{"USAGE"},
	},
	"tablespace": {
		hasFunc: "has_tablespace_privilege", objectExpr: "$1::text", byName: true,
		aclSQL:     `select coalesce(t.spcacl, acldefault('t', t.spcowner)), pg_get_userbyid(t.spcowner) from pg_tablespace t where t.spcname = $1`,
		privileges: []string{"CREATE"},
	},
}

// postgresqlAccessPrivilege is one privilege a role holds on the object and
// where it comes from: "owner", "direct" (an ACL entry naming the role),
// "superuser", or "inherited" (through a membership).
type postgresqlAccessPrivilege struct {
	Privilege string
	Source    string
	Grantable bool
}

type postgresqlAccessRole struct {
	Role       string // "PUBLIC" for the pseudo-role
	Superuser  bool
	Privileges []postgresqlAccessPrivilege
}

// postgresqlObjectAccess answers "who can do what with this object": every
// role with at least one privilege it holds itself -- as owner, by a direct
// grant, as a superuser or through a membership -- plus PUBLIC when the ACL
// grants it anything. Roles whose only access is what every role gets from
// PUBLIC are left out (they would be the whole role list), as are Postgres's
// predefined pg_* roles unless something was granted to them directly.
// Effective access comes from Postgres's own has_*_privilege functions, so
// it matches what the server would really allow; the ACL is read separately
// only to label each privilege's source.
func postgresqlObjectAccess(db *sql.DB, objectType, schema, object string) (owner string, roles []postgresqlAccessRole, err error) {
	spec, ok := pgAccessSpecs[objectType]
	if !ok {
		return "", nil, fmt.Errorf("unsupported object type: %s", objectType)
	}
	kind, ident, err := verifyGrantableObject(db, objectType, schema, object)
	if err != nil {
		return "", nil, err
	}
	if kind == "" {
		return "", nil, fmt.Errorf("object does not exist")
	}
	arg := ident
	if spec.byName {
		arg = unquotePostgresIdentifier(ident)
	}

	// The owner first (an owner who revoked their own privileges leaves no
	// ACL row to read it from), then the direct grants.
	var ownerName string
	if err := db.QueryRow(`select x.owner from (`+spec.aclSQL+`) x(acl, owner)`, arg).Scan(&ownerName); err != nil {
		return "", nil, err
	}
	aclRows, err := db.Query(`
		select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end, a.privilege_type, a.is_grantable
		from (`+spec.aclSQL+`) x(acl, owner)
		cross join lateral aclexplode(x.acl) a
	`, arg)
	if err != nil {
		return "", nil, err
	}
	type direct struct{ grantable bool }
	directByRole := map[string]map[string]direct{}
	for aclRows.Next() {
		var grantee, privilege string
		var grantable bool
		if err := aclRows.Scan(&grantee, &privilege, &grantable); err != nil {
			aclRows.Close()
			return "", nil, err
		}
		if directByRole[grantee] == nil {
			directByRole[grantee] = map[string]direct{}
		}
		directByRole[grantee][privilege] = direct{grantable}
	}
	aclRows.Close()
	if err := aclRows.Err(); err != nil {
		return "", nil, err
	}

	// Effective access per role.
	rows, err := db.Query(`
		select r.rolname, r.rolsuper, array(
			select p from unnest($2::text[]) p where `+spec.hasFunc+`(r.oid, `+spec.objectExpr+`, p)
		)
		from pg_roles r
		order by r.rolname
	`, arg, "{"+strings.Join(spec.privileges, ",")+"}")
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()

	publicHas := map[string]bool{}
	for priv := range directByRole["PUBLIC"] {
		publicHas[priv] = true
	}

	if pub := directByRole["PUBLIC"]; len(pub) > 0 {
		entry := postgresqlAccessRole{Role: "PUBLIC"}
		for _, priv := range spec.privileges {
			if d, ok := pub[priv]; ok {
				entry.Privileges = append(entry.Privileges, postgresqlAccessPrivilege{Privilege: priv, Source: "direct", Grantable: d.grantable})
			}
		}
		roles = append(roles, entry)
	}

	for rows.Next() {
		var name string
		var super bool
		var held string
		if err := rows.Scan(&name, &super, &held); err != nil {
			return "", nil, err
		}
		// pgx renders a text[] scanned into a string as {A,B}.
		privileges := strings.Split(strings.Trim(held, "{}"), ",")
		entry := postgresqlAccessRole{Role: name, Superuser: super}
		predefined := strings.HasPrefix(name, "pg_")
		for _, priv := range spec.privileges {
			if !contains(privileges, priv) {
				continue
			}
			item := postgresqlAccessPrivilege{Privilege: priv}
			switch d, isDirect := directByRole[name][priv]; {
			case name == ownerName:
				item.Source = "owner"
			case isDirect:
				item.Source, item.Grantable = "direct", d.grantable
			case super:
				item.Source = "superuser"
			case publicHas[priv]:
				continue // everyone has it through PUBLIC; PUBLIC's own row says so
			default:
				item.Source = "inherited"
			}
			if predefined && item.Source != "direct" {
				continue
			}
			entry.Privileges = append(entry.Privileges, item)
		}
		if len(entry.Privileges) > 0 {
			roles = append(roles, entry)
		}
	}
	return ownerName, roles, rows.Err()
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
