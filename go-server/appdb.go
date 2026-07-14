package main

import (
	"database/sql"
	"net/url"
	"os"
	"path/filepath"
	"sync"
)

// appDBPathCache caches the resolved path to OmniDB's own SQLite app
// database for this process's lifetime — HOME_DIR can't change at runtime,
// so there's no reason to recompute it every request. A failed lookup is
// not cached, so a transient failure (e.g. an explicit --homedir that
// doesn't exist yet at the exact moment of a very first request) gets a
// fresh attempt next time instead of being stuck failing forever.
//
// Before Fáze 8b's HOME_DIR work, this asked Django's own
// /internal/appdb_path/ bridge (OmniDB_app/views/internal.py) — Go now
// resolves the same path independently (see homedir.go's resolveHomeDir,
// a direct port of omnidb-server.py's own -d/--homedir/app-mode logic), no
// HTTP round trip or running Django process required at all.
var (
	appDBPathMu  sync.Mutex
	appDBPathVal string
)

func resolveAppDBPath(upstream *url.URL) (string, error) {
	appDBPathMu.Lock()
	defer appDBPathMu.Unlock()
	if appDBPathVal != "" {
		return appDBPathVal, nil
	}

	dir, err := resolveHomeDir(os.Args[1:])
	if err != nil {
		return "", err
	}
	appDBPathVal = filepath.Join(dir, "omnidb.db")
	return appDBPathVal, nil
}

// tempDirInfo mirrors OmniDB_app/views/internal.py's old temp_dir response
// shape — where a Go-side export route should write its output file, and
// the URL prefix static files are served under (settings.PATH, always ""
// — see custom_settings.py). Path stays "" unconditionally now; kept as a
// field rather than removed so export.go's existing v_filename
// construction (tempDir.Path + "/static/temp/" + fileName) doesn't need to
// change.
type tempDirInfo struct {
	TempDir string
	Path    string
}

var (
	tempDirMu  sync.Mutex
	tempDirVal *tempDirInfo
)

// resolveTempDir mirrors resolveAppDBPath's HOME_DIR-based approach —
// before Fáze 8b this asked Django's /internal/temp_dir/ bridge, which
// pointed at Django's own BASE_DIR/OmniDB_app/static/temp (a path that
// only made sense while a Django source tree existed on disk). Go's own
// temp directory instead lives under HOME_DIR, alongside omnidb.db —
// served back to the browser by handleTempFiles (static_assets.go), a
// live filesystem handler mounted at the more specific "/static/temp/"
// prefix (wins over the embedded catch-all "/static/" registration).
func resolveTempDir(upstream *url.URL) (*tempDirInfo, error) {
	tempDirMu.Lock()
	defer tempDirMu.Unlock()
	if tempDirVal != nil {
		return tempDirVal, nil
	}

	dir, err := resolveHomeDir(os.Args[1:])
	if err != nil {
		return nil, err
	}
	tempDirVal = &tempDirInfo{TempDir: filepath.Join(dir, "temp"), Path: ""}
	return tempDirVal, nil
}

// openAppDB opens OmniDB's own SQLite app database (connections, groups,
// snippets, users, ...) — distinct from openSQLiteTarget, which opens a
// *user's saved connection* pointing at some unrelated SQLite file. Reuses
// the same "sqlite" database/sql driver registered by sqlite.go's blank
// import — no need to import modernc.org/sqlite again here.
func openAppDB(upstream *url.URL) (*sql.DB, error) {
	path, err := resolveAppDBPath(upstream)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	if err := bootstrapAppDB(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
