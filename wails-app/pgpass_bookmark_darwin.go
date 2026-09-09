//go:build darwin

package main

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>
#include "pgpass_bookmark_darwin.h"
*/
import "C"

import (
	"context"
	"errors"
	"unsafe"
)

// pickPgpassFile shows the native Open panel and, on a real pick, creates
// its security-scoped bookmark in the same native call — see
// pgpass_bookmark_darwin.h's comment on pgpass_pick_file_and_bookmark for
// why that has to happen together rather than as two separate steps from
// Go. ctx is unused on this platform (the panel is driven entirely via
// Cocoa, not through Wails' own runtime) but kept in the signature so
// pgpass_bookmark_other.go's non-darwin implementation — which does need
// it, to call wailsruntime.OpenFileDialog — has the same shape and
// handlePgpassLookupRequest doesn't need its own per-platform branch.
func pickPgpassFile(ctx context.Context) (path string, bookmark []byte, cancelled bool, err error) {
	var outPath *C.char
	var outBookmark *C.uchar
	var outBookmarkLen C.int
	var outCancelled C.int
	var outErr *C.char

	ok := C.pgpass_pick_file_and_bookmark(&outPath, &outBookmark, &outBookmarkLen, &outCancelled, &outErr)
	if outCancelled != 0 {
		return "", nil, true, nil
	}
	if ok == 0 {
		defer C.free(unsafe.Pointer(outErr))
		return "", nil, false, errors.New(C.GoString(outErr))
	}
	defer C.free(unsafe.Pointer(outPath))
	if outBookmark == nil {
		// Not sandboxed, so there was no security-scoped bookmark to
		// create — see pgpass_bookmark_darwin.h. A nil bookmark tells
		// pgpassdialog.go to remember the plain path instead.
		return C.GoString(outPath), nil, false, nil
	}
	defer C.free(unsafe.Pointer(outBookmark))
	return C.GoString(outPath), C.GoBytes(unsafe.Pointer(outBookmark), outBookmarkLen), false, nil
}

// resolvedBookmark is what resolveSecurityScopedBookmark hands back — Stop
// must be called (typically deferred) once the caller is done reading the
// file, to release the sandbox extension it granted. Path is only valid
// between a successful resolve and the matching Stop call.
type resolvedBookmark struct {
	Path          string
	RefreshedData []byte // nil unless the bookmark was stale and refreshing it succeeded
}

func (b resolvedBookmark) Stop() {
	cPath := C.CString(b.Path)
	defer C.free(unsafe.Pointer(cPath))
	C.pgpass_stop_accessing(cPath)
}

// resolveSecurityScopedBookmark mirrors pgpass_resolve_bookmark.
func resolveSecurityScopedBookmark(data []byte) (resolvedBookmark, error) {
	if len(data) == 0 {
		return resolvedBookmark{}, errors.New("empty bookmark data")
	}

	var outPath *C.char
	var outRefreshed *C.uchar
	var outRefreshedLen C.int
	var outErr *C.char

	ok := C.pgpass_resolve_bookmark(
		(*C.uchar)(unsafe.Pointer(&data[0])), C.int(len(data)),
		&outPath, &outRefreshed, &outRefreshedLen, &outErr,
	)
	if ok == 0 {
		defer C.free(unsafe.Pointer(outErr))
		return resolvedBookmark{}, errors.New(C.GoString(outErr))
	}
	defer C.free(unsafe.Pointer(outPath))

	result := resolvedBookmark{Path: C.GoString(outPath)}
	if outRefreshed != nil {
		defer C.free(unsafe.Pointer(outRefreshed))
		result.RefreshedData = C.GoBytes(unsafe.Pointer(outRefreshed), outRefreshedLen)
	}
	return result, nil
}
