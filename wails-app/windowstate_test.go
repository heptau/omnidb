package main

import (
	"encoding/json"
	"os"
	"testing"
)

// writeTestWindowState mimics what saveWindowState writes, without needing
// a live Wails runtime context (which saveWindowState itself requires, and
// which isn't available in a headless `go test` run).
func writeTestWindowState(path string, state windowState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// TestLoadWindowStateMissingFileReturnsNil covers a first launch (or an
// upgrade from a version predating this feature): RestoreWindowState must
// fall back to its default rather than panic or error out.
func TestLoadWindowStateMissingFileReturnsNil(t *testing.T) {
	path, err := windowStatePath()
	if err != nil {
		t.Fatalf("windowStatePath: %v", err)
	}
	_ = os.Remove(path)

	if state := loadWindowState(); state != nil {
		t.Errorf("expected nil for a missing state file, got %+v", state)
	}
}

// TestWindowStateRoundTrip guards the save/load pair: what saveWindowState
// writes is exactly what RestoreWindowState later reads back, for both the
// maximised and the restored (explicit geometry) cases.
func TestWindowStateRoundTrip(t *testing.T) {
	path, err := windowStatePath()
	if err != nil {
		t.Fatalf("windowStatePath: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })

	cases := []windowState{
		{Maximised: true},
		{Width: 1200, Height: 800, X: 50, Y: 75, Maximised: false},
	}
	for _, want := range cases {
		if err := writeTestWindowState(path, want); err != nil {
			t.Fatalf("writeTestWindowState(%+v): %v", want, err)
		}
		got := loadWindowState()
		if got == nil {
			t.Fatalf("loadWindowState() = nil after writing %+v", want)
		}
		if *got != want {
			t.Errorf("loadWindowState() = %+v, want %+v", *got, want)
		}
	}
}

// TestLoadWindowStateRejectsZeroSize guards against a corrupt or
// hand-edited state file wedging the window at 0x0 -- loadWindowState
// treats that the same as "no state" rather than handing RestoreWindowState
// a size it would refuse to apply usefully.
func TestLoadWindowStateRejectsZeroSize(t *testing.T) {
	path, err := windowStatePath()
	if err != nil {
		t.Fatalf("windowStatePath: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(path) })

	if err := writeTestWindowState(path, windowState{Width: 0, Height: 0}); err != nil {
		t.Fatalf("writeTestWindowState: %v", err)
	}
	if state := loadWindowState(); state != nil {
		t.Errorf("expected nil for a zero-size, non-maximised state, got %+v", state)
	}
}
