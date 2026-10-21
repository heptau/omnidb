package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func sp(s string) *string { return &s }

func TestImportRows(t *testing.T) {
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "imp.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, stmt := range []string{
		`create table people (id integer primary key, "Full Name" text not null, age int, note text)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}

	n, err := importRows(db, "sqlite", "", "people", []string{"id", "Full Name", "age"}, [][]*string{
		{sp("1"), sp("O'Brien"), sp("30")},
		{sp("2"), sp("Eve; DROP TABLE people"), nil},
	})
	if err != nil || n != 2 {
		t.Fatalf("importRows = %d, %v", n, err)
	}
	var name string
	var age *int
	if err := db.QueryRow(`select "Full Name", age from people where id = 2`).Scan(&name, &age); err != nil || name != "Eve; DROP TABLE people" || age != nil {
		t.Fatalf("row 2 = %q %v %v", name, age, err)
	}

	// A failing row rolls everything back and is named.
	_, err = importRows(db, "sqlite", "", "people", []string{"id", "Full Name"}, [][]*string{
		{sp("3"), sp("ok")},
		{sp("4"), nil}, // violates NOT NULL
	})
	if err == nil || !strings.Contains(err.Error(), "row 2") {
		t.Fatalf("err = %v, want it to name row 2", err)
	}
	var count int
	db.QueryRow(`select count(*) from people`).Scan(&count)
	if count != 2 {
		t.Fatalf("rows after a failed import = %d, want 2 (rolled back)", count)
	}

	for name, call := range map[string]func() (int, error){
		"unknown column": func() (int, error) {
			return importRows(db, "sqlite", "", "people", []string{"nope"}, [][]*string{{sp("1")}})
		},
		"injected column": func() (int, error) {
			return importRows(db, "sqlite", "", "people", []string{"id) values (1); drop table people; --"}, [][]*string{{sp("1")}})
		},
		"duplicate column": func() (int, error) {
			return importRows(db, "sqlite", "", "people", []string{"id", "ID"}, [][]*string{{sp("9"), sp("9")}})
		},
		"unknown table": func() (int, error) {
			return importRows(db, "sqlite", "", "ghost", []string{"id"}, [][]*string{{sp("1")}})
		},
		"short row": func() (int, error) {
			return importRows(db, "sqlite", "", "people", []string{"id", "age"}, [][]*string{{sp("9")}})
		},
		"no columns": func() (int, error) { return importRows(db, "sqlite", "", "people", nil, nil) },
	} {
		if _, err := call(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	db.QueryRow(`select count(*) from people`).Scan(&count)
	if count != 2 {
		t.Fatalf("rows after rejected imports = %d", count)
	}
}
