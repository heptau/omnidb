package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// openExternalURLRequest/Response are the wire shape between JS and this
// handler, and (Response) also between this handler and wails-app's relay.
type openExternalURLRequest struct {
	URL string `json:"url"`
}

type openExternalURLResponse struct {
	Error string `json:"error"`
}

// omnidbOpenURLEnv is set by wails-app/backend.go when it spawns this
// process, pointing at the same loopback listener wails-app/savedialog.go
// runs for save dialogs.
const omnidbOpenURLEnv = "OMNIDB_OPEN_URL"

// handleOpenExternalURL relays a "open this URL in the system's default
// browser" request to wails-app — same reason and same shape as
// handleExportSaveDialog's relay: workspace.html is loaded via a full
// top-level navigation to go-server's own origin, so it never gets
// window.go/window.runtime and can't call wailsruntime.BrowserOpenURL
// directly. Unlike the save dialog, there's a same-origin fallback for when
// this handler isn't reachable at all (plain window.open(), see
// website_tab.js) — window.open() only fails silently inside the desktop
// app's own webview (confirmed against the packaged app: no popup, no
// console error, nothing happens), which is exactly the case this handler
// exists to cover.
func handleOpenExternalURL(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var req openExternalURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		writeOpenExternalURLError(w, "invalid url")
		return
	}

	openURL := os.Getenv(omnidbOpenURLEnv)
	if openURL == "" {
		writeOpenExternalURLError(w, "Can't reach the desktop app (or it needs to be rebuilt).")
		return
	}

	payload, err := json.Marshal(map[string]string{"url": req.URL})
	if err != nil {
		writeOpenExternalURLError(w, err.Error())
		return
	}

	resp, err := http.Post(openURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		writeOpenExternalURLError(w, "Could not reach the desktop app: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var out openExternalURLResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		writeOpenExternalURLError(w, "Unexpected response from the desktop app.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func writeOpenExternalURLError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(openExternalURLResponse{Error: msg})
}
