package main

import (
	"sync"
	"testing"
)

// TestLockForTabKeySerializesSameKey guards against the terminal/console
// session-open race fixed in handleTerminalRequest/openOrReuseConsoleSession:
// two concurrent callers for the same (kind, key) must contend on the exact
// same *sync.Mutex instance, not two different ones that would let both
// proceed into the "no live session, open one" branch at once.
func TestLockForTabKeySerializesSameKey(t *testing.T) {
	const n = 50
	var wg sync.WaitGroup
	mus := make([]*sync.Mutex, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			mus[i] = lockForTabKey("terminal", "client-1|tab-1")
		}(i)
	}
	wg.Wait()

	first := mus[0]
	for i, m := range mus {
		if m != first {
			t.Fatalf("lockForTabKey returned a different mutex instance at index %d for the same key", i)
		}
	}
}

// TestLockForTabKeyDistinctKeysAndKinds verifies different keys (and the
// same key under a different session kind) get independent mutexes, so
// unrelated tabs/sessions never contend on each other's lock.
func TestLockForTabKeyDistinctKeysAndKinds(t *testing.T) {
	a := lockForTabKey("terminal", "client-1|tab-1")
	b := lockForTabKey("terminal", "client-1|tab-2")
	c := lockForTabKey("console", "client-1|tab-1")

	if a == b {
		t.Fatal("distinct tab keys shared a mutex")
	}
	if a == c {
		t.Fatal("terminal and console sessions shared a mutex for the same tab id")
	}
}

// TestLockForTabKeyActuallyBlocksConcurrentOpeners simulates the real race:
// two goroutines racing to be "the one that opens a new session" for the
// same key must run their critical sections one at a time, not overlap.
func TestLockForTabKeyActuallyBlocksConcurrentOpeners(t *testing.T) {
	key := "client-2|tab-9"
	var active int32
	var sawOverlap bool
	var mu sync.Mutex // guards sawOverlap/active in this test only

	var wg sync.WaitGroup
	const n = 20
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			l := lockForTabKey("terminal", key)
			l.Lock()
			defer l.Unlock()

			mu.Lock()
			active++
			if active > 1 {
				sawOverlap = true
			}
			mu.Unlock()

			mu.Lock()
			active--
			mu.Unlock()
		}()
	}
	wg.Wait()

	if sawOverlap {
		t.Fatal("two goroutines held the critical section for the same tab key concurrently")
	}
}
