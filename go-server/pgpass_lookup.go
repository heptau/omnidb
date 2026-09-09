package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
)

// pgpassLookupRequest/Response are the wire shape between JS
// (passwords.js's readPgpassFileNatively) and this handler, and (Response)
// also between this handler and wails-app's relay.
type pgpassLookupRequest struct {
	Hostname string `json:"hostname"`
	Port     string `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
}

type pgpassLookupResponse struct {
	Password  string `json:"password"`
	Cancelled bool   `json:"cancelled"`
	Error     string `json:"error"`
}

// omnidbPgpassLookupURLEnv is set by wails-app/backend.go when it spawns
// this process, pointing at the same loopback listener
// wails-app/savedialog.go runs for save dialogs and external-URL opens.
const omnidbPgpassLookupURLEnv = "OMNIDB_PGPASS_LOOKUP_URL"

// handlePgpassLookup relays a "show the native Open dialog for a .pgpass
// file, and resolve the password entry matching this host/port/database/
// username" request to wails-app — same reason and shape as
// handleExportSaveDialog/handleOpenExternalURL's relays (workspace.html has
// no window.go/window.runtime to call wailsruntime.OpenFileDialog with
// directly). Unlike those two, the browser's own `<input type="file">` can
// do this same job on its own (see passwords.js's readPgpassFile) — this
// relay only exists because that HTML control can't ask the OS's file
// panel to show hidden files, and .pgpass is a dotfile every such panel
// hides by default; passwords.js falls back to the HTML input when this
// route isn't reachable (outside the desktop app, or an older build).
func handlePgpassLookup(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var req pgpassLookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	lookupURL := os.Getenv(omnidbPgpassLookupURLEnv)
	if lookupURL == "" {
		writePgpassLookupError(w, "Can't open the file picker: this page isn't running inside the OmniDB desktop app (or it needs to be rebuilt).")
		return
	}

	payload, err := json.Marshal(req)
	if err != nil {
		writePgpassLookupError(w, err.Error())
		return
	}

	resp, err := http.Post(lookupURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		writePgpassLookupError(w, "Could not reach the desktop app's file picker: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var out pgpassLookupResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		writePgpassLookupError(w, "Unexpected response from the desktop app.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writePgpassLookupError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pgpassLookupResponse{Error: msg})
}
