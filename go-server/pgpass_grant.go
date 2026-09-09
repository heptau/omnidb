package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
)

// pgpassGrantResponse mirrors wails-app/pgpassdialog.go's own type — the
// wire shape both between this handler and wails-app's relay, and between
// this handler and passwords.js's grantPgpassAccess.
type pgpassGrantResponse struct {
	Granted   bool   `json:"granted"`
	Matched   bool   `json:"matched"`
	Cancelled bool   `json:"cancelled"`
	Error     string `json:"error"`
}

// omnidbPgpassGrantURLEnv is set by wails-app/backend.go when it spawns
// this process, pointing at the same loopback listener
// wails-app/savedialog.go runs for save dialogs, external-URL opens,
// .pgpass reads and bulk .pgpass imports.
const omnidbPgpassGrantURLEnv = "OMNIDB_PGPASS_GRANT_URL"

// handlePgpassGrant relays the password prompt's "let OmniDB use my .pgpass
// file" click to wails-app, which shows a native Open panel and persists
// the picked file's location (see its handlePgpassGrantRequest). The relay
// exists for the same reason handleExportSaveDialog's does: workspace.html
// is served by this process, not by Wails' own asset server, so it never
// gets the window.go/window.runtime bridge and can't call a bound Go method
// — this hop is its only way to reach the shell process.
//
// No password is involved in either direction. Once the grant is in place,
// the password is resolved on the connect path like any unsandboxed client
// would resolve it (see pgpass_resolve.go), so all the frontend does with
// the answer is retry the operation that prompted it.
func handlePgpassGrant(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	grantURL := os.Getenv(omnidbPgpassGrantURLEnv)
	if grantURL == "" {
		writePgpassGrantError(w, "Can't open the file picker: this page isn't running inside the OmniDB desktop app (or it needs to be rebuilt).")
		return
	}

	// The body is the connection to check the picked file against
	// (host/port/database/username, see wails-app's pgpassMatchRequest) —
	// forwarded as-is rather than re-decoded here, since nothing in this
	// process needs to look at it.
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8<<10))
	if err != nil {
		writePgpassGrantError(w, "bad request")
		return
	}

	resp, err := http.Post(grantURL, "application/json", bytes.NewReader(body))
	if err != nil {
		writePgpassGrantError(w, "Could not reach the desktop app's file picker: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var out pgpassGrantResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		writePgpassGrantError(w, "Unexpected response from the desktop app.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writePgpassGrantError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pgpassGrantResponse{Error: msg})
}
