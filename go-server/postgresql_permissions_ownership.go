package main

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// buildAlterObjectOwnerSQL renders ALTER <kind> <object> OWNER TO <role>,
// the object verified and quoted by verifyGrantableObject exactly like a
// GRANT target, so every object type the Permissions panel can show a grant
// for can also get a new owner (foreign tables remain the one gap). A view
// or materialized view is ALTERed as TABLE, which Postgres accepts for both.
func buildAlterObjectOwnerSQL(db *sql.DB, newOwner, objectType, schema, object string) (string, error) {
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(newOwner))
	if err != nil {
		return "", err
	}
	if verified == "" {
		return "", fmt.Errorf("role does not exist")
	}
	kind, ident, err := verifyGrantableObject(db, objectType, schema, object)
	if err != nil {
		return "", err
	}
	if kind == "" {
		return "", fmt.Errorf("object does not exist")
	}
	return "ALTER " + kind + " " + ident + " OWNER TO " + quotePostgresIdentifierDoubleQuoted(verified), nil
}

// postgresqlOwnedObject is one object a role owns in the inspected database.
type postgresqlOwnedObject struct {
	ObjectType string // key of pgValidPrivilegesByObjectType
	Schema     string // quote_ident()-quoted; "" for schema-less types
	Object     string // the value verifyGrantableObject expects as `object`
}

// pgOwnedObjectsLimit caps the owned-objects listing: a role owning tens of
// thousands of tables would otherwise make the tree unusable.
const pgOwnedObjectsLimit = 1000

