package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// saveDialogRequest/Response mirror go-server/export_save_dialog.go's relay
// payload — kept as their own pair here since nothing else needs these
// types.
type saveDialogRequest struct {
	SrcPath       string `json:"srcPath"`
	SuggestedName string `json:"suggestedName"`
}

type saveDialogResponse struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// startSaveDialogServer runs a tiny loopback-only HTTP server that lets
// go-server ask this process to do things only the Wails shell process can:
// show a native "Save As" dialog and copy a file there on its behalf
// (/save-file), or open a URL in the system's default browser
// (/open-url, see openurl.go). This exists only because of a Wails
// limitation: window.go/window.runtime are injected exclusively into pages
// served by Wails' own asset server (see pkg/assetserver/assetserver.go);
// workspace.html is served entirely by go-server via a full top-level
// navigation (see AGENTS.md's "Wails migration" notes and menu.go's execJS
// switch, which hit the exact same limitation from the other direction),
// so it never gets that bridge and can never call a bound Go method
// directly — this HTTP hop is the only way for it to reach this process at
// all. Loopback-only binding is the same trust boundary go-server's own
// /internal/shutdown/ relies on (see its comment) — no separate auth token
// needed on top of that.
func (a *App) startSaveDialogServer() error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/save-file", a.handleSaveDialogRequest)
	mux.HandleFunc("/open-url", a.handleOpenURLRequest)

	server := &http.Server{Handler: mux}
	a.saveDialogAddr = listener.Addr().String()
	go server.Serve(listener)
	return nil
}

func (a *App) handleSaveDialogRequest(w http.ResponseWriter, r *http.Request) {
	var req saveDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}

	dst, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		DefaultFilename: req.SuggestedName,
		Title:           "Save Exported File",
	})
	if err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}
	if dst == "" {
		// User cancelled the dialog — not an error.
		writeSaveDialogJSON(w, saveDialogResponse{})
		return
	}

	root, relSrcPath, err := validateSaveDialogSrcPath(req.SrcPath)
	if err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}
	defer root.Close()

	if err := copySaveDialogFile(root, relSrcPath, dst); err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}
	writeSaveDialogJSON(w, saveDialogResponse{Path: dst})
}

// validateSaveDialogSrcPath confirms srcPath falls inside go-server's own
// export temp directory before it's ever handed to os.Open — this loopback
// server has no way to authenticate its caller as go-server specifically
// (any local process that discovers the ephemeral port could POST here), so
// it can't just trust that go-server already did this same check in
// export_save_dialog.go before relaying the request. Independently
// re-deriving the expected directory (rather than trusting a caller-
// supplied one) means a malicious request still can't walk srcPath outside
// the one directory this relay is meant to ever read from.
//
// Returns an os.Root rooted at that directory plus the path relative to it,
// rather than a cleaned absolute path — the caller opens the file through
// root.Open(rel), so containment is enforced by the OS/runtime on every
// path component (including symlinks), not just by a string comparison
// against the request-controlled value. That also makes the sanitization
// visible to static analysis: a string-based check (filepath.Rel plus a
// ".." prefix test) still leaves the request-controlled string itself
// flowing into the sink, which CodeQL's go/sql-injection-style dataflow
// keeps flagging even though the check is correct at runtime — same class
// of gap as go-server's sqliteVerifiedTableName comment describes, fixed
// here the same way that fix uses: don't hand the sink the tainted value at
// all, hand it something the containment check itself produced.
func validateSaveDialogSrcPath(srcPath string) (*os.Root, string, error) {
	tempDir, err := exportTempDir()
	if err != nil {
		return nil, "", err
	}
	root, err := os.OpenRoot(tempDir)
	if err != nil {
		return nil, "", err
	}
	cleanPath := filepath.Clean(srcPath)
	rel, err := filepath.Rel(tempDir, cleanPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		root.Close()
		return nil, "", fmt.Errorf("invalid export path")
	}
	return root, rel, nil
}

// exportTempDir mirrors go-server/homedir.go's resolveHomeDir + appdb.go's
// resolveTempDir for the one mode this process ever launches go-server in:
// startBackend always appends "-A" (see backend.go), so the "app mode"
// branch (~/.omnidb/omnidb-app, or an explicit -d/--homedir override) is the
// only case that can ever apply here — go-server's own home-dir resolution
// isn't reachable from this separate module, so this recomputes the same
// path from the same os.Args instead of importing it.
func exportTempDir() (string, error) {
	dir := homeDirFlag(os.Args[1:])
	if dir == "" {
		base, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(base, ".omnidb", "omnidb-app")
	}
	return filepath.Join(dir, "temp"), nil
}

// homeDirFlag mirrors go-server/homedir.go's own flag parsing for -d/--homedir.
func homeDirFlag(args []string) string {
	for i, a := range args {
		if a == "-d" || a == "--homedir" {
			if i+1 < len(args) {
				return args[i+1]
			}
		}
		if v, ok := strings.CutPrefix(a, "--homedir="); ok {
			return v
		}
	}
	return ""
}

func copySaveDialogFile(root *os.Root, relSrcPath, dstPath string) error {
	src, err := root.Open(relSrcPath)
	if err != nil {
		return err
	}
	defer src.Close()

	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, src)
	return err
}

func writeSaveDialogError(w http.ResponseWriter, msg string) {
	writeSaveDialogJSON(w, saveDialogResponse{Error: msg})
}

func writeSaveDialogJSON(w http.ResponseWriter, resp saveDialogResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
