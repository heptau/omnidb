package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/jackc/pgpassfile"
)

// pgpassMatchRequest identifies the connection a password is wanted for —
// the same host/port/database/username quadruple libpq matches a .pgpass
// line against. Sent by go-server/pgpass_resolve.go (filled in from the
// parsed pgx connection config, so it matches exactly what pgx itself
// would have looked up had the file been reachable) and, optionally, by
// go-server/pgpass_grant.go so a freshly-granted file can be checked for a
// matching entry right away instead of only failing later at connect time.
type pgpassMatchRequest struct {
	Hostname string `json:"hostname"`
	Port     string `json:"port"`
	Database string `json:"database"`
	Username string `json:"username"`
}

// pgpassResolveResponse answers /pgpass-resolve. Granted is false whenever
// there is no usable saved .pgpass location at all (never granted, or the
// grant no longer resolves) — as opposed to Granted with an empty Password,
// which means "the file is readable, it just has nothing for this
// connection". go-server only needs to tell those apart to decide whether
// offering the grant button could plausibly help.
type pgpassResolveResponse struct {
	Password string `json:"password"`
	Granted  bool   `json:"granted"`
	Error    string `json:"error"`
}

// pgpassGrantResponse answers /pgpass-grant. Matched reports whether the
// just-granted file actually holds an entry for the requested connection —
// see handlePgpassGrantRequest.
type pgpassGrantResponse struct {
	Granted   bool   `json:"granted"`
	Matched   bool   `json:"matched"`
	Cancelled bool   `json:"cancelled"`
	Error     string `json:"error"`
}

// pgpassLocationFileName is where the user's granted .pgpass location is
// persisted, inside appHomeDir() (savedialog.go) — that directory survives
// across app relaunches (it's the sandboxed container's own Data dir, not
// ephemeral temp storage), which is the whole point: on macOS the sandbox
// extension a file pick grants only lasts for the current process's
// lifetime, so without persisting something every relaunch would need the
// user to re-pick .pgpass from scratch even though nothing about the file
// changed.
//
// Two things can live in it, tagged so one slot serves both (see
// encodePgpassLocation): a macOS security-scoped bookmark, which is what
// actually re-grants sandbox access on a later launch (see
// pgpass_bookmark_darwin.go), or a plain remembered path, used everywhere a
// bookmark is neither available nor needed — Windows/Linux, and a macOS
// build running outside the sandbox (wails dev), where access to a path the
// user picked once never goes away.
const pgpassLocationFileName = "pgpass-bookmark.dat"

const (
	pgpassStoredPathTag     = "path\n"
	pgpassStoredBookmarkTag = "bookmark\n"
)

func pgpassLocationPath() (string, error) {
	home, err := appHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, pgpassLocationFileName), nil
}

// encodePgpassLocation/decodePgpassLocation are the on-disk format of that
// file. A nil bookmark means "nothing to resolve, just remember where the
// file is".
func encodePgpassLocation(path string, bookmark []byte) []byte {
	if bookmark == nil {
		return append([]byte(pgpassStoredPathTag), path...)
	}
	return append([]byte(pgpassStoredBookmarkTag), bookmark...)
}

// pgpassLocation is a .pgpass file the app is currently allowed to read.
// stop releases whatever grant made that possible (a no-op for a plain
// remembered path) and must be called once the file is no longer needed;
// refreshed carries bookmark bytes worth re-persisting, if resolving turned
// up a stale bookmark that could be refreshed.
type pgpassLocation struct {
	path      string
	stop      func()
	refreshed []byte
}

