package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestSqliteTemplatesUseTrailingCommaAsAliasAndConfiguredIndent is a
// regression test for the tree context menu's SELECT/INSERT/UPDATE
// templates: they used to always emit a leading comma, a bare table alias
// with no AS, and a hardcoded number of literal spaces regardless of the
// user's indent Settings. All three must now reflect the requested style.
func TestSqliteTemplatesUseTrailingCommaAsAliasAndConfiguredIndent(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "templates_test.sqlite")
	db, err := openSQLiteTarget(dbPath)
	if err != nil {
		t.Fatalf("openSQLiteTarget: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec("create table people (id integer primary key, name text not null, age integer)"); err != nil {
		t.Fatalf("create table: %v", err)
	}

	t.Run("select: trailing comma, AS alias, tab indent", func(t *testing.T) {
		got, err := sqliteTemplateSelect(db, "people", "t", "\t")
		if err != nil {
			t.Fatalf("sqliteTemplateSelect: %v", err)
		}
		want := "SELECT t.id,\n\tt.name,\n\tt.age\nFROM people AS t\nORDER BY t.id"
		if got != want {
			t.Fatalf("got:\n%s\nwant:\n%s", got, want)
		}
	})

	t.Run("select: 2-space indent from Settings", func(t *testing.T) {
		got, err := sqliteTemplateSelect(db, "people", "t", "  ")
		if err != nil {
			t.Fatalf("sqliteTemplateSelect: %v", err)
		}
		want := "SELECT t.id,\n  t.name,\n  t.age\nFROM people AS t\nORDER BY t.id"
		if got != want {
			t.Fatalf("got:\n%s\nwant:\n%s", got, want)
		}
	})

	t.Run("insert: trailing comma, comma before inline comment", func(t *testing.T) {
		got, err := sqliteTemplateInsert(db, "people", "    ")
		if err != nil {
			t.Fatalf("sqliteTemplateInsert: %v", err)
		}
		want := "INSERT INTO people (\n" +
			"    id,\n" +
			"    name,\n" +
			"    age\n" +
			") VALUES (\n" +
			"    ?, -- id integer PRIMARY KEY\n" +
			"    ?, -- name text\n" +
			"    ? -- age integer NULLABLE\n" +
			")"
		if got != want {
			t.Fatalf("got:\n%s\nwant:\n%s", got, want)
		}
		if strings.Contains(got, "\n     ,") || strings.Contains(got, "\n    ,") {
			t.Fatalf("template still uses a leading comma:\n%s", got)
		}
	})

	t.Run("update: trailing comma, comma before inline comment", func(t *testing.T) {
		got, err := sqliteTemplateUpdate(db, "people", "    ")
		if err != nil {
			t.Fatalf("sqliteTemplateUpdate: %v", err)
		}
		want := "UPDATE people\n" +
			"SET id = ?, -- id integer PRIMARY KEY\n" +
			"    name = ?, -- name text\n" +
			"    age = ? -- age integer NULLABLE\n" +
			"WHERE condition"
		if got != want {
			t.Fatalf("got:\n%s\nwant:\n%s", got, want)
		}
	})
}
