package main

import (
	"net"
	"os"
	"strings"
	"testing"
)

// Needs a throwaway PostgreSQL: OMNIDB_TEST_PG_ADDR=host:port (trust auth,
// user "postgres"). Skipped otherwise.
func TestRoleCommentAgainstPostgreSQL(t *testing.T) {
	addr := os.Getenv("OMNIDB_TEST_PG_ADDR")
	if addr == "" {
		t.Skip("OMNIDB_TEST_PG_ADDR not set")
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	db, err := openPostgreSQLTarget(&ConnectionInfo{Technology: "postgresql", Server: host, Port: port, Database: "postgres", Username: "postgres"})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec(`drop role if exists zz_commented`)
	defer db.Exec(`drop role if exists zz_commented`)

	comment := "Reporting user — it's \"read only\""
	attrs := postgresqlRoleAttributes{CanLogin: true, Inherit: true, ConnLimit: -1, Comment: &comment}

	stmts, err := buildCreateRoleStatements(db, "zz_commented", attrs, "", true)
	if err != nil || len(stmts) != 2 || !strings.HasPrefix(stmts[1], "COMMENT ON ROLE zz_commented IS ") || !strings.Contains(stmts[1], "it''s") {
		t.Fatalf("preview statements = %v, %v", stmts, err)
	}
	if err := postgresqlCreateRole(db, "zz_commented", attrs, ""); err != nil {
		t.Fatal(err)
	}

	roles, err := postgresqlRoles(db)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, r := range roles {
		if r.Name == "zz_commented" {
			found = true
			if r.Comment != comment {
				t.Errorf("listed comment = %q", r.Comment)
			}
		} else if r.Name == "postgres" && r.Comment != "" {
			t.Logf("postgres comment: %q", r.Comment)
		}
	}
	if !found {
		t.Fatal("role not listed")
	}

	got, err := postgresqlRoleAttributesFor(db, "zz_commented")
	if err != nil || got.Comment == nil || *got.Comment != comment {
		t.Fatalf("attributes = %+v, %v", got, err)
	}

	// Leaving the comment out (nil) keeps it; a new text replaces it; "" clears it.
	got.Comment = nil
	if err := postgresqlAlterRoleAttributes(db, "zz_commented", got); err != nil {
		t.Fatal(err)
	}
	again, _ := postgresqlRoleAttributesFor(db, "zz_commented")
	if again.Comment == nil || *again.Comment != comment {
		t.Errorf("a nil comment must leave it alone, got %v", again.Comment)
	}
	next := "second"
	got.Comment = &next
	if err := postgresqlAlterRoleAttributes(db, "zz_commented", got); err != nil {
		t.Fatal(err)
	}
	again, _ = postgresqlRoleAttributesFor(db, "zz_commented")
	if *again.Comment != "second" {
		t.Errorf("comment = %q", *again.Comment)
	}
	empty := ""
	got.Comment = &empty
	if err := postgresqlAlterRoleAttributes(db, "zz_commented", got); err != nil {
		t.Fatal(err)
	}
	again, _ = postgresqlRoleAttributesFor(db, "zz_commented")
	if *again.Comment != "" {
		t.Errorf("comment not cleared: %q", *again.Comment)
	}
}
