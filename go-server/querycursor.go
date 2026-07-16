package main

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"
)

// queryCursor holds one query tab's live result set between HTTP requests —
// mode 0 (run) opens it, mode 1 (fetch more) continues reading from it. This
// mirrors what Django keeps alive on tab_object['omnidatabase'] for the
// lifetime of a query tab, just scoped to Go's own native-engine queries.
//
// tx is non-nil whenever autocommit is off (Python's default: an explicit
// transaction the user must COMMIT/ROLLBACK via the UI, same as running
// against a real psql/mysql client with autocommit disabled) — Go's
// database/sql has no implicit transaction the way some DB-API drivers do,
// so mode 0 has to explicitly db.Begin() to get equivalent semantics.
// Without this, every statement run through Go's native query path would
// commit itself immediately regardless of what the user's autocommit
// setting says, which is a real behavior difference from the Python
// original, not just a cosmetic one.
type queryCursor struct {
	mu         sync.Mutex
	db         *sql.DB
	tx         *sql.Tx
	rows       *sql.Rows
	cols       []string
	pending    []string // one already-fetched row held back to detect "more data" without losing it
	autocommit bool
}

var queryCursors sync.Map // map[string]*queryCursor, keyed by cursorKey(clientID, tabID)

func cursorKey(clientID, tabID string) string {
	return clientID + "|" + tabID
}

// closeCursor releases a tab's held-open connection/result set, if any.
// Safe to call for tabs Go never touched.
func closeCursor(clientID, tabID string) {
	key := cursorKey(clientID, tabID)
	v, ok := queryCursors.LoadAndDelete(key)
	if !ok {
		return
	}
	c := v.(*queryCursor)
	c.mu.Lock()
	defer c.mu.Unlock()
	closeCursorLocked(c)
}

// closeCursorLocked releases a cursor's rows/transaction/connection. An
// uncommitted transaction is rolled back — same as closing a psql session
// with uncommitted changes; abandoning a tab shouldn't silently commit
// whatever was left in flight, and it releases any locks the transaction
// was holding. Safe to call on an already-committed/rolled-back tx (Go's
// sql.Tx.Rollback() is a documented no-op/ErrTxDone in that case, which
// this ignores). Caller must hold c.mu.
func closeCursorLocked(c *queryCursor) {
	if c.rows != nil {
		c.rows.Close()
	}
	if c.tx != nil {
		c.tx.Rollback()
	}
	if c.db != nil {
		c.db.Close()
	}
}

// closeCursorsForClient releases every cursor a client still holds open —
// used on /clear_client/ (page unload/reconnect) so an abandoned mid-page
// query doesn't leak an open connection (or an uncommitted transaction's
// locks) indefinitely.
func closeCursorsForClient(clientID string) {
	prefix := clientID + "|"
	var keys []string
	queryCursors.Range(func(key, _ any) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
		return true
	})
	for _, k := range keys {
		if v, ok := queryCursors.LoadAndDelete(k); ok {
			c := v.(*queryCursor)
			c.mu.Lock()
			closeCursorLocked(c)
			c.mu.Unlock()
		}
	}
}

// startCursor opens a fresh query, replacing (and closing) any previous
// cursor held for this tab — mirrors mode 0 always starting clean.
// autocommit mirrors the frontend's autocommit toggle (Python's
// `v_database.v_connection.v_autocommit = v_autocommit`): when true, the
// query runs directly on db (each statement commits itself immediately,
// same as Go's normal database/sql behavior); when false, it runs inside
// an explicit db.Begin() transaction that stays open until a later mode-3
// (commit) or mode-4 (rollback) request — see commitCursor/rollbackCursor.
func startCursor(clientID, tabID string, db *sql.DB, sqlText string, autocommit bool) (*queryCursor, error) {
	closeCursor(clientID, tabID)

	var tx *sql.Tx
	var rows *sql.Rows
	var err error
	if autocommit {
		rows, err = db.Query(sqlText)
	} else {
		tx, err = db.Begin()
		if err != nil {
			db.Close()
			return nil, err
		}
		rows, err = tx.Query(sqlText)
	}
	if err != nil {
		if tx != nil {
			tx.Rollback()
		}
		db.Close()
		return nil, err
	}
	cols, err := rows.Columns()
	if err != nil {
		rows.Close()
		if tx != nil {
			tx.Rollback()
		}
		db.Close()
		return nil, err
	}

	c := &queryCursor{db: db, tx: tx, rows: rows, cols: cols, autocommit: autocommit}
	queryCursors.Store(cursorKey(clientID, tabID), c)
	return c, nil
}

