package main

import (
	"path/filepath"
	"testing"
)

// TestValidateSaveDialogSrcPathAcceptsWithinTempDir guards the CodeQL
// go/path-injection fix: a srcPath actually inside the resolved export temp
// dir (the only thing export_save_dialog.go ever sends) must still work.
func TestValidateSaveDialogSrcPathAcceptsWithinTempDir(t *testing.T) {
	tempDir, err := exportTempDir()
	if err != nil {
		t.Fatalf("exportTempDir: %v", err)
	}
	if _, err := validateSaveDialogSrcPath(filepath.Join(tempDir, "export_20260728.csv")); err != nil {
		t.Errorf("expected a path inside %s to be accepted, got: %v", tempDir, err)
	}
}

// TestValidateSaveDialogSrcPathRejectsTraversalAndOutsidePaths guards
// against a malicious local caller (any process that discovers this
// loopback server's ephemeral port, not just go-server) walking srcPath
// outside the one directory this relay is meant to ever read from.
func TestValidateSaveDialogSrcPathRejectsTraversalAndOutsidePaths(t *testing.T) {
	tempDir, err := exportTempDir()
	if err != nil {
		t.Fatalf("exportTempDir: %v", err)
	}

	cases := []string{
		filepath.Join(tempDir, "..", "..", "etc", "passwd"), // escapes via ".."
		"/etc/passwd",         // unrelated absolute path
		filepath.Dir(tempDir), // the temp dir's own parent
	}
	for _, srcPath := range cases {
		if _, err := validateSaveDialogSrcPath(srcPath); err == nil {
			t.Errorf("expected %q to be rejected as outside %s, but it was accepted", srcPath, tempDir)
		}
	}
}
