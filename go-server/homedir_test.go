package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHomeDirFlagParsing(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"-d", "/tmp/foo"}, "/tmp/foo"},
		{[]string{"--homedir", "/tmp/bar"}, "/tmp/bar"},
		{[]string{"--homedir=/tmp/baz"}, "/tmp/baz"},
		{[]string{"-A"}, ""},
		{[]string{"-d"}, ""}, // dangling flag, no value follows
		{nil, ""},
	}
	for _, c := range cases {
		if got := homeDirFlag(c.args); got != c.want {
			t.Errorf("homeDirFlag(%v) = %q, want %q", c.args, got, c.want)
		}
	}
}

func TestResolveHomeDirExplicitFlagMustExist(t *testing.T) {
	dir := t.TempDir()
	got, err := resolveHomeDir([]string{"-d", dir})
	if err != nil {
		t.Fatalf("resolveHomeDir: %v", err)
	}
	if got != dir {
		t.Errorf("got %q, want %q", got, dir)
	}

	if _, err := resolveHomeDir([]string{"-d", filepath.Join(dir, "does-not-exist")}); err == nil {
		t.Error("expected an error for a nonexistent --homedir, got nil")
	}
}

// TestResolveHomeDirComputedDefault redirects $HOME to a scratch directory
// (t.Setenv auto-restores it) rather than touching the real user's home —
// this is the one branch that can't be tested via an explicit override
// without exercising the exact same code path it's meant to verify.
func TestResolveHomeDirComputedDefault(t *testing.T) {
	fakeHome := t.TempDir()
	t.Setenv("HOME", fakeHome)

	got, err := resolveHomeDir(nil)
	if err != nil {
		t.Fatalf("resolveHomeDir: %v", err)
	}
	want := filepath.Join(fakeHome, ".omnidb", "omnidb-server")
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if info, err := os.Stat(got); err != nil || !info.IsDir() {
		t.Errorf("expected computed default directory to be created, stat error: %v", err)
	}

	gotApp, err := resolveHomeDir([]string{"-A"})
	if err != nil {
		t.Fatalf("resolveHomeDir: %v", err)
	}
	wantApp := filepath.Join(fakeHome, ".omnidb", "omnidb-app")
	if gotApp != wantApp {
		t.Errorf("app mode: got %q, want %q", gotApp, wantApp)
	}
}
