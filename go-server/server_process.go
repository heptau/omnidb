package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// serverDirEnvOverride lets developers point at a local omnidb-server build
// (or a stub script) without needing the full Makefile packaging pipeline.
// Mirrors the same override wails-app/backend.go used before this proxy
// existed.
const serverDirEnvOverride = "OMNIDB_SERVER_DIR"

// resolveServerDir mirrors wails-app/backend.go's resolveServerDir: the
// Python server ships as a sibling resource next to whichever binary spawns
// it. This proxy now occupies the spot wails-app/backend.go used to spawn
// omnidb-server directly from, so the same bundle-relative path applies.
func resolveServerDir() (string, error) {
	if dir := os.Getenv(serverDirEnvOverride); dir != "" {
		return dir, nil
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	exeDir := filepath.Dir(exePath)

	if runtime.GOOS == "darwin" {
		return filepath.Join(exeDir, "..", "Resources", "omnidb-server"), nil
	}
	return filepath.Join(exeDir, "omnidb-server"), nil
}

func serverExecutableName() string {
	if runtime.GOOS == "windows" {
		return "omnidb-server.exe"
	}
	return "omnidb-server"
}

// buildServerEnv replicates wails-app/backend.go's buildServerEnv: PATH is
// extended so the bundled binary finds system tools, and on macOS the
// bundled psycopg2 dylibs are made discoverable.
func buildServerEnv(serverDir string) []string {
	env := map[string]string{}
	for _, kv := range os.Environ() {
		if i := strings.IndexByte(kv, '='); i >= 0 {
			env[kv[:i]] = kv[i+1:]
		}
	}

	internalDir := filepath.Join(serverDir, "_internal")

	prependPathEnv(env, "PATH", []string{
		serverDir,
		internalDir,
		"/usr/local/bin",
		"/opt/homebrew/bin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	})

	if runtime.GOOS == "darwin" {
		dylibDirs := []string{internalDir, filepath.Join(internalDir, "psycopg2", ".dylibs")}
		prependPathEnv(env, "DYLD_LIBRARY_PATH", dylibDirs)
		prependPathEnv(env, "DYLD_FALLBACK_LIBRARY_PATH", dylibDirs)
	}

	result := make([]string, 0, len(env))
	for k, v := range env {
		result = append(result, k+"="+v)
	}
	return result
}

func prependPathEnv(env map[string]string, name string, values []string) {
	parts := make([]string, 0, len(values)+1)
	for _, v := range values {
		if v != "" {
			parts = append(parts, v)
		}
	}
	if existing := env[name]; existing != "" {
		parts = append(parts, existing)
	}
	env[name] = strings.Join(parts, string(os.PathListSeparator))
}
