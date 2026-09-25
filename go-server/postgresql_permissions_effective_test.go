package main

import "testing"

func TestGroupEffectiveGrantRowsKeepsSeparateSourcesPerPrivilege(t *testing.T) {
	groups := groupEffectiveGrantRows([]postgresqlEffectiveGrantRow{
		{Identifier: "db1", Privilege: "SELECT", Grantee: "bar1"},
		{Identifier: "db1", Privilege: "SELECT", Grantee: "bar2"},
		{Identifier: "db1", Privilege: "INSERT", Grantee: "bar1"},
	})

	if len(groups) != 1 {
		t.Fatalf("want 1 object group, got %d: %+v", len(groups), groups)
	}
	if len(groups[0].Privileges) != 2 {
		t.Fatalf("want 2 distinct privileges (SELECT, INSERT), got %d: %+v", len(groups[0].Privileges), groups[0].Privileges)
	}

	var selectPriv, insertPriv *postgresqlEffectivePrivilege
	for i := range groups[0].Privileges {
		switch groups[0].Privileges[i].Privilege {
		case "SELECT":
			selectPriv = &groups[0].Privileges[i]
		case "INSERT":
			insertPriv = &groups[0].Privileges[i]
		}
	}
	if selectPriv == nil || len(selectPriv.Sources) != 2 {
		t.Errorf("SELECT must keep both bar1 and bar2 as separate sources, got %+v", selectPriv)
	}
	if insertPriv == nil || len(insertPriv.Sources) != 1 || insertPriv.Sources[0].Grantee != "bar1" {
		t.Errorf("INSERT must only have bar1 as a source, got %+v", insertPriv)
	}
}

func TestGroupEffectiveGrantRowsPublicSourceSortsFirst(t *testing.T) {
	groups := groupEffectiveGrantRows([]postgresqlEffectiveGrantRow{
		{Identifier: "db1", Privilege: "CONNECT", Grantee: "bar1"},
		{Identifier: "db1", Privilege: "CONNECT", Grantee: "PUBLIC"},
	})

	if len(groups) != 1 || len(groups[0].Privileges) != 1 {
		t.Fatalf("want 1 object with 1 grouped CONNECT privilege, got %+v", groups)
	}
	sources := groups[0].Privileges[0].Sources
	if len(sources) != 2 || sources[0].Grantee != "PUBLIC" {
		t.Errorf("PUBLIC must sort first among sources, got %+v", sources)
	}
}

func TestGroupEffectiveGrantRowsSeparatesDifferentObjects(t *testing.T) {
	groups := groupEffectiveGrantRows([]postgresqlEffectiveGrantRow{
		{Identifier: "db1", Privilege: "CONNECT", Grantee: "bar1"},
		{Identifier: "db2", Privilege: "CONNECT", Grantee: "bar1"},
	})
	if len(groups) != 2 {
		t.Fatalf("want 2 separate objects, got %d: %+v", len(groups), groups)
	}
}

func TestPostgresqlRoleAndAncestorNamesReturnsEmptyForPublic(t *testing.T) {
	// No live *sql.DB needed: isPublicPseudoRole short-circuits before any
	// query is built, same guard shape as postgresRoleOrPublicSQL's.
	names, err := postgresqlRoleAndAncestorNames(nil, "PUBLIC")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(names) != 0 {
		t.Errorf("PUBLIC has no ancestors of its own, want an empty list, got %v", names)
	}
}