func decodePgpassLocation(data []byte) (pgpassLocation, error) {
	if rest, ok := bytes.CutPrefix(data, []byte(pgpassStoredPathTag)); ok {
		return pgpassLocation{path: string(rest), stop: func() {}}, nil
	}
	rest, ok := bytes.CutPrefix(data, []byte(pgpassStoredBookmarkTag))
	if !ok {
		return pgpassLocation{}, errors.New("unrecognized saved .pgpass location")
	}
	resolved, err := resolveSecurityScopedBookmark(rest)
	if err != nil {
		return pgpassLocation{}, err
	}
	var refreshed []byte
	if resolved.RefreshedData != nil {
		refreshed = encodePgpassLocation("", resolved.RefreshedData)
	}
	return pgpassLocation{path: resolved.Path, stop: resolved.Stop, refreshed: refreshed}, nil
}

// writePgpassLocationFile persists the granted location, creating
// appHomeDir() first if it doesn't exist yet — appHomeDir() itself only
// computes the path, it doesn't guarantee the directory exists (unlike
// go-server's own resolveHomeDir, which the parallel comment on
// appHomeDir claims to mirror but doesn't, for this one side effect). This
// matters here specifically: os.WriteFile does not create parent
// directories, so on whatever launch happens to run this before go-server
// has otherwise caused that directory to exist, the write would silently
// fail and the grant would quietly never get saved at all — every relaunch
// would then fall back to the Open panel forever with no visible error,
// which is exactly the bug report this fixes.
func writePgpassLocationFile(data []byte) error {
	locationPath, err := pgpassLocationPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(locationPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(locationPath, data, 0o600)
}

// The granted location is resolved at most once per launch and then kept
// open for the rest of it, rather than resolved and released around every
// read. Two reasons: resolving a security-scoped bookmark is the expensive
// part (the read itself is a few microseconds), and this is now on the
// connect path — go-server opens a short-lived connection per request (see
// go-server/postgresql.go's openPostgreSQLTarget), so a read can happen
// many times per user action instead of once per password prompt as it did
// when this was only reachable from a button.
var (
	pgpassAccessMu sync.Mutex
	pgpassAccess   *pgpassLocation
)

// grantedPgpassLocation returns the currently-accessible .pgpass file,
// resolving the saved location on first use. ok is false for anything that
// means "no usable granted location right now" — nothing saved yet, corrupt
// data, or a bookmark that no longer resolves (file moved or deleted, access
// revoked) — which callers report as "not granted" rather than as an error,
// since the answer in every one of those cases is the same: the user needs
// to point at the file again.
func grantedPgpassLocation() (path string, ok bool) {
	pgpassAccessMu.Lock()
	defer pgpassAccessMu.Unlock()

	if pgpassAccess != nil {
		return pgpassAccess.path, true
	}

	locationPath, err := pgpassLocationPath()
	if err != nil {
		return "", false
	}
	data, err := os.ReadFile(locationPath)
	if err != nil {
		return "", false
	}
	location, err := decodePgpassLocation(data)
	if err != nil {
		return "", false
	}
	if location.refreshed != nil {
		// Best-effort: a failure here just costs one more (harmless)
		// stale-but-working resolve on the next launch, not a real
		// problem, so its error is deliberately dropped.
		_ = writePgpassLocationFile(location.refreshed)
	}
	pgpassAccess = &location
	return location.path, true
}

// releasePgpassAccess drops the cached grant — called when a read through it
// fails (so the next attempt resolves the saved location afresh instead of
// holding a grant that has stopped working) and after a new pick replaces
// what was saved.
func releasePgpassAccess() {
	pgpassAccessMu.Lock()
	defer pgpassAccessMu.Unlock()
	if pgpassAccess != nil {
		pgpassAccess.stop()
		pgpassAccess = nil
	}
}

// readGrantedPassfile parses the granted .pgpass file. A read failure gets
// exactly one retry through a freshly-resolved grant: a bookmark resolved
// earlier this launch can stop working while the app runs (the file was
// replaced by an editor writing a new inode, moved, or the extension went
// away), and re-resolving recovers from that without the user having to
// re-pick anything.
func readGrantedPassfile() (*pgpassfile.Passfile, bool) {
	path, ok := grantedPgpassLocation()
	if !ok {
		return nil, false
	}
	passfile, err := pgpassfile.ReadPassfile(path)
	if err == nil {
		return passfile, true
	}

	releasePgpassAccess()
	path, ok = grantedPgpassLocation()
	if !ok {
		return nil, false
	}
	passfile, err = pgpassfile.ReadPassfile(path)
	if err != nil {
		return nil, false
	}
	return passfile, true
}

// handlePgpassResolveRequest resolves the single password entry matching the
// requested host/port/database/username out of the .pgpass file the user has
// granted access to. Never shows a dialog: this runs on the connect path,
// on go-server's behalf, for every PostgreSQL connection that has no
// password of its own (see go-server/pgpass_resolve.go) — the point of the
// whole feature is that once access is granted, .pgpass works the way it
// does for an unsandboxed client, with nothing to click. Asking the user
// for the file is a separate, explicit step: handlePgpassGrantRequest.
//
// Only the one matching password is ever handed back, never the file's
// contents: the rest of it holds credentials for hosts that have nothing to
// do with the connection being opened, and nothing but the one relevant
// password needs to leave this process.
func (a *App) handlePgpassResolveRequest(w http.ResponseWriter, r *http.Request) {
	var req pgpassMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePgpassJSON(w, pgpassResolveResponse{Error: err.Error()})
		return
	}

	passfile, ok := readGrantedPassfile()
	if !ok {
		writePgpassJSON(w, pgpassResolveResponse{Granted: false})
		return
	}
	writePgpassJSON(w, pgpassResolveResponse{
		Granted:  true,
		Password: passfile.FindPassword(req.Hostname, req.Port, req.Database, req.Username),
	})
}

