package main

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

// This file backs the "Permissions" section (see
// frontend/src/panel_functions/outer_permissions_panel.js): direct role
// management (create/drop/alter attributes) executed straight from a form,
// unlike the tree's existing Create Role/Alter Role/Drop Role context-menu
// actions (tree_postgresql.js's cm_roles/cm_role), which only open a SQL
// template tab for the user to run themselves. Change Password is
// deliberately NOT duplicated here — postgresqlChangeRolePassword
// (postgresql_serverlevel.go) already executes directly and the Permissions
// panel calls that same /change_role_password_postgresql/ endpoint.

// postgresqlRoleAttributes mirrors the ALTER/CREATE ROLE clauses exposed
// through the Permissions section's forms — the same attribute set
// postgresqlPropertiesRole/postgresqlDDLRole (postgresql_properties.go,
// postgresql_ddl2.go) already read, just written back here.
type postgresqlRoleAttributes struct {
	CanLogin    bool
	Super       bool
	CreateDB    bool
	CreateRole  bool
	Inherit     bool
	Replication bool
	BypassRLS   bool
	ConnLimit   int64
	// ValidUntil is a Postgres-parseable timestamp string ("infinity" clears
	// any expiration); empty means "leave unset" on CREATE, and is coerced to
	// "infinity" on ALTER (see postgresqlAlterRoleAttributes) since that form
	// always submits the role's full, current attribute set.
	ValidUntil string
}

// roleAttributeClauses renders the WITH-clause booleans/connection-limit
// shared by CREATE ROLE and ALTER ROLE. All values are typed Go fields, not
// interpolated request strings, so this never needs identifier/literal
// escaping of its own.
func roleAttributeClauses(attrs postgresqlRoleAttributes) string {
	boolClause := func(label string, on bool) string {
		if on {
			return " " + label
		}
		return " NO" + label
	}

	var b strings.Builder
	if attrs.CanLogin {
		b.WriteString(" LOGIN")
	} else {
		b.WriteString(" NOLOGIN")
	}
	b.WriteString(boolClause("SUPERUSER", attrs.Super))
	b.WriteString(boolClause("CREATEDB", attrs.CreateDB))
	b.WriteString(boolClause("CREATEROLE", attrs.CreateRole))
	b.WriteString(boolClause("INHERIT", attrs.Inherit))
	b.WriteString(boolClause("REPLICATION", attrs.Replication))
	b.WriteString(boolClause("BYPASSRLS", attrs.BypassRLS))
	b.WriteString(fmt.Sprintf(" CONNECTION LIMIT %d", attrs.ConnLimit))
	return b.String()
}

// postgresValidUntilLiteral turns a caller-supplied VALID UNTIL value (the
// Permissions form's <input type="datetime-local"> string, or "infinity")
// into a safely quoted SQL literal, by asking Postgres itself to parse and
// re-quote it. CREATE ROLE/ALTER ROLE's VALID UNTIL clause rejects a bind
// parameter outright — confirmed live against a real server: `ALTER ROLE x
// VALID UNTIL $1` fails with "syntax error at or near "$1"" (SQLSTATE
// 42601), a grammar rejection, not merely a type-inference gap the usual
// `$1::timestamptz` cast would paper over. quote_literal() is this clause's
// identifier/literal-safety substitute, same idea as postgresVerifiedRoleName
// for a role name: the ::timestamptz cast here also rejects anything that
// isn't a real timestamp, so malformed or injected input errors out instead
// of reaching the DDL text at all.
func postgresValidUntilLiteral(db *sql.DB, raw string) (string, error) {
	var literal string
	if err := db.QueryRow(`select quote_literal($1::timestamptz)`, raw).Scan(&literal); err != nil {
		return "", err
	}
	return literal, nil
}

// postgresqlCreateRole executes CREATE ROLE directly (the Permissions
// section's "New role" form), unlike tree_postgresql.js's Create Role menu
// item, which only opens an empty SQL template. The role does not exist yet,
// so there is nothing to verify it against — the requested name is quoted as
// a plain identifier and used as-is, same as any other CREATE statement in
// this app. Password, if given, is pre-hashed exactly like
// postgresqlChangeRolePassword — hashed against the role's own (raw) name,
// since Postgres's md5 verifier format is keyed to the username — so the
// plaintext is never sent as literal SQL text, and (like that function) the
// hash is spliced into the statement text directly rather than bound: a
// PASSWORD clause rejects a bind parameter exactly like VALID UNTIL does
// (see postgresValidUntilLiteral's comment). Safe to inline unescaped: the
// hash is our own output, either "md5" + hex or Postgres's SCRAM verifier
// shape, both drawn from an alphabet that can never contain a quote.
func postgresqlCreateRole(db *sql.DB, name string, attrs postgresqlRoleAttributes, password string) error {
	stmt, err := buildCreateRoleSQL(db, name, attrs, password, false)
	if err != nil {
		return err
	}
	_, err = db.Exec(stmt)
	return err
}

