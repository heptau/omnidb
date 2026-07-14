package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// pollingClient mirrors memory_objects.py's per-client entry in
// global_object (id/polling_lock/returning_data_lock/returning_data/
// last_update) — one per logged-in native session, not per browser tab.
// Tab-level routing happens via v_context_code inside each queued message,
// exactly like Django's own design (long_polling.js dispatches each
// returned row by context code, not by which /long_polling/ call it arrived
// on) — so a single shared queue per session is correct, not a
// simplification.
//
// Python's version reuses a single threading.Lock as a "wait for the next
// release()" signal across repeated poll cycles, with a "startup" flag to
// recover a lock left stuck-locked by an abandoned poll cycle (see
// go-backend-migration memory for the full mechanics). Go's request
// context (r.Context(), cancelled the moment the browser disconnects) makes
// that recovery case impossible to get stuck on in the first place — a
// waiter here is always tied to one specific still-open HTTP request — so
// this implementation is deliberately simpler: a mutex-protected slice plus
// a "close channel and replace it" broadcast, the standard Go idiom for a
// condition-variable-style wakeup that also composes with context
// cancellation (sync.Cond doesn't).
type pollingClient struct {
	mu         sync.Mutex
	returning  []map[string]any
	notify     chan struct{}
	lastUpdate time.Time
}

func newPollingClient() *pollingClient {
	return &pollingClient{notify: make(chan struct{}), lastUpdate: time.Now()}
}

// signal wakes every goroutine currently blocked in waitForData. Caller
// must hold c.mu.
func (c *pollingClient) signal() {
	close(c.notify)
	c.notify = make(chan struct{})
}

// waitForData mirrors long_polling()'s acquire-then-drain — blocks until
// there's at least one queued response or the request's own context is
// cancelled (browser navigated away/closed the tab), then returns and
// clears the queue. startup is accepted for wire compatibility with
// long_polling.js's p_startup flag but is otherwise a no-op here — it only
// mattered in Python to unstick a lock from an abandoned poll cycle, a
// failure mode this design doesn't have (see the package comment).
func (c *pollingClient) waitForData(ctx context.Context, startup bool) []map[string]any {
	c.mu.Lock()
	for len(c.returning) == 0 {
		ch := c.notify
		c.mu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			return nil
		}
		c.mu.Lock()
	}
	data := c.returning
	c.returning = nil
	c.mu.Unlock()
	return data
}

var (
	pollingClientsMu sync.Mutex
	pollingClients   = map[string]*pollingClient{}
)

// getPollingClient mirrors get_client_object — returns the existing entry
// or creates one lazily, same as Python's try/except KeyError fallback.
func getPollingClient(clientID string) *pollingClient {
	pollingClientsMu.Lock()
	defer pollingClientsMu.Unlock()
	c, ok := pollingClients[clientID]
	if !ok {
		c = newPollingClient()
		pollingClients[clientID] = c
	}
	return c
}

// removePollingClient mirrors clear_client's effective intent for this
// process's own state — see handleClearClient. Safe to call for an unknown
// clientID (no-op).
func removePollingClient(clientID string) {
	pollingClientsMu.Lock()
	defer pollingClientsMu.Unlock()
	delete(pollingClients, clientID)
}

// nativeClientIDFromCookieHeader extracts the Go-native session cookie from
// a raw "Cookie" header value — the same parsing trick resolveIdentity uses
// (whoami.go), needed here because queueNativeResponse's callers only carry
// the header string forward (originally so it could be re-forwarded to
// Django; now used purely to recover the client id).
func nativeClientIDFromCookieHeader(cookieHeader string) string {
	req := &http.Request{Header: http.Header{}}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
	}
	c, err := req.Cookie(nativeSessionCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// queueNativeResponse mirrors polling.py's queue_response — appends a
// response for a client's queue and wakes any /long_polling/ call currently
// blocked waiting for it. Replaces the old queueResponseOnDjango bridge
// (see go-backend-migration memory): every technology's query/console/
// edit-data/export/terminal result delivery already ran through that single
// choke point, so switching it to an in-process queue needed no changes at
// any of those call sites beyond dropping the now-unused upstream argument.
func queueNativeResponse(cookieHeader string, payload map[string]any) {
	clientID := nativeClientIDFromCookieHeader(cookieHeader)
	if clientID == "" {
		return
	}
	c := getPollingClient(clientID)
	c.mu.Lock()
	c.returning = append(c.returning, payload)
	c.lastUpdate = time.Now()
	c.signal()
	c.mu.Unlock()
}

type longPollingRequest struct {
	PStartup bool `json:"p_startup"`
}

// handleLongPolling mirrors polling.py's long_polling — the browser's
// real-time result delivery loop (long_polling.js's call_polling),
// natively in Go with zero Django involvement (see native_polling.go's
// package comment and handleCreateRequest's comment on why every request
// type that could still be running server-side already delivers through
// this same queue).
func handleLongPolling() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clientID := nativeSessionCookieValue(r)
		if clientID == "" {
			writeEnvelope(w, "", true, 1)
			return
		}

		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req longPollingRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		rows := getPollingClient(clientID).waitForData(r.Context(), req.PStartup)
		if rows == nil {
			rows = []map[string]any{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"returning_rows": rows})
	}
}

// handleClientKeepAlive mirrors polling.py's client_keep_alive — the 60s
// heartbeat ping long_polling.js sends so an idle-but-still-open session
// isn't reaped. Nothing in this Go process currently reaps idle
// pollingClient entries by age (unlike Python's cleanup_thread), so this is
// mostly wire-compatibility today, but recording lastUpdate here keeps the
// door open for adding that later without touching the frontend.
func handleClientKeepAlive() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if clientID := nativeSessionCookieValue(r); clientID != "" {
			c := getPollingClient(clientID)
			c.mu.Lock()
			c.lastUpdate = time.Now()
			c.mu.Unlock()
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
	}
}
