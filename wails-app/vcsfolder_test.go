package main

import (
	"path/filepath"
	"strings"
	"testing"

	"omnidb-server/vcsrepo"
)

func TestVCSActionsInGrantedFolder(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	vcsFolderAccess.release()
	t.Cleanup(vcsFolderAccess.release)

	// With nothing picked, the default folder inside the app home is used,
	// created on demand, and a commit makes it a repository by itself.
	r0 := runVCSAction(vcsRequest{Action: "commit", Roots: []string{"snippets"}, Files: []vcsrepo.File{{Path: "snippets/d.sql", Text: "select 0"}}, Message: "d"})
	if r0.Error != "" || !r0.Default || !strings.HasSuffix(r0.Result, " d") {
		t.Fatalf("default folder commit: %+v", r0)
	}
	if dir, isDefault, err := vcsFolder(); err != nil || !isDefault || filepath.Base(dir) != vcsDefaultFolderName {
		t.Fatalf("vcsFolder = %q, %v, %v", dir, isDefault, err)
	}

	repo := t.TempDir()
	if err := vcsFolderAccess.save(encodePgpassLocation(repo, nil)); err != nil {
		t.Fatal(err)
	}
	if path, ok := vcsFolderAccess.get(); !ok || path != repo {
		t.Fatalf("granted folder = %q, %v", path, ok)
	}

	if r := runVCSAction(vcsRequest{Action: "init"}); r.Error != "" || r.State == nil || !r.State.IsRepo {
		t.Fatalf("init: %+v", r)
	}
	files := []vcsrepo.File{{Path: "snippets/a.sql", Text: "select 1"}}
	r := runVCSAction(vcsRequest{Action: "commit", Roots: []string{"snippets"}, Files: files, Message: "m"})
	if r.Error != "" || !strings.HasSuffix(r.Result, " m") {
		t.Fatalf("commit: %+v", r)
	}
	r = runVCSAction(vcsRequest{Action: "read", Roots: []string{"snippets"}})
	if r.Error != "" || len(r.Files) != 1 || r.Files[0].Text != "select 1" {
		t.Fatalf("read: %+v", r)
	}
	if r := runVCSAction(vcsRequest{Action: "bogus"}); r.Error == "" {
		t.Error("an unknown action must fail")
	}
}