// buildCreateRoleSQL renders the CREATE ROLE statement postgresqlCreateRole
// runs. With maskPassword the PASSWORD clause shows a placeholder instead of
// the real verifier -- used for the Permissions dialogs' SQL preview, which
// is displayed and copied around and must never carry password material.
func buildCreateRoleSQL(db *sql.DB, name string, attrs postgresqlRoleAttributes, password string, maskPassword bool) (string, error) {
	rawName := strings.TrimSpace(name)
	if rawName == "" {
		return "", fmt.Errorf("role name must not be empty")
	}
	// Let the server quote the name so the DDL text only ever contains
	// server-produced identifier text.
	var quoted string
	if err := db.QueryRow(`select quote_ident($1)`, rawName).Scan(&quoted); err != nil {
		return "", err
	}

	stmt := "CREATE ROLE " + quoted + " WITH" + roleAttributeClauses(attrs)

	if password != "" {
		if maskPassword {
			stmt += " PASSWORD '********'"
		} else {
			hash, err := postgresPasswordVerifier(db, password, rawName)
			if err != nil {
				return "", err
			}
			stmt += " PASSWORD '" + hash + "'"
		}
	}
	if attrs.ValidUntil != "" {
		literal, err := postgresValidUntilLiteral(db, attrs.ValidUntil)
		if err != nil {
			return "", err
		}
		stmt += " VALID UNTIL " + literal
	}

	return stmt, nil
}

// postgresqlAlterRoleAttributes executes ALTER ROLE directly, replacing the
// role's full attribute set (the Permissions panel's edit form always
// submits every field, not a partial patch) — so, unlike CREATE ROLE above,
// VALID UNTIL is always set explicitly, defaulting to 'infinity' (Postgres's
// own "no expiration" value) rather than being omitted, which would leave a
// previously-set expiration untouched instead of clearing it.
func postgresqlAlterRoleAttributes(db *sql.DB, name string, attrs postgresqlRoleAttributes) error {
	stmt, err := buildAlterRoleAttributesSQL(db, name, attrs)
	if err != nil {
		return err
	}
	_, err = db.Exec(stmt)
	return err
}

func buildAlterRoleAttributesSQL(db *sql.DB, name string, attrs postgresqlRoleAttributes) (string, error) {
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(name))
	if err != nil {
		return "", err
	}
	if verified == "" {
		return "", fmt.Errorf("role does not exist")
	}

	validUntilRaw := attrs.ValidUntil
	if validUntilRaw == "" {
		validUntilRaw = "infinity"
	}
	literal, err := postgresValidUntilLiteral(db, validUntilRaw)
	if err != nil {
		return "", err
	}

	return "ALTER ROLE " + quotePostgresIdentifierDoubleQuoted(verified) + " WITH" + roleAttributeClauses(attrs) + " VALID UNTIL " + literal, nil
}

// postgresqlRoleMembership is one row of a role's direct "member of" list —
// the roles it was directly GRANTed, as opposed to anything it only inherits
// transitively through one of those.
type postgresqlRoleMembership struct {
	Name        string
	AdminOption bool
	// Inherit and Set are the PostgreSQL 16+ membership options (does the
	// member automatically use the role's privileges / may it SET ROLE to
	// it); nil on older servers, which have neither column.
	Inherit *bool
	Set     *bool
}

// pgMembershipOptionsVersion is the first server_version_num with per-
// membership INHERIT and SET options (PostgreSQL 16).
const pgMembershipOptionsVersion = 160000

