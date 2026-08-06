package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakeSlowConn simulates a query that never returns on its own — standing in
// for a real "SELECT with no WHERE/no index" against a big table, without
// needing an actual slow database in a unit test. QueryContext blocks until
// either the test's unblock channel closes (simulating the query finally
// finishing) or ctx is canceled (simulating a Cancel click) — whichever
// happens first, exactly like a real driver honoring context cancellation.
type fakeSlowConn struct {
	unblock chan struct{}
}

func (c *fakeSlowConn) Prepare(query string) (driver.Stmt, error) {
	return nil, errors.New("fakeSlowConn: Prepare not supported")
}
func (c *fakeSlowConn) Close() error { return nil }
func (c *fakeSlowConn) Begin() (driver.Tx, error) {
	return nil, errors.New("fakeSlowConn: Begin not supported")
}

func (c *fakeSlowConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.unblock:
		return nil, errors.New("fakeSlowConn: query finished, no rows to give")
	}
}

type fakeSlowDriver struct{}

var (
	fakeSlowConnsMu sync.Mutex
	fakeSlowConns   = map[string]chan struct{}{}
)

func registerFakeSlowConn(dsn string, unblock chan struct{}) {
	fakeSlowConnsMu.Lock()
	defer fakeSlowConnsMu.Unlock()
	fakeSlowConns[dsn] = unblock
}

func (d *fakeSlowDriver) Open(dsn string) (driver.Conn, error) {
	fakeSlowConnsMu.Lock()
	unblock, ok := fakeSlowConns[dsn]
	fakeSlowConnsMu.Unlock()
	if !ok {
		return nil, errors.New("fakeSlowConn: unregistered dsn " + dsn)
	}
	return &fakeSlowConn{unblock: unblock}, nil
}

func init() {
	sql.Register("fakeslow", &fakeSlowDriver{})
}

// TestCloseCursorInterruptsInFlightQuery is a regression test for the bug
// report that Cancel doesn't actually stop a long-running query on the
// server — clicking Cancel while startCursor's initial QueryContext call is
// still blocked used to be a complete no-op: the cursor isn't published to
// queryCursors until after QueryContext returns, so closeCursor found
// nothing to close and the query kept running untouched. It must now
// interrupt that in-flight call via queryCancels instead of hanging until
// the slow query finishes on its own.
func TestCloseCursorInterruptsInFlightQuery(t *testing.T) {
	dsn := "cancel-test-in-flight"
	unblock := make(chan struct{})
	defer close(unblock) // don't leak the goroutine if the test fails before canceling
	registerFakeSlowConn(dsn, unblock)

	db, err := sql.Open("fakeslow", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}

	const clientID = "test-client-cancel-in-flight"
	const tabID = "test-tab-cancel-in-flight"

	done := make(chan error, 1)
	started := make(chan struct{})
	go func() {
		close(started)
		_, err := startCursor(clientID, tabID, db, "select 1", true)
		done <- err
	}()

	<-started
	// Give startCursor a moment to reach conn.QueryContext and register
	// itself in queryCancels before we try to cancel it — otherwise the
	// test itself would be racing the very thing it's testing.
	time.Sleep(50 * time.Millisecond)

	closeCursor(clientID, tabID)

	select {
	case err := <-done:
		if err == nil {
			t.Fatalf("startCursor returned nil error — expected the canceled context's error")
		}
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("startCursor returned %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("startCursor did not return within 2s of closeCursor — Cancel did not interrupt the in-flight query, reproducing the reported hang")
	}
}
