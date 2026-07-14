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

// tempDirInfo mirrors OmniDB_app/views/internal.py's temp_dir response —
// where a Go-side export route should write its output file, and the URL
// prefix Django serves its own static files under (so the response's
// v_filename lines up with what Django's existing static-file serving,
// still reached via the "/" reverse-proxy catch-all, already handles).
type tempDirInfo struct {
	TempDir string
	Path    string
}

var (
	tempDirMu  sync.Mutex
	tempDirVal *tempDirInfo
)

func resolveTempDir(upstream *url.URL) (*tempDirInfo, error) {
	tempDirMu.Lock()
	defer tempDirMu.Unlock()
	if tempDirVal != nil {
		return tempDirVal, nil
	}

	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s://%s/internal/temp_dir/", upstream.Scheme, upstream.Host), nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call temp_dir: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("temp_dir: unexpected status %d", resp.StatusCode)
	}

	var body struct {
		TempDir string `json:"temp_dir"`
		Path    string `json:"path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decode temp_dir response: %w", err)
	}
	tempDirVal = &tempDirInfo{TempDir: body.TempDir, Path: body.Path}
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
	return db, nil
}
