package main

import (
	"context"
	"os/exec"
)

// App struct
type App struct {
	ctx    context.Context
	server *exec.Cmd
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	go a.startBackend()
}

// shutdown is called when the app is about to terminate. It stops the
// OmniDB server process, mirroring the NW.js shell's
// v_window.on('close', () => process.kill(django.pid)).
func (a *App) shutdown(ctx context.Context) {
	a.stopBackend()
}
