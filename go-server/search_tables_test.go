package main

import (
	"reflect"
	"testing"
)

func TestMatchTables(t *testing.T) {
	names := []string{"users", `"Order Items"`, "orders", "audit_log", "USER_ROLES"}
	cases := []struct {
		needle string
		limit  int
		want   []string
	}{
		{"user", 10, []string{"users", "USER_ROLES"}},
		{"ORDER", 10, []string{`"Order Items"`, "orders"}},
		{"order items", 10, []string{`"Order Items"`}},
		{"  log ", 10, []string{"audit_log"}},
		{"o", 2, []string{`"Order Items"`, "orders"}},
		{"zzz", 10, nil},
	}
	for _, c := range cases {
		if got := matchTables(names, c.needle, c.limit); !reflect.DeepEqual(got, c.want) {
			t.Errorf("matchTables(%q, %d) = %v, want %v", c.needle, c.limit, got, c.want)
		}
	}
}
