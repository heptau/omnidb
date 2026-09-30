package main

import "testing"

func TestRoleDependenciesTotals(t *testing.T) {
	deps := postgresqlRoleDependencies{Databases: []postgresqlDatabaseDependencies{
		{Name: "", Owned: 1, ACL: 1},
		{Name: "a", Owned: 4, ACL: 2, Other: 1},
	}}
	if got := deps.totalOwned(); got != 5 {
		t.Errorf("totalOwned = %d, want 5", got)
	}
	if got := deps.totalPrivileges(); got != 4 {
		t.Errorf("totalPrivileges = %d, want 4 (ACL + policies/tablespaces)", got)
	}
}

func TestRenderDropRolePlanLabelsEachDatabase(t *testing.T) {
	got := renderSQLPlan([]pgSQLStep{
		{Database: "a", Stmts: []string{`REASSIGN OWNED BY "r" TO "n"`, `DROP OWNED BY "r"`}},
		{Database: "we\"ird", Stmts: []string{`DROP ROLE "r"`}},
	})
	want := "-- database \"a\"\nREASSIGN OWNED BY \"r\" TO \"n\";\nDROP OWNED BY \"r\";\n\n-- database \"we\"\"ird\"\nDROP ROLE \"r\";"
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}
