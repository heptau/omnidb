package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
)

// staticAssetsFS embeds OmniDB_app/static/OmniDB_app verbatim (see
// go-backend-migration memory for how this tree was copied in) — Fáze 8b's
// static-asset takeover. Deliberately excludes two subtrees that were never
// part of Django's own STATIC_ROOT serving in the first place:
// OmniDB_app/static/plugins (the plugin system was dropped project-wide,
// see the plan file's plugin note) and OmniDB_app/static/temp (a runtime
// scratch dir for CSV/XLSX export, not static content — served instead by
// handleTempFiles below, a live filesystem handler, since new files can't
// be added to a compiled-in embed.FS at runtime). Also excludes the two
// .scss theme source files (never fetched by URL, confirmed by grepping
// every template/JS file for ".scss" — only the compiled .css output is
// served) and stray .DS_Store files.
//
// Embedding directly into the Go binary (rather than adding yet another
// /internal/... bridge to ask Django where STATIC_ROOT lives on disk) means
// static asset serving has zero runtime dependency on Django/CherryPy even
// existing — a real step toward Fáze 8c, not just a mechanical reshuffle.
//
//go:embed all:static_assets
var staticAssetsFS embed.FS

// handleStaticAssets mirrors CherryPy's own tools.staticdir mount
// (settings.STATIC_URL = "/static/"), including its 24h-ish Expires
// behavior — safe here for the same reason it was safe there (see commit
// 776a7a1e): every asset URL carries a "?v<staticCacheBust>" query string
// that changes on every process restart (see appdb_workspace_handlers.go's
// staticCacheBust), so a long Cache-Control can't serve genuinely stale
// content across a restart, only skip refetching within one.
func handleStaticAssets() http.Handler {
	sub, err := fs.Sub(staticAssetsFS, "static_assets")
	if err != nil {
		log.Fatalf("static_assets: %v", err)
	}
	fileServer := http.FileServerFS(sub)
	return http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		fileServer.ServeHTTP(w, r)
	}))
}

// handleTempFiles serves export.go's generated CSV/XLSX/... files — a real
// (non-embedded) filesystem directory, since files are written here at
// runtime after this process has already started (see resolveTempDir in
// appdb.go). Registered in main.go at the more specific "/static/temp/"
// prefix, which Go's ServeMux prefers over the embedded catch-all
// "/static/" registration automatically — no ordering dependency between
// the two mux.Handle calls. No Cache-Control override here: each exported
// file has a unique, timestamp-based name (see export.go), so there's
// nothing to ever go stale.
func handleTempFiles(dir string) http.Handler {
	prefix := "/static/temp/"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Exported files are named from a low-entropy unix timestamp (see
		// export.go) and this directory is otherwise unauthenticated, so
		// without this check anyone who can reach this listener at all —
		// trivial in server mode (-H), or any other local user/process in
		// desktop mode — could download another user's just-exported query
		// results by guessing/polling the name. Requiring a valid session
		// closes that off; every other sensitive route in this file already
		// gates on either loopback-only or an authenticated identity.
		who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		if !strings.HasPrefix(r.URL.Path, prefix) {
			http.NotFound(w, r)
			return
		}
		fileName := strings.TrimPrefix(r.URL.Path, prefix)
		fileName = strings.TrimLeft(fileName, "/")
		filePath := filepath.Join(dir, fileName)
		// filepath.Rel + explicit ".."-prefix rejection, not
		// strings.HasPrefix(filePath, dir) — a bare prefix check without a
		// trailing separator is the classic sibling-directory escape (e.g.
		// dir "temp" also matches a resolved path under a sibling
		// "temp-secret" or "temp2" directory). Same pattern already used
		// correctly next door in export_save_dialog.go.
		rel, err := filepath.Rel(dir, filePath)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Disposition", "attachment")
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeFile(w, r, filePath)
	})
}
