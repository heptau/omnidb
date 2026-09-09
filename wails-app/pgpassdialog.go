package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jackc/pgpassfile"
)

// pgpassLookupRequest/Response are the wire shape between JS
// (passwords.js's readPgpassFileNatively) and this handler, relayed through
// go-server/pgpass_lookup.go.
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

// pgpassBookmarkFileName is where a resolved .pgpass location's
// security-scoped bookmark is persisted, inside appHomeDir() (savedialog.go)
// — that directory survives across app relaunches (it's the sandboxed
// container's own Data dir, not ephemeral temp storage), which is the whole
// point: the sandbox extension a plain file pick grants only lasts for the
// current process's lifetime, so without saving a bookmark every relaunch
// of the app would need the user to re-pick .pgpass from scratch even
// though nothing about the file changed. See pgpass_bookmark_darwin.go's
// comment on the actual macOS mechanism this relies on. Only macOS needs
// any of this (pgpass_bookmark_other.go stubs it out elsewhere) —
// Windows/Linux builds are never sandboxed in a way that could lose access
// to a previously-read file between launches.
const pgpassBookmarkFileName = "pgpass-bookmark.dat"

func pgpassBookmarkPath() (string, error) {
	home, err := appHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, pgpassBookmarkFileName), nil
}

// writePgpassBookmarkFile persists bookmark bytes to disk, creating
// appHomeDir() first if it doesn't exist yet — appHomeDir() itself only
// computes the path, it doesn't guarantee the directory exists (unlike
// go-server's own resolveHomeDir, which the parallel comment on
// appHomeDir claims to mirror but doesn't, for this one side effect). This
// matters here specifically: os.WriteFile does not create parent
// directories, so on whatever launch happens to run this before go-server
// has otherwise caused that directory to exist, the write would silently
// fail (both callers below already treat any error here as best-effort and
// drop it) and the bookmark would quietly never get saved at all — every
// relaunch would then fall back to the Open panel forever with no visible
// error, which is exactly the bug report this fixes.
func writePgpassBookmarkFile(data []byte) error {
	bookmarkPath, err := pgpassBookmarkPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(bookmarkPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(bookmarkPath, data, 0o600)
}

// handlePgpassLookupRequest resolves the single password entry matching the
// requested host/port/database/username out of the user's .pgpass file —
// see passwords.js's client-side parsePgpassText/findPgpassPassword for why
// only that one entry is ever extracted rather than the whole file being
// handed back: the file can hold credentials for hosts that have nothing to
// do with the connection that's failing, and nothing but the one relevant
// password needs to leave this process.
//
// Where that file comes from, in order:
//  1. A security-scoped bookmark saved from a previous successful pick
//     (readPgpassViaSavedBookmark) — no dialog at all when this works,
//     which is the common case after the first use. Only ever taken as the
//     final answer when it actually contains a matching entry — a bookmark
//     that resolves fine but has nothing for this connection falls through
//     to the dialog below instead of reporting the miss right here (an
//     earlier version of this reported the miss and stopped there, which
//     turned into a dead end the very next launch: once a bookmark exists
//     it always resolves and always "succeeds" at being read, so a real
//     mismatch would report the same error forever with no way to ever see
//     the picker again and correct it).
//  2. pickPgpassFile — a native Open dialog with hidden files visible
//     (.pgpass is a dotfile every OS file panel hides by default, and a
//     bare HTML `<input type="file">` has no attribute that can override
//     that; confirmed against Chromium/WebKit — there isn't one). Reached
//     the first time ever, any time the saved bookmark stops resolving
//     (file moved/deleted, permission revoked, no prior bookmark on this
//     platform at all), and any time it resolves but doesn't answer this
//     particular request. A freshly-picked file gets its own bookmark
//     saved for next time (replacing whatever was remembered before)
//     before it's ever read.
func (a *App) handlePgpassLookupRequest(w http.ResponseWriter, r *http.Request) {
	var req pgpassLookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePgpassLookupError(w, err.Error())
		return
	}

	if passfile, ok := readPgpassViaSavedBookmark(); ok {
		if password := passfile.FindPassword(req.Hostname, req.Port, req.Database, req.Username); password != "" {
			writePgpassLookupJSON(w, pgpassLookupResponse{Password: password})
			return
		}
	}

	path, bookmark, cancelled, err := pickPgpassFile(a.ctx)
	if err != nil {
		writePgpassLookupError(w, err.Error())
		return
	}
	if cancelled {
		writePgpassLookupJSON(w, pgpassLookupResponse{Cancelled: true})
		return
	}
	if bookmark != nil {
		_ = writePgpassBookmarkFile(bookmark)
	}

	passfile, err := pgpassfile.ReadPassfile(path)
	if err != nil {
		writePgpassLookupError(w, "Could not read that file: "+err.Error())
		return
	}
	respondWithPgpassMatch(w, passfile, req)
}

// readPgpassViaSavedBookmark tries the security-scoped bookmark persisted
// from a previous successful pick, if any. ok is false for anything that
// means "no usable saved location right now" — no bookmark file yet,
// corrupt bookmark data, or one that no longer resolves (file moved or
// deleted, access revoked, or simply no bookmark support on this platform,
// see pgpass_bookmark_other.go) — the caller falls back to the Open panel
// in every one of those cases rather than surfacing an error the user
// couldn't act on anyway (they'd just need to pick the file again either
// way).
func readPgpassViaSavedBookmark() (passfile *pgpassfile.Passfile, ok bool) {
	bookmarkPath, err := pgpassBookmarkPath()
	if err != nil {
		return nil, false
	}
	data, err := os.ReadFile(bookmarkPath)
	if err != nil {
		return nil, false
	}
	resolved, err := resolveSecurityScopedBookmark(data)
	if err != nil {
		return nil, false
	}
	defer resolved.Stop()

	passfile, err = pgpassfile.ReadPassfile(resolved.Path)
	if err != nil {
		return nil, false
	}

	if resolved.RefreshedData != nil {
		// Best-effort: a failure here just costs one more (harmless)
		// stale-but-working resolve on the next launch, not a real
		// problem, so its error is deliberately dropped.
		_ = writePgpassBookmarkFile(resolved.RefreshedData)
	}

	return passfile, true
}

func respondWithPgpassMatch(w http.ResponseWriter, passfile *pgpassfile.Passfile, req pgpassLookupRequest) {
	password := passfile.FindPassword(req.Hostname, req.Port, req.Database, req.Username)
	if password == "" {
		writePgpassLookupError(w, "No matching entry found in that .pgpass file for "+
			req.Hostname+":"+req.Port+":"+req.Database+":"+req.Username)
		return
	}
	writePgpassLookupJSON(w, pgpassLookupResponse{Password: password})
}

func writePgpassLookupError(w http.ResponseWriter, msg string) {
	writePgpassLookupJSON(w, pgpassLookupResponse{Error: msg})
}

func writePgpassLookupJSON(w http.ResponseWriter, resp pgpassLookupResponse) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
