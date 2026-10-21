package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGuessSourceTable(t *testing.T) {
	cases := map[string]string{
		"select * from zz_people":                         "zz_people",
		"SELECT a, b FROM public.\"My Tab\" t WHERE x=1;": `public."My Tab"`,
		"select * from s.t order by 1 limit 5":            "s.t",
		"select * from t as u where a='from x'":           "t",
		"  -- c\nselect * from t":                         "t",
		"select * from a join b on 1=1":                   "",
		"select * from a, b":                              "",
		"select extract(year from d) from t":              "",
		"with x as (select 1) select * from x":            "",
		"select * from (select 1) q":                      "",
		"select 1":                                        "",
		"select * from t; select * from u":                "",
		"select * from t u v":                             "",
		"delete from t":                                   "",
		"select * from `db`.`tbl`":                        "`db`.`tbl`",
		"select * from t\n  where a = 1\n  order by a":    "t",
	}
	for in, want := range cases {
		if got := guessSourceTable(in); got != want {
			t.Errorf("guessSourceTable(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSQLExportLiteral(t *testing.T) {
	ts := time.Date(2026, 10, 21, 8, 7, 22, 0, time.UTC)
	cases := []struct {
		v    any
		tech string
		want string
	}{
		{nil, "postgresql", "NULL"},
		{int64(7), "sqlite", "7"},
		{1.5, "mysql", "1.5"},
		{true, "postgresql", "TRUE"},
		{true, "mssql", "1"},
		{false, "oracle", "0"},
		{"O'Brien", "postgresql", "'O''Brien'"},
		{`a\b`, "mysql", `'a\\b'`},
		{`a\b`, "postgresql", `'a\b'`},
		{ts, "postgresql", "'2026-10-21 08:07:22+00:00'"},
		{ts, "mysql", "'2026-10-21 08:07:22'"},
		{[]byte("text"), "sqlite", "'text'"},
		{[]byte{0xff, 0x00}, "postgresql", `'\xff00'`},
		{[]byte{0xff, 0x00}, "mssql", "0xff00"},
		{[]byte{0xff, 0x00}, "mysql", "X'ff00'"},
	}
	for _, c := range cases {
		if got := sqlExportLiteral(c.v, c.tech); got != c.want {
			t.Errorf("sqlExportLiteral(%#v, %s) = %s, want %s", c.v, c.tech, got, c.want)
		}
	}
}

func TestSQLExportIdent(t *testing.T) {
	cases := []struct{ name, tech, want string }{
		{"id", "postgresql", "id"},
		{"Name", "postgresql", `"Name"`},
		{"a b", "sqlite", `"a b"`},
		{"Name", "mysql", "`Name`"},
		{"Name", "mssql", "Name"},
		{"a b", "mssql", "[a b]"},
		{"ID", "oracle", "ID"},
		{"id", "oracle", `"id"`},
		{`we"ird`, "postgresql", `"we""ird"`},
	}
	for _, c := range cases {
		if got := sqlExportIdent(c.name, c.tech); got != c.want {
			t.Errorf("sqlExportIdent(%q, %s) = %s, want %s", c.name, c.tech, got, c.want)
		}
	}
}

func TestRunExportQuerySQL(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "src.db")
	db, err := openSQLiteTarget(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, stmt := range []string{
		"create table people (id integer primary key, \"Full Name\" text, note text)",
		"insert into people values (1, 'O''Brien', NULL), (2, 'Eve', 'hi')",
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	out := filepath.Join(dir, "out.sql")
	if err := runExportQuery(db, `select id, "Full Name", note from people order by id`, "sql", out, ";", "utf-8", "sqlite"); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	want := "INSERT INTO people (id, \"Full Name\", note) VALUES (1, 'O''Brien', NULL);\n" +
		"INSERT INTO people (id, \"Full Name\", note) VALUES (2, 'Eve', 'hi');\n"
	if string(got) != want {
		t.Fatalf("export =\n%s\nwant\n%s", got, want)
	}
}
