package main

import (
	"database/sql"
	"strings"
	"testing"
)

func TestCanonicalNavLayout(t *testing.T) {
	got, err := canonicalNavLayout(`{"order":["welcome","|","bookmarks"],"hidden":["notify"]}`)
	if err != nil || got != `{"order":["welcome","|","bookmarks"],"hidden":["notify"]}` {
		t.Fatalf("got %q, %v", got, err)
	}
	for name, bad := range map[string]string{
		"not json":       `nope`,
		"duplicate id":   `{"order":["a","a"],"hidden":[]}`,
		"two dividers":   `{"order":["a","|","|"],"hidden":[]}`,
		"hidden divider": `{"order":["a"],"hidden":["|"]}`,
		"bad characters": `{"order":["../x"],"hidden":[]}`,
		"upper case":     `{"order":["Welcome"],"hidden":[]}`,
		"too long":       `{"order":["` + strings.Repeat("a", 40) + `"],"hidden":[]}`,
		"empty id":       `{"order":[""],"hidden":[]}`,
		"number id":      `{"order":[1],"hidden":[]}`,
		"digit first id": `{"order":["1a"],"hidden":[]}`,
	} {
		if _, err := canonicalNavLayout(bad); err == nil {
			t.Errorf("%s: %q must be refused", name, bad)
		}
	}
	var many []string
	for i := 0; i < maxNavItems+1; i++ {
		many = append(many, "x"+strings.Repeat("a", i%5)+string(rune('a'+i%26))+string(rune('a'+i/26)))
	}
	b := `{"order":["` + strings.Join(many, `","`) + `"],"hidden":[]}`
	if _, err := canonicalNavLayout(b); err == nil {
		t.Error("an oversized layout must be refused")
	}
}

func TestUIPrefs(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(uiPrefTableDDL); err != nil {
		t.Fatal(err)
	}
	if getUIPref(db, 1, navLayoutKey) != "" {
		t.Error("an unset preference is blank")
	}
	setUIPref(db, 1, navLayoutKey, "a")
	setUIPref(db, 1, navLayoutKey, "b")
	setUIPref(db, 2, navLayoutKey, "other")
	if getUIPref(db, 1, navLayoutKey) != "b" || getUIPref(db, 2, navLayoutKey) != "other" {
		t.Error("preferences are per user and overwrite")
	}
	deleteUIPref(db, 1, navLayoutKey)
	if getUIPref(db, 1, navLayoutKey) != "" || getUIPref(db, 2, navLayoutKey) != "other" {
		t.Error("delete only the user's own")
	}
}
