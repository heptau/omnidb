package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
)

// pgpassImportEntry/Response mirror wails-app/pgpassimport.go's
// pgpassEntryDTO/pgpassImportResponse — the wire shape between this handler
// and wails-app's relay, and (unchanged) between this handler and
// connections.js's importConnectionsFromPgpass.
type pgpassImportEntry struct {
	Hostname string `json:"hostname"`
	Port     string `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
}

type pgpassImportResponse struct {
	Entries   []pgpassImportEntry `json:"entries"`
	Cancelled bool                `json:"cancelled"`
	Error     string              `json:"error"`
}

// omnidbPgpassImportURLEnv is set by wails-app/backend.go when it spawns
// this process, pointing at the same loopback listener
// wails-app/savedialog.go runs for save dialogs, external-URL opens, and
// single-password .pgpass lookups.
const omnidbPgpassImportURLEnv = "OMNIDB_PGPASS_IMPORT_URL"

// handlePgpassImport relays a "show the native .pgpass picker and list
// every entry in it" request to wails-app — same reason and shape as
// handlePgpassLookup's relay (see its comment): workspace.html has no
// window.go/window.runtime to call wailsruntime.OpenFileDialog with
// directly. Backs connections.js's "Import from .pgpass" button in desktop
// mode only — outside the app, connections.js reads and parses the file
// itself via a plain `<input type="file">` instead (see
// importConnectionsFromPgpass's comment), since there's no sandbox to
// route around there in the first place.
func handlePgpassImport(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	importURL := os.Getenv(omnidbPgpassImportURLEnv)
	if importURL == "" {
		writePgpassImportError(w, "Can't open the file picker: this page isn't running inside the OmniDB desktop app (or it needs to be rebuilt).")
		return
	}

	resp, err := http.Post(importURL, "application/json", bytes.NewReader(nil))
	if err != nil {
		writePgpassImportError(w, "Could not reach the desktop app's file picker: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var out pgpassImportResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		writePgpassImportError(w, "Unexpected response from the desktop app.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writePgpassImportError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pgpassImportResponse{Error: msg})
}