// postgresqlRoleOwnedObjects lists the objects the role owns in the current
// database (system schemas excluded, same filter as the privileges listing).
// truncated reports that pgOwnedObjectsLimit cut the list short.
func postgresqlRoleOwnedObjects(db *sql.DB, role string) (objects []postgresqlOwnedObject, truncated bool, err error) {
	if isPublicPseudoRole(role) {
		return nil, false, nil
	}
	rows, err := db.Query(`
		with r as (select oid from pg_roles where rolname = $1)
		select object_type, schema_name, object_name from (
			select 'schema' as object_type, '' as schema_name, quote_ident(n.nspname) as object_name
			from pg_namespace n, r
			where n.nspowner = r.oid and `+pgSystemSchemaExcludeSQL+`
			union all
			select case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view'
			                      when 'm' then 'materialized_view' else 'sequence' end,
			       quote_ident(n.nspname), quote_ident(c.relname)
			from pg_class c join pg_namespace n on n.oid = c.relnamespace, r
			where c.relowner = r.oid and c.relkind in ('r', 'p', 'v', 'm', 'S') and `+pgSystemSchemaExcludeSQL+`
			union all
			select case p.prokind when 'p' then 'procedure' else 'function' end,
			       quote_ident(n.nspname), p.oid::regprocedure::text
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace, r
			where p.proowner = r.oid and p.prokind in ('f', 'p') and `+pgSystemSchemaExcludeSQL+`
			union all
			select case t.typtype when 'd' then 'domain' else 'type' end,
			       quote_ident(n.nspname), quote_ident(t.typname)
			from pg_type t join pg_namespace n on n.oid = t.typnamespace, r
			where t.typowner = r.oid
			  and (t.typrelid = 0 or (select c.relkind = 'c' from pg_class c where c.oid = t.typrelid))
			  and not exists(select 1 from pg_type el where el.oid = t.typelem and el.typarray = t.oid)
			  and `+pgSystemSchemaExcludeSQL+`
			union all
			select 'foreign_data_wrapper', '', quote_ident(f.fdwname)
			from pg_foreign_data_wrapper f, r where f.fdwowner = r.oid
			union all
			select 'foreign_server', '', quote_ident(s.srvname)
			from pg_foreign_server s, r where s.srvowner = r.oid
		) owned
		order by 1, 2, 3
		limit $2
	`, unquotePostgresIdentifier(role), pgOwnedObjectsLimit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var o postgresqlOwnedObject
		if err := rows.Scan(&o.ObjectType, &o.Schema, &o.Object); err != nil {
			return nil, false, err
		}
		objects = append(objects, o)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if len(objects) > pgOwnedObjectsLimit {
		objects = objects[:pgOwnedObjectsLimit]
		truncated = true
	}
	return objects, truncated, nil
}

// postgresqlDatabaseDependencies counts what ties a role to one database (or,
// with Name "", to the cluster-wide shared objects: databases and
// tablespaces it owns, and ACL entries on them).
type postgresqlDatabaseDependencies struct {
	Name  string
	Owned int // objects owned (pg_shdepend deptype 'o')
	ACL   int // privileges held on other objects (deptype 'a')
	Other int // policies / default tablespaces (deptype 'r', 't')
}

type postgresqlRoleDependencies struct {
	Databases []postgresqlDatabaseDependencies // "" name = shared objects; sorted by name
	MemberOf  int                              // direct memberships held
	Members   int                              // direct members it has
}

func (d postgresqlRoleDependencies) totalOwned() (n int) {
	for _, db := range d.Databases {
		n += db.Owned
	}
	return n
}

func (d postgresqlRoleDependencies) totalPrivileges() (n int) {
	for _, db := range d.Databases {
		n += db.ACL + db.Other
	}
	return n
}

// postgresqlRoleDependencyCounts reads pg_shdepend -- a cluster-wide
// catalog, so one query from any connection sees every database's
// dependencies on the role. That is what lets the drop dialog say *which*
// databases need REASSIGN OWNED / DROP OWNED (both only act on the database
// they run in) without connecting to each one first.
func postgresqlRoleDependencyCounts(db *sql.DB, role string) (postgresqlRoleDependencies, error) {
	var out postgresqlRoleDependencies
	name := unquotePostgresIdentifier(role)
	rows, err := db.Query(`
		select s.dbid::int8, coalesce(d.datname, ''), s.deptype::text, count(*)
		from pg_shdepend s
		left join pg_database d on d.oid = s.dbid
		where s.refclassid = 'pg_authid'::regclass
		  and s.refobjid = (select oid from pg_roles where rolname = $1)
		group by 1, 2, 3
	`, name)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	byName := map[string]*postgresqlDatabaseDependencies{}
	for rows.Next() {
		var dbid int64
		var dbName, deptype string
		var n int
		if err := rows.Scan(&dbid, &dbName, &deptype, &n); err != nil {
			return out, err
		}
		entry := byName[dbName]
		if entry == nil {
			entry = &postgresqlDatabaseDependencies{Name: dbName}
			byName[dbName] = entry
		}
		switch deptype {
		case "o":
			entry.Owned += n
		case "a":
			entry.ACL += n
		default:
			entry.Other += n
		}
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	for _, entry := range byName {
		out.Databases = append(out.Databases, *entry)
	}
	sort.Slice(out.Databases, func(i, j int) bool { return out.Databases[i].Name < out.Databases[j].Name })

	err = db.QueryRow(`
		select (select count(*) from pg_auth_members where member = r.oid),
		       (select count(*) from pg_auth_members where roleid = r.oid)
		from (select oid from pg_roles where rolname = $1) r
	`, name).Scan(&out.MemberOf, &out.Members)
	if err == sql.ErrNoRows {
		err = nil
	}
	return out, err
}

// pgSQLStep is the statements to run while connected to one database
// (shared by the drop-role and clone-role plans).
type pgSQLStep struct {
	Database string // "" = the connection's own database
	Stmts    []string
}

// buildDropRolePlan works out everything DROP ROLE needs first: per database
// the role has dependencies in, REASSIGN OWNED (when a new owner is given)
// followed by DROP OWNED (when dropOwned) -- in that order, since DROP OWNED
// would otherwise delete the very objects being handed over -- and finally
// DROP ROLE itself in the connection's database. It refuses up front, with a
// readable message, when the role still owns objects but no new owner was
// chosen or still holds privileges but dropOwned is off, instead of letting
// DROP ROLE fail halfway through on Postgres's own "cannot be dropped
// because some objects depend on it".
func buildDropRolePlan(db *sql.DB, name, reassignTo string, dropOwned bool) ([]pgSQLStep, error) {
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(name))
	if err != nil {
		return nil, err
	}
	if verified == "" {
		return nil, fmt.Errorf("role does not exist")
	}
	quoted := quotePostgresIdentifierDoubleQuoted(verified)

	deps, err := postgresqlRoleDependencyCounts(db, verified)
	if err != nil {
		return nil, err
	}
	newOwner := ""
	if strings.TrimSpace(reassignTo) != "" {
		v, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(reassignTo))
		if err != nil {
			return nil, err
		}
		if v == "" {
			return nil, fmt.Errorf("role does not exist")
		}
		if v == verified {
			return nil, fmt.Errorf("the new owner must be a different role")
		}
		newOwner = quotePostgresIdentifierDoubleQuoted(v)
	}
	if owned := deps.totalOwned(); owned > 0 && newOwner == "" {
		return nil, fmt.Errorf("role owns %d object(s); choose a role to take over their ownership", owned)
	}
	if held := deps.totalPrivileges(); held > 0 && !dropOwned {
		return nil, fmt.Errorf("role still holds %d privilege(s) on other objects; revoke them as part of the drop", held)
	}

	var current string
	if err := db.QueryRow(`select current_database()`).Scan(&current); err != nil {
		return nil, err
	}

	var steps []pgSQLStep
	for _, dep := range deps.Databases {
		target := dep.Name
		if target == "" {
			// Shared objects (databases, tablespaces) are reached from any
			// database; the connection's own is the one already open.
			target = current
		}
		var stmts []string
		if newOwner != "" && dep.Owned > 0 {
			stmts = append(stmts, "REASSIGN OWNED BY "+quoted+" TO "+newOwner)
		}
		if dropOwned {
			stmts = append(stmts, "DROP OWNED BY "+quoted)
		}
		if len(stmts) == 0 {
			continue
		}
		// The shared-objects entry and the connection's own database map to
		// the same step.
		merged := false
		for i := range steps {
			if steps[i].Database == target {
				steps[i].Stmts = appendMissing(steps[i].Stmts, stmts)
				merged = true
			}
		}
		if !merged {
			steps = append(steps, pgSQLStep{Database: target, Stmts: stmts})
		}
	}
	// DROP ROLE is its own last step, so it only runs once every database's
	// cleanup succeeded.
	steps = append(steps, pgSQLStep{Database: current, Stmts: []string{"DROP ROLE " + quoted}})
	return steps, nil
}

