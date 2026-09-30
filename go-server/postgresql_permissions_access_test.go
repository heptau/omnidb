package main

import "testing"

// Every object type the panel can grant on must also be answerable by the
// reverse "who has access" view, with exactly the same privilege set --
// otherwise a privilege could be grantable yet never listed there.
func TestAccessSpecsMatchGrantablePrivileges(t *testing.T) {
	for objectType, allowed := range pgValidPrivilegesByObjectType {
		spec, ok := pgAccessSpecs[objectType]
		if !ok {
			t.Errorf("no pgAccessSpecs entry for grantable object type %q", objectType)
			continue
		}
		if len(spec.privileges) != len(allowed) {
			t.Errorf("%s: access spec lists %v, grants allow %d privileges", objectType, spec.privileges, len(allowed))
		}
		for _, priv := range spec.privileges {
			if !allowed[priv] {
				t.Errorf("%s: access spec lists %q, which cannot be granted", objectType, priv)
			}
		}
	}
}
