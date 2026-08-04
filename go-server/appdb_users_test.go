package main

import (
	"database/sql"
	"testing"
)

// The tables deleteUserCascade touches, minus columns it does not read. Only
// enough schema to exercise the cascade — bootstrapAppDB guards itself with a
// package-level once flag, so it cannot be reused here.
var cascadeSchema = []string{
	`create table auth_user (id integer primary key, username text, password text, is_superuser integer,
		last_login text, last_name text, email text, is_staff integer, is_active integer, date_joined text, first_name text)`,
	`create table OmniDB_app_connection (id integer primary key, user_id integer)`,
	`create table OmniDB_app_tab (id integer primary key, connection_id integer)`,
	`create table OmniDB_app_queryhistory (id integer primary key, connection_id integer)`,
	`create table OmniDB_app_consolehistory (id integer primary key, connection_id integer)`,
	`create table OmniDB_app_monunitsconnections (id integer primary key, connection_id integer)`,
	`create table OmniDB_app_groupconnection (id integer primary key, connection_id integer, group_id integer)`,
	`create table OmniDB_app_group (id integer primary key, user_id integer)`,
	`create table OmniDB_app_snippetfile (id integer primary key, user_id integer)`,
	`create table OmniDB_app_snippetfolder (id integer primary key, user_id integer)`,
	`create table OmniDB_app_shortcut (id integer primary key, user_id integer)`,
	`create table OmniDB_app_monunits (id integer primary key, user_id integer)`,
	`create table OmniDB_app_userdetails (id integer primary key, user_id integer)`,
}

// The four Django framework tables bootstrapAppDB deliberately never creates.
var legacyDjangoSchema = []string{
	`create table auth_user_groups (id integer primary key, user_id integer)`,
	`create table auth_user_user_permissions (id integer primary key, user_id integer)`,
	`create table django_admin_log (id integer primary key, user_id integer)`,
	`create table social_auth_usersocialauth (id integer primary key, user_id integer)`,
}

func newCascadeDB(t *testing.T, extra []string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	for _, stmt := range append(append([]string{}, cascadeSchema...), extra...) {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("schema %q: %v", stmt, err)
		}
	}
	for _, stmt := range []string{
		`insert into auth_user (id, username, is_superuser) values (7, 'doomed', 0)`,
		`insert into auth_user (id, username, is_superuser) values (8, 'keeper', 1)`,
		`insert into OmniDB_app_connection (id, user_id) values (70, 7), (80, 8)`,
		`insert into OmniDB_app_tab (id, connection_id) values (1, 70), (2, 80)`,
		`insert into OmniDB_app_group (id, user_id) values (700, 7)`,
		`insert into OmniDB_app_groupconnection (id, connection_id, group_id) values (1, 70, 700)`,
		`insert into OmniDB_app_shortcut (id, user_id) values (1, 7), (2, 8)`,
		`insert into OmniDB_app_userdetails (id, user_id) values (1, 7), (2, 8)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("seed %q: %v", stmt, err)
		}
	}
	return db
}

func count(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("count %q: %v", query, err)
	}
	return n
}

// deleteUserCascade used to end with unconditional deletes from four Django
// framework tables that bootstrapAppDB never creates, so the very first one
// aborted the transaction with "no such table: auth_user_groups" and removing a
// user always failed with nothing deleted.
func TestDeleteUserCascadeOnSchemaWithoutDjangoTables(t *testing.T) {
	db := newCascadeDB(t, nil)

	if err := deleteUserCascade(db, 7); err != nil {
		t.Fatalf("deleteUserCascade: %v", err)
	}

	if n := count(t, db, `select count(*) from auth_user where id = 7`); n != 0 {
		t.Errorf("user still present: %d rows", n)
	}
	if n := count(t, db, `select count(*) from OmniDB_app_connection where user_id = 7`); n != 0 {
		t.Errorf("connections not cascaded: %d rows", n)
	}
	if n := count(t, db, `select count(*) from OmniDB_app_tab where connection_id = 70`); n != 0 {
		t.Errorf("tabs not cascaded: %d rows", n)
	}
	if n := count(t, db, `select count(*) from OmniDB_app_groupconnection`); n != 0 {
		t.Errorf("group connections not cascaded: %d rows", n)
	}

	// The other user is untouched.
	if n := count(t, db, `select count(*) from auth_user where id = 8`); n != 1 {
		t.Errorf("other user affected: %d rows", n)
	}
	if n := count(t, db, `select count(*) from OmniDB_app_tab where connection_id = 80`); n != 1 {
		t.Errorf("other user's tabs affected: %d rows", n)
	}
}

// A configuration database carried over from the Django releases does have
// those tables, and their rows still have to go.
func TestDeleteUserCascadeCleansLegacyDjangoTables(t *testing.T) {
	db := newCascadeDB(t, legacyDjangoSchema)
	for _, table := range []string{"auth_user_groups", "auth_user_user_permissions", "django_admin_log", "social_auth_usersocialauth"} {
		if _, err := db.Exec(`insert into ` + table + ` (id, user_id) values (1, 7), (2, 8)`); err != nil {
			t.Fatalf("seed %s: %v", table, err)
		}
	}

	if err := deleteUserCascade(db, 7); err != nil {
		t.Fatalf("deleteUserCascade: %v", err)
	}

	for _, table := range []string{"auth_user_groups", "auth_user_user_permissions", "django_admin_log", "social_auth_usersocialauth"} {
		if n := count(t, db, `select count(*) from `+table+` where user_id = 7`); n != 0 {
			t.Errorf("%s not cleaned: %d rows", table, n)
		}
		if n := count(t, db, `select count(*) from `+table+` where user_id = 8`); n != 1 {
			t.Errorf("%s: other user affected, %d rows", table, n)
		}
	}
}
