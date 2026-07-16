package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// goServerPathEnvOverride lets developers point at a local omnidb-go-server
// build without needing the full Makefile packaging pipeline.
const goServerPathEnvOverride = "OMNIDB_GO_SERVER_PATH"

// resolveGoServerPath locates the omnidb-go-server binary (see go-server/)
// — the entire backend now, no Django/Python process involved anywhere
// (Fáze 8c). Ships as a plain sibling of this shell binary on every
// platform (no Resources-folder indirection needed).
func resolveGoServerPath() (string, error) {
	if p := os.Getenv(goServerPathEnvOverride); p != "" {
		return p, nil
	}

	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable path: %w", err)
	}

	name := "omnidb-go-server"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(filepath.Dir(exePath), name), nil
}

// startBackend spawns the omnidb-go-server process and streams its output
// back to the frontend as "backend:log" events, emitting "backend:ready"
// with the login URL once it reports it is listening (a stdout line
// starting with "http").
func (a *App) startBackend() {
	goServerPath, err := resolveGoServerPath()
	if err != nil {
		wailsruntime.EventsEmit(a.ctx, "backend:log", fmt.Sprintf("Failed to locate OmniDB server: %v", err))
		return
	}

	// Forward any args the shell itself was launched with (e.g. `open
	// OmniDB.app --args -d /some/throwaway/dir` for isolated test runs) on
	// top of the required -A. Without this, a caller-supplied -d is
	// silently dropped and the server falls back to the real ~/.omnidb.
	args := append([]string{"-A"}, os.Args[1:]...)
	cmd := exec.Command(goServerPath, args...)

	// Tells go-server/export_save_dialog.go where to relay a native
	// save-dialog request — see savedialog.go's comment on why that hop
	// exists. saveDialogAddr is already set by the time this runs: startup
	// (an OnStartup hook, always first) starts that listener synchronously,
	// well before FrontendReady (triggered later, by JS) calls this.
	if a.saveDialogAddr != "" {
		cmd.Env = append(os.Environ(), "OMNIDB_SAVE_DIALOG_URL=http://"+a.saveDialogAddr+"/save-file")
	}

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
// carries a one-time login token (see go-server/main.go's run()) that must
// not be displayed, only navigated to.
func (a *App) streamServerOutput(pipe io.Reader, watchForReadyURL bool) {
	scanner := bufio.NewScanner(pipe)
	for scanner.Scan() {
		line := scanner.Text()

		if watchForReadyURL && strings.HasPrefix(line, "http") {
			if u, err := url.Parse(line); err == nil {
				a.backendMu.Lock()
				a.backendURL = u.Scheme + "://" + u.Host
				a.backendMu.Unlock()
			}
			wailsruntime.EventsEmit(a.ctx, "backend:log", "Opening OmniDB...")
			wailsruntime.EventsEmit(a.ctx, "backend:ready", line)
			continue
		}

		wailsruntime.EventsEmit(a.ctx, "backend:log", line)
	}
}

// stopBackend asks omnidb-go-server to shut down gracefully over loopback
// HTTP (see go-server/main.go's handleShutdown) and waits for it to exit,
// falling back to Process.Kill() only if that request fails or the process
// doesn't exit within a few seconds — gives the HTTP server a chance to
// finish in-flight requests and close its listener cleanly instead of
// always going straight to an uncatchable SIGKILL.
func (a *App) stopBackend() {
	if a.server == nil || a.server.Process == nil {
		return
	}

	a.backendMu.Lock()
	backendURL := a.backendURL
	a.backendMu.Unlock()

	if backendURL != "" {
		client := http.Client{Timeout: 2 * time.Second}
		if _, err := client.Post(backendURL+"/internal/shutdown/", "text/plain", nil); err == nil {
			done := make(chan struct{})
			go func() {
				_, _ = a.server.Process.Wait()
				close(done)
			}()
			select {
			case <-done:
				return
			case <-time.After(5 * time.Second):
				// Fall through to the force-kill below — omnidb-go-server
				// accepted the request but didn't exit in time.
			}
		}
	}

	_ = a.server.Process.Kill()
}
