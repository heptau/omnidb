package main

import "testing"

// TestReapActiveDatabaseMapRemovesOnlyDeadSessions guards against the
// unbounded-growth bug fixed alongside nativeSessions/pollingClients'
// reapers: activeDatabaseMap previously had no cleanup at all.
func TestReapActiveDatabaseMapRemovesOnlyDeadSessions(t *testing.T) {
	activeDatabaseMu.Lock()
	activeDatabaseMap["live-session|tab1"] = "otherdb"
	activeDatabaseMap["dead-session|tab2"] = "otherdb2"
	activeDatabaseMu.Unlock()
	t.Cleanup(func() {
		activeDatabaseMu.Lock()
		delete(activeDatabaseMap, "live-session|tab1")
		delete(activeDatabaseMap, "dead-session|tab2")
		activeDatabaseMu.Unlock()
	})

	reapActiveDatabaseMap(map[string]struct{}{"live-session": {}})

	activeDatabaseMu.Lock()
	_, liveStillThere := activeDatabaseMap["live-session|tab1"]
	_, deadStillThere := activeDatabaseMap["dead-session|tab2"]
	activeDatabaseMu.Unlock()

	if !liveStillThere {
		t.Fatal("reapActiveDatabaseMap removed an entry belonging to a still-live session")
	}
	if deadStillThere {
		t.Fatal("reapActiveDatabaseMap left an entry belonging to a dead session")
	}
}

// TestReapPasswordMemoryMapRemovesOnlyDeadSessions is the same guard for
// passwordMemoryMap, where a leaked entry is worse than a generic memory
// leak — it holds a plaintext password.
func TestReapPasswordMemoryMapRemovesOnlyDeadSessions(t *testing.T) {
	passwordMemoryMu.Lock()
	passwordMemoryMap["live-session|conn1"] = passwordMemory{password: "hunter2"}
	passwordMemoryMap["dead-session|conn2"] = passwordMemory{password: "hunter3"}
	passwordMemoryMu.Unlock()
	t.Cleanup(func() {
		passwordMemoryMu.Lock()
		delete(passwordMemoryMap, "live-session|conn1")
		delete(passwordMemoryMap, "dead-session|conn2")
		passwordMemoryMu.Unlock()
	})

	reapPasswordMemoryMap(map[string]struct{}{"live-session": {}})

	passwordMemoryMu.Lock()
	_, liveStillThere := passwordMemoryMap["live-session|conn1"]
	_, deadStillThere := passwordMemoryMap["dead-session|conn2"]
	passwordMemoryMu.Unlock()

	if !liveStillThere {
		t.Fatal("reapPasswordMemoryMap removed an entry belonging to a still-live session")
	}
	if deadStillThere {
		t.Fatal("reapPasswordMemoryMap left an entry belonging to a dead session, holding a plaintext password indefinitely")
	}
}
