package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
)

// omnidbNotifyTitleURLEnv is set by wails-app/backend.go when it spawns this
// process, pointing at the small loopback HTTP server wails-app/savedialog.go
// runs — see handleNotifyTitle's comment for why this indirection exists at
// all.
const omnidbNotifyTitleURLEnv = "OMNIDB_NOTIFY_TITLE_URL"

type notifyTitleRequest struct {
	Title string `json:"title"`
}

// handleNotifyTitle relays "the window title should now read this" to
// wails-app — go-server itself has no window to retitle, only the Wails
// shell process does, and workspace.html's JS can't call into wails-app
// directly: window.go/window.runtime are only injected into pages served
// through Wails' own asset server, and workspace.html is served entirely by
// go-server via a full top-level navigation instead (see
// export_save_dialog.go's comment for the fuller story). This HTTP hop is
// the only bridge available.
//
// Unlike the native menu bar's language (notify_language.go), which only
// ever needs to be reported once per page render, the window title changes
// on every client-side section switch with no new page load at all — so
// this has to be reachable from section_switcher.js's applyWindowTitle
// directly, not piggybacked on a render-time hook.
//
// No CSRF/token check beyond the session cookie (this route is in
// native_session.go's csrfExemptPrefixes, same reasoning as
// /export_save_dialog/): consistent with every other native relay route in
// this migration. Fire-and-forget on both ends — a missed native title-bar
// update is cosmetic, corrected on the next section switch, not worth
// failing the request or making the caller wait on the wails-app round trip.
func handleNotifyTitle(w http.ResponseWriter, r *http.Request) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	var req notifyTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	titleURL := os.Getenv(omnidbNotifyTitleURLEnv)
	if titleURL != "" {
		go func() {
			payload, err := json.Marshal(map[string]string{"title": req.Title})
			if err != nil {
				return
			}
			resp, err := http.Post(titleURL, "application/json", bytes.NewReader(payload))
			if err != nil {
				return
			}
			resp.Body.Close()
		}()
	}
	w.WriteHeader(http.StatusOK)
}