// handlePgpassGrantRequest is the "let OmniDB use my .pgpass file" step,
// backing the password prompt's own button (see passwords.js): it shows a
// native Open dialog with hidden files visible (.pgpass is a dotfile every
// OS file panel hides by default, and a bare HTML `<input type="file">` has
// no attribute that can override that; confirmed against Chromium/WebKit —
// there isn't one), then persists the picked file's location so every later
// connect can read it without asking again.
//
// It deliberately hands back no password, only whether the grant succeeded
// and whether the picked file has an entry for the connection that
// triggered the prompt. The password itself arrives the same way it would
// in an unsandboxed client: through the connect path's own lookup, on the
// retry that follows.
//
// Always shows the picker rather than short-circuiting on an existing
// grant: this is only ever reached from a deliberate click, and a click
// reached *because* a connection failed with a grant already in place means
// the granted file is the wrong one — silently reusing it would be a dead
// end with no way to correct the choice.
func (a *App) handlePgpassGrantRequest(w http.ResponseWriter, r *http.Request) {
	// The match fields are optional here (an unknown connection just gets
	// Matched reported as true, see below), so a body that doesn't decode
	// is not worth failing the grant over.
	var req pgpassMatchRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	path, bookmark, cancelled, err := pickPgpassFile(a.ctx)
	if err != nil {
		writePgpassJSON(w, pgpassGrantResponse{Error: err.Error()})
		return
	}
	if cancelled {
		writePgpassJSON(w, pgpassGrantResponse{Cancelled: true})
		return
	}

	// Read the file through the pick's own access before anything else: a
	// file that can't be parsed shouldn't replace a working saved grant.
	passfile, err := pgpassfile.ReadPassfile(path)
	if err != nil {
		writePgpassJSON(w, pgpassGrantResponse{Error: "Could not read that file: " + err.Error()})
		return
	}

	if err := writePgpassLocationFile(encodePgpassLocation(path, bookmark)); err != nil {
		writePgpassJSON(w, pgpassGrantResponse{Error: "Could not remember that file: " + err.Error()})
		return
	}
	releasePgpassAccess()

	matched := req.Hostname == "" ||
		passfile.FindPassword(req.Hostname, req.Port, req.Database, req.Username) != ""
	writePgpassJSON(w, pgpassGrantResponse{Granted: true, Matched: matched})
}

func writePgpassJSON(w http.ResponseWriter, resp any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
