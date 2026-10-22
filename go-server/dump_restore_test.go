package main

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestDumpAndRestoreSQLite(t *testing.T) {
	src, err := openSQLiteTarget(filepath.Join(t.TempDir(), "src.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	for _, stmt := range []string{
		`create table "my people" (id integer primary key, "Full Name" text not null, age int, score real, note text, blob_col blob)`,
		`insert into "my people" values (1, 'O''Brien; DROP TABLE x', 30, 1.5, NULL, X'00ff'), (2, 'Line1
Line2 -- not a comment', NULL, -2, '', NULL)`,
	} {
		if _, err := src.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}

	var withData strings.Builder
	if err := dumpTable(&withData, src, "sqlite", "", "my people", true); err != nil {
		t.Fatal(err)
	}
	dump := withData.String()
	if !strings.HasPrefix(dump, "-- OmniDB dump of ") || !strings.Contains(dump, "CREATE TABLE") || strings.Count(dump, "INSERT INTO") != 2 {
		t.Fatalf("dump =\n%s", dump)
	}
	var structure strings.Builder
	if err := dumpTable(&structure, src, "sqlite", "", "my people", false); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(structure.String(), "INSERT") {
		t.Fatalf("structure-only dump holds data:\n%s", structure.String())
	}

	dst, err := openSQLiteTarget(filepath.Join(t.TempDir(), "dst.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer dst.Close()
	n, err := restoreScript(dst, dump)
	if err != nil || n != 3 {
		t.Fatalf("restoreScript = %d, %v", n, err)
	}
	got := fetchAll(t, dst, `select id, "Full Name", age, score, note, hex(blob_col) from "my people" order by id`)
	want := fetchAll(t, src, `select id, "Full Name", age, score, note, hex(blob_col) from "my people" order by id`)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("restored rows differ:\n got %v\nwant %v", got, want)
	}

	// A failing statement rolls the whole script back and is named.
	_, err = restoreScript(dst, "create table fresh (a int);\ninsert into fresh values (1);\ninsert into no_such_table values (1);")
	if err == nil || !strings.Contains(err.Error(), "statement 3") {
		t.Fatalf("err = %v, want statement 3 named", err)
	}
	if rows := fetchAll(t, dst, `select name from sqlite_master where name = 'fresh'`); len(rows) != 0 {
		t.Fatalf("table from a rolled-back script exists: %v", rows)
	}
	if _, err := restoreScript(dst, " -- only a comment\n/* and another */ ; ;"); err == nil {
		t.Error("a script without statements must fail")
	}
}

func TestScriptStatements(t *testing.T) {
	got := scriptStatements("-- header\nselect 1;\n\n-- Create\n/* c */;\nselect ';' as semi;\nselect 2")
	if len(got) != 3 || !strings.Contains(got[1], "';'") {
		t.Fatalf("scriptStatements = %q", got)
	}
}

func TestDumpUnknownTable(t *testing.T) {
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var b strings.Builder
	if err := dumpTable(&b, db, "sqlite", "", "ghost", true); err == nil {
		t.Error("unknown table must fail")
	}
}

// fetchAll reads every row of a query as strings (NULL as "<nil>").
func fetchAll(t *testing.T, db *sql.DB, query string) [][]string {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var out [][]string
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		row := make([]string, len(cols))
		for i, v := range vals {
			row[i] = fmt.Sprintf("%v", v)
		}
		out = append(out, row)
	}
	return out
}
