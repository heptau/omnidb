package main

import "testing"

func boolPtr(b bool) *bool { return &b }

func TestMembershipGrantSuffix(t *testing.T) {
	cases := []struct {
		name string
		m    postgresqlRoleMembership
		want string
	}{
		{"pre-16 plain", postgresqlRoleMembership{}, ""},
		{"pre-16 admin", postgresqlRoleMembership{AdminOption: true}, " WITH ADMIN OPTION"},
		{"16+ all explicit", postgresqlRoleMembership{Inherit: boolPtr(false), Set: boolPtr(true)}, " WITH ADMIN FALSE, INHERIT FALSE, SET TRUE"},
		{"16+ admin", postgresqlRoleMembership{AdminOption: true, Inherit: boolPtr(true), Set: boolPtr(false)}, " WITH ADMIN TRUE, INHERIT TRUE, SET FALSE"},
	}
	for _, c := range cases {
		if got := membershipGrantSuffix(c.m); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
