package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
)

// omnidbNotifyLanguageURLEnv is set by wails-app/backend.go when it spawns
// this process, pointing at wails-app/savedialog.go's loopback HTTP server —
// see notifyDesktopShellLanguage's comment for why this relay exists at all.
const omnidbNotifyLanguageURLEnv = "OMNIDB_NOTIFY_LANGUAGE_URL"

// notifyDesktopShellLanguage tells wails-app which UI language the workspace
// page it just served resolved to, so the native macOS menu bar (built
// entirely in wails-app/menu.go, out of go-server's reach — see
// export_save_dialog.go's comment on why) can be rebuilt to match. A no-op
// outside the desktop app (server/web deployments never set the env var).
//
// Fire-and-forget: runs in its own goroutine and swallows every error, since
// a missed native menu refresh is a cosmetic inconvenience corrected on the
// next page load, not something worth slowing down or failing the page
// request over.
func notifyDesktopShellLanguage(lang string) {
	url := os.Getenv(omnidbNotifyLanguageURLEnv)
	if url == "" {
		return
	}
	go func() {
		payload, err := json.Marshal(map[string]string{"lang": lang})
		if err != nil {
			return
		}
		resp, err := http.Post(url, "application/json", bytes.NewReader(payload))
		if err != nil {
			return
		}
		resp.Body.Close()
	}()
}
