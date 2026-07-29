package main

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/sijms/go-ora/v2/network"
)

// DBMS_METADATA.GET_DDL — what oracleDDL returns — reproduces an object's
// CREATE statement and nothing else: comments and grants are separate
// "dependent" metadata in Oracle's model, which left the DDL panel showing
// neither. This file appends them, the same way postgresql_ddl_extras.go and
// mysql_ddl_extras.go do for their backends.
//
// The catalog views are read directly rather than going through
// GET_DEPENDENT_DDL('COMMENT'/'OBJECT_GRANT'): that function raises ORA-31608
// instead of returning nothing when an object has no comments or no grants,
// returns a CLOB (which oracleDDL only reads the first 4000 characters of),
// and would produce statements formatted unlike every other backend's. The
// view columns used below — ALL_TAB_COMMENTS/ALL_COL_COMMENTS' COMMENTS,
// DBA_TAB_PRIVS/DBA_COL_PRIVS' OWNER and ALL_TAB_PRIVS/ALL_COL_PRIVS'
// TABLE_SCHEMA, plus PRIVILEGE/GRANTABLE on all four — are unchanged across
// Oracle 10.2 through 23ai, so no version branching is needed. Only object
// grants are listed, not the system privileges or roles a grantee might
// separately hold.

// oracleDDLExtras returns the COMMENT ON / GRANT statements to append under an
// object's GET_DDL output, already separated from it by a blank line, or ""
// when the object has neither. Comments only exist for tables and views in
// Oracle, and the queries simply return no rows for the other kinds, so no
// object_type dispatch is needed here.
func oracleDDLExtras(db *sql.DB, schema, object string) (string, error) {
	var statements []string

	comments, err := oracleObjectComments(db, schema, object)
	if err != nil {
		return "", err
	}
	statements = append(statements, comments...)

	entries, err := oracleGrantEntries(db, schema, object)
	if err != nil {
		return "", err
	}
	grants := oracleFormatGrants(schema, object, entries)
	if len(grants) > 0 && len(statements) > 0 {
		statements = append(statements, "")
	}
	statements = append(statements, grants...)

	if len(statements) == 0 {
		return "", nil
	}
	return "\n\n" + strings.Join(statements, "\n") + "\n", nil
}

// oracleObjectComments builds the COMMENT ON TABLE/COLUMN statements for an
// object. COMMENT ON TABLE is also the syntax a view's comment takes, so both
// kinds come out of ALL_TAB_COMMENTS the same way. Oracle stores an empty
// comment as NULL, and a comment that was never set is NULL too, so the
// is-not-null filters cover both.
func oracleObjectComments(db *sql.DB, schema, object string) ([]string, error) {
	ident := oracleQualifiedName(schema, object)

	statements := make([]string, 0)

	var comment sql.NullString
	err := db.QueryRow(`
		select comments
		from all_tab_comments
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("table_name")+` = :2
	`, schema, object).Scan(&comment)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		// Not a table or view — nothing this object could have a comment on.
	case err != nil:
		return nil, err
	case comment.Valid && comment.String != "":
		statements = append(statements, "COMMENT ON TABLE "+ident+"\nIS "+oracleQuoteLiteral(comment.String)+";")
	}

	rows, err := db.Query(`
		select `+oracleIdentEq("column_name")+`, comments
		from all_col_comments
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("table_name")+` = :2
		  and comments is not null
		order by column_name
	`, schema, object)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var column, columnComment string
		if err := rows.Scan(&column, &columnComment); err != nil {
			return nil, err
		}
		statements = append(statements, "COMMENT ON COLUMN "+ident+"."+column+"\nIS "+oracleQuoteLiteral(columnComment)+";")
	}
	return statements, rows.Err()
}

// oracleErrTableOrViewNotFound is ORA-00942, which is also what SELECTing a
// DBA_* view raises for a user without privileges on it — Oracle reports "does
// not exist" rather than "not allowed" for dictionary views.
const oracleErrTableOrViewNotFound = 942

