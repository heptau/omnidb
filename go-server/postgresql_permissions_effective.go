package main

import (
	"database/sql"
	"sort"
)

// This file backs the Permissions panel's columns 3+ (see
// postgresql_permissions_objects.go for the column-2-only, direct-grants-
// per-role model those still use) — an *effective*-privileges view that
// covers a role's own direct grants together with everything it inherits
// through postgresqlRoleAncestors (postgresql_permissions.go) and PUBLIC,
// attributing each privilege to whichever grantee(s) actually hold it. The
// frontend tells a direct grant from an inherited one by checking whether
// the focused role's own name is among a privilege's Sources, rather than
// this package pre-deciding that for a single caller — the same grouped
// shape serves any focus role, PUBLIC included (see
// postgresqlRoleAndAncestorNames).
//
// Column 3 (postgresqlRoleServerObjectGrants, this file) covers the two
// object types that are not scoped to any one database — pg_database and
// pg_tablespace are shared/cluster-wide catalogs, visible identically no
// matter which database the connection is on (see
// postgresql_permissions_objects.go's module comment for the shared-vs-
// per-database distinction this app already leans on elsewhere).
//
// Column 4 (postgresqlRoleDatabaseObjectGrants, this file) covers the
// object types that *are* scoped to one database — schema/table/view/
// materialized view/sequence/function/procedure/type/domain/foreign data
// wrapper/foreign server live in pg_namespace/pg_class/pg_proc/pg_type/
// pg_foreign_data_wrapper/pg_foreign_server, which (unlike pg_roles/
// pg_database/pg_tablespace) only show whichever database the connection
// is currently on. The caller picks which database that is
// (a <select> in column 4's header, see outer_permissions_panel.js),
// independent of whatever database the tab itself happens to be pointed
// at, so its handler (postgresql_permissions_effective_handlers.go) opens
// its own connection via resolvePostgreSQLRequestForDatabase
// (postgresql_handlers.go) rather than the tab's usual one — the same
// pattern handleExportDBMLPostgreSQL (postgresql_export_dbml.go) already
// established for "introspect a specific database, not necessarily the
// tab's active one". Grant/revoke for column 4 reuses column 2's own
// postgresqlGrantObjectPrivilege/postgresqlRevokeObjectPrivilege
// (postgresql_permissions_objects.go) through the same optional p_database
// override, rather than needing their own mutating endpoints.

// postgresqlRoleAndAncestorNames returns the focus role's own name plus
// every ancestor postgresqlRoleAncestors finds — the set of grantees whose
// direct grants make up a role's effective privileges, aside from PUBLIC
// (which applies to every role universally via aclexplode()'s grantee = 0
// sentinel, matched directly in SQL rather than by appearing in this list).
// Every name here is already quote_ident()-quoted, same as every role name
// this app passes around (postgresqlRoles, postgresqlRoleAncestors) — the
// effective-grants queries below compare against quote_ident(pg_get_userbyid(...))
// rather than the raw catalog name for exactly that reason, so a role name
// that needs quoting still matches.
//
// PUBLIC itself has no ancestors of its own (it isn't a real pg_roles row —
// see isPublicPseudoRole's comment), so its effective set is the empty
// list: its own direct grants are already fully covered by the grantee = 0
// branch alone.
func postgresqlRoleAndAncestorNames(db *sql.DB, roleName string) ([]string, error) {
	if isPublicPseudoRole(roleName) {
		return []string{}, nil
	}
	ancestors, err := postgresqlRoleAncestors(db, roleName)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(ancestors)+1)
	names = append(names, roleName)
	for _, a := range ancestors {
		names = append(names, a.Name)
	}
	return names, nil
}

// postgresqlPrivilegeSource is one grantee that holds a given privilege on
// a given object — Grantable reflects that specific grantee's own WITH
// GRANT OPTION, not any other source's.
type postgresqlPrivilegeSource struct {
	Grantee   string
	Grantable bool
}

// postgresqlEffectivePrivilege is one privilege on an object, together with
// every grantee (from postgresqlRoleAndAncestorNames, or PUBLIC) who holds
// it directly — never pre-collapsed into a single "the role has it" bit,
// since the panel needs to show *who* it came from for anything that isn't
// a direct grant to the focused role itself.
type postgresqlEffectivePrivilege struct {
	Privilege string
	Sources   []postgresqlPrivilegeSource
}

// postgresqlEffectiveObjectGrants is one object a role's effective
// privilege set reaches, however it gets there.
type postgresqlEffectiveObjectGrants struct {
	ObjectType string
	Schema     string
	ObjectName string
	Identifier string
	Privileges []postgresqlEffectivePrivilege
}

