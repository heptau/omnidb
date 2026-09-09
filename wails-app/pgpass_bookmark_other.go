//go:build !darwin

package main

import (
	"context"
	"errors"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// pickPgpassFile just shows Wails' own cross-platform Open dialog —
// Windows and Linux builds of this app are never sandboxed in a way that
// would lose filesystem access to a user-picked file between launches, so
// there is nothing to bookmark, and no need for the darwin build's own
// native-panel dance (see pgpass_bookmark_darwin.go/.m) that exists solely
// to capture a security-scoped NSURL bookmark can actually persist.
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
// pgpassdialog.go compiles unchanged on every platform — resolving a
// bookmark is meaningless without pickPgpassFile ever producing one, so
// this always fails, which readPgpassViaSavedBookmark already treats as
// "no usable saved location, fall back to the picker" (see its comment).
type resolvedBookmark struct {
	Path          string
	RefreshedData []byte
}

func (b resolvedBookmark) Stop() {}

func resolveSecurityScopedBookmark(data []byte) (resolvedBookmark, error) {
	return resolvedBookmark{}, errors.New("security-scoped bookmarks are only needed on macOS")
}
