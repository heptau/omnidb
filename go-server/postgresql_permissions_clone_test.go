package main

import (
	"reflect"
	"testing"
)

func TestDirectGrantStatementsKeepsOnlySourceRolesOwnGrants(t *testing.T) {
	grants := []postgresqlEffectiveObjectGrants{
		{
			ObjectType: "table", Identifier: "s1.t",
			Privileges: []postgresqlEffectivePrivilege{
				{Privilege: "SELECT", Sources: []postgresqlPrivilegeSource{{Grantee: "src"}, {Grantee: "PUBLIC"}}},
				{Privilege: "INSERT", Sources: []postgresqlPrivilegeSource{{Grantee: `"src"`}}},
				{Privilege: "UPDATE", Sources: []postgresqlPrivilegeSource{{Grantee: "src", Grantable: true}}},
				{Privilege: "DELETE", Sources: []postgresqlPrivilegeSource{{Grantee: "parent"}}}, // inherited, not src's own
			},
		},
		{ObjectType: "nonsense", Identifier: "x", Privileges: []postgresqlEffectivePrivilege{{Privilege: "SELECT", Sources: []postgresqlPrivilegeSource{{Grantee: "src"}}}}},
	}
	got := directGrantStatements(grants, "src", `"new"`)
	want := []string{
		`GRANT SELECT, INSERT ON TABLE s1.t TO "new"`,
		`GRANT UPDATE ON TABLE s1.t TO "new" WITH GRANT OPTION`,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestGrantKeywordsCoverEveryGrantableType(t *testing.T) {
	for objectType := range pgValidPrivilegesByObjectType {
		if _, ok := pgGrantKeywords[objectType]; !ok {
			t.Errorf("no GRANT keyword for grantable object type %q", objectType)
		}
	}
}
