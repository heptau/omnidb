package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// pgGrantKeywords maps an object type to the keyword GRANT expects for it --
// the same mapping verifyGrantableObject returns, for callers whose
// identifiers already come straight from the catalog and need no lookup.
var pgGrantKeywords = map[string]string{
	"database":             "DATABASE",
	"tablespace":           "TABLESPACE",
	"schema":               "SCHEMA",
	"table":                "TABLE",
	"view":                 "TABLE",
	"materialized_view":    "TABLE",
	"sequence":             "SEQUENCE",
	"function":             "FUNCTION",
	"procedure":            "PROCEDURE",
	"type":                 "TYPE",
	"domain":               "DOMAIN",
	"foreign_data_wrapper": "FOREIGN DATA WRAPPER",
	"foreign_server":       "FOREIGN SERVER",
}

// directGrantStatements renders the GRANTs that reproduce, for newRole
// (already quoted), the privileges sourceRole holds *directly* on the given
// objects -- inherited and PUBLIC-sourced entries are not sourceRole's own
// and are skipped. Privileges with and without grant option become separate
// statements. Identifiers and privilege names come from the catalog (and the
// privileges are re-checked against the allow-list), so nothing here is
// request text.
func directGrantStatements(grants []postgresqlEffectiveObjectGrants, sourceRole, newRole string) []string {
	var stmts []string
	for _, g := range grants {
		keyword, ok := pgGrantKeywords[g.ObjectType]
		if !ok {
			continue
		}
		var plain, grantable []string
		for _, p := range g.Privileges {
			for _, src := range p.Sources {
				if unquotePostgresIdentifier(src.Grantee) != sourceRole {
					continue
				}
				if src.Grantable {
					grantable = append(grantable, p.Privilege)
				} else {
					plain = append(plain, p.Privilege)
				}
			}
		}
		for i, group := range [][]string{plain, grantable} {
			if len(group) == 0 {
				continue
			}
			privs, err := validatePrivilegesForObjectType(g.ObjectType, group)
			if err != nil {
				continue
			}
			stmt := "GRANT " + strings.Join(privs, ", ") + " ON " + keyword + " " + g.Identifier + " TO " + newRole
			if i == 1 {
				stmt += " WITH GRANT OPTION"
			}
			stmts = append(stmts, stmt)
		}
	}
	return stmts
}

// buildCloneRolePlan renders everything "clone role" does: CREATE ROLE with
// the source's attributes (and the given password, masked for previews),
// the source's direct memberships, and -- when copyPrivileges -- its direct
// object privileges in every database it holds any (found via pg_shdepend,
// so databases it has nothing in are never opened). Default privileges,
// owned objects and per-role settings are not copied: they belong to the
// source, not to "what this role may do".
func buildCloneRolePlan(db *sql.DB, info *ConnectionInfo, source, newName, password string, maskPassword, copyMemberships, copyPrivileges bool) ([]pgSQLStep, error) {
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(source))
	if err != nil {
		return nil, err
	}
	if verified == "" {
		return nil, fmt.Errorf("role does not exist")
	}
	rawNew := strings.TrimSpace(newName)
	if rawNew == "" {
		return nil, fmt.Errorf("role name must not be empty")
	}
	existing, err := postgresVerifiedRoleName(db, rawNew)
	if err != nil {
		return nil, err
	}
	if existing != "" {
		return nil, fmt.Errorf("role %q already exists", rawNew)
	}
	newQuoted := quotePostgresIdentifierDoubleQuoted(rawNew)

	var sourceQuoted string
	if err := db.QueryRow(`select quote_ident($1)`, verified).Scan(&sourceQuoted); err != nil {
		return nil, err
	}
	attrs, err := postgresqlRoleAttributesFor(db, sourceQuoted)
	if err != nil {
		return nil, err
	}
	createStmt, err := buildCreateRoleSQL(db, rawNew, attrs, password, maskPassword)
	if err != nil {
		return nil, err
	}
	stmts := []string{createStmt}

	if copyMemberships {
		memberships, err := postgresqlRoleMemberships(db, sourceQuoted)
		if err != nil {
			return nil, err
		}
		for _, m := range memberships {
			stmts = append(stmts, "GRANT "+m.Name+" TO "+newQuoted+membershipGrantSuffix(m))
		}
	}

	var current string
	if err := db.QueryRow(`select current_database()`).Scan(&current); err != nil {
		return nil, err
	}
	steps := []pgSQLStep{{Database: current, Stmts: stmts}}

	if copyPrivileges {
		deps, err := postgresqlRoleDependencyCounts(db, verified)
		if err != nil {
			return nil, err
		}
		for _, dep := range deps.Databases {
			if dep.ACL == 0 {
				continue
			}
			target := dep.Name
			if target == "" {
				target = current // cluster-wide objects: databases, tablespaces
			}
			conn := db
			if target != current {
				other := *info
				other.Database = target
				opened, err := openPostgreSQLTarget(&other)
				if err != nil {
					return nil, fmt.Errorf("database %s: %w", target, err)
				}
				defer opened.Close()
				conn = opened
			}
			var grants []postgresqlEffectiveObjectGrants
			if dep.Name == "" {
				grants, err = postgresqlRoleServerObjectGrants(conn, sourceQuoted)
			} else {
				grants, err = postgresqlRoleDatabaseObjectGrants(conn, sourceQuoted)
			}
			if err != nil {
				return nil, fmt.Errorf("database %s: %w", target, err)
			}
			grantStmts := directGrantStatements(grants, verified, newQuoted)
			if len(grantStmts) == 0 {
				continue
			}
			if target == current {
				steps[0].Stmts = append(steps[0].Stmts, grantStmts...)
			} else {
				steps = append(steps, pgSQLStep{Database: target, Stmts: grantStmts})
			}
		}
	}
	return steps, nil
}
