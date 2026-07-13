package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
)

// appDBPathCache caches the resolved path to Django's own SQLite app
// database (see OmniDB_app/views/internal.py's appdb_path) for this
// process's lifetime — the path can't change while Django keeps running, so
// there's no reason to ask again every request. A failed lookup is not
// cached, so a request arriving before Django has finished starting up gets
// a fresh attempt next time instead of being stuck failing forever.
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

	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s://%s/internal/appdb_path/", upstream.Scheme, upstream.Host), nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call appdb_path: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("appdb_path: unexpected status %d", resp.StatusCode)
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("decode appdb_path response: %w", err)
	}
	appDBPathVal = body.Path
	return appDBPathVal, nil
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
	return db, nil
}
