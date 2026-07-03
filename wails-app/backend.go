package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
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

func (a *App) streamServerOutput(pipe io.Reader, watchForReadyURL bool) {
	scanner := bufio.NewScanner(pipe)
	for scanner.Scan() {
		line := scanner.Text()

		// The ready line carries a one-time login token (see omnidb-server.py)
		// so it must never be echoed into the visible log, only used to
		// navigate the iframe — matching the NW.js shell's behaviour.
		if watchForReadyURL && strings.HasPrefix(line, "http") {
			readyURL := line
			if proxied, err := a.startFrameProxy(line); err != nil {
				wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to start local frame proxy, opening server URL directly: %v", err))
			} else {
				readyURL = proxied
			}
			wailsruntime.EventsEmit(a.ctx, "backend:log", "Opening OmniDB...")
			wailsruntime.EventsEmit(a.ctx, "backend:ready", readyURL)
			continue
		}

		wailsruntime.EventsEmit(a.ctx, "backend:log", line)
	}
}

// startFrameProxy runs a local reverse proxy in front of the Django server
// and returns the equivalent of backendURL rewritten to go through it.
//
// Django's default XFrameOptionsMiddleware sends "X-Frame-Options: DENY" on
// every response, which makes browsers refuse to render the page inside an
// <iframe> (verified against the real omnidb-server: the login page loaded
// fine directly but stayed blank when framed). NW.js's <webview> tag never
// hit this because guest content in a <webview> is a top-level browsing
// context to Chromium, not a "frame" the header applies to — Wails has no
// such element, so an <iframe> is the closest equivalent and needs this
// workaround. Stripping the header here (not in Django) keeps the backend
// code untouched; it is a no-op from a security standpoint since the proxy
// only listens on 127.0.0.1 and is only ever loaded by our own window.
func (a *App) startFrameProxy(backendURL string) (string, error) {
	target, err := url.Parse(backendURL)
	if err != nil {
		return "", fmt.Errorf("parse backend URL: %w", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", fmt.Errorf("open frame proxy listener: %w", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(&url.URL{Scheme: target.Scheme, Host: target.Host})
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("X-Frame-Options")
		return nil
	}

	server := &http.Server{Handler: proxy}
	a.frameProxy = server
	go server.Serve(listener)

	proxied := *target
	proxied.Host = listener.Addr().String()
	return proxied.String(), nil
}

// stopFrameProxy shuts down the local reverse proxy started by
// startFrameProxy, if any.
func (a *App) stopFrameProxy() {
	if a.frameProxy != nil {
		_ = a.frameProxy.Close()
	}
}

// stopBackend terminates the omnidb-server process. Best-effort, matching
// the NW.js shell's try/catch around process.kill(django.pid).
func (a *App) stopBackend() {
	if a.server != nil && a.server.Process != nil {
		_ = a.server.Process.Kill()
	}
}