func appendMissing(dst, src []string) []string {
	for _, s := range src {
		found := false
		for _, d := range dst {
			if d == s {
				found = true
			}
		}
		if !found {
			dst = append(dst, s)
		}
	}
	return dst
}

// renderSQLPlan is the plan as copyable SQL text, one "-- database"
// comment per step, for the dialogs' SQL preview.
func renderSQLPlan(steps []pgSQLStep) string {
	var b strings.Builder
	for i, step := range steps {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("-- database " + quotePostgresIdentifierDoubleQuoted(step.Database) + "\n")
		for _, stmt := range step.Stmts {
			b.WriteString(stmt + ";\n")
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

// executeSQLPlan runs each step in its own transaction on a connection
// to that step's database (the caller's own connection where it already
// points there). Stops at the first failure, leaving earlier databases
// cleaned up -- which is harmless, the drop dialog can simply be run again.
func executeSQLPlan(db *sql.DB, info *ConnectionInfo, steps []pgSQLStep) error {
	var current string
	if err := db.QueryRow(`select current_database()`).Scan(&current); err != nil {
		return err
	}
	for _, step := range steps {
		conn := db
		if step.Database != current {
			other := *info
			other.Database = step.Database
			opened, err := openPostgreSQLTarget(&other)
			if err != nil {
				return fmt.Errorf("database %s: %w", step.Database, err)
			}
			defer opened.Close()
			conn = opened
		}
		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		for _, stmt := range step.Stmts {
			if _, err := tx.Exec(stmt); err != nil {
				tx.Rollback()
				return fmt.Errorf("database %s: %w", step.Database, err)
			}
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