// continueCursor looks up an already-open cursor for mode 1 (fetch more) and
// returns it with the mutex held. The caller must call c.mu.Unlock() after
// using the cursor. This prevents a concurrent closeCursor (LoadAndDelete +
// rows.Close) from closing the underlying sql.Rows between the map lookup
// and the first rows.Next().
func continueCursor(clientID, tabID string) (*queryCursor, bool) {
	key := cursorKey(clientID, tabID)
	v, ok := queryCursors.Load(key)
	if !ok {
		return nil, false
	}
	c := v.(*queryCursor)
	c.mu.Lock()
	// Re-check: closeCursor may have deleted between Load and Lock.
	v, ok = queryCursors.Load(key)
	if !ok {
		c.mu.Unlock()
		return nil, false
	}
	c = v.(*queryCursor)
	return c, true
}

// commitCursor mirrors mode 3 (COMMIT) — found=false means there's no
// Go-held cursor for this tab (autocommit was on, so there's nothing to
// commit, or this tab's connection isn't Go-native), which the caller
// treats as "nothing to do here, let Django's own thread_query handle it
// like before."
func commitCursor(clientID, tabID string) (found bool, err error) {
	key := cursorKey(clientID, tabID)
	v, ok := queryCursors.LoadAndDelete(key)
	if !ok {
		return false, nil
	}
	c := v.(*queryCursor)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.rows != nil {
		c.rows.Close()
	}
	if c.tx != nil {
		err = c.tx.Commit()
	}
	if c.db != nil {
		c.db.Close()
	}
	return true, err
}

// rollbackCursor mirrors mode 4 (ROLLBACK) — same shape as commitCursor.
func rollbackCursor(clientID, tabID string) (found bool, err error) {
	key := cursorKey(clientID, tabID)
	v, ok := queryCursors.LoadAndDelete(key)
	if !ok {
		return false, nil
	}
	c := v.(*queryCursor)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.rows != nil {
		c.rows.Close()
	}
	if c.tx != nil {
		err = c.tx.Rollback()
	}
	if c.db != nil {
		c.db.Close()
	}
	return true, err
}

// fetchBlock reads up to blockSize rows, returning lastBlock=true once the
// result set is exhausted. It peeks one row past the block to tell whether
// more data remains, buffering that row in c.pending so the next call (or a
// later mode-1 request) picks it up first instead of losing it.
func (c *queryCursor) fetchBlock(blockSize int) (rowsOut [][]string, lastBlock bool, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.fetchBlockLocked(blockSize)
}

// fetchBlockLocked is fetchBlock's inner body, callable while c.mu is already
// held. Used by continueCursorFetchBlock to avoid a TOCTOU race with
// closeCursor (LoadAndDelete + rows.Close) between the map lookup and the
// first rows.Next().
func (c *queryCursor) fetchBlockLocked(blockSize int) (rowsOut [][]string, lastBlock bool, err error) {
	out := make([][]string, 0, blockSize)
	if c.pending != nil {
		out = append(out, c.pending)
		c.pending = nil
	}

	for len(out) < blockSize {
		if !c.rows.Next() {
			return out, true, c.rows.Err()
		}
		row, err := scanRowAsStrings(c.rows, len(c.cols))
		if err != nil {
			return nil, false, err
		}
		out = append(out, row)
	}

	if c.rows.Next() {
		row, err := scanRowAsStrings(c.rows, len(c.cols))
		if err != nil {
			return nil, false, err
		}
		c.pending = row
		return out, false, nil
	}
	return out, true, c.rows.Err()
}

func scanRowAsStrings(rows *sql.Rows, numCols int) ([]string, error) {
	values := make([]any, numCols)
	ptrs := make([]any, numCols)
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}

	out := make([]string, numCols)
	for i, v := range values {
		out[i] = formatSQLValue(v)
	}
	return out, nil
}

// formatSQLValue mirrors how the existing Python DataTable/DB-API layer
// ends up serializing values into the JSON grid payload — everything
// becomes a display string, NULL becomes "" (there's no separate "is this
// null" flag in the wire format, matching the Python side).
func formatSQLValue(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case []byte:
		return string(x)
	case string:
		return x
	case int64:
		return fmt.Sprintf("%d", x)
	case float64:
		return fmt.Sprintf("%g", x)
	case bool:
		if x {
			return "1"
		}
		return "0"
	default:
		return fmt.Sprintf("%v", x)
	}
}
