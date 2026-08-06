package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"
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
	conn       *sql.Conn // pinned connection for the autocommit path, see startCursor
	rows       *sql.Rows
	cols       []string
	colTypes   []string // DatabaseTypeName for each column
	pending    []string // one already-fetched row held back to detect "more data" without losing it
	autocommit bool

	// cancel aborts whatever QueryContext/ExecContext/rows.Next() call is
	// currently in flight for this cursor (mode 0's initial run, or a later
	// mode-1/mode-2 fetch — all share the same context, since Next() has no
	// context parameter of its own and relies on the one QueryContext was
	// first called with). Set once at cursor creation and never reassigned,
	// so it's safe to read from another goroutine without holding mu — which
	// is the whole point: a goroutine blocked inside a slow query holds mu
	// for the entire call, so anything that needed mu to reach this field
	// would deadlock behind the very query it's trying to interrupt.
	cancel context.CancelFunc
}

var queryCursors sync.Map // map[string]*queryCursor, keyed by cursorKey(clientID, tabID)

// cancelToken wraps a CancelFunc so it can live in a sync.Map that's cleaned
// up with CompareAndDelete — func values aren't comparable in Go (comparing
// two non-nil funcs panics), but pointers to this struct are, which is what
// CompareAndDelete needs to tell "the entry I stored" apart from "a newer
// entry a racing call already replaced it with".
type cancelToken struct{ cancel context.CancelFunc }

// queryCancels holds cancel tokens for a mode-0 query that's still inside its
// initial QueryContext call, before startCursor has anything to publish to
// queryCursors — closing over just the CancelFunc (not c.mu) means a Cancel
// arriving mid-run can interrupt it immediately instead of finding no cursor
// to close and silently doing nothing while the query keeps running on the
// database. Entries are removed as soon as startCursor has either published
// a cursor (whose own c.cancel field takes over from here) or failed.
var queryCancels sync.Map // map[string]*cancelToken, keyed by cursorKey(clientID, tabID)

func cursorKey(clientID, tabID string) string {
	return clientID + "|" + tabID
}

// cancelKeyedQuery aborts whatever's running for this tab right now, whether
// that's a mode-0 query still inside startCursor (via queryCancels) or an
// already-published cursor mid-fetch (via its own c.cancel) — called before
// any attempt to lock a cursor's mu, since the goroutine actually doing the
// work holds that lock for the full duration of the blocking DB call.
func cancelKeyedQuery(key string) {
	if v, ok := queryCancels.Load(key); ok {
		v.(*cancelToken).cancel()
	}
	if v, ok := queryCursors.Load(key); ok {
		if c := v.(*queryCursor); c.cancel != nil {
			c.cancel()
		}
	}
}

// closeCursor releases a tab's held-open connection/result set, if any.
// Safe to call for tabs Go never touched.
func closeCursor(clientID, tabID string) {
	key := cursorKey(clientID, tabID)
	cancelKeyedQuery(key)
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
	if c.cancel != nil {
		c.cancel()
	}
	if c.rows != nil {
		c.rows.Close()
	}
	if c.tx != nil {
		c.tx.Rollback()
	}
	if c.conn != nil {
		c.conn.Close()
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
		cancelKeyedQuery(k)
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

	// Postgres (via pgx's extended query protocol) rejects more than one
	// command in a single prepared statement outright ("cannot insert
	// multiple commands into a prepared statement", SQLSTATE 42601), and
	// running a semicolon-separated script as one driver call is dodgy for
	// every other engine too. So a multi-statement editor run (e.g.
	// "select 1; select 2;") is split the same way the console tab already
	// splits scripts (see splitSQLStatements), every statement but the last
	// runs via Exec, and only the last one's result set becomes this
	// cursor's grid — matching the single-grid-per-run UI the frontend
	// actually has (see go-backend-migration memory).
	statements := splitSQLStatements(sqlText)
	if len(statements) == 0 {
		statements = []string{sqlText}
	}
	last := statements[len(statements)-1]

	// Published to queryCancels before the blocking QueryContext call below,
	// not after — a slow first run (e.g. a SELECT with no WHERE/no index) is
	// exactly the case where a Cancel needs to interrupt something that
	// isn't a queryCursor yet. See queryCancels' own comment.
	key := cursorKey(clientID, tabID)
	ctx, cancel := context.WithCancel(context.Background())
	tok := &cancelToken{cancel: cancel}
	queryCancels.Store(key, tok)
	defer queryCancels.CompareAndDelete(key, tok)

	var tx *sql.Tx
	var conn *sql.Conn
	var rows *sql.Rows
	var err error
	if autocommit {
		// Pinned to one physical connection (rather than plain db.Exec/
		// db.Query, which may each hop to a different pooled connection)
		// so session state a later statement might depend on — temp
		// tables, SET, search_path — survives from one statement to the
		// next, same as running them one after another in a real client.
		conn, err = db.Conn(ctx)
		if err == nil {
			for _, stmt := range statements[:len(statements)-1] {
				if _, err = conn.ExecContext(ctx, stmt); err != nil {
					break
				}
			}
			if err == nil {
				// codeql[go/sql-injection]: last is the user's own typed
				// query-editor SQL, same trust boundary already accepted for
				// this function's sibling alerts (#340-#343, non-autocommit
				// branch below included) — this is a SQL query tool, running
				// whatever the authenticated owner of the connection typed is
				// the feature, not a privilege boundary crossing.
				rows, err = conn.QueryContext(ctx, last)
			}
		}
	} else {
		tx, err = db.BeginTx(ctx, nil)
		if err == nil {
			for _, stmt := range statements[:len(statements)-1] {
				if _, err = tx.ExecContext(ctx, stmt); err != nil {
					break
				}
			}
			if err == nil {
				rows, err = tx.QueryContext(ctx, last)
			}
		}
	}
	if err != nil {
		if tx != nil {
			tx.Rollback()
		}
		if conn != nil {
			conn.Close()
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
		if conn != nil {
			conn.Close()
		}
		db.Close()
		return nil, err
	}

	colTypes := make([]string, len(cols))
	if rawTypes, err := rows.ColumnTypes(); err == nil {
		for i, t := range rawTypes {
			colTypes[i] = t.DatabaseTypeName()
		}
	}

	c := &queryCursor{db: db, tx: tx, conn: conn, rows: rows, cols: cols, colTypes: colTypes, autocommit: autocommit, cancel: cancel}
	queryCursors.Store(key, c)
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
			return "true"
		}
		return "false"
	case time.Time:
		return x.Format("2006-01-02 15:04:05.999999-07:00")
	default:
		return fmt.Sprintf("%v", x)
	}
}
