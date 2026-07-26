package main

import (
	"encoding/json"
	"net/http"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// openURLRequest/Response mirror go-server/open_external_url.go's relay
// payload — kept as their own pair here for the same reason
// saveDialogRequest/Response are, in savedialog.go.
type openURLRequest struct {
	URL string `json:"url"`
}

type openURLResponse struct {
	Error string `json:"error"`
}

// handleOpenURLRequest opens a URL in the system's default browser on
// go-server's behalf — see startSaveDialogServer's comment for why this
// relay exists at all (registered on that same loopback listener), and
// go-server/open_external_url.go's comment for why the frontend needs it
// specifically for this action (window.open() is a silent no-op inside the
// desktop app's own webview).
func (a *App) handleOpenURLRequest(w http.ResponseWriter, r *http.Request) {
	var req openURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeOpenURLError(w, err.Error())
		return
	}

	wailsruntime.BrowserOpenURL(a.ctx, req.URL)
	writeOpenURLJSON(w, openURLResponse{})
}

func writeOpenURLError(w http.ResponseWriter, msg string) {
	writeOpenURLJSON(w, openURLResponse{Error: msg})
}

func writeOpenURLJSON(w http.ResponseWriter, resp openURLResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
