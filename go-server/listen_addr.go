package main

import (
	"os"
	"strings"
)

// hostFlag/portFlag mirror omnidb-server.py's -H/--host and -p/--port
// options — restored here so "OmniDB Server" (network-accessible, as
// opposed to the desktop app) is actually reachable from another machine.
// Between Fáze 0 and this point, go-server always bound to 127.0.0.1 with
// no way to change it; that was never a deliberate decision to drop server
// mode, just this migration's focus on desktop-app parity first.
func hostFlag(args []string) string {
	for i, a := range args {
		if a == "-H" || a == "--host" {
			if i+1 < len(args) {
				return args[i+1]
			}
		}
		if v, ok := strings.CutPrefix(a, "--host="); ok {
			return v
		}
	}
	return ""
}

func portFlag(args []string) string {
	for i, a := range args {
		if a == "-p" || a == "--port" {
			if i+1 < len(args) {
				return args[i+1]
			}
		}
		if v, ok := strings.CutPrefix(a, "--port="); ok {
			return v
		}
	}
	return ""
}

// listenAddr computes the "host:port" net.Listen address for this process.
//
// Host: -H/--host is only honored outside app mode. App mode (-A/--app) is
// the desktop shell's own use — wails-app/backend.go always spawns it
// without -H — and always binds loopback-only regardless of what's passed,
// on purpose: /internal/shutdown/ (see handleShutdown) has no auth check at
// all, relying entirely on "nothing untrusted can reach this listener" being
// true. That's still true for a bare server-mode listener bound wide open
// (the shutdown route is simply not registered then, see run()), but app
// mode's desktop auto-login token (native_login.go's handleSignInAutomatic)
// is also only ever meant to be reachable locally — so app mode forces
// loopback rather than trusting a caller not to combine -A with -H by
// mistake.
//
// Port: an explicit -p/--port wins; failing that, listenPortEnv (dev
// convenience, see its own comment) or an OS-chosen free port.
func listenAddr(args []string) string {
	host := "127.0.0.1"
	if !isAppMode(args) {
		if h := hostFlag(args); h != "" {
			host = h
		}
	}

	port := "0" // OS-chosen free port by default
	if p := os.Getenv(listenPortEnv); p != "" {
		port = p
	}
	if p := portFlag(args); p != "" {
		port = p
	}

	return host + ":" + port
}

// isLoopbackHost reports whether listenAddr's resolved host is loopback-only
// — used to decide whether /internal/shutdown/ is safe to register at all
// (see run()'s mux setup and handleShutdown's comment).
func isLoopbackHost(host string) bool {
	switch host {
	case "127.0.0.1", "localhost", "::1", "[::1]":
		return true
	default:
		return false
	}
}
