package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// serverDirEnvOverride lets developers point at a local omnidb-server build
// (or a stub script) without needing the full Makefile packaging pipeline.
// Production builds never set this; resolveServerDir falls back to the
// bundle-relative path below.
const serverDirEnvOverride = "OMNIDB_SERVER_DIR"

// resolveServerDir mirrors deploy/app/index.html's
// path.join(global.__dirname, 'omnidb-server'): the server ships as a
// sibling resource next to the shell. On a packaged macOS .app the Go
// binary lives in Contents/MacOS, while resources (as copied by the
// Makefile today for app.nw) belong in Contents/Resources.
func resolveServerDir() (string, error) {
	if dir := os.Getenv(serverDirEnvOverride); dir != "" {
		return dir, nil
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable path: %w", err)
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

// buildServerEnv replicates buildServerSpawnOptions() from the NW.js shell:
// PATH is extended so the bundled binary finds system tools, and on macOS
// the bundled psycopg2 dylibs are made discoverable.
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

// startBackend spawns the omnidb-server process and streams its output back
// to the frontend as "backend:log" events, emitting "backend:ready" with the
// login URL once the server reports it is listening (a stdout line starting
// with "http" — see OmniDB/omnidb-server.py's DjangoApplication.run).
func (a *App) startBackend() {
	serverDir, err := resolveServerDir()
	if err != nil {
		wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to locate OmniDB server: %v", err))
		return
	}

	cmd := exec.Command(filepath.Join(serverDir, serverExecutableName()), "-A")
	cmd.Dir = serverDir
	cmd.Env = buildServerEnv(serverDir)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to attach OmniDB server stdout: %v", err))
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to attach OmniDB server stderr: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to start OmniDB server: %v", err))
		return
	}
	a.server = cmd

	go a.streamServerOutput(stderr, false)
	go a.streamServerOutput(stdout, true)
}

// streamServerOutput forwards the server's output to the frontend as
// "backend:log" events. Once the ready line (starting with "http") appears,
// it's emitted as "backend:ready" instead of being logged verbatim — it
// carries a one-time login token (see omnidb-server.py) that must not be
// displayed, only navigated to.
func (a *App) streamServerOutput(pipe io.Reader, watchForReadyURL bool) {
	scanner := bufio.NewScanner(pipe)
	for scanner.Scan() {
		line := scanner.Text()

		if watchForReadyURL && strings.HasPrefix(line, "http") {
			wailsruntime.EventsEmit(a.ctx, "backend:log", "Opening OmniDB...")
			wailsruntime.EventsEmit(a.ctx, "backend:ready", line)
			continue
		}

		wailsruntime.EventsEmit(a.ctx, "backend:log", line)
	}
}

// stopBackend terminates the omnidb-server process. Best-effort, matching
// the NW.js shell's try/catch around process.kill(django.pid).
func (a *App) stopBackend() {
	if a.server != nil && a.server.Process != nil {
		_ = a.server.Process.Kill()
	}
}