func oracleErrorCode(err error) int {
	var oracleErr *network.OracleError
	if errors.As(err, &oracleErr) {
		return oracleErr.ErrCode
	}
	return 0
}

// oracleGrantEntries reads an object's grants from the DBA_TAB_PRIVS/
// DBA_COL_PRIVS dictionary views, falling back to their ALL_* counterparts
// when the connected user can't read those. The DBA views come first because
// the ALL_* ones only list grants the current user is party to — owner,
// grantor, grantee, or a grant to PUBLIC/an enabled role — so an
// administrator browsing another schema's table saw an empty privileges
// section for grants it wasn't involved in. Other dba_* views are already
// read unconditionally elsewhere in this backend (oraclePropertiesRole,
// oraclePropertiesTablespace), so requiring them here would be no new
// dependency; the fallback just keeps the DDL working for a plain user too.
//
// Grantee names go through oracleIdentEq like every other identifier here, so
// one needing quotes gets them — PUBLIC, being all-uppercase, comes out bare,
// as the GRANT keyword it is.
func oracleGrantEntries(db *sql.DB, schema, object string) ([]grantEntry, error) {
	entries, err := oracleGrantEntriesFrom(db, "dba_tab_privs", "dba_col_privs", "owner", schema, object)
	if oracleErrorCode(err) == oracleErrTableOrViewNotFound {
		// The ALL_* views name the owner column TABLE_SCHEMA, not OWNER.
		return oracleGrantEntriesFrom(db, "all_tab_privs", "all_col_privs", "table_schema", schema, object)
	}
	return entries, err
}

// oracleGrantEntriesFrom runs the object-and-column grant query against one
// pair of dictionary views. The view and column names are this file's own
// constants, never request data, so interpolating them carries no injection
// risk — only schema/object are bound.
func oracleGrantEntriesFrom(db *sql.DB, tabView, colView, ownerColumn, schema, object string) ([]grantEntry, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("grantee")+`, privilege, grantable, cast(null as varchar2(4000)) as column_name
		from `+tabView+`
		where `+oracleIdentEq(ownerColumn)+` = :1
		  and `+oracleIdentEq("table_name")+` = :2
		union all
		select `+oracleIdentEq("grantee")+`, privilege, grantable, `+oracleIdentEq("column_name")+`
		from `+colView+`
		where `+oracleIdentEq(ownerColumn)+` = :3
		  and `+oracleIdentEq("table_name")+` = :4
	`, schema, object, schema, object)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]grantEntry, 0)
	for rows.Next() {
		var e grantEntry
		var grantable string
		var column sql.NullString
		if err := rows.Scan(&e.grantee, &e.privilege, &grantable, &column); err != nil {
			return nil, err
		}
		e.grantable = strings.EqualFold(grantable, "YES")
		e.column = column.String
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// oracleFormatGrants writes one GRANT statement per group. Oracle's GRANT
// takes no object-kind keyword — the qualified name alone is enough for a
// table, view, sequence or routine alike.
func oracleFormatGrants(schema, object string, entries []grantEntry) []string {
	ident := oracleQualifiedName(schema, object)
	groups := groupGrantEntries(entries)
	statements := make([]string, 0, len(groups))
	for _, group := range groups {
		var b strings.Builder
		b.WriteString("GRANT " + strings.Join(group.privileges, ", "))
		if group.column != "" {
			b.WriteString(" (" + group.column + ")")
		}
		b.WriteString(" ON " + ident + " TO " + group.grantee)
		if group.grantable {
			b.WriteString(" WITH GRANT OPTION")
		}
		b.WriteString(";")
		statements = append(statements, b.String())
	}
	return statements
}

// oracleQualifiedName joins the schema and object names as they arrive from
// the tree, which already quotes whichever of them needs it (the same
// representation oracleIdentEq matches against in the catalog).
func oracleQualifiedName(schema, object string) string {
	if schema == "" {
		return object
	}
	return schema + "." + object
}

func oracleQuoteLiteral(text string) string {
	return "'" + strings.ReplaceAll(text, "'", "''") + "'"
}
