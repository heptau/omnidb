package main

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// pwdTimeoutTotal mirrors settings.py's PWD_TIMEOUT_TOTAL — how long a
// password verified via renew_password stays remembered for a given
// browser session before a native route would need it re-verified.
//
// Python's Session.DatabaseReachPasswordTimeout also has a shorter
// "PWD_TIMEOUT_REFRESH" (300s) that silently slides prompt_timeout forward
// on any activity well before the full 30-minute window elapses, so an
// actively-used connection practically never hits the real re-test path.
// This Go port doesn't reproduce that refresh step: recording
// lastSuccessAt once at renew_password time and checking "still within
// pwdTimeoutTotal of that" already gives the same practical outcome for an
// active session (no re-verification needed), it just doesn't keep
// sliding the window forward on every request — a harmless simplification
// (worst case: an active session re-verifies once every 30 minutes instead
// of never), not a behavior users would notice.
const pwdTimeoutTotal = 1800 * time.Second

type passwordMemory struct {
	password      string
	lastSuccessAt time.Time
}

var (
	passwordMemoryMu  sync.Mutex
	passwordMemoryMap = map[string]passwordMemory{}
)

func passwordMemoryKey(sessionKey, connID string) string {
	return sessionKey + "|" + connID
}

// reapPasswordMemoryMap removes every entry whose session key is no longer
// in liveSessionKeys — called from startSessionReaper's hourly sweep
// (native_session.go). Unlike nativeSessions/pollingClients, this map had
// no cleanup at all — worse than a generic memory leak, since a stale
// entry here holds a plaintext database password indefinitely, well past
// pwdTimeoutTotal (recalledPassword already refuses to hand it back once
// stale, but the value itself just sat in memory forever). Piggybacks on
// nativeSessions' own expiry rather than tracking a second timeout: once a
// session is gone, recalledPassword can never be reached with that
// sessionKey again anyway.
func reapPasswordMemoryMap(liveSessionKeys map[string]struct{}) {
	passwordMemoryMu.Lock()
	defer passwordMemoryMu.Unlock()
	for k := range passwordMemoryMap {
		sessionKey, _, _ := strings.Cut(k, "|")
		if _, ok := liveSessionKeys[sessionKey]; !ok {
			delete(passwordMemoryMap, k)
		}
	}
}

// rememberPassword mirrors what a successful renew_password does to
// Session.v_databases[i]['database'].v_connection.v_password in Python —
// remembers a verified password for this browser session + connection, so
// later requests in the same session don't need the stored (blank)
// password to keep failing.
func rememberPassword(sessionKey, connID, password string) {
	if sessionKey == "" || connID == "" {
		return
	}
	passwordMemoryMu.Lock()
	defer passwordMemoryMu.Unlock()
	passwordMemoryMap[passwordMemoryKey(sessionKey, connID)] = passwordMemory{password: password, lastSuccessAt: time.Now()}
}

// recalledPassword returns a remembered password for this session+connection
// if it's still within pwdTimeoutTotal of when it was last verified.
func recalledPassword(sessionKey, connID string) (string, bool) {
	if sessionKey == "" || connID == "" {
		return "", false
	}
	passwordMemoryMu.Lock()
	defer passwordMemoryMu.Unlock()
	mem, ok := passwordMemoryMap[passwordMemoryKey(sessionKey, connID)]
	if !ok || time.Since(mem.lastSuccessAt) > pwdTimeoutTotal {
		return "", false
	}
	return mem.password, true
}

// applyRememberedPassword mirrors Python's `prompt_password = conn.password
// == ”` gate — only a connection saved with NO stored password ever
// consults the remembered-password cache; a connection with a real stored
// password always uses it unconditionally, matching every already-ported
// route's existing behavior exactly.
func applyRememberedPassword(r *http.Request, connID string, info *ConnectionInfo) {
	if info.Password != "" {
		return
	}
	if pw, ok := recalledPassword(nativeSessionCookieValue(r), connID); ok {
		info.Password = pw
	}
}
