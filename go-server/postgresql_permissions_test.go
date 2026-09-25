package main

import "testing"

func TestRoleAttributeClausesRendersEveryFlagAndConnLimit(t *testing.T) {
	got := roleAttributeClauses(postgresqlRoleAttributes{
		CanLogin:   true,
		Super:      true,
		CreateDB:   false,
		CreateRole: true,
		Inherit:    false,
		ConnLimit:  5,
	})
	want := " LOGIN SUPERUSER NOCREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestRoleAttributeClausesNegativeConnLimitMeansUnlimited(t *testing.T) {
	got := roleAttributeClauses(postgresqlRoleAttributes{ConnLimit: -1})
	if got == "" || got[len(got)-2:] != "-1" {
		t.Errorf("CONNECTION LIMIT -1 (unlimited) must round-trip as-is, got %q", got)
	}
}

func TestPostgresqlCreateRoleRejectsBlankName(t *testing.T) {
	// No live *sql.DB needed: the empty-name check short-circuits before any
	// query is built, same guard shape as postgresVerifiedRoleName's "" return
	// for drop/alter below.
	err := postgresqlCreateRole(nil, "   ", postgresqlRoleAttributes{}, "")
	if err == nil {
		t.Error("want an error for a blank role name, got nil")
	}
}

func TestAncestorsEnvelopeMergesAdminOptionOnlyForDirectRows(t *testing.T) {
	out := ancestorsEnvelope(
		[]postgresqlRoleAncestor{
			{Name: "bar1", Direct: true},
			{Name: "bar2", Direct: false},
		},
		[]postgresqlRoleMembership{
			{Name: "bar1", AdminOption: true},
		},
	)

	if len(out) != 2 {
		t.Fatalf("want 2 entries, got %d: %+v", len(out), out)
	}
	if out[0]["v_name"] != "bar1" || out[0]["v_direct"] != true || out[0]["v_admin_option"] != true {
		t.Errorf("direct ancestor with an admin-option grant: got %+v", out[0])
	}
	// bar2 has no row in the direct-memberships list at all (it's only
	// reachable indirectly), so it must default to false rather than a
	// lookup miss leaking through as some other zero value.
	if out[1]["v_name"] != "bar2" || out[1]["v_direct"] != false || out[1]["v_admin_option"] != false {
		t.Errorf("indirect ancestor must default admin_option to false: got %+v", out[1])
	}
}
