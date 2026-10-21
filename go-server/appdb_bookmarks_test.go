package main

import (
	"database/sql"
	"testing"
)

func newBookmarkTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	db.SetMaxOpenConns(1)
	for _, stmt := range []string{
		`create table OmniDB_app_technology (id integer primary key, name text)`,
		`create table OmniDB_app_connection (id integer primary key, user_id integer, technology_id integer, alias text, public bool)`,
		`insert into OmniDB_app_technology values (1, 'sqlite')`,
		`insert into OmniDB_app_connection values (1, 10, 1, 'mine', 0), (2, 20, 1, 'theirs', 0), (3, 20, 1, 'shared', 1)`,
		bookmarkTableDDL,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	return db
}

func TestBookmarks(t *testing.T) {
	db := newBookmarkTestDB(t)

	if err := addBookmark(db, 10, 1, "table", "", "people"); err != nil {
		t.Fatal(err)
	}
	// Pinning the same object again is a no-op, not an error.
	if err := addBookmark(db, 10, 1, "table", "", "people"); err != nil {
		t.Fatal(err)
	}
	if err := addBookmark(db, 10, 3, "table", "public", "orders"); err != nil {
		t.Fatalf("public connection of another user: %v", err)
	}
	if err := addBookmark(db, 10, 2, "table", "", "x"); err == nil {
		t.Error("bookmarking an object on somebody else's private connection must fail")
	}
	if err := addBookmark(db, 10, 1, "trigger", "", "x"); err == nil {
		t.Error("unknown kind must fail")
	}
	if err := addBookmark(db, 10, 1, "table", "", "  "); err == nil {
		t.Error("blank name must fail")
	}

	list, err := fetchBookmarks(db, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Alias != "mine" || list[0].Name != "people" || list[1].Alias != "shared" || list[1].Schema != "public" {
		t.Fatalf("bookmarks = %+v", list)
	}
	if other, _ := fetchBookmarks(db, 20); len(other) != 0 {
		t.Errorf("another user sees %+v", other)
	}

	// Somebody else's bookmark id cannot be deleted.
	if err := deleteBookmark(db, 20, list[0].ID); err != nil {
		t.Fatal(err)
	}
	if again, _ := fetchBookmarks(db, 10); len(again) != 2 {
		t.Fatalf("a foreign delete removed a bookmark: %+v", again)
	}
	if err := deleteBookmark(db, 10, list[0].ID); err != nil {
		t.Fatal(err)
	}
	if left, _ := fetchBookmarks(db, 10); len(left) != 1 {
		t.Fatalf("after delete: %+v", left)
	}

	// A connection that is no longer visible takes its bookmarks out of the list.
	if _, err := db.Exec(`update OmniDB_app_connection set public = 0 where id = 3`); err != nil {
		t.Fatal(err)
	}
	if hidden, _ := fetchBookmarks(db, 10); len(hidden) != 0 {
		t.Fatalf("bookmark of a no longer visible connection listed: %+v", hidden)
	}
}
