package main

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/go-sql-driver/mysql"
)

// mysqlErrTableAccessDenied is server error 1142 (ER_TABLEACCESS_DENIED_ERROR)
// — what "SELECT on mysql.procs_priv" fails with for a user without
// privileges on the mysql schema, as opposed to a query that's actually
// broken.
const mysqlErrTableAccessDenied = 1142

func mysqlErrorNumber(err error) uint16 {
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number
	}
	return 0
}

// SHOW CREATE already carries the comments MySQL/MariaDB support — a table's
// own COMMENT='...' clause and its columns' COMMENT '...' clauses, a
// routine's COMMENT characteristic (views have no comment concept at all) —
// so mysqlDDL's gap next to the PostgreSQL side is only the object's
// privileges. This file appends them as GRANT statements, the same way
// postgresql_ddl_extras.go does.
//
// Every query below is parameterized against information_schema (or, for
// routines, mysql.procs_priv), so the schema/object names arriving from the
// request body need no separate catalog verification the way mysqlShowCreate's
// interpolated SHOW CREATE does.

// mysqlDDLExtras returns the GRANT statements to append under an object's
// SHOW CREATE output, already separated from it by a blank line, or "" when
// the object has no privileges granted on it.
func mysqlDDLExtras(db *sql.DB, schema, object, kind string) (string, error) {
	ident := quoteMySQLIdent(schema) + "." + quoteMySQLIdent(object)

	switch kind {
	case "table", "view":
		entries, err := mysqlTableGrantEntries(db, schema, object)
		if err != nil {
			return "", err
		}
		// MySQL's GRANT takes the plain qualified name here: the optional
		// TABLE keyword it also accepts would be wrong for a view.
		return mysqlJoinGrants(mysqlFormatGrants("", ident, entries)), nil
	case "function", "procedure":
		entries, note, err := mysqlRoutineGrantEntries(db, schema, object, kind)
		if err != nil {
			return "", err
		}
		statements := mysqlFormatGrants(strings.ToUpper(kind), ident, entries)
		if note != "" {
			statements = append(statements, note)
		}
		return mysqlJoinGrants(statements), nil
	}
	return "", nil
}

// mysqlTableGrantEntries reads a table's or view's privileges from
// information_schema, which exposes exactly the grants the connected user is
// allowed to see (its own, or all of them given SELECT on the mysql schema).
// Table- and column-level privileges live in two separate views.
func mysqlTableGrantEntries(db *sql.DB, schema, table string) ([]grantEntry, error) {
	entries := make([]grantEntry, 0)

	rows, err := db.Query(`
		select grantee, privilege_type, is_grantable, '' as column_name
		from information_schema.table_privileges
		where table_schema = ? and table_name = ?
		union all
		select grantee, privilege_type, is_grantable, column_name
		from information_schema.column_privileges
		where table_schema = ? and table_name = ?
	`, schema, table, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var e grantEntry
		var grantable, column string
		if err := rows.Scan(&e.grantee, &e.privilege, &grantable, &column); err != nil {
			return nil, err
		}
		e.grantable = strings.EqualFold(grantable, "YES")
		if column != "" {
			e.column = quoteMySQLIdent(column)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// mysqlRoutineGrantEntries reads a routine's privileges from mysql.procs_priv
// — unlike tables, routines have no information_schema privileges view in
// either MySQL or MariaDB, and that grant table is only readable with
// privileges on the mysql schema. A user without them gets a comment line
// saying so rather than a silently empty privileges section, which would read
// as "nothing is granted here".
func mysqlRoutineGrantEntries(db *sql.DB, schema, routine, kind string) ([]grantEntry, string, error) {
	rows, err := db.Query(`
		select concat(quote(user), '@', quote(host)) as grantee, proc_priv
		from mysql.procs_priv
		where db = ? and routine_name = ? and routine_type = ?
	`, schema, routine, strings.ToUpper(kind))
	if err != nil {
		if mysqlErrorNumber(err) == mysqlErrTableAccessDenied {
			return nil, "-- Routine privileges not shown: mysql.procs_priv is not readable by this user.", nil
		}
		return nil, "", err
	}
	defer rows.Close()

	entries := make([]grantEntry, 0)
	for rows.Next() {
		var grantee, procPriv string
		if err := rows.Scan(&grantee, &procPriv); err != nil {
			return nil, "", err
		}
		// proc_priv is a SET column: 'Execute', 'Alter Routine' and 'Grant'
		// in any combination, where 'Grant' is the WITH GRANT OPTION flag
		// rather than a privilege of its own.
		privileges := make([]string, 0, 2)
		grantable := false
		for _, priv := range strings.Split(procPriv, ",") {
			switch strings.TrimSpace(priv) {
			case "Execute":
				privileges = append(privileges, "EXECUTE")
			case "Alter Routine":
				privileges = append(privileges, "ALTER ROUTINE")
			case "Grant":
				grantable = true
			}
		}
		for _, privilege := range privileges {
			entries = append(entries, grantEntry{grantee: grantee, privilege: privilege, grantable: grantable})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	return entries, "", nil
}

// mysqlFormatGrants writes one GRANT statement per group, with kind the
// object-kind keyword GRANT needs before the name (FUNCTION/PROCEDURE) or
// empty for tables and views. Grantees come out of the catalogs already
// spelled 'user'@'host', which is exactly how GRANT wants them.
func mysqlFormatGrants(kind, ident string, entries []grantEntry) []string {
	if kind != "" {
		kind += " "
	}
	groups := groupGrantEntries(entries)
	statements := make([]string, 0, len(groups))
	for _, group := range groups {
		var b strings.Builder
		b.WriteString("GRANT " + strings.Join(group.privileges, ", "))
		if group.column != "" {
			b.WriteString(" (" + group.column + ")")
		}
		b.WriteString(" ON " + kind + ident + " TO " + group.grantee)
		if group.grantable {
			b.WriteString(" WITH GRANT OPTION")
		}
		b.WriteString(";")
		statements = append(statements, b.String())
	}
	return statements
}

func mysqlJoinGrants(statements []string) string {
	if len(statements) == 0 {
		return ""
	}
	return "\n\n" + strings.Join(statements, "\n") + "\n"
}
