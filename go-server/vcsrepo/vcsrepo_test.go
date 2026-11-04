package vcsrepo

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRepoLifecycle(t *testing.T) {
	t.Setenv("HOME", t.TempDir()) // no global git identity
	dir := t.TempDir()
	if err := CheckDir(dir); err != nil {
		t.Fatal(err)
	}
	if CheckDir("relative") == nil || CheckDir(filepath.Join(dir, "missing")) == nil {
		t.Error("relative and missing folders must be refused")
	}
	if Status(dir).IsRepo {
		t.Fatal("a fresh folder is not a repository")
	}
	if err := Init(dir); err != nil {
		t.Fatal(err)
	}
	if st := Status(dir); !st.IsRepo || st.Branch == "" || len(st.Log) != 0 {
		t.Errorf("empty repository state = %+v", st)
	}

	os.WriteFile(filepath.Join(dir, "README.md"), []byte("keep"), 0o644)
	files := []File{{"snippets/a.sql", "select 1"}, {"snippets/sub/b.sql", "select 2"}, {"monitoring/pg/u.json", "{}"}}
	msg, err := Commit(dir, []string{"snippets", "monitoring"}, files, "first")
	if err != nil || !strings.HasSuffix(msg, " first") {
		t.Fatalf("commit = %q, %v", msg, err)
	}
	if msg, _ := Commit(dir, []string{"snippets", "monitoring"}, files, "again"); msg != NothingToCommit {
		t.Errorf("unchanged commit = %q", msg)
	}

	// Dropping a file prunes it; the untracked README is committed along
	// (everything is staged) but never deleted.
	if _, err := Commit(dir, []string{"snippets", "monitoring"}, files[:1], "second"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "snippets/sub/b.sql")); err == nil {
		t.Error("a stale managed file must be removed")
	}
	if _, err := os.Stat(filepath.Join(dir, "README.md")); err != nil {
		t.Error("unmanaged files must be left alone")
	}
	st := Status(dir)
	if len(st.Log) != 2 || len(st.Changes) != 0 {
		t.Errorf("state = %+v", st)
	}

	got, err := Read(dir, []string{"snippets", "monitoring"})
	if err != nil || len(got) != 1 || got[0].Path != "snippets/a.sql" || got[0].Text != "select 1" {
		t.Errorf("read = %v, %v", got, err)
	}

	// A subfolder of a repository is not itself a repository.
	sub := filepath.Join(dir, "inner")
	os.Mkdir(sub, 0o755)
	if Status(sub).IsRepo {
		t.Error("a subfolder must not count as a repository")
	}
}

func TestWriteRejectsEscapes(t *testing.T) {
	dir := t.TempDir()
	for _, p := range []string{"../x.sql", "/abs.sql", ".git/config", "a/../../x.sql", "."} {
		if err := Write(dir, nil, []File{{p, "x"}}); err == nil {
			t.Errorf("path %q must be refused", p)
		}
	}
	if err := Write(dir, []string{"../up"}, nil); err == nil {
		t.Error("a root outside the folder must be refused")
	}
}

func TestCommitInitializesAFolder(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	dir := t.TempDir()
	msg, err := Commit(dir, []string{"snippets"}, []File{{"snippets/a.sql", "select 1"}}, "first")
	if err != nil || !strings.HasSuffix(msg, " first") || !Status(dir).IsRepo {
		t.Fatalf("commit into a plain folder = %q, %v", msg, err)
	}

	// A folder inside another repository is refused, not nested.
	sub := filepath.Join(dir, "inner")
	os.Mkdir(sub, 0o755)
	if _, err := Commit(sub, []string{"snippets"}, []File{{"snippets/b.sql", "select 2"}}, ""); err == nil || !strings.Contains(err.Error(), "inside another git repository") {
		t.Errorf("nested folder: %v", err)
	}
	if Status(sub).IsRepo {
		t.Error("no repository may be created inside another one")
	}
}

func TestWriteReadRefuseSymlinkEscape(t *testing.T) {
	dir, outside := t.TempDir(), t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dir, "snippets")); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	if err := Write(dir, nil, []File{{Path: "snippets/a.sql", Text: "select 1"}}); err == nil {
		t.Error("Write followed a symlink out of the folder")
	}
	if _, err := os.Stat(filepath.Join(outside, "a.sql")); err == nil {
		t.Error("a file was written outside the folder")
	}
	if _, err := Read(dir, []string{"snippets"}); err == nil {
		t.Error("Read followed a symlink out of the folder")
	}
}
