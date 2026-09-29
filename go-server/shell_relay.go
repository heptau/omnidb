package main

import (
	"crypto/subtle"
	"io"
	"net/http"
	"os"
	"strings"
)

// omnidbRelayTokenEnv is set by wails-app/backend.go when it spawns this
// process: a per-launch random secret shared by exactly these two
// processes. Loopback binding alone isn't a real trust boundary — any other
// local process (or OS user) can connect to 127.0.0.1, and any web page in
// the user's browser can fire "simple" cross-origin POSTs at it — so every
// hop between go-server and the shell carries this token in both
// directions: postToShell sends it on the relay calls (save dialog,
// open-URL, .pgpass resolve/grant/import, language/title notifications),
// and hasShellRelayToken requires it on /internal/shutdown/.
const omnidbRelayTokenEnv = "OMNIDB_RELAY_TOKEN"

// shellRelayToken is read once at startup; os.Getenv on every request would
// work too, but the env never changes after spawn.
var shellRelayToken = os.Getenv(omnidbRelayTokenEnv)

// postToShell POSTs a JSON body to one of wails-app/savedialog.go's relay
// endpoints with the shared secret attached. client may be nil for
// http.DefaultClient.
func postToShell(client *http.Client, url string, body io.Reader) (*http.Response, error) {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequest(http.MethodPost, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+shellRelayToken)
	return client.Do(req)
}

// hasShellRelayToken reports whether r carries the shell's shared secret.
// Always false when no secret was provided (this process wasn't spawned by
// the desktop shell), so the shell-only routes are simply unusable then.
func hasShellRelayToken(r *http.Request) bool {
	if shellRelayToken == "" {
		return false
	}
	got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return ok && subtle.ConstantTimeCompare([]byte(got), []byte(shellRelayToken)) == 1
}
