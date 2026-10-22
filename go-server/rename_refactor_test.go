package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenameIdentifier(t *testing.T) {
	cases := []struct {
		in, want string
		count    int
	}{
		{"select * from customer c where c.id = 1", "select * from client c where c.id = 1", 1},
		{"select customer.id from public.customer join customer_log on 1=1", "select client.id from public.client join customer_log on 1=1", 2},
		{`select "Customer".id from "Customer"`, `select "client".id from "client"`, 2},
		{"select 'customer' as customer_name, customer_id from customer -- customer\n/* customer */ where 1=1", "select 'customer' as customer_name, customer_id from client -- customer\n/* customer */ where 1=1", 1},
		{"select CUSTOMER from Customer", "select client from client", 2},
		{"select $$ customer $$ from t", "select $$ customer $$ from t", 0},
		{"", "", 0},
	}
	for _, c := range cases {
		got, n := renameIdentifier(c.in, "customer", "client")
		if got != c.want || n != c.count {
			t.Errorf("renameIdentifier(%q)\n got %q (%d)\nwant %q (%d)", c.in, got, n, c.want, c.count)
		}
	}
	// A quote inside the new name of a quoted identifier is doubled.
	if got, _ := renameIdentifier(`select "a" from t`, "a", `we"ird`); got != `select "we""ird" from t` {
		t.Errorf("quoted rename = %q", got)
	}
}

func TestRenameStatement(t *testing.T) {
	cases := []struct {
		tech, schema, table, column, name, want string
	}{
		{"sqlite", "", "customer", "", "client", `ALTER TABLE "customer" RENAME TO client;`},
		{"postgresql", "public", "customer", "", "client", `ALTER TABLE "public"."customer" RENAME TO client;`},
		{"postgresql", "public", "customer", "", "Client", `ALTER TABLE "public"."customer" RENAME TO "Client";`},
		{"mysql", "shop", "customer", "", "client", "RENAME TABLE `shop`.`customer` TO `shop`.client;"},
		{"oracle", "APP", "CUSTOMER", "", "client", `ALTER TABLE "APP"."CUSTOMER" RENAME TO CLIENT;`},
		{"mssql", "dbo", "customer", "", "client", `EXEC sp_rename 'dbo.customer', 'client';`},
		{"sqlite", "", "customer", "name", "title", `ALTER TABLE "customer" RENAME COLUMN "name" TO title;`},
		{"mariadb", "shop", "customer", "name", "title", "ALTER TABLE `shop`.`customer` RENAME COLUMN `name` TO title;"},
		{"mssql", "dbo", "customer", "name", "title", `EXEC sp_rename 'dbo.customer.name', 'title', 'COLUMN';`},
		{"firebird", "", "CUSTOMER", "NAME", "title", `ALTER TABLE "CUSTOMER" ALTER COLUMN "NAME" TO TITLE;`},
	}
	for _, c := range cases {
		got, err := renameStatement(c.tech, c.schema, c.table, c.column, c.name)
		if err != nil || got != c.want {
			t.Errorf("%s %s.%s.%s -> %s\n got %q (%v)\nwant %q", c.tech, c.schema, c.table, c.column, c.name, got, err, c.want)
		}
	}
	if _, err := renameStatement("firebird", "", "T", "", "x"); err == nil {
		t.Error("firebird has no table rename")
	}
	// A quote in a name given to sp_rename is doubled.
	if got, _ := renameStatement("mssql", "dbo", "customer", "", "o'brien"); got != `EXEC sp_rename 'dbo.customer', 'o''brien';` {
		t.Errorf("literal escaping = %q", got)
	}
}

func TestBuildRenamePlan(t *testing.T) {
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "r.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, stmt := range []string{
		`create table customer (id integer primary key, name text)`,
		`create table other (id integer primary key)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	plan, err := buildRenamePlan(db, "sqlite", "", "customer", "", "client")
	if err != nil || plan.SQL != `ALTER TABLE "customer" RENAME TO client;` || plan.OldName != "customer" {
		t.Fatalf("table plan = %+v, %v", plan, err)
	}
	// The statement really renames the table.
	if _, err := db.Exec(plan.SQL); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`select count(*) from client`).Scan(&n); err != nil {
		t.Fatalf("renamed table is not there: %v", err)
	}

	plan, err = buildRenamePlan(db, "sqlite", "", "client", "name", "title")
	if err != nil || plan.SQL != `ALTER TABLE "client" RENAME COLUMN "name" TO title;` {
		t.Fatalf("column plan = %+v, %v", plan, err)
	}
	if _, err := db.Exec(plan.SQL); err != nil {
		t.Fatal(err)
	}

	for name, call := range map[string]func() error{
		"unknown table":      func() error { _, e := buildRenamePlan(db, "sqlite", "", "ghost", "", "x"); return e },
		"unknown column":     func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "nope", "x"); return e },
		"name taken (table)": func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "", "other"); return e },
		"name taken (case)":  func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "", "OTHER"); return e },
		"column name taken":  func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "title", "ID"); return e },
		"same name":          func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "", "Client"); return e },
		"injection": func() error {
			_, e := buildRenamePlan(db, "sqlite", "", "client", "", `x"; drop table other; --`)
			return e
		},
		"empty":       func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "", ""); return e },
		"digit first": func() error { _, e := buildRenamePlan(db, "sqlite", "", "client", "", "1abc"); return e },
	} {
		if call() == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	if err := db.QueryRow(`select count(*) from other`).Scan(&n); err != nil {
		t.Errorf("table other was affected: %v", err)
	}
}

func newSnippetRenameDB(t *testing.T) *sql.DB {
	t.Helper()
	return newUsageTestDB(t)
}

func TestSnippetRenames(t *testing.T) {
	db := newSnippetRenameDB(t)
	list, err := snippetRenames(db, 10, "customer", "client")
	if err != nil {
		t.Fatal(err)
	}
	titles := map[string]snippetRename{}
	for _, s := range list {
		titles[s.Title] = s
	}
	sales, ok := titles["Reports / Monthly / sales"]
	if !ok || sales.Count != 1 || len(sales.Lines) != 1 || sales.Lines[0].Line != 2 ||
		sales.Lines[0].Before != "from public.Customer c" || sales.Lines[0].After != "from public.client c" {
		t.Fatalf("sales preview = %+v", sales)
	}
	if _, ok := titles["unrelated"]; ok {
		t.Error("customers_archive is not the table customer")
	}
	if _, ok := titles["foreign"]; ok {
		t.Error("another user's snippet listed")
	}
	if titles["quoted"].Count != 2 {
		t.Errorf("quoted = %+v", titles["quoted"])
	}

	// Applying touches only the chosen, own snippets, with the stored text.
	n, err := applySnippetRename(db, 10, []int64{1, 3}, "customer", "client")
	if err != nil || n != 1 {
		t.Fatalf("apply = %d, %v (id 3 belongs to another user)", n, err)
	}
	var text string
	db.QueryRow(`select text from OmniDB_app_snippetfile where id = 1`).Scan(&text)
	if !strings.Contains(text, "from public.client c") {
		t.Errorf("snippet 1 = %q", text)
	}
	db.QueryRow(`select text from OmniDB_app_snippetfile where id = 3`).Scan(&text)
	if text != "select * from customer" {
		t.Errorf("foreign snippet changed: %q", text)
	}
	db.QueryRow(`select text from OmniDB_app_snippetfile where id = 4`).Scan(&text)
	if !strings.Contains(text, `"Customer"`) {
		t.Errorf("a snippet that was not chosen changed: %q", text)
	}
}
