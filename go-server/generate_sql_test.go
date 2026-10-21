package main

import (
	"database/sql"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func newGenerateTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "gen.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, stmt := range []string{
		`create table region (id integer primary key, name text)`,
		`create table customer (id integer primary key, name text, region_id integer references region(id))`,
		`create table "order line" (order_id integer, line_no integer, customer_id integer references customer(id),
			region_id integer references region(id), note text, primary key (order_id, line_no))`,
		`create table keyless (a int, b text)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestGenerateSelectWithJoins(t *testing.T) {
	db := newGenerateTestDB(t)
	got, err := generateSelectWithJoins(db, "sqlite", "", "customer")
	if err != nil {
		t.Fatal(err)
	}
	for _, frag := range []string{
		"SELECT t.\"id\",\n       t.\"name\",\n       t.\"region_id\",",
		// r1.id would be called region_id, which the table's own column already is.
		"r1.\"id\" AS region_id_2",
		"r1.\"name\" AS region_name\nFROM \"customer\" t\nLEFT JOIN \"region\" r1 ON t.\"region_id\" = r1.\"id\"\n",
	} {
		if !strings.Contains(got, frag) {
			t.Fatalf("missing %q in:\n%s", frag, got)
		}
	}

	// Two foreign keys: two joins, distinct aliases; a key of its own table needs no alias for new names.
	got, err = generateSelectWithJoins(db, "sqlite", "", "order line")
	if err != nil {
		t.Fatal(err)
	}
	for _, frag := range []string{`FROM "order line" t`, `LEFT JOIN "customer" r`, `LEFT JOIN "region" r`, " ON t.\"customer_id\" = r", " ON t.\"region_id\" = r"} {
		if !strings.Contains(got, frag) {
			t.Errorf("missing %q in:\n%s", frag, got)
		}
	}
	// No selected name may repeat.
	seen := map[string]bool{}
	for _, line := range strings.Split(got[:strings.Index(got, "FROM")], "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "SELECT "))
		name := line
		if i := strings.Index(line, " AS "); i >= 0 {
			name = line[i+4:]
		} else if i := strings.Index(line, "."); i >= 0 {
			name = line[i+1:]
		}
		name = strings.Trim(strings.TrimSuffix(name, ","), `"`)
		if seen[name] {
			t.Errorf("column name %q selected twice:\n%s", name, got)
		}
		seen[name] = true
	}

	got, err = generateSelectWithJoins(db, "sqlite", "", "region")
	if err != nil || !strings.HasPrefix(got, "-- This table has no foreign keys") || strings.Contains(got, "JOIN") {
		t.Fatalf("table without foreign keys = %q, %v", got, err)
	}
	if _, err := generateSelectWithJoins(db, "sqlite", "", "ghost"); err == nil {
		t.Error("unknown table must fail")
	}
}

func TestGenerateCRUD(t *testing.T) {
	db := newGenerateTestDB(t)
	got, err := generateCRUD(db, "sqlite", "", "customer")
	if err != nil {
		t.Fatal(err)
	}
	for _, frag := range []string{
		"INSERT INTO \"customer\" (\"id\", \"name\", \"region_id\")\nVALUES (:id, :name, :region_id);",
		"SELECT \"id\", \"name\", \"region_id\"\nFROM \"customer\"\nWHERE \"id\" = :id;",
		"UPDATE \"customer\"\nSET \"name\" = :name,\n    \"region_id\" = :region_id\nWHERE \"id\" = :id;",
		"DELETE FROM \"customer\"\nWHERE \"id\" = :id;",
	} {
		if !strings.Contains(got, frag) {
			t.Errorf("missing %q in:\n%s", frag, got)
		}
	}
	if params := findParamsInSQL(got); !reflect.DeepEqual(params, []string{"id", "name", "region_id"}) {
		t.Errorf("parameters = %v", params)
	}

	got, err = generateCRUD(db, "sqlite", "", "order line")
	if err != nil || !strings.Contains(got, `WHERE "order_id" = :order_id AND "line_no" = :line_no;`) {
		t.Fatalf("composite key: %v\n%s", err, got)
	}
	got, err = generateCRUD(db, "sqlite", "", "keyless")
	if err != nil || !strings.Contains(got, "no primary key") || !strings.Contains(got, "SET \"a\" = :a,\n    \"b\" = :b") {
		t.Fatalf("keyless table: %v\n%s", err, got)
	}
}

func TestParamNames(t *testing.T) {
	got := paramNames("sqlite", []string{"Full Name", "full_name", "1st", "", "é"})
	want := []string{"full_name", "full_name_2", "p_1st", "p_", "p_"}
	if got[0] != want[0] || got[1] != want[1] || got[2] != want[2] || got[3] == got[4] {
		t.Errorf("paramNames = %v", got)
	}
	if got := paramNames("postgresql", []string{`"Mixed Case"`, "plain"}); got[0] != "mixed_case" || got[1] != "plain" {
		t.Errorf("postgres paramNames = %v", got)
	}
}

// findParamsInSQL lists the distinct :names in generated SQL, in order.
func findParamsInSQL(sqlText string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range regexp.MustCompile(`:([a-z_][a-z0-9_]*)`).FindAllStringSubmatch(sqlText, -1) {
		if !seen[m[1]] {
			seen[m[1]] = true
			out = append(out, m[1])
		}
	}
	return out
}
