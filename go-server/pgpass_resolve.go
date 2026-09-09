package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// omnidbPgpassResolveURLEnv is set by wails-app/backend.go when it spawns
// this process, pointing at the same loopback listener
// wails-app/savedialog.go runs for save dialogs and external-URL opens.
// Unset outside the desktop app, which is also exactly when this whole
// relay is unnecessary — see applyPgpassPassword.
const omnidbPgpassResolveURLEnv = "OMNIDB_PGPASS_RESOLVE_URL"

// pgpassResolveResponse mirrors wails-app/pgpassdialog.go's own type.
type pgpassResolveResponse struct {
	Password string `json:"password"`
	Granted  bool   `json:"granted"`
	Error    string `json:"error"`
}

// pgpassResolveTimeout bounds the loopback hop. It's generous for what it
// does (resolve a saved location once per app launch, then read and parse a
// small file), and only exists so a wedged shell process can't hang every
// connection attempt indefinitely.
const pgpassResolveTimeout = 5 * time.Second

// applyPgpassPassword fills in a PostgreSQL connection's password from the
// user's .pgpass file when the connection carries none of its own — the
// libpq convention this app's connection form already documents ("If it's a
// PostgreSQL connection, OmniDB will try to retrieve password from
// .pgpass.").
//
// pgx does this itself inside ParseConfig, and for every non-sandboxed
// deployment (self-hosted, Windows, Linux, a macOS build outside the
// sandbox) that is the end of it: cfg.Password is already set by the time
// this sees it, and this returns immediately. It exists for the sandboxed
// macOS app, where that lookup silently finds nothing: App Sandbox
// redirects this process's $HOME into the app container (see
// wails-app/legacydata.go's sandboxed() comment), so pgx reads
// <container>/.pgpass — a path that doesn't exist — rather than the real
// ~/.pgpass, and pgconn/config.go swallows a passfile read error instead of
// surfacing it, leaving the password blank and the server rejecting it with
// SQLSTATE 28P01.
//
// The file is read by the shell process instead, over the same loopback
// relay used for native save dialogs: the sandbox extension that makes
// ~/.pgpass readable belongs to whichever process the user granted it to
// through an Open panel, and this one is a child that inherits the sandbox
// but not that grant (com.apple.security.inherit, see
// wails-app/build/darwin/entitlements-helper.plist). Only the single
// matching password crosses back, never the file — the rest of it is
// credentials for hosts that have nothing to do with this connection.
//
// Deliberately matched on the *parsed* config rather than on ConnectionInfo's
// own fields: cfg.Host/Port/Database/User are what pgx itself would have
// matched a .pgpass line against, including every default it applied
// (port 5432, database = user, a connstring's embedded values), so this
// resolves the same entry an unsandboxed client would have — which is the
// whole point of the feature.
func applyPgpassPassword(cfg *pgx.ConnConfig) {
	if cfg.Password != "" {
		return
	}
	resolveURL := os.Getenv(omnidbPgpassResolveURLEnv)
	if resolveURL == "" {
		return
	}

	// Mirrors pgconn's own passfile matching for a Unix socket, where the
	// entry is written against "localhost" rather than the socket directory.
	host := cfg.Host
	if network, _ := pgconn.NetworkAddress(cfg.Host, cfg.Port); network == "unix" {
		host = "localhost"
	}

	password, err := pgpassPasswordFromShell(resolveURL, pgpassMatch{
		Hostname: host,
		Port:     strconv.Itoa(int(cfg.Port)),
		Database: cfg.Database,
		Username: cfg.User,
	})
	if err != nil {
		// Not fatal and not worth failing the connection over: without a
		// password the server answers with 28P01, which the frontend turns
		// into the password prompt (and its "grant access to .pgpass"
		// button) — the same place a genuine "no entry for this
		// connection" ends up. Logged because, unlike that case, this one
		// means the relay itself misbehaved.
		log.Printf("pgpass resolve: %v", err)
		return
	}
	cfg.Password = password
}

// pgpassMatch is the wire shape of a resolve request — mirrors wails-app/
// pgpassdialog.go's pgpassMatchRequest.
type pgpassMatch struct {
	Hostname string `json:"hostname"`
	Port     string `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
}

// pgpassPasswordFromShell asks wails-app for the one .pgpass entry matching
// this connection. An empty password with no error is the normal answer for
// "access was never granted" and for "the granted file has no entry for
// this connection" alike — neither is a failure worth reporting from here
// (see applyPgpassPassword), so only a broken relay produces an error.
func pgpassPasswordFromShell(resolveURL string, match pgpassMatch) (string, error) {
	payload, err := json.Marshal(match)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: pgpassResolveTimeout}
	resp, err := client.Post(resolveURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var out pgpassResolveResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Error != "" {
		return "", errPgpassRelay(out.Error)
	}
	return out.Password, nil
}

// errPgpassRelay keeps the relay's own error string distinguishable in the
// log from a transport failure.
type errPgpassRelay string

func (e errPgpassRelay) Error() string { return "desktop app reported: " + string(e) }
