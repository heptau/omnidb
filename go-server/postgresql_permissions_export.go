package main

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"
)

// pgPermissionsExportOptions picks which sections of the exported script to
// include.
type pgPermissionsExportOptions struct {
	Roles             bool // CREATE ROLE (attributes only, never passwords)
	Memberships       bool // GRANT parent TO member
	Privileges        bool // direct object privileges, per database
	DefaultPrivileges bool // ALTER DEFAULT PRIVILEGES, per database
}

// defaultPrivilegeStatements renders the ALTER DEFAULT PRIVILEGES that
// reproduce one slot (creator, schema, kind, grantee). Creator and grantee
// come from the catalog (raw names, quoted here), the schema is already
// quote_ident()-quoted, and the privileges are re-checked against the
// allow-list; privileges with and without grant option are separate
// statements.
func defaultPrivilegeStatements(e postgresqlDefaultPrivilegeEntry) []string {
	spec, ok := pgDefaultPrivilegeKinds[e.Kind]
	if !ok {
		return nil
	}
	grantee := "PUBLIC"
	if e.Grantee != "PUBLIC" {
		grantee = quotePostgresIdentifierDoubleQuoted(e.Grantee)
	}
	var plain, grantable []string
	for _, p := range e.Privileges {
		if p.Grantable {
			grantable = append(grantable, p.Privilege)
		} else {
			plain = append(plain, p.Privilege)
		}
	}
	var stmts []string
	for i, group := range [][]string{plain, grantable} {
		if len(group) == 0 {
			continue
		}
		privs, err := validatePrivilegesForObjectType(spec.objectType, group)
		if err != nil {
			continue
		}
		stmt := "ALTER DEFAULT PRIVILEGES FOR ROLE " + quotePostgresIdentifierDoubleQuoted(e.Creator)
		if e.Schema != "" {
			stmt += " IN SCHEMA " + e.Schema
		}
		stmt += " GRANT " + strings.Join(privs, ", ") + " ON " + spec.keyword + " TO " + grantee
		if i == 1 {
			stmt += " WITH GRANT OPTION"
		}
		stmts = append(stmts, stmt)
	}
	return stmts
}

// buildPermissionsExport renders a SQL script that recreates the permissions
// of one role (role != "") or of every non-predefined role: the roles
// themselves (no passwords), their direct memberships, their direct object
// privileges and the default privileges involving them, each database's
// statements under its own header. PUBLIC's grants, object ownership and
// per-role settings are not exported. Databases are found via pg_shdepend, so
// only ones where an exported role holds something are opened.
func buildPermissionsExport(db *sql.DB, info *ConnectionInfo, role string, opts pgPermissionsExportOptions) (string, error) {
	var names []string
	if strings.TrimSpace(role) != "" {
		verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(role))
		if err != nil {
			return "", err
		}
		if verified == "" {
			return "", fmt.Errorf("role does not exist")
		}
		names = []string{verified}
	} else {
		rows, err := db.Query(`select rolname from pg_roles where rolname !~ '^pg_' order by rolname`)
		if err != nil {
			return "", err
		}
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				rows.Close()
				return "", err
			}
			names = append(names, n)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return "", err
		}
	}

	var current string
	if err := db.QueryRow(`select current_database()`).Scan(&current); err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString("-- OmniDB permissions export, " + time.Now().UTC().Format("2006-01-02 15:04 UTC") + "\n")
	if len(names) == 1 {
		b.WriteString("-- Role: " + quotePostgresIdentifierDoubleQuoted(names[0]) + "\n")
	} else {
		b.WriteString("-- Scope: all roles except PostgreSQL's predefined pg_* ones\n")
	}
	b.WriteString("-- Passwords, PUBLIC's grants, object ownership and role settings are not exported.\n")

	quoted := func(n string) string { return quotePostgresIdentifierDoubleQuoted(n) }
	serverQuoted := func(n string) (string, error) {
		var q string
		err := db.QueryRow(`select quote_ident($1)`, n).Scan(&q)
		return q, err
	}

	if opts.Roles {
		b.WriteString("\n-- Roles\n")
		for _, n := range names {
			q, err := serverQuoted(n)
			if err != nil {
				return "", err
			}
			attrs, err := postgresqlRoleAttributesFor(db, q)
			if err != nil {
				return "", err
			}
			stmt, err := buildCreateRoleSQL(db, n, attrs, "", false)
			if err != nil {
				return "", err
			}
			b.WriteString(stmt + ";\n")
		}
	}

	if opts.Memberships {
		var lines []string
		for _, n := range names {
			q, err := serverQuoted(n)
			if err != nil {
				return "", err
			}
			memberships, err := postgresqlRoleMemberships(db, q)
			if err != nil {
				return "", err
			}
			for _, m := range memberships {
				lines = append(lines, "GRANT "+m.Name+" TO "+quoted(n)+membershipGrantSuffix(m)+";")
			}
		}
		if len(lines) > 0 {
			b.WriteString("\n-- Memberships\n" + strings.Join(lines, "\n") + "\n")
		}
	}

	if !opts.Privileges && !opts.DefaultPrivileges {
		return b.String(), nil
	}

	// What to visit: per database to open, which role holds something in
	// its own (database-scoped) objects and which only in the cluster-wide
	// ones (databases, tablespaces), which are reachable from any database --
	// the connection's own is used for those.
	type exportVisit struct {
		role   string
		shared bool
	}
	visits := map[string][]exportVisit{}
	for _, n := range names {
		deps, err := postgresqlRoleDependencyCounts(db, n)
		if err != nil {
			return "", err
		}
		for _, dep := range deps.Databases {
			if dep.ACL == 0 {
				continue
			}
			target := dep.Name
			if target == "" {
				target = current
			}
			visits[target] = append(visits[target], exportVisit{role: n, shared: dep.Name == ""})
		}
	}
	databases := make([]string, 0, len(visits))
	for d := range visits {
		databases = append(databases, d)
	}
	sort.Strings(databases)

	for _, target := range databases {
		conn := db
		if target != current {
			other := *info
			other.Database = target
			opened, err := openPostgreSQLTarget(&other)
			if err != nil {
				return "", fmt.Errorf("database %s: %w", target, err)
			}
			defer opened.Close()
			conn = opened
		}

		var lines []string
		seenDefaults := map[string]bool{}
		for _, v := range visits[target] {
			q, err := serverQuoted(v.role)
			if err != nil {
				return "", err
			}
			if opts.Privileges {
				var grants []postgresqlEffectiveObjectGrants
				if v.shared {
					grants, err = postgresqlRoleServerObjectGrants(conn, q)
				} else {
					grants, err = postgresqlRoleDatabaseObjectGrants(conn, q)
				}
				if err != nil {
					return "", fmt.Errorf("database %s: %w", target, err)
				}
				for _, stmt := range directGrantStatements(grants, v.role, quoted(v.role)) {
					lines = append(lines, stmt+";")
				}
			}
			if opts.DefaultPrivileges && !v.shared {
				entries, err := postgresqlRoleDefaultPrivileges(conn, q)
				if err != nil {
					return "", fmt.Errorf("database %s: %w", target, err)
				}
				for _, e := range entries {
					for _, stmt := range defaultPrivilegeStatements(e) {
						if !seenDefaults[stmt] {
							seenDefaults[stmt] = true
							lines = append(lines, stmt+";")
						}
					}
				}
			}
		}
		if len(lines) > 0 {
			b.WriteString("\n-- Database " + quoted(target) + " (connect to it before running the statements below)\n")
			b.WriteString(strings.Join(lines, "\n") + "\n")
		}
	}
	return b.String(), nil
}
