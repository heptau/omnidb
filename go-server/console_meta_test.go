package main

import (
	"context"
	"strings"
	"testing"
)

func TestConsoleArg(t *testing.T) {
	cases := []struct {
		stmt string
		want string
	}{
		{`\d`, ""},
		{`\d public.customers`, "public.customers"},
		{`\d  customers  `, "customers"},
		{`\dt`, ""},
	}
	for _, c := range cases {
		if got := consoleArg(c.stmt); got != c.want {
			t.Errorf("consoleArg(%q) = %q, want %q", c.stmt, got, c.want)
		}
	}
}

func TestConsoleRelationArgPattern(t *testing.T) {
	valid := []string{"customers", "public.customers", "_x", "a1.b2"}
	invalid := []string{"", "customers; drop table x", "public.customers.extra", "a b", "a-b"}
	for _, v := range valid {
		if !consoleRelationArgPattern.MatchString(v) {
			t.Errorf("expected %q to be valid", v)
		}
	}
	for _, v := range invalid {
		if consoleRelationArgPattern.MatchString(v) {
			t.Errorf("expected %q to be invalid", v)
		}
	}
}

func openTestConsoleSession(t *testing.T, technology string) *consoleSession {
	t.Helper()
	db := openTestSQLite(t)
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatalf("db.Conn: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return &consoleSession{db: db, conn: conn, technology: technology}
}

func TestConsoleMetaSQLite(t *testing.T) {
	s := openTestConsoleSession(t, "sqlite")
	ctx := context.Background()

	if _, err := s.conn.ExecContext(ctx, `CREATE TABLE customers (id integer primary key, name text not null)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := s.conn.ExecContext(ctx, `CREATE VIEW customer_names AS SELECT name FROM customers`); err != nil {
		t.Fatalf("create view: %v", err)
	}

	t.Run(`\dt lists the table`, func(t *testing.T) {
		out, err := s.consoleMetaTables(ctx)
		if err != nil {
			t.Fatalf("consoleMetaTables: %v", err)
		}
		if !strings.Contains(out, "customers") {
			t.Errorf("expected output to contain %q, got:\n%s", "customers", out)
		}
	})

	t.Run(`\d lists table and view`, func(t *testing.T) {
		out, err := s.consoleMetaRelations(ctx)
		if err != nil {
			t.Fatalf("consoleMetaRelations: %v", err)
		}
		if !strings.Contains(out, "customers") || !strings.Contains(out, "customer_names") {
			t.Errorf("expected output to contain both relations, got:\n%s", out)
		}
	})

	t.Run(`\d NAME describes columns`, func(t *testing.T) {
		out, err := s.consoleMetaDescribe(ctx, "customers")
		if err != nil {
			t.Fatalf("consoleMetaDescribe: %v", err)
		}
		if !strings.Contains(out, "id") || !strings.Contains(out, "name") {
			t.Errorf("expected output to contain both columns, got:\n%s", out)
		}
	})

	t.Run(`\d NAME rejects a malformed name`, func(t *testing.T) {
		if _, err := s.consoleMetaDescribe(ctx, "customers; drop table customers"); err == nil {
			t.Error("expected an error for a malformed relation name, got nil")
		}
	})

	t.Run(`\du has no roles to show`, func(t *testing.T) {
		out, err := s.consoleMetaRoles(ctx)
		if err != nil {
			t.Fatalf("consoleMetaRoles: %v", err)
		}
		if !strings.Contains(out, "no user/role concept") {
			t.Errorf("expected an explanatory message, got:\n%s", out)
		}
	})

	t.Run(`\l has nothing else to list`, func(t *testing.T) {
		out, err := s.consoleMetaDatabases(ctx)
		if err != nil {
			t.Fatalf("consoleMetaDatabases: %v", err)
		}
		if !strings.Contains(out, "single-database") {
			t.Errorf("expected an explanatory message, got:\n%s", out)
		}
	})

	t.Run(`\df has no function catalog`, func(t *testing.T) {
		out, err := s.consoleMetaFunctions(ctx)
		if err != nil {
			t.Fatalf("consoleMetaFunctions: %v", err)
		}
		if !strings.Contains(out, "no catalog of user-defined functions") {
			t.Errorf("expected an explanatory message, got:\n%s", out)
		}
	})
}

func TestConsoleMetaDispatchViaRunStatement(t *testing.T) {
	s := openTestConsoleSession(t, "sqlite")
	ctx := context.Background()
	if _, err := s.conn.ExecContext(ctx, `CREATE TABLE widgets (id integer primary key)`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	out, err := s.runStatement(ctx, `\dt`)
	if err != nil {
		t.Fatalf(`runStatement("\\dt"): %v`, err)
	}
	if !strings.Contains(out, "widgets") {
		t.Errorf("expected \\dt dispatched through runStatement to list widgets, got:\n%s", out)
	}

	out, err = s.runStatement(ctx, `\d widgets`)
	if err != nil {
		t.Fatalf(`runStatement("\\d widgets"): %v`, err)
	}
	if !strings.Contains(out, "id") {
		t.Errorf("expected \\d widgets dispatched through runStatement to describe it, got:\n%s", out)
	}
}

func TestSplitSQLStatementsDollarQuoting(t *testing.T) {
	// A semicolon inside a tagged dollar-quoted body (as in a real
	// CREATE PROCEDURE) must not split the statement in two.
	procedure := `CREATE OR REPLACE PROCEDURE fix_thing()
LANGUAGE plpgsql
AS $procedure$
DECLARE
    BATCH_SIZE CONSTANT INTEGER = 100;
BEGIN
    RAISE NOTICE 'hi;there';
END;
$procedure$;`
	got := splitSQLStatements(procedure)
	if len(got) != 1 {
		t.Fatalf("expected 1 statement, got %d: %q", len(got), got)
	}
	if !strings.HasSuffix(strings.TrimSpace(got[0]), "$procedure$") {
		t.Errorf("statement truncated before closing tag: %q", got[0])
	}

	cases := []struct {
		name string
		sql  string
		want []string
	}{
		{
			name: "bare $$ with embedded semicolon",
			sql:  `select 1; create function f() returns int as $$ select 1; $$ language sql; select 2;`,
			want: []string{
				"select 1",
				"create function f() returns int as $$ select 1; $$ language sql",
				"select 2",
			},
		},
		{
			name: "tag containing digits and underscores",
			sql:  `do $body_1$ begin perform 1; end; $body_1$;`,
			want: []string{"do $body_1$ begin perform 1; end; $body_1$"},
		},
		{
			name: "unrelated dollar signs inside body are literal",
			sql:  `select $$a $ b; c$$ as x;`,
			want: []string{"select $$a $ b; c$$ as x"},
		},
	}
	for _, c := range cases {
		got := splitSQLStatements(c.sql)
		if len(got) != len(c.want) {
			t.Errorf("%s: got %d statements %q, want %d %q", c.name, len(got), got, len(c.want), c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%s: statement %d = %q, want %q", c.name, i, got[i], c.want[i])
			}
		}
	}
}