// postgresqlEffectiveGrantRow is one raw (object, grantee, privilege) row
// as scanned straight off an effective-grants query, before
// groupEffectiveGrantRows collapses it.
type postgresqlEffectiveGrantRow struct {
	ObjectType string
	Schema     sql.NullString
	ObjectName string
	Identifier string
	Grantee    string
	Privilege  string
	Grantable  bool
}

// groupEffectiveGrantRows collapses exploded (object, grantee, privilege)
// rows into one entry per object, each holding one postgresqlEffectivePrivilege
// per distinct privilege with every grantee that holds it attached as a
// Source — unlike postgresql_permissions_objects.go's groupObjectGrantRows,
// this never collapses different grantees together into one displayed row,
// since keeping them apart is the entire point of the effective-privileges
// view.
func groupEffectiveGrantRows(rows []postgresqlEffectiveGrantRow) []postgresqlEffectiveObjectGrants {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.Identifier != b.Identifier {
			return a.Identifier < b.Identifier
		}
		if ra, rb := privilegeRank(a.Privilege), privilegeRank(b.Privilege); ra != rb {
			return ra < rb
		}
		if a.Privilege != b.Privilege {
			return a.Privilege < b.Privilege
		}
		if (a.Grantee == "PUBLIC") != (b.Grantee == "PUBLIC") {
			return a.Grantee == "PUBLIC"
		}
		return a.Grantee < b.Grantee
	})

	out := make([]postgresqlEffectiveObjectGrants, 0)
	for _, r := range rows {
		objIdx := len(out) - 1
		if objIdx < 0 || out[objIdx].Identifier != r.Identifier {
			g := postgresqlEffectiveObjectGrants{ObjectType: r.ObjectType, ObjectName: r.ObjectName, Identifier: r.Identifier}
			if r.Schema.Valid {
				g.Schema = r.Schema.String
			}
			out = append(out, g)
			objIdx = len(out) - 1
		}

		privs := out[objIdx].Privileges
		privIdx := len(privs) - 1
		if privIdx < 0 || privs[privIdx].Privilege != r.Privilege {
			privs = append(privs, postgresqlEffectivePrivilege{Privilege: r.Privilege})
			privIdx = len(privs) - 1
		}
		privs[privIdx].Sources = append(privs[privIdx].Sources, postgresqlPrivilegeSource{Grantee: r.Grantee, Grantable: r.Grantable})
		out[objIdx].Privileges = privs
	}
	return out
}

// pgServerObjectGrantsSQL covers the two object types with no per-database
// scope: pg_database and pg_tablespace. $1 is postgresqlRoleAndAncestorNames'
// result (possibly empty, for PUBLIC) — quote_ident(pg_get_userbyid(...))
// on the left rather than the raw catalog name matches every name in $1
// already being quote_ident()-quoted (see that function's comment); PUBLIC
// itself is matched via the grantee = 0 sentinel regardless of $1's
// contents, same as every other aclexplode()-based query in this app.
const pgServerObjectGrantsSQL = `
	select 'database' as object_type, null::text as schema_name, quote_ident(d.datname) as object_name,
	       quote_ident(d.datname) as identifier,
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee,
	       a.privilege_type, a.is_grantable
	from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
	where a.grantee <> d.datdba
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select 'tablespace', null::text, quote_ident(t.spcname), quote_ident(t.spcname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_tablespace t, aclexplode(coalesce(t.spcacl, acldefault('t', t.spcowner))) a
	where a.grantee <> t.spcowner
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))
`

