package main

import (
	"database/sql"
	"testing"
)

// Enough of appdb_schema.sql for fetchConnectionsForUser's join and
// saveConnectionOrder's writes -- bootstrapAppDB guards itself with a
// package-level once flag, so it cannot be reused here (same reason
// appdb_users_test.go spells its schema out).
var connectionOrderSchema = []string{
	`create table OmniDB_app_technology (id integer primary key, name varchar(50))`,
	`create table OmniDB_app_connection (id integer primary key, user_id integer, alias text, conn_string text,
		database text, password text, port text, server text, ssh_key text, ssh_password text, ssh_port text,
		ssh_server text, ssh_user text, use_tunnel bool, technology_id integer, username text, public bool,
		environment text default '')`,
	`create table OmniDB_app_connectionorder (id integer primary key, user_id integer, connection_id integer,
		position integer, unique (user_id, connection_id))`,
}

func newConnectionOrderDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	for _, stmt := range connectionOrderSchema {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("schema %q: %v", stmt, err)
		}
	}
	for _, stmt := range []string{
		`insert into OmniDB_app_technology (id, name) values (1, 'postgresql')`,
		// User 1 owns 10/11/12; user 2 owns 20, which is public and so shows
		// up in user 1's list too.
		`insert into OmniDB_app_connection (id, user_id, technology_id, alias, public, conn_string, database,
			password, port, server, ssh_key, ssh_password, ssh_port, ssh_server, ssh_user, use_tunnel, username)
			values (10, 1, 1, 'a', 0, '', '', '', '', '', '', '', '', '', '', 0, ''),
			       (11, 1, 1, 'b', 0, '', '', '', '', '', '', '', '', '', '', 0, ''),
			       (12, 1, 1, 'c', 0, '', '', '', '', '', '', '', '', '', '', 0, ''),
			       (20, 2, 1, 'shared', 1, '', '', '', '', '', '', '', '', '', '', 0, ''),
			       (21, 2, 1, 'private', 0, '', '', '', '', '', '', '', '', '', '', 0, '')`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("seed %q: %v", stmt, err)
		}
	}
	return db
}

func connectionIDs(t *testing.T, db *sql.DB, userID int64) []int64 {
	t.Helper()
	conns, err := fetchConnectionsForUser(db, userID)
	if err != nil {
		t.Fatalf("fetchConnectionsForUser(%d): %v", userID, err)
	}
	ids := make([]int64, 0, len(conns))
	for _, c := range conns {
		ids = append(ids, c.ID)
	}
	return ids
}

func assertIDs(t *testing.T, got []int64, want ...int64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v, want %v", got, want)
		}
	}
}

func TestConnectionOrderDefaultsToID(t *testing.T) {
	db := newConnectionOrderDB(t)
	assertIDs(t, connectionIDs(t, db, 1), 10, 11, 12, 20)
}

func TestSaveConnectionOrderReordersOnlyForThatUser(t *testing.T) {
	db := newConnectionOrderDB(t)

	if err := saveConnectionOrder(db, 1, []int64{20, 12, 10, 11}); err != nil {
		t.Fatalf("saveConnectionOrder: %v", err)
	}
	assertIDs(t, connectionIDs(t, db, 1), 20, 12, 10, 11)

	// User 2 sees the same public connection, but at their own position --
	// which is why the order lives in its own per-user table rather than in a
	// column on OmniDB_app_connection.
	assertIDs(t, connectionIDs(t, db, 2), 20, 21)
}

func TestSaveConnectionOrderPutsLaterConnectionsLast(t *testing.T) {
	db := newConnectionOrderDB(t)

	if err := saveConnectionOrder(db, 1, []int64{12, 11, 10, 20}); err != nil {
		t.Fatalf("saveConnectionOrder: %v", err)
	}
	if _, err := db.Exec(`insert into OmniDB_app_connection (id, user_id, technology_id, alias, public, conn_string,
		database, password, port, server, ssh_key, ssh_password, ssh_port, ssh_server, ssh_user, use_tunnel, username)
		values (13, 1, 1, 'new', 0, '', '', '', '', '', '', '', '', '', '', 0, '')`); err != nil {
		t.Fatalf("insert new connection: %v", err)
	}

	assertIDs(t, connectionIDs(t, db, 1), 12, 11, 10, 20, 13)
}

// A saved order must never become a way to learn that somebody else's private
// connection exists, or to keep a stale row alive: ids the user cannot see and
// repeated ids are dropped rather than stored.
func TestSaveConnectionOrderSkipsInvisibleAndDuplicateIDs(t *testing.T) {
	db := newConnectionOrderDB(t)

	if err := saveConnectionOrder(db, 1, []int64{21, 12, 10, 12, 999, 11, 20}); err != nil {
		t.Fatalf("saveConnectionOrder: %v", err)
	}
	assertIDs(t, connectionIDs(t, db, 1), 12, 10, 11, 20)

	var n int
	if err := db.QueryRow(`select count(*) from OmniDB_app_connectionorder where user_id = 1`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 4 {
		t.Errorf("stored %d order rows, want 4", n)
	}
}

// Dragging twice must replace the previous arrangement, not append to it.
func TestSaveConnectionOrderReplacesPreviousOrder(t *testing.T) {
	db := newConnectionOrderDB(t)

	if err := saveConnectionOrder(db, 1, []int64{20, 12, 11, 10}); err != nil {
		t.Fatalf("saveConnectionOrder: %v", err)
	}
	if err := saveConnectionOrder(db, 1, []int64{10, 11, 12, 20}); err != nil {
		t.Fatalf("saveConnectionOrder: %v", err)
	}
	assertIDs(t, connectionIDs(t, db, 1), 10, 11, 12, 20)

	var n int
	if err := db.QueryRow(`select count(*) from OmniDB_app_connectionorder`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 4 {
		t.Errorf("stored %d order rows, want 4", n)
	}
}
