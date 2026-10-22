package main

import (
	"database/sql"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func openPair(t *testing.T, srcSQL, dstSQL []string) (*sql.DB, *sql.DB) {
	t.Helper()
	open := func(name string, stmts []string) *sql.DB {
		db, err := openSQLiteTarget(filepath.Join(t.TempDir(), name))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		for _, s := range stmts {
			if _, err := db.Exec(s); err != nil {
				t.Fatalf("%s: %v", s, err)
			}
		}
		return db
	}
	return open("src.db", srcSQL), open("dst.db", dstSQL)
}

func TestSchemaDiffAndSync(t *testing.T) {
	src, dst := openPair(t,
		[]string{
			`create table a (id integer, name text, age int)`,
			`create table b (id integer primary key, v text)`,
			`create table c (x int)`,
			`create table same (id integer, v text)`,
		},
		[]string{
			`create table a (id integer, name integer, old text)`,
			`create table d (z int)`,
			`create table same (id integer, v text)`,
		})
	sm, err := readSchemaModel(src, "sqlite", "")
	if err != nil {
		t.Fatal(err)
	}
	dm, err := readSchemaModel(dst, "sqlite", "")
	if err != nil {
		t.Fatal(err)
	}
	d := diffSchemas(sm, dm)
	if !reflect.DeepEqual(d.MissingTables, []string{"b", "c"}) || !reflect.DeepEqual(d.ExtraTables, []string{"d"}) {
		t.Fatalf("tables: missing=%v extra=%v", d.MissingTables, d.ExtraTables)
	}
	if len(d.AddedColumns) != 1 || d.AddedColumns[0].Table != "a" || d.AddedColumns[0].Column != "age" {
		t.Errorf("added = %+v", d.AddedColumns)
	}
	if len(d.RemovedColumns) != 1 || d.RemovedColumns[0].Column != "old" {
		t.Errorf("removed = %+v", d.RemovedColumns)
	}
	if len(d.TypeChanges) != 1 || d.TypeChanges[0].Column != "name" || !strings.EqualFold(d.TypeChanges[0].Source, "text") || !strings.EqualFold(d.TypeChanges[0].Target, "integer") {
		t.Errorf("type changes = %+v", d.TypeChanges)
	}

	script := schemaSyncScript(src, sm, dm, d)
	for _, want := range []string{
		"CREATE TABLE b", "CREATE TABLE c", `ALTER TABLE "a" ADD COLUMN age`,
		"-- sqlite cannot change the type of a.name",
		`-- ALTER TABLE "a" DROP COLUMN old;`, `-- DROP TABLE "d";`,
	} {
		if !strings.Contains(script, want) {
			t.Errorf("script lacks %q:\n%s", want, script)
		}
	}
	// The executable part of the script brings the target in line (drops stay commented out).
	for _, stmt := range scriptStatements(script) {
		if _, err := dst.Exec(stmt); err != nil {
			t.Fatalf("running %q: %v", stmt, err)
		}
	}
	dm2, _ := readSchemaModel(dst, "sqlite", "")
	d2 := diffSchemas(sm, dm2)
	if len(d2.MissingTables) != 0 || len(d2.AddedColumns) != 0 {
		t.Errorf("still different after the sync: %+v", d2)
	}
	if len(d2.ExtraTables) != 1 || len(d2.RemovedColumns) != 1 {
		t.Errorf("the destructive differences must remain: %+v", d2)
	}

	same, _ := readSchemaModel(src, "sqlite", "")
	if d := diffSchemas(same, same); !d.empty() || !strings.Contains(schemaSyncScript(src, same, same, d), "The schemas match") {
		t.Error("identical schemas reported as different")
	}
}

func TestCompareTableData(t *testing.T) {
	src, dst := openPair(t,
		[]string{
			`create table person (id integer primary key, name text, age int, note text)`,
			`insert into person values (1, 'Ann', 30, NULL), (2, 'Bob', 41, 'x'), (3, 'O''Neil', 25, 'multi
line')`,
		},
		[]string{
			`create table person (id integer primary key, name text, age int, extra text)`,
			`insert into person values (2, 'Robert', 41, 'e'), (3, 'O''Neil', 25, 'e'), (4, 'Dan', 50, 'e')`,
		})
	diff, err := compareTableData(src, "sqlite", "", "person", dst, "sqlite", "", "person", false)
	if err != nil {
		t.Fatal(err)
	}
	if diff.Inserts != 1 || diff.Updates != 1 || diff.Deletes != 1 {
		t.Fatalf("diff = %d inserts, %d updates, %d deletes\n%s", diff.Inserts, diff.Updates, diff.Deletes, diff.Script)
	}
	if !reflect.DeepEqual(diff.KeyColumns, []string{"id"}) {
		t.Errorf("keys = %v", diff.KeyColumns)
	}
	// 'note' (source only) and 'extra' (target only) are not compared, so row 3 counts as equal.
	if !strings.Contains(diff.Script, "-- DELETE FROM") || strings.Contains(diff.Script, "\nDELETE FROM") {
		t.Errorf("deletes must be commented out by default:\n%s", diff.Script)
	}
	if !strings.Contains(diff.Script, "UPDATE") || strings.Contains(diff.Script, "extra") {
		t.Errorf("script:\n%s", diff.Script)
	}

	// With deletes included, running the script makes the common columns equal.
	diff, err = compareTableData(src, "sqlite", "", "person", dst, "sqlite", "", "person", true)
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range scriptStatements(diff.Script) {
		if _, err := dst.Exec(stmt); err != nil {
			t.Fatalf("running %q: %v", stmt, err)
		}
	}
	again, err := compareTableData(src, "sqlite", "", "person", dst, "sqlite", "", "person", true)
	if err != nil {
		t.Fatal(err)
	}
	if again.Inserts+again.Updates+again.Deletes != 0 || !strings.Contains(again.Script, "The tables match") {
		t.Fatalf("not in sync after the script:\n%s", again.Script)
	}
	var n int
	dst.QueryRow(`select count(*) from person`).Scan(&n)
	if n != 3 {
		t.Errorf("target has %d rows, want 3", n)
	}
}

func TestCompareTableDataErrors(t *testing.T) {
	src, dst := openPair(t,
		[]string{`create table nopk (a int, b int)`, `create table t (id integer primary key, v int)`},
		[]string{`create table nopk (a int, b int)`, `create table t (id integer primary key, other text)`})
	if _, err := compareTableData(src, "sqlite", "", "nopk", dst, "sqlite", "", "nopk", false); err == nil || !strings.Contains(err.Error(), "primary key") {
		t.Errorf("no primary key: %v", err)
	}
	if _, err := compareTableData(src, "sqlite", "", "t", dst, "sqlite", "", "t", false); err != nil {
		t.Errorf("partly shared columns: %v", err)
	}
	if _, err := compareTableData(src, "sqlite", "", "ghost", dst, "sqlite", "", "t", false); err == nil {
		t.Error("unknown source table")
	}
	if _, err := compareTableData(src, "sqlite", "", "t", dst, "sqlite", "", "ghost", false); err == nil {
		t.Error("unknown target table")
	}
}
