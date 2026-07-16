package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// exportSaveDialogRequest/Response are the wire shape between JS and this
// handler. Field names match what runQueryExport already puts in its
// long-polling response (v_filepath/v_downloadname), so the frontend can
// forward them unchanged.
type exportSaveDialogRequest struct {
	VFilepath     string `json:"v_filepath"`
	VDownloadname string `json:"v_downloadname"`
}

type exportSaveDialogResponse struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// omnidbSaveDialogURLEnv is set by wails-app/backend.go when it spawns this
// process, pointing at the small loopback HTTP server wails-app/savedialog.go
// runs — see handleExportSaveDialog's comment for why this indirection
// exists at all.
const omnidbSaveDialogURLEnv = "OMNIDB_SAVE_DIALOG_URL"

// handleExportSaveDialog relays a "show the native Save dialog for this
// already-exported file" request to wails-app — go-server itself has no
// window to show a dialog from, only the Wails shell process does, and
// JS on workspace.html can't call into wails-app directly: window.go /
// window.runtime are only injected into pages served through Wails' own
// asset server (confirmed the hard way for the native menu bar, see git
// history for wails-app/menu.go's execJS switch), and workspace.html is
// served entirely by go-server via a full top-level navigation instead —
// Wails has no involvement in that request at all. This HTTP hop is the
// only bridge available.
//
// No CSRF/token check beyond the session cookie: consistent with every
// other native route in this migration (checkCSRF is only ever called from
// the login flow, see native_login.go), and the srcPath validation below
// closes the one meaningfully sensitive gap a "copy this path somewhere the
// user picks" relay could otherwise open — the only paths ever accepted are
// ones export.go itself just wrote into the resolved temp dir.
func handleExportSaveDialog(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var req exportSaveDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	tempDir, err := resolveTempDir(nil)
	if err != nil {
		writeExportSaveDialogError(w, err.Error())
		return
	}

	cleanPath := filepath.Clean(req.VFilepath)
	rel, err := filepath.Rel(tempDir.TempDir, cleanPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		writeExportSaveDialogError(w, "invalid export path")
		return
	}

	saveURL := os.Getenv(omnidbSaveDialogURLEnv)
	if saveURL == "" {
		writeExportSaveDialogError(w, "Can't open the save dialog: this page isn't running inside the OmniDB desktop app (or it needs to be rebuilt).")
		return
	}

	payload, err := json.Marshal(map[string]string{
		"srcPath":       cleanPath,
		"suggestedName": req.VDownloadname,
	})
	if err != nil {
		writeExportSaveDialogError(w, err.Error())
		return
	}

	resp, err := http.Post(saveURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		writeExportSaveDialogError(w, "Could not reach the desktop app's save dialog: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var out exportSaveDialogResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		writeExportSaveDialogError(w, "Unexpected response from the desktop app.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writeExportSaveDialogError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(exportSaveDialogResponse{Error: msg})
}
