package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestEditDataForeignKeysSQLite(t *testing.T) {
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "fk.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, stmt := range []string{
		"create table parent (id integer primary key, region text, name text, unique (id, region))",
		"create table other (code text primary key)",
		`create table child (id integer primary key, parent_id integer references parent(id),
			p_id integer, p_region text, o text references other(code),
			foreign key (p_id, p_region) references parent(id, region))`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	fks, err := editDataForeignKeys("sqlite", db, "", "child")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]editDataFK{}
	for _, fk := range fks {
		got[fk.Columns[0]] = fk
	}
	if len(fks) != 3 {
		t.Fatalf("got %d foreign keys, want 3: %+v", len(fks), fks)
	}
	if fk := got["parent_id"]; fk.RTable != "parent" || !reflect.DeepEqual(fk.RColumns, []string{"id"}) || fk.RColumnSQL[0] != `"id"` {
		t.Errorf("parent_id fk = %+v", fk)
	}
	if fk := got["p_id"]; !reflect.DeepEqual(fk.Columns, []string{"p_id", "p_region"}) || !reflect.DeepEqual(fk.RColumns, []string{"id", "region"}) {
		t.Errorf("composite fk = %+v", fk)
	}
	if fk := got["o"]; fk.RTable != "other" || fk.RColumns[0] != "code" {
		t.Errorf("o fk = %+v", fk)
	}
}
