package main

import "testing"

func TestColumnNameLookupPrefersExactAndRefusesAmbiguous(t *testing.T) {
	l := columnNameLookup([]editDataColumn{{Name: "id"}, {Name: `"ID"`}, {Name: "Name"}})
	for in, want := range map[string]string{"id": "id", `"ID"`: `"ID"`, "name": "Name", "NAME": "Name"} {
		if got, ok := l.find(in); !ok || got != want {
			t.Errorf("find(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	if got, ok := l.find("Id"); ok {
		t.Errorf("find(Id) resolved to %q although id and \"ID\" both fold to it", got)
	}
}
