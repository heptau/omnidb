package main

import (
	"os"
	"path/filepath"
	"testing"
)

// writeTestPgpass drops a .pgpass file with one entry into dir and returns
// its path.
func writeTestPgpass(t *testing.T, dir, line string) string {
	t.Helper()
	path := filepath.Join(dir, ".pgpass")
	if err := os.WriteFile(path, []byte(line+"\n"), 0o600); err != nil {
		t.Fatalf("write .pgpass: %v", err)
	}
	return path
}

func TestPgpassLocationRoundTripsAPlainPath(t *testing.T) {
	encoded := encodePgpassLocation("/Users/somebody/.pgpass", nil)

	location, err := decodePgpassLocation(encoded)
	if err != nil {
		t.Fatalf("decodePgpassLocation: %v", err)
	}
	if location.path != "/Users/somebody/.pgpass" {
		t.Errorf("path = %q, want /Users/somebody/.pgpass", location.path)
	}
	if location.refreshed != nil {
		t.Errorf("refreshed = %q, want nil for a plain path", location.refreshed)
	}
	// Must be callable — a plain path has nothing to release, but callers
	// don't know that and call it unconditionally.
	location.stop()
}

func TestPgpassLocationRejectsUntaggedData(t *testing.T) {
	// What the pre-tagging version of this file wrote: raw bookmark bytes
	// with no tag at all. Rejecting it means one extra Open panel after an
	// upgrade, which is the intended outcome — misreading those bytes as a
	// path would instead leave a permanently unreadable "granted" location.
	if _, err := decodePgpassLocation([]byte("bookmarkish-bytes-with-no-tag")); err == nil {
		t.Fatal("decodePgpassLocation accepted untagged data, want error")
	}
}

// TestGrantedPgpassLocationSurvivesRelaunch covers the path-tagged half of
// the storage format end to end: what handlePgpassGrantRequest persists is
// what a later launch resolves and reads a password out of, with no picker
// involved. The bookmark-tagged half needs a real sandboxed process (and a
// user at the Open panel), so it can't be exercised here.
func TestGrantedPgpassLocationSurvivesRelaunch(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	releasePgpassAccess()
	t.Cleanup(releasePgpassAccess)

	pgpassPath := writeTestPgpass(t, home, "db.example.com:5432:sales:reporter:s3cret")
	if err := writePgpassLocationFile(encodePgpassLocation(pgpassPath, nil)); err != nil {
		t.Fatalf("writePgpassLocationFile: %v", err)
	}

	passfile, ok := readGrantedPassfile()
	if !ok {
		t.Fatal("readGrantedPassfile reported no granted location right after granting one")
	}
	if got := passfile.FindPassword("db.example.com", "5432", "sales", "reporter"); got != "s3cret" {
		t.Errorf("FindPassword = %q, want s3cret", got)
	}
}

// TestReadGrantedPassfileRecoversAfterReplacement covers the retry in
// readGrantedPassfile: the cached grant is dropped and the saved location
// resolved again, so an editor replacing .pgpass mid-session (or the file
// briefly going missing) doesn't leave the app unable to read it until the
// next relaunch.
func TestReadGrantedPassfileRecoversAfterReplacement(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	releasePgpassAccess()
	t.Cleanup(releasePgpassAccess)

	pgpassPath := writeTestPgpass(t, home, "db.example.com:5432:sales:reporter:first")
	if err := writePgpassLocationFile(encodePgpassLocation(pgpassPath, nil)); err != nil {
		t.Fatalf("writePgpassLocationFile: %v", err)
	}
	if _, ok := readGrantedPassfile(); !ok {
		t.Fatal("first readGrantedPassfile failed")
	}

	if err := os.Remove(pgpassPath); err != nil {
		t.Fatalf("remove .pgpass: %v", err)
	}
	if _, ok := readGrantedPassfile(); ok {
		t.Error("readGrantedPassfile succeeded with the file deleted")
	}

	writeTestPgpass(t, home, "db.example.com:5432:sales:reporter:second")
	passfile, ok := readGrantedPassfile()
	if !ok {
		t.Fatal("readGrantedPassfile still failing after the file came back")
	}
	if got := passfile.FindPassword("db.example.com", "5432", "sales", "reporter"); got != "second" {
		t.Errorf("FindPassword = %q, want second", got)
	}
}
