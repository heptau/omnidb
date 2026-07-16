package main

import (
	"context"
	"os/exec"
	"sync"
)

// App struct
type App struct {
	ctx            context.Context
	server         *exec.Cmd
	backendURL     string // "scheme://host:port" of omnidb-go-server, set once ready — see backend.go
	backendMu      sync.Mutex
	saveDialogAddr string // "127.0.0.1:port" of this process's own save-dialog listener — see savedialog.go
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods. The save-dialog listener has to be
// up before startBackend (triggered later by FrontendReady) spawns
// omnidb-go-server, since that's when saveDialogAddr gets handed to it as
// an env var — see savedialog.go and backend.go.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.startSaveDialogServer(); err != nil {
		println("Failed to start save-dialog listener:", err.Error())
	}
}

// FrontendReady is called by main.js once it has registered its
// "backend:log"/"backend:ready" EventsOn listeners — only then do we start
// the backend and begin emitting. Starting it from OnStartup/OnDomReady
// instead raced the frontend: a fast-starting omnidb-go-server can print
// its ready line (and Go can emit "backend:ready") before the webview has
// finished executing main.js's module script and registered a listener,
// silently dropping the event and leaving the window stuck on the loading
// screen forever. This never showed up while Django (slow to start) was the
// backend; Go starts fast enough to lose that race almost every time. A
// method call from JS (rather than a Go-side lifecycle hook) is the only
// ordering both sides can actually rely on.
func (a *App) FrontendReady() {
	go a.startBackend()
}

// shutdown is called when the app is about to terminate. It stops the
// OmniDB server process, mirroring the NW.js shell's
// v_window.on('close', () => process.kill(django.pid)).
func (a *App) shutdown(ctx context.Context) {
	a.stopBackend()
}
