package main

import (
	"database/sql"
	"strings"
	"testing"
)

func newEditorVersionTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	db.SetMaxOpenConns(1)
	for _, stmt := range []string{
		`create table OmniDB_app_connection (id integer primary key, user_id integer, public bool)`,
		`insert into OmniDB_app_connection values (1, 10, 0), (2, 20, 0), (3, 20, 1)`,
		editorVersionTableDDL,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	return db
}

func TestEditorVersions(t *testing.T) {
	db := newEditorVersionTestDB(t)

	if stored, err := saveEditorVersion(db, 10, 1, "  \n "); err != nil || stored {
		t.Fatalf("blank text: stored=%v err=%v", stored, err)
	}
	for _, text := range []string{"select 1", "select 1", "select 2\nfrom t"} {
		if _, err := saveEditorVersion(db, 10, 1, text); err != nil {
			t.Fatal(err)
		}
	}
	list, err := fetchEditorVersions(db, 10, 1)
	if err != nil || len(list) != 2 {
		t.Fatalf("versions = %+v, %v (an identical consecutive snapshot must not be stored)", list, err)
	}
	if list[0].Preview != "select 2" || list[1].Preview != "select 1" || list[0].Size != len("select 2\nfrom t") {
		t.Fatalf("order/preview = %+v", list)
	}
	// Going back to an older text is a new version, not a duplicate of the newest.
	if stored, _ := saveEditorVersion(db, 10, 1, "select 1"); !stored {
		t.Fatal("restoring an old text should be stored again")
	}

	text, err := fetchEditorVersionText(db, 10, list[0].ID)
	if err != nil || text != "select 2\nfrom t" {
		t.Fatalf("text = %q, %v", text, err)
	}
	if _, err := fetchEditorVersionText(db, 20, list[0].ID); err == nil {
		t.Error("another user read a snapshot")
	}
	if other, _ := fetchEditorVersions(db, 20, 1); len(other) != 0 {
		t.Errorf("another user lists %+v", other)
	}
	if _, err := saveEditorVersion(db, 10, 2, "x"); err == nil {
		t.Error("snapshot on somebody else's private connection must fail")
	}
	if _, err := saveEditorVersion(db, 10, 3, "x"); err != nil {
		t.Errorf("public connection of another user: %v", err)
	}
	if _, err := saveEditorVersion(db, 10, 1, strings.Repeat("x", maxEditorVersionBytes+1)); err == nil {
		t.Error("oversized snapshot must fail")
	}
}

func TestEditorVersionsPruned(t *testing.T) {
	db := newEditorVersionTestDB(t)
	for i := 0; i < maxEditorVersions+25; i++ {
		if _, err := saveEditorVersion(db, 10, 1, "select "+strings.Repeat("x", i+1)); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := fetchEditorVersions(db, 10, 1)
	if len(list) != maxEditorVersions {
		t.Fatalf("kept %d versions, want %d", len(list), maxEditorVersions)
	}
	if list[0].Size != len("select ")+maxEditorVersions+25 {
		t.Errorf("newest snapshot missing: %+v", list[0])
	}
}

func TestEditorPreview(t *testing.T) {
	if got := editorPreview("\n\n  select 1  \nfrom t"); got != "select 1" {
		t.Errorf("preview = %q", got)
	}
	long := strings.Repeat("ž", 150)
	if got := editorPreview(long); got != strings.Repeat("ž", editorPreviewRunes)+"…" {
		t.Errorf("long preview = %q", got)
	}
}

func TestEditorVersionDate(t *testing.T) {
	for in, want := range map[string]string{
		"2026-10-21 09:25:38":       "2026-10-21T09:25:38Z",
		"2026-10-21T09:25:38Z":      "2026-10-21T09:25:38Z",
		"2026-10-21T11:25:38+02:00": "2026-10-21T09:25:38Z",
		"garbage":                   "garbage",
	} {
		if got := editorVersionDate(in); got != want {
			t.Errorf("editorVersionDate(%q) = %q, want %q", in, got, want)
		}
	}
}
