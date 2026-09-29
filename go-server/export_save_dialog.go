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
// CSRF-checked like every other POST route (requireCSRF; the frontend sends
// X-CSRFToken via jsonPostHeaders), and the srcPath validation below
// closes the one meaningfully sensitive gap a "copy this path somewhere the
// user picks" relay could otherwise open — the only paths ever accepted are
// ones export.go itself just wrote into the resolved temp dir for this same
// user (see resolveExportFilePath).
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

	cleanPath, ok := resolveExportFilePath(req.VFilepath, who.UserID)
	if !ok {
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

	resp, err := postToShell(nil, saveURL, bytes.NewReader(payload))
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

// resolveExportFilePath cleans p_filepath and checks it stays inside the
// resolved temp dir — shared by handleExportSaveDialog and
// handleDiscardExportFile, both of which only ever accept a path an export
// handler (export.go, postgresql_export_dbml.go, ...) just wrote there.
func resolveExportFilePath(rawPath string, userID int) (string, bool) {
	tempDir, err := resolveTempDir(nil)
	if err != nil {
		return "", false
	}
	cleanPath := filepath.Clean(rawPath)
	rel, err := filepath.Rel(tempDir.TempDir, cleanPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	// Only a file directly in the temp dir that this user generated — the
	// temp dir is shared by every user of a server-mode instance.
	if rel != filepath.Base(rel) {
		return "", false
	}
	name, ok := exportFileTrustedName(rel, userID)
	if !ok {
		return "", false
	}
	return filepath.Join(tempDir.TempDir, name), true
}

// discardExportFileRequest is the wire shape for handleDiscardExportFile.
type discardExportFileRequest struct {
	VFilepath string `json:"v_filepath"`
}

// handleDiscardExportFile deletes a temp export file the user chose not to
// keep after all -- the browser-mode export dialog's Cancel button (see
// exportDBMLPostgresql in tree_postgresql.js), so a generated-but-unwanted
// file doesn't sit around wasting space until cleanTempFolder's 24h sweep
// gets to it. Best-effort: a missing/already-gone file isn't an error.
//
// Unlike handleExportSaveDialog above, this isn't loopback-only (the
// browser-mode dialog it backs also has to work on a network-exposed -H
// deployment), so it goes through the ordinary execAjax/{v_data,v_error}
// envelope contract -- readFormData's "data" field, CSRF-checked by
// requireCSRF like every other authenticated route -- rather than a raw
// fetch() body needing its own exemption.
func handleDiscardExportFile(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return
	}

	raw, err := readFormData(r)
	if err != nil || raw == "" {
		writeBadRequest(w)
		return
	}
	var req discardExportFileRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		writeBadRequest(w)
		return
	}

	cleanPath, ok := resolveExportFilePath(req.VFilepath, who.UserID)
	if !ok {
		writeBadRequest(w)
		return
	}

	_ = os.Remove(cleanPath)
	writeEnvelope(w, "", false, -1)
}
