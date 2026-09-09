//go:build !darwin

package main

import (
	"context"
	"errors"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// pickPgpassFile just shows Wails' own cross-platform Open dialog, and
// returns no bookmark — Windows and Linux builds of this app are never
// sandboxed in a way that would lose filesystem access to a user-picked
// file between launches, so there is nothing to bookmark and no need for
// the darwin build's own native-panel dance (see
// pgpass_bookmark_darwin.go/.m) that exists solely to capture a
// security-scoped NSURL bookmark that can actually persist. A nil bookmark
// makes pgpassdialog.go remember the plain path instead, which is all a
// grant needs to survive a relaunch here.
func pickPgpassFile(ctx context.Context) (path string, bookmark []byte, cancelled bool, err error) {
	path, err = wailsruntime.OpenFileDialog(ctx, wailsruntime.OpenDialogOptions{
		Title:           "Select .pgpass file",
		DefaultFilename: ".pgpass",
		ShowHiddenFiles: true,
	})
	if err != nil {
		return "", nil, false, err
	}
	if path == "" {
		return "", nil, true, nil
	}
	return path, nil, false, nil
}

// resolvedBookmark/resolveSecurityScopedBookmark exist only so
// pgpassdialog.go compiles unchanged on every platform — pickPgpassFile
// never produces a bookmark here, so nothing this platform saves is ever
// tagged as one and this is only reachable from a location file written by
// a macOS build (a synced or copied container), where failing is the right
// answer anyway: the path inside it means nothing here.
type resolvedBookmark struct {
	Path          string
	RefreshedData []byte
}

func (b resolvedBookmark) Stop() {}

func resolveSecurityScopedBookmark(data []byte) (resolvedBookmark, error) {
	return resolvedBookmark{}, errors.New("security-scoped bookmarks are only needed on macOS")
}
