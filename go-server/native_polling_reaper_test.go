package main

import (
	"testing"
	"time"
)

// A client the browser stopped talking to must be reaped even while a
// background producer keeps queueing responses for it, and one with a parked
// poll or a recent keep-alive must not.
func TestReapStalePollingClients(t *testing.T) {
	old := time.Now().Add(-2 * time.Hour)
	mk := func(id string, last time.Time, waiters int) {
		c := getPollingClient(id)
		c.mu.Lock()
		c.lastUpdate = last
		c.waiters = waiters
		c.mu.Unlock()
	}
	mk("reap-gone", old, 0)
	mk("reap-parked", old, 1)
	mk("reap-live", time.Now(), 0)
	t.Cleanup(func() {
		for _, id := range []string{"reap-gone", "reap-parked", "reap-live"} {
			removePollingClient(id)
		}
	})

	// Queueing a response is not a sign of life.
	queueNativeResponse(nativeSessionCookieName+"=reap-gone", map[string]any{"v_code": 1})

	reaped := reapStalePollingClients(time.Now().Add(-time.Hour))
	found := false
	for _, id := range reaped {
		if id == "reap-parked" || id == "reap-live" {
			t.Errorf("reaped a live client: %s", id)
		}
		if id == "reap-gone" {
			found = true
		}
	}
	if !found {
		t.Errorf("abandoned client not reaped (got %v)", reaped)
	}
}
