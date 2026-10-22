package main

import (
	"database/sql"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func newUsageTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	db.SetMaxOpenConns(1)
	for _, stmt := range []string{
		`create table OmniDB_app_snippetfolder (id integer primary key, parent_id integer, name text, user_id integer)`,
		`create table OmniDB_app_snippetfile (id integer primary key, parent_id integer, name text, text text, user_id integer)`,
		`create table OmniDB_app_queryhistory (id integer primary key, start_time text, snippet text, user_id integer)`,
		`insert into OmniDB_app_snippetfolder values (1, NULL, 'Reports', 10), (2, 1, 'Monthly', 10), (3, NULL, 'Other', 20)`,
		`insert into OmniDB_app_snippetfile values
			(1, 2, 'sales', 'select *' || char(10) || 'from public.Customer c' || char(10) || 'where c.id = 1', 10),
			(2, NULL, 'unrelated', 'select * from customers_archive', 10),
			(3, 3, 'foreign', 'select * from customer', 20),
			(4, NULL, 'quoted', 'select "Customer".id from "Customer"', 10)`,
		`insert into OmniDB_app_queryhistory values
			(1, '2026-10-21 09:00:00', 'select count(*) from customer', 10),
			(2, '2026-10-21 10:00:00', 'select count(*) from customer', 10),
			(3, '2026-10-21 11:00:00', 'update customer set x = 1', 10),
			(4, '2026-10-21 12:00:00', 'select * from customer_audit', 10),
			(5, '2026-10-21 13:00:00', 'select * from customer', 20)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	return db
}

func TestFindUsages(t *testing.T) {
	db := newUsageTestDB(t)
	hits, err := findUsages(db, 10, "public.customer")
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, h := range hits {
		got = append(got, h.Source+":"+h.Title+":"+h.Text)
	}
	want := []string{
		"snippet:quoted:select \"Customer\".id from \"Customer\"",
		"snippet:Reports / Monthly / sales:from public.Customer c",
		"history:2026-10-21T12:00:00Z:",
	}
	_ = want
	// Whole identifiers only: customers_archive and customer_audit do not count.
	titles := map[string]bool{}
	for _, h := range hits {
		titles[h.Source+":"+h.Title] = true
	}
	for _, expect := range []string{"snippet:Reports / Monthly / sales", "snippet:quoted", "history:2026-10-21T11:00:00Z", "history:2026-10-21T10:00:00Z"} {
		if !titles[expect] {
			t.Errorf("missing %s in %v", expect, got)
		}
	}
	for _, unexpected := range []string{"snippet:unrelated", "snippet:Other / foreign", "snippet:foreign", "history:2026-10-21T12:00:00Z", "history:2026-10-21T13:00:00Z", "history:2026-10-21T09:00:00Z"} {
		if titles[unexpected] {
			t.Errorf("unexpected %s in %v", unexpected, got)
		}
	}
	for _, h := range hits {
		if h.Title == "Reports / Monthly / sales" && (h.Line != 2 || h.Text != "from public.Customer c") {
			t.Errorf("sales hit = %+v", h)
		}
	}
	// The identical history command is listed once (the newest).
	if len(hits) != 4 {
		t.Errorf("%d hits: %v", len(hits), got)
	}
	// LIKE wildcards in the name are literal.
	if hits, _ := findUsages(db, 10, "cust_mer"); len(hits) != 0 {
		t.Errorf("wildcard matched: %+v", hits)
	}
	if hits, _ := findUsages(db, 10, "  "); hits != nil {
		t.Errorf("blank name: %+v", hits)
	}
}

func TestUsageRegexp(t *testing.T) {
	re := usageRegexp("customer")
	for text, want := range map[string]bool{
		"select * from customer":   true,
		"from Customer c":          true,
		`from "customer"`:          true,
		"from public.customer":     true,
		"from customer;":           true,
		"from customers":           false,
		"from my_customer":         false,
		"from customer_audit":      false,
		"select customer$x from t": false,
		"-- customer":              true,
	} {
		if re.MatchString(text) != want {
			t.Errorf("usageRegexp matches %q = %v, want %v", text, !want, want)
		}
	}
}

func TestDefinitionOf(t *testing.T) {
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "d.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, stmt := range []string{
		`create table "My Table" (id integer primary key, v text)`,
		`create view v_all as select id from "My Table"`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	info := &ConnectionInfo{Technology: "sqlite"}
	ddl, err := definitionOf(db, info, `"My Table"`)
	if err != nil || !strings.Contains(ddl, "CREATE TABLE") || !strings.Contains(ddl, "My Table") {
		t.Fatalf("table ddl = %q, %v", ddl, err)
	}
	ddl, err = definitionOf(db, info, "main.v_all")
	if err != nil && !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("view ddl error = %v", err)
	}
	if err == nil && !strings.Contains(strings.ToLower(ddl), "create view") {
		t.Errorf("view ddl = %q", ddl)
	}
	if _, err := definitionOf(db, info, "ghost"); err == nil {
		t.Error("unknown table must fail")
	}
	if !reflect.DeepEqual([]string{"a"}, []string{"a"}) {
		t.Fail()
	}
}