// postgresqlServerVersionNum is server_version_num as an int (0 if it cannot
// be read), for feature gates like pgMembershipOptionsVersion.
func postgresqlServerVersionNum(db *sql.DB) int {
	var s string
	if err := db.QueryRow(`show server_version_num`).Scan(&s); err != nil {
		return 0
	}
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

// membershipGrantSuffix renders the WITH clause that reproduces a membership:
// on PostgreSQL 16+ every option explicitly (a bare GRANT would take the
// member's current rolinherit default instead of what the grant actually
// has), before that just ADMIN OPTION.
func membershipGrantSuffix(m postgresqlRoleMembership) string {
	if m.Inherit == nil || m.Set == nil {
		if m.AdminOption {
			return " WITH ADMIN OPTION"
		}
		return ""
	}
	return " WITH ADMIN " + pgBoolKeyword(m.AdminOption) + ", INHERIT " + pgBoolKeyword(*m.Inherit) + ", SET " + pgBoolKeyword(*m.Set)
}

func pgBoolKeyword(b bool) string {
	if b {
		return "TRUE"
	}
	return "FALSE"
}

// postgresqlRoleMemberships lists the roles a role is a direct member of.
// Used by postgresqlDDLRoleExtras (postgresql_ddl_extras.go), which
// reproduces the list as GRANT statements under the role's DDL — the
// Permissions panel itself now gets its flattened, direct-and-indirect view
// from postgresqlRoleAncestors below instead. Grouped by granted role rather
// than listed per pg_auth_members row: PostgreSQL 16 made a membership
// recordable once per grantor, so the same "role is a member of parent" can
// have several rows behind it.
func postgresqlRoleMemberships(db *sql.DB, roleName string) ([]postgresqlRoleMembership, error) {
	return queryRoleMemberships(db, roleName, false)
}

// postgresqlRoleDirectMembers is postgresqlRoleMemberships' mirror image: the
// roles that are directly a member *of* roleName (Name is the member), with
// the same per-membership options.
func postgresqlRoleDirectMembers(db *sql.DB, roleName string) ([]postgresqlRoleMembership, error) {
	return queryRoleMemberships(db, roleName, true)
}

// queryRoleMemberships reads pg_auth_members grouped by the other side of the
// edge: with members == false, the roles roleName is a member of; with true,
// the roles that are members of roleName.
func queryRoleMemberships(db *sql.DB, roleName string, members bool) ([]postgresqlRoleMembership, error) {
	// inherit_option/set_option exist from PostgreSQL 16; any grantor's row
	// granting the option counts (bool_or), like admin_option.
	extraColumns := "null::boolean, null::boolean"
	withOptions := postgresqlServerVersionNum(db) >= pgMembershipOptionsVersion
	if withOptions {
		extraColumns = "bool_or(am.inherit_option), bool_or(am.set_option)"
	}
	nameColumn, filterColumn := "g.rolname", "m.rolname"
	if members {
		nameColumn, filterColumn = "m.rolname", "g.rolname"
	}
	rows, err := db.Query(`
		select quote_ident(`+nameColumn+`), bool_or(am.admin_option), `+extraColumns+`
		from pg_auth_members am
		inner join pg_roles g on g.oid = am.roleid
		inner join pg_roles m on m.oid = am.member
		where quote_ident(`+filterColumn+`) = $1
		group by 1
		order by 1
	`, roleName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoleMembership, 0)
	for rows.Next() {
		var m postgresqlRoleMembership
		var inherit, set sql.NullBool
		if err := rows.Scan(&m.Name, &m.AdminOption, &inherit, &set); err != nil {
			return nil, err
		}
		if withOptions && inherit.Valid && set.Valid {
			m.Inherit, m.Set = &inherit.Bool, &set.Bool
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// postgresqlRoleAncestor is one entry in a role's flattened "member of"
// closure — every role reachable by following pg_auth_members edges from
// the given role, direct or indirect.
type postgresqlRoleAncestor struct {
	Name   string
	Direct bool
}

// postgresqlRoleAncestors computes the full transitive "member of" closure
// for a role via a recursive CTE — the Permissions panel's column 2 shows
// every ancestor at once (direct ones in black, indirect ones in grey)
// rather than a separate column per inheritance level, so this is one query
// instead of walking postgresqlRoleMemberships one level at a time.
//
// `visited` guards the recursion against a cycle (an aclitem-style array of
// oids seen so far on this path; a role already in it is not re-descended
// into), and depth is hard-capped at 50 as a second, independent fuse. Both
// are defense in depth rather than a path expected to matter in practice:
// PostgreSQL itself already refuses to create a cycle via GRANT — confirmed
// live against a real server, even the simplest two-role case errors "role
// ... is a member of role ..." at grant time — so this only protects against
// corrupted or foreign server state, the same reasoning the frontend's
// now-removed column-drilling cycle guard used.
func postgresqlRoleAncestors(db *sql.DB, roleName string) ([]postgresqlRoleAncestor, error) {
	rows, err := db.Query(`
		with recursive ancestors(role_oid, depth, visited) as (
			select r.oid, 0, array[r.oid]
			from pg_roles r
			where quote_ident(r.rolname) = $1

			union all

			select g.oid, a.depth + 1, a.visited || g.oid
			from ancestors a
			inner join pg_auth_members am on am.member = a.role_oid
			inner join pg_roles g on g.oid = am.roleid
			where not g.oid = any(a.visited) and a.depth < 50
		)
		select quote_ident(g.rolname), min(a.depth) = 1
		from ancestors a
		inner join pg_roles g on g.oid = a.role_oid
		where a.depth > 0
		group by g.rolname
		order by 1
	`, roleName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoleAncestor, 0)
	for rows.Next() {
		var a postgresqlRoleAncestor
		if err := rows.Scan(&a.Name, &a.Direct); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// postgresqlRoleDescendant is one entry in a role's flattened "members"
// closure — the mirror image of postgresqlRoleAncestor: every role reachable
// by following pg_auth_members edges *into* the given role (so it inherits
// the given role's privileges), rather than every role the given role is
// itself a member of.
type postgresqlRoleDescendant struct {
	Name   string
	Direct bool
}

// postgresqlRoleDescendants computes the full transitive "members" closure
// for a role via a recursive CTE — the Permissions panel's column 2 shows it
// as the top half, "Members" (postgresqlRoleAncestors backs the bottom half,
// "Member of", unchanged). Same shape as postgresqlRoleAncestors' own query,
// just walking pg_auth_members the other direction: am.roleid is the role
// reached so far and am.member is the next one found to inherit through it,
// rather than am.member being the role reached so far and am.roleid the next
// one up. Same cycle/depth guards, for the same reason (defense in depth
// against corrupted/foreign server state — see postgresqlRoleAncestors'
// comment).
func postgresqlRoleDescendants(db *sql.DB, roleName string) ([]postgresqlRoleDescendant, error) {
	rows, err := db.Query(`
		with recursive descendants(role_oid, depth, visited) as (
			select r.oid, 0, array[r.oid]
			from pg_roles r
			where quote_ident(r.rolname) = $1

			union all

			select am.member, d.depth + 1, d.visited || am.member
			from descendants d
			inner join pg_auth_members am on am.roleid = d.role_oid
			where not am.member = any(d.visited) and d.depth < 50
		)
		select quote_ident(m.rolname), min(d.depth) = 1
		from descendants d
		inner join pg_roles m on m.oid = d.role_oid
		where d.depth > 0
		group by m.rolname
		order by 1
	`, roleName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlRoleDescendant, 0)
	for rows.Next() {
		var d postgresqlRoleDescendant
		if err := rows.Scan(&d.Name, &d.Direct); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// postgresqlGrantRoleMembership executes GRANT parent TO member directly —
// the Permissions panel's "add membership" action. Both names are verified
// via postgresVerifiedRoleName first: like every other role-targeting
// statement in this file, neither side of GRANT ... TO can be a bind
// parameter.
func postgresqlGrantRoleMembership(db *sql.DB, member, parent string, adminOption bool, inherit, set *bool) error {
	stmt, err := buildGrantRoleMembershipSQL(db, member, parent, adminOption, inherit, set)
	if err != nil {
		return err
	}
	_, err = db.Exec(stmt)
	return err
}

// buildGrantRoleMembershipSQL renders GRANT parent TO member. inherit and set
// (PostgreSQL 16+; nil = leave to the server's default) switch to the
// explicit option form, which also makes re-granting an existing membership
// *update* its options, including turning the admin option off.
func buildGrantRoleMembershipSQL(db *sql.DB, member, parent string, adminOption bool, inherit, set *bool) (string, error) {
	verifiedMember, verifiedParent, err := verifyMemberAndParentRoles(db, member, parent)
	if err != nil {
		return "", err
	}
	stmt := "GRANT " + quotePostgresIdentifierDoubleQuoted(verifiedParent) + " TO " + quotePostgresIdentifierDoubleQuoted(verifiedMember)
	if inherit != nil || set != nil {
		if postgresqlServerVersionNum(db) < pgMembershipOptionsVersion {
			return "", fmt.Errorf("membership INHERIT/SET options require PostgreSQL 16 or newer")
		}
		parts := []string{"ADMIN " + pgBoolKeyword(adminOption)}
		if inherit != nil {
			parts = append(parts, "INHERIT "+pgBoolKeyword(*inherit))
		}
		if set != nil {
			parts = append(parts, "SET "+pgBoolKeyword(*set))
		}
		return stmt + " WITH " + strings.Join(parts, ", "), nil
	}
	if adminOption {
		stmt += " WITH ADMIN OPTION"
	}
	return stmt, nil
}

// postgresqlRevokeRoleMembership executes REVOKE parent FROM member
// directly — the Permissions panel's "remove membership" action.
func postgresqlRevokeRoleMembership(db *sql.DB, member, parent string) error {
	stmt, err := buildRevokeRoleMembershipSQL(db, member, parent)
	if err != nil {
		return err
	}
	_, err = db.Exec(stmt)
	return err
}

func buildRevokeRoleMembershipSQL(db *sql.DB, member, parent string) (string, error) {
	verifiedMember, verifiedParent, err := verifyMemberAndParentRoles(db, member, parent)
	if err != nil {
		return "", err
	}
	return "REVOKE " + quotePostgresIdentifierDoubleQuoted(verifiedParent) + " FROM " + quotePostgresIdentifierDoubleQuoted(verifiedMember), nil
}

func verifyMemberAndParentRoles(db *sql.DB, member, parent string) (string, string, error) {
	verifiedMember, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(member))
	if err != nil {
		return "", "", err
	}
	if verifiedMember == "" {
		return "", "", fmt.Errorf("role does not exist")
	}
	verifiedParent, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(parent))
	if err != nil {
		return "", "", err
	}
	if verifiedParent == "" {
		return "", "", fmt.Errorf("role does not exist")
	}
	return verifiedMember, verifiedParent, nil
}

// postgresqlRoleAttributesFor reads the same pg_roles columns
// postgresqlDDLRole/postgresqlPropertiesRole do, as typed fields rather than
// DDL text or a display grid, so the Permissions panel's Alter Attributes
// form can be pre-filled. ValidUntil comes back as Postgres's own text
// rendering (or "" when unset), suitable for feeding straight back into
// postgresqlAlterRoleAttributes.
func postgresqlRoleAttributesFor(db *sql.DB, name string) (postgresqlRoleAttributes, error) {
	var attrs postgresqlRoleAttributes
	var validUntil sql.NullString
	err := db.QueryRow(`
		select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
			   rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text
		from pg_roles
		where quote_ident(rolname) = $1
	`, name).Scan(
		&attrs.CanLogin, &attrs.Super, &attrs.CreateDB, &attrs.CreateRole, &attrs.Inherit,
		&attrs.Replication, &attrs.BypassRLS, &attrs.ConnLimit, &validUntil,
	)
	if err != nil {
		return postgresqlRoleAttributes{}, err
	}
	if validUntil.Valid {
		attrs.ValidUntil = validUntil.String
	}
	return attrs, nil
}

// buildRenameRoleSQL renders ALTER ROLE ... RENAME TO ... . The old name is
// verified against pg_roles and the new one must not exist yet; the new name
// is quoted as a plain identifier, same as in CREATE ROLE. Note Postgres
// clears an md5 password on rename (its hash is keyed to the role name) --
// the dialog says so.
func buildRenameRoleSQL(db *sql.DB, oldName, newName string) (string, error) {
	verified, err := postgresVerifiedRoleName(db, unquotePostgresIdentifier(oldName))
	if err != nil {
		return "", err
	}
	if verified == "" {
		return "", fmt.Errorf("role does not exist")
	}
	rawNew := strings.TrimSpace(newName)
	if rawNew == "" {
		return "", fmt.Errorf("role name must not be empty")
	}
	if rawNew == verified {
		return "", fmt.Errorf("the new name is the same as the current one")
	}
	existing, err := postgresVerifiedRoleName(db, rawNew)
	if err != nil {
		return "", err
	}
	if existing != "" {
		return "", fmt.Errorf("role %q already exists", rawNew)
	}
	return "ALTER ROLE " + quotePostgresIdentifierDoubleQuoted(verified) + " RENAME TO " + quotePostgresIdentifierDoubleQuoted(rawNew), nil
}
