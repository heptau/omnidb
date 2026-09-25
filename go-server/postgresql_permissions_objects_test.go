package main

import "testing"

func TestValidatePrivilegesForObjectTypeRejectsUnknownPrivilege(t *testing.T) {
	if _, err := validatePrivilegesForObjectType("table", []string{"SELECT; DROP TABLE x; --"}); err == nil {
		t.Error("want an error for a privilege string outside the allow-list, got nil")
	}
}

func TestValidatePrivilegesForObjectTypeUppercasesAndDedupes(t *testing.T) {
	got, err := validatePrivilegesForObjectType("schema", []string{"usage", "USAGE", "create"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 || got[0] != "USAGE" || got[1] != "CREATE" {
		t.Errorf("got %v, want [USAGE CREATE] (uppercased, deduped, insertion order)", got)
	}
}

func TestValidatePrivilegesForObjectTypeRejectsPrivilegeWrongForType(t *testing.T) {
	// EXECUTE is valid for a function, not a table.
	if _, err := validatePrivilegesForObjectType("table", []string{"EXECUTE"}); err == nil {
		t.Error("want an error for a privilege not valid for this object type, got nil")
	}
}

func TestValidatePrivilegesForObjectTypeRejectsUnsupportedType(t *testing.T) {
	// Foreign tables remain unsupported (see postgresql_permissions_objects.go's
	// module comment) -- materialized_view/type/domain/foreign_data_wrapper/
	// foreign_server were Fáze 8's own additions, so they'd be a poor choice
	// for "not yet supported" now.
	if _, err := validatePrivilegesForObjectType("foreign_table", []string{"SELECT"}); err == nil {
		t.Error("want an error for an object type not yet supported by this phase, got nil")
	}
}

func TestValidatePrivilegesForObjectTypeAcceptsTablespaceCreate(t *testing.T) {
	if _, err := validatePrivilegesForObjectType("tablespace", []string{"CREATE"}); err != nil {
		t.Errorf("want tablespace CREATE to be valid, got error: %v", err)
	}
	if _, err := validatePrivilegesForObjectType("tablespace", []string{"SELECT"}); err == nil {
		t.Error("want an error for a privilege not valid on tablespace, got nil")
	}
}

func TestValidatePrivilegesForObjectTypeAcceptsFaze8Types(t *testing.T) {
	cases := []struct {
		objectType string
		privilege  string
	}{
		{"materialized_view", "SELECT"},
		{"type", "USAGE"},
		{"domain", "USAGE"},
		{"foreign_data_wrapper", "USAGE"},
		{"foreign_server", "USAGE"},
	}
	for _, c := range cases {
		if _, err := validatePrivilegesForObjectType(c.objectType, []string{c.privilege}); err != nil {
			t.Errorf("validatePrivilegesForObjectType(%q, [%q]) unexpected error: %v", c.objectType, c.privilege, err)
		}
	}
	if _, err := validatePrivilegesForObjectType("type", []string{"SELECT"}); err == nil {
		t.Error("want an error for a privilege not valid on a type (only USAGE is), got nil")
	}
}

func TestIsPublicPseudoRole(t *testing.T) {
	cases := map[string]bool{
		"PUBLIC":     true,
		"public":     true,
		"  Public  ": true,
		"PUBLICROLE": false,
		"bob":        false,
		"":           false,
	}
	for input, want := range cases {
		if got := isPublicPseudoRole(input); got != want {
			t.Errorf("isPublicPseudoRole(%q) = %v, want %v", input, got, want)
		}
	}
}

func TestPostgresRoleOrPublicSQLReturnsBarePublicKeyword(t *testing.T) {
	// No live *sql.DB needed: the PUBLIC branch returns before ever touching
	// the database, same short-circuit shape as postgresqlCreateRole's
	// blank-name guard.
	got, err := postgresRoleOrPublicSQL(nil, " public ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "PUBLIC" {
		t.Errorf("got %q, want the bare, unquoted keyword %q", got, "PUBLIC")
	}
}
