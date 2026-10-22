package main

import (
	"database/sql"
	"strings"
	"testing"
	"time"

	"omnidb-server/vcsrepo"
)

func newVCSTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, _ := newScheduleTestDB(t)
	for _, stmt := range []string{
		`create table OmniDB_app_snippetfolder (id integer primary key autoincrement, name text, create_date text, modify_date text, user_id integer, parent_id integer)`,
		`create table OmniDB_app_snippetfile (id integer primary key autoincrement, name text, create_date text, modify_date text, text text, parent_id integer, user_id integer)`,
		`create table OmniDB_app_monunits (id integer primary key autoincrement, script_chart text, script_data text, type text, title text, is_default bool, interval integer, technology_id integer, user_id integer)`,
		`insert into OmniDB_app_snippetfolder (id, name, user_id, parent_id) values (1, 'reports', 1, null), (2, 'monthly', 1, 1), (3, 'other', 2, null)`,
		`insert into OmniDB_app_snippetfile (name, text, parent_id, user_id) values
			('top', 'select 1', null, 1), ('a/b', 'select 2', 1, 1), ('a:b', 'select 3', 1, 1),
			('deep', 'select 4', 2, 1), ('theirs', 'select 5', 3, 2)`,
		`insert into OmniDB_app_monunits (script_chart, script_data, type, title, is_default, interval, technology_id, user_id)
			values ('c', 'd', 'chart', 'Locks', 0, 30, 1, 1), ('c2', 'd2', 'grid', 'Theirs', 0, 60, 1, 2)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	return db
}

func exportAll(t *testing.T, db *sql.DB, userID int64) map[string]string {
	t.Helper()
	got := map[string]string{}
	for _, k := range vcsKinds {
		files, err := k.Export(db, userID)
		if err != nil {
			t.Fatalf("%s: %v", k.Name, err)
		}
		for _, f := range files {
			got[f.Path] = f.Text
		}
	}
	return got
}

func TestVCSExport(t *testing.T) {
	db := newVCSTestDB(t)
	if _, err := addSchedule(db, 1, 30, "nightly", "select 1", 60, time.Unix(1_000_000, 0)); err != nil {
		t.Fatal(err)
	}
	got := exportAll(t, db, 1)
	for path, want := range map[string]string{
		"snippets/top.sql":                  "select 1",
		"snippets/reports/a_b.sql":          "select 2",
		"snippets/reports/a_b (2).sql":      "select 3",
		"snippets/reports/monthly/deep.sql": "select 4",
	} {
		if got[path] != want {
			t.Errorf("%s = %q, want %q", path, got[path], want)
		}
	}
	if m := got["monitoring/postgresql/Locks.json"]; !strings.Contains(m, `"script_data": "d"`) || strings.Contains(m, "Theirs") {
		t.Errorf("monitoring file = %q", m)
	}
	if _, ok := got["monitoring/postgresql/Theirs.json"]; ok {
		t.Error("another user's monitoring unit was exported")
	}
	sch := got["schedules/file/nightly.json"]
	if !strings.Contains(sch, `"interval_minutes": 60`) || strings.Contains(sch, "target.sqlite") {
		t.Errorf("schedule file = %q (must carry the alias, never the connection's address)", sch)
	}
	if safePathElement(" ..") != "_" || safePathElement("x\x01y") != "x_y" {
		t.Error("safePathElement")
	}
}

func TestVCSImport(t *testing.T) {
	db := newVCSTestDB(t)
	files := exportAllFiles(t, db, 1)
	// Importing what was just exported changes nothing.
	for _, k := range vcsKinds {
		res, err := k.Import(db, 1, under(k.Root, files))
		if err != nil || res.Created+res.Updated != 0 {
			t.Errorf("%s: re-import = %+v, %v", k.Name, res, err)
		}
	}

	edit := func(path, text string) {
		for i := range files {
			if files[i].Path == path {
				files[i].Text = text
			}
		}
	}
	edit("snippets/top.sql", "select 11")
	files = append(files,
		vcsrepo.File{Path: "snippets/fresh/sub/new.sql", Text: "select 9"},
		vcsrepo.File{Path: "monitoring/postgresql/Fresh.json", Text: `{"title":"Fresh","type":"grid","interval":15,"script_chart":"","script_data":"x"}`},
		vcsrepo.File{Path: "monitoring/nosuchdb/X.json", Text: `{"title":"X","type":"grid","interval":15}`},
		vcsrepo.File{Path: "monitoring/postgresql/broken.json", Text: `not json`},
		vcsrepo.File{Path: "schedules/file/imported.json", Text: `{"name":"imported","sql":"select 2","interval_minutes":5}`},
		vcsrepo.File{Path: "schedules/unknown-alias/x.json", Text: `{"name":"x","sql":"select 2","interval_minutes":5}`},
		vcsrepo.File{Path: "schedules/file/bad.json", Text: `{"name":"bad","sql":"select 2","interval_minutes":0}`},
	)
	byName := map[string]vcsImportResult{}
	for _, k := range vcsKinds {
		res, err := k.Import(db, 1, under(k.Root, files))
		if err != nil {
			t.Fatalf("%s: %v", k.Name, err)
		}
		byName[k.Name] = res
	}
	if r := byName["snippets"]; r.Created != 1 || r.Updated != 1 {
		t.Errorf("snippets = %+v", r)
	}
	if r := byName["monitoring"]; r.Created != 1 || r.Skipped != 2 {
		t.Errorf("monitoring = %+v", r)
	}
	if r := byName["schedules"]; r.Created != 1 || r.Skipped != 2 {
		t.Errorf("schedules = %+v", r)
	}

	var enabled bool
	if err := db.QueryRow(`select enabled from OmniDB_app_schedule where name = 'imported'`).Scan(&enabled); err != nil || enabled {
		t.Errorf("an imported schedule must start paused (enabled=%v, err=%v)", enabled, err)
	}
	var n int
	db.QueryRow(`select count(*) from OmniDB_app_snippetfolder where user_id = 1 and name in ('fresh','sub')`).Scan(&n)
	if n != 2 {
		t.Errorf("folders created = %d", n)
	}
	db.QueryRow(`select count(*) from OmniDB_app_snippetfile where user_id = 2`).Scan(&n)
	if n != 1 {
		t.Errorf("the other user's snippets = %d", n)
	}
}

func TestVCSLocalBackendRoundTrip(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	db := newVCSTestDB(t)
	b := localBackend{dir: t.TempDir()}
	if err := b.Init(); err != nil {
		t.Fatal(err)
	}
	var files []vcsrepo.File
	var roots []string
	for _, k := range vcsKinds {
		fs, _ := k.Export(db, 1)
		files = append(files, fs...)
		roots = append(roots, k.Root)
	}
	if msg, err := b.Commit(roots, files, "snapshot"); err != nil || !strings.HasSuffix(msg, "snapshot") {
		t.Fatalf("commit = %q, %v", msg, err)
	}
	read, err := b.Read(roots)
	if err != nil || len(read) != len(files) {
		t.Fatalf("read %d files, want %d (%v)", len(read), len(files), err)
	}
	if _, err := selectedVCSKinds([]string{"nope"}); err == nil {
		t.Error("an unknown kind must be refused")
	}
}

func exportAllFiles(t *testing.T, db *sql.DB, userID int64) []vcsrepo.File {
	t.Helper()
	var all []vcsrepo.File
	for _, k := range vcsKinds {
		fs, err := k.Export(db, userID)
		if err != nil {
			t.Fatal(err)
		}
		all = append(all, fs...)
	}
	return all
}