// postgresqlRoleServerObjectGrants is column 3's data source: the given
// role's effective (direct + inherited + PUBLIC) privileges on every
// database and tablespace on the server.
func postgresqlRoleServerObjectGrants(db *sql.DB, roleName string) ([]postgresqlEffectiveObjectGrants, error) {
	roleNames, err := postgresqlRoleAndAncestorNames(db, roleName)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(pgServerObjectGrantsSQL, roleNames)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	raw := make([]postgresqlEffectiveGrantRow, 0)
	for rows.Next() {
		var r postgresqlEffectiveGrantRow
		if err := rows.Scan(&r.ObjectType, &r.Schema, &r.ObjectName, &r.Identifier, &r.Grantee, &r.Privilege, &r.Grantable); err != nil {
			return nil, err
		}
		raw = append(raw, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return groupEffectiveGrantRows(raw), nil
}

// pgDatabaseObjectGrantsSQL covers every object type scoped to one
// database: schema, table+view, sequence, function+procedure, materialized
// view, type+domain, foreign data wrapper and foreign server -- unlike
// pgServerObjectGrantsSQL's database/tablespace above. $1 is an array of
// every attributed grantee (like pgServerObjectGrantsSQL's own $1), matched
// via quote_ident(pg_get_userbyid(...)) against $1's already-quoted names
// on both sides, so a role name that needs quoting still matches (see
// postgresqlRoleAndAncestorNames' comment).
const pgDatabaseObjectGrantsSQL = `
	select 'schema' as object_type, null::text as schema_name, quote_ident(n.nspname) as object_name,
	       quote_ident(n.nspname) as identifier,
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee,
	       a.privilege_type, a.is_grantable
	from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
	where a.grantee <> n.nspowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select case c.relkind when 'v' then 'view' else 'table' end,
	       quote_ident(n.nspname), quote_ident(c.relname), quote_ident(n.nspname) || '.' || quote_ident(c.relname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_class c
	inner join pg_namespace n on n.oid = c.relnamespace
	cross join aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
	where c.relkind in ('r', 'p', 'v')
	  and a.grantee <> c.relowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select 'sequence', quote_ident(n.nspname), quote_ident(c.relname), quote_ident(n.nspname) || '.' || quote_ident(c.relname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_class c
	inner join pg_namespace n on n.oid = c.relnamespace
	cross join aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
	where c.relkind = 'S'
	  and a.grantee <> c.relowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select case p.prokind when 'p' then 'procedure' else 'function' end,
	       quote_ident(n.nspname), quote_ident(p.proname), p.oid::regprocedure::text,
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_proc p
	inner join pg_namespace n on n.oid = p.pronamespace
	cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
	where a.grantee <> p.proowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select 'materialized_view', quote_ident(n.nspname), quote_ident(c.relname), quote_ident(n.nspname) || '.' || quote_ident(c.relname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_class c
	inner join pg_namespace n on n.oid = c.relnamespace
	cross join aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
	where c.relkind = 'm'
	  and a.grantee <> c.relowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	-- Mirrors postgresqlTypes'/postgresqlDomains' (postgresql_serverlevel.go)
	-- own filter: excludes a relation's implicit row type and array types,
	-- split into "type"/"domain" by typtype the same way those two listing
	-- queries are.
	select case when t.typtype = 'd' then 'domain' else 'type' end,
	       quote_ident(n.nspname), quote_ident(t.typname), quote_ident(n.nspname) || '.' || quote_ident(t.typname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_type t
	inner join pg_namespace n on n.oid = t.typnamespace
	cross join aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
	where (t.typrelid = 0 or (select c.relkind = 'c' from pg_class c where c.oid = t.typrelid))
	  and not exists(select 1 from pg_type el where el.oid = t.typelem and el.typarray = t.oid)
	  and a.grantee <> t.typowner
	  and ` + pgSystemSchemaExcludeSQL + `
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select 'foreign_data_wrapper', null::text, quote_ident(w.fdwname), quote_ident(w.fdwname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_foreign_data_wrapper w, aclexplode(coalesce(w.fdwacl, acldefault('F', w.fdwowner))) a
	where a.grantee <> w.fdwowner
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))

	union all

	select 'foreign_server', null::text, quote_ident(s.srvname), quote_ident(s.srvname),
	       case when a.grantee = 0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end,
	       a.privilege_type, a.is_grantable
	from pg_foreign_server s, aclexplode(coalesce(s.srvacl, acldefault('S', s.srvowner))) a
	where a.grantee <> s.srvowner
	  and (a.grantee = 0 or quote_ident(pg_get_userbyid(a.grantee)) = any($1::text[]))
`

// postgresqlRoleDatabaseObjectGrants is column 4's data source: the given
// role's effective (direct + inherited + PUBLIC) privileges on every
// database-scoped object (see pgDatabaseObjectGrantsSQL) in whichever
// database db is already connected to -- the caller
// (handleGetRoleDatabaseGrantsPostgreSQL, postgresql_permissions_effective_
// handlers.go) is responsible for that connection actually being open on
// the requested database, via resolvePostgreSQLRequestForDatabase.
func postgresqlRoleDatabaseObjectGrants(db *sql.DB, roleName string) ([]postgresqlEffectiveObjectGrants, error) {
	roleNames, err := postgresqlRoleAndAncestorNames(db, roleName)
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(pgDatabaseObjectGrantsSQL, roleNames)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	raw := make([]postgresqlEffectiveGrantRow, 0)
	for rows.Next() {
		var r postgresqlEffectiveGrantRow
		if err := rows.Scan(&r.ObjectType, &r.Schema, &r.ObjectName, &r.Identifier, &r.Grantee, &r.Privilege, &r.Grantable); err != nil {
			return nil, err
		}
		raw = append(raw, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return groupEffectiveGrantRows(raw), nil
}
