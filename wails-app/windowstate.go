package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// windowState is the persisted geometry of the app's single window --
// written on close (saveWindowState, the app's OnBeforeClose hook) and
// re-applied once the workspace is about to be shown (RestoreWindowState,
// called from main.js's "backend:ready" handler) -- so the window comes
// back exactly as the user left it instead of always maximising.
type windowState struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Maximised bool `json:"maximised"`
}

// windowStatePath lives alongside omnidb.db and the export temp dir --
// appHomeDir() (savedialog.go) -- rather than in the multi-user app DB
// (appdb_userdetails): window geometry is a property of this one desktop
// shell/machine, not of whichever account happens to be logged in.
func windowStatePath() (string, error) {
	dir, err := appHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "window_state.json"), nil
}

// saveWindowState is the App's OnBeforeClose hook: captures the window's
// current geometry before it closes and writes it to disk. Always returns
// false (never blocks closing) -- a failed save just means the next launch
// falls back to RestoreWindowState's default, not a stuck window.
func (a *App) saveWindowState(ctx context.Context) (prevent bool) {
	path, err := windowStatePath()
	if err != nil {
		return false
	}

	state := windowState{Maximised: wailsruntime.WindowIsMaximised(ctx)}
	// Only capture size/position while not maximised: WindowGetSize/
	// WindowGetPosition report the maximised (full-screen) geometry in that
	// state, which would overwrite the one meaningful "restored" size --
	// the one the user actually chose the last time they weren't maximised.
	if !state.Maximised {
		state.Width, state.Height = wailsruntime.WindowGetSize(ctx)
		state.X, state.Y = wailsruntime.WindowGetPosition(ctx)
	}

	data, err := json.Marshal(state)
	if err != nil {
		return false
	}
	_ = os.WriteFile(path, data, 0o600)
	return false
}

// loadWindowState reads back what saveWindowState last wrote. A missing or
// unreadable file (first launch, or an upgrade from a version that predates
// this feature) is not an error -- RestoreWindowState treats a nil state as
// "fall back to the app's original always-maximised startup".
func loadWindowState() *windowState {
	path, err := windowStatePath()
	if err != nil {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var state windowState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil
	}
	// A maximised state never had Width/Height captured (saveWindowState
	// skips that on purpose -- see its comment), so the zero-size check only
	// makes sense for a non-maximised one; applying it unconditionally would
	// reject every legitimately-saved "was maximised" state.
	if !state.Maximised && (state.Width <= 0 || state.Height <= 0) {
		return nil
	}
	return &state
}

// RestoreWindowState is bound for main.js to call once the workspace is
// about to be shown (see its "backend:ready" handler) -- the same moment
// that used to unconditionally call WindowMaximise(). Reapplies the last
// known geometry instead, so the window comes back at the size/position/
// maximised-state the user left it in; a first launch (no saved state yet)
// keeps the app's previous always-maximised behaviour.
func (a *App) RestoreWindowState() {
	state := loadWindowState()
	if state == nil {
		wailsruntime.WindowMaximise(a.ctx)
		return
	}
	if state.Maximised {
		wailsruntime.WindowMaximise(a.ctx)
		return
	}
	wailsruntime.WindowUnmaximise(a.ctx)
	wailsruntime.WindowSetSize(a.ctx, state.Width, state.Height)
	wailsruntime.WindowSetPosition(a.ctx, state.X, state.Y)
}
