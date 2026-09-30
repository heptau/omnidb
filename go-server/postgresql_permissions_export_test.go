package main

import (
	"reflect"
	"testing"
)

func TestDefaultPrivilegeStatementsSplitsGrantOption(t *testing.T) {
	got := defaultPrivilegeStatements(postgresqlDefaultPrivilegeEntry{
		Creator: `we"ird`, Schema: "s1", Kind: "tables", Grantee: "PUBLIC",
		Privileges: []postgresqlDefaultPrivilege{{Privilege: "SELECT"}, {Privilege: "UPDATE", Grantable: true}},
	})
	want := []string{
		`ALTER DEFAULT PRIVILEGES FOR ROLE "we""ird" IN SCHEMA s1 GRANT SELECT ON TABLES TO PUBLIC`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE "we""ird" IN SCHEMA s1 GRANT UPDATE ON TABLES TO PUBLIC WITH GRANT OPTION`,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestDefaultPrivilegeStatementsDatabaseWideAndUnknownKind(t *testing.T) {
	got := defaultPrivilegeStatements(postgresqlDefaultPrivilegeEntry{
		Creator: "c", Kind: "functions", Grantee: "g", Privileges: []postgresqlDefaultPrivilege{{Privilege: "EXECUTE"}},
	})
	want := []string{`ALTER DEFAULT PRIVILEGES FOR ROLE "c" GRANT EXECUTE ON FUNCTIONS TO "g"`}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if got := defaultPrivilegeStatements(postgresqlDefaultPrivilegeEntry{Creator: "c", Kind: "bogus", Grantee: "g"}); got != nil {
		t.Errorf("unknown kind produced %v", got)
	}
}

func TestPermissionsExportFileName(t *testing.T) {
	cases := map[string]string{
		"":             "permissions-all-roles.sql",
		"  ":           "permissions-all-roles.sql",
		"app_user":     "permissions-app_user.sql",
		`"Weird Name"`: "permissions-Weird_Name.sql",
		"../etc/pass":  "permissions-.._etc_pass.sql",
	}
	for in, want := range cases {
		if got := permissionsExportFileName(in); got != want {
			t.Errorf("permissionsExportFileName(%q) = %q, want %q", in, got, want)
		}
	}
}
