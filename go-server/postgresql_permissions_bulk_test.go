package main

import "testing"

// Both checks below run before the builder touches the database, so a nil
// *sql.DB is fine -- same shape as postgresql_permissions_test.go.

func TestBuildBulkObjectPrivilegeSQLRejectsUnknownKind(t *testing.T) {
	// "views" has no bulk grammar of its own -- ALL TABLES already covers them.
	if _, err := buildBulkObjectPrivilegeSQL(nil, false, "someone", "views", "public", []string{"SELECT"}, false); err == nil {
		t.Error("want an error for a bulk kind outside pgBulkKinds, got nil")
	}
}

func TestBuildAlterDefaultPrivilegesSQLRejectsSchemaScopedSchemas(t *testing.T) {
	// ALTER DEFAULT PRIVILEGES ... ON SCHEMAS cannot take IN SCHEMA.
	if _, err := buildAlterDefaultPrivilegesSQL(nil, false, "someone", "", "public", "schemas", []string{"USAGE"}, false); err == nil {
		t.Error("want an error for ON SCHEMAS combined with IN SCHEMA, got nil")
	}
}

func TestBuildAlterDefaultPrivilegesSQLRejectsUnknownKind(t *testing.T) {
	if _, err := buildAlterDefaultPrivilegesSQL(nil, false, "someone", "", "", "procedures", []string{"EXECUTE"}, false); err == nil {
		t.Error("want an error for a kind outside pgDefaultPrivilegeKinds, got nil")
	}
}

func TestDefaultACLObjTypesCoverEveryKind(t *testing.T) {
	seen := map[string]bool{}
	for _, kind := range pgDefaultACLObjTypeToKind {
		seen[kind] = true
	}
	for kind := range pgDefaultPrivilegeKinds {
		if !seen[kind] {
			t.Errorf("kind %q has no pg_default_acl.defaclobjtype mapping, so existing defaults of it would never be listed", kind)
		}
	}
}
