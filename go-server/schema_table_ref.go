package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// verifiedSchemaTable confirms schema/table refer to a real table or view in
// the target connection's own catalog and returns the catalog's own copy of
// those two strings — same "return the verified value, don't just gate on a
// bool" principle as sqliteVerifiedTableName/postgresVerifiedRoleName
// (sqlite_constraints.go / postgresql_serverlevel.go). editDataTableRef and
// completionTableRef both build a bare `schema.table` SQL fragment for a
// FROM/INTO clause position that has no bind-parameter form, so re-deriving
// the expected name from the database itself — rather than trusting the
// request body's p_schema/p_table fields, which a tampered client can set to
// anything — is the only injection defense available for that position,
// same class of gap as the PRAGMA/ALTER ROLE/SHOW CREATE fixes elsewhere in
// this migration. Returns ("", "", nil) if no such object exists.
func verifiedSchemaTable(technology string, db *sql.DB, schema, table string) (string, string, error) {
	switch technology {
	case "sqlite":
		name, err := sqliteVerifiedTableOrViewName(db, table)
		if err != nil || name == "" {
			return "", "", err
		}
		return "", name, nil
	case "postgresql":
		return postgresqlVerifiedSchemaTable(db, schema, table)
	case "mysql", "mariadb":
		return mysqlVerifiedSchemaTable(db, schema, table)
	case "oracle":
		return oracleVerifiedSchemaTable(db, schema, table)
	default:
		return "", "", fmt.Errorf("unsupported technology %q", technology)
	}
}

// postgresqlVerifiedSchemaTable mirrors postgresqlColumns' own filter —
// information_schema.tables covers both base tables and views (table_type
// distinguishes them, but neither editDataTableRef nor completionTableRef
// cares which).
func postgresqlVerifiedSchemaTable(db *sql.DB, schema, table string) (string, string, error) {
	var s, t string
	err := db.QueryRow(`
		SELECT table_schema, table_name FROM information_schema.tables
		WHERE table_schema = $1 AND table_name = $2
	`, schema, table).Scan(&s, &t)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return s, t, err
}

// mysqlVerifiedSchemaTable mirrors mysqlColumns' own filter —
// information_schema.tables covers both base tables and views in MySQL/
// MariaDB alike.
func mysqlVerifiedSchemaTable(db *sql.DB, schema, table string) (string, string, error) {
	var s, t string
	err := db.QueryRow(`
		SELECT table_schema, table_name FROM information_schema.tables
		WHERE table_schema = ? AND table_name = ?
	`, schema, table).Scan(&s, &t)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return s, t, err
}

// oracleVerifiedSchemaTable mirrors oracleColumns' own oracleIdentEq filter —
// all_objects covers both tables and views under a single OBJECT_TYPE check,
// unlike all_tables/all_views which would need a UNION.
func oracleVerifiedSchemaTable(db *sql.DB, schema, table string) (string, string, error) {
	var s, t string
	err := db.QueryRow(`
		select `+oracleIdentEq("owner")+`, `+oracleIdentEq("object_name")+`
		from all_objects
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("object_name")+` = :2
		  and object_type in ('TABLE', 'VIEW')
	`, schema, table).Scan(&s, &t)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return s, t, err
}

// quoteOracleIdent double-quotes an Oracle identifier, doubling any embedded
// double-quote character — the standard Oracle quoted-identifier rule (same
// shape as quotePostgresIdentifierDoubleQuoted).
func quoteOracleIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// quotedSchemaTableRef builds a `schema.table` (or bare `table`, for engines
// without schemas) FROM-clause fragment out of an already-verified
// schema/table pair, quoting each part the way that engine's DDL/DML already
// does elsewhere in this codebase. Callers must only ever pass verified
// values here (see verifiedSchemaTable) — quoting alone still lets a
// tampered request reference some *other* real object, just not break out
// of the identifier position entirely, so verification is what actually
// closes the injection, and quoting is defense in depth on top of it.
func quotedSchemaTableRef(technology, schema, table string) string {
	switch technology {
	case "sqlite":
		return quotePostgresIdentifierDoubleQuoted(table)
	case "postgresql":
		return quotePostgresIdentifierDoubleQuoted(schema) + "." + quotePostgresIdentifierDoubleQuoted(table)
	case "mysql", "mariadb":
		return quoteMySQLIdent(schema) + "." + quoteMySQLIdent(table)
	case "oracle":
		return quoteOracleIdent(schema) + "." + quoteOracleIdent(table)
	default:
		return table
	}
}
