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

	verifiedSrcPath, err := validateSaveDialogSrcPath(req.SrcPath)
	if err != nil {
		writeSaveDialogError(w, err.Error())
		return
	}

	if err := copySaveDialogFile(verifiedSrcPath, dst); err != nil {
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
// Returns the cleaned path rather than just an ok/error bool — os.Open must
// consume this returned value, not the original request field, so the only
// path that can ever reach it is one that has actually passed the
// containment check right here (same principle as go-server's
// sqliteVerifiedTableName: a static analyzer can't assume a same-named
// check elsewhere in the call chain already covered the value it sees
// flowing into the sink).
func validateSaveDialogSrcPath(srcPath string) (string, error) {
	tempDir, err := exportTempDir()
	if err != nil {
		return "", err
	}
	cleanPath := filepath.Clean(srcPath)
	rel, err := filepath.Rel(tempDir, cleanPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid export path")
	}
	return cleanPath, nil
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

func copySaveDialogFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
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
