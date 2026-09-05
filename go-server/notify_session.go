package main

import (
	"context"
	"errors"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// notifyBackend is the technology-specific half of a Notify session — it
// differs between Postgres (a dedicated pgx.Conn with a genuine push
// WaitForNotification) and Oracle (a pinned database/sql.Conn polled through
// DBMS_ALERT.WAITANY). Everything above this interface (bookkeeping,
// teardown, backpressure) is shared.
type notifyBackend interface {
	listen(ctx context.Context, channel string) error
	unlisten(ctx context.Context, channel string) error
	waitForMessage(ctx context.Context) (channel, payload string, err error)
	close() error
}

// notifySession holds one Notify tab's live subscription across separate HTTP
// requests, the same shape consoleSession/terminalSession use — the panel's
// REST handlers (add/delete/pause/resume) reach into the live session so a
// change takes effect immediately, without the user re-opening the tab.
type notifySession struct {
	mu         sync.Mutex
	backend    notifyBackend
	technology string
	channels   map[string]bool

	// ctx/cancel bound the whole session, not one request: cancelling is what
	// unblocks the reader goroutine parked in waitForMessage. Both are
	// assigned once, in openOrReuseNotifySession, before the session is
	// published — so every later reader is guaranteed to see them.
	ctx    context.Context
	cancel context.CancelFunc
}

var notifySessions sync.Map // map[string]*notifySession, keyed by cursorKey(clientID, tabID)

// notifySupportedTechnology reports whether an engine has a NOTIFY-style
// asynchronous message mechanism this panel can use. MySQL/MariaDB/MS SQL
// Server/SQLite deliberately have none — the panel shows an explicit
// "not supported" message for those rather than hiding them.
func notifySupportedTechnology(technology string) bool {
	return technology == "postgresql" || isOracle(technology)
}

// openOrReuseNotifySession returns this tab's already-live session, or opens
// a fresh one via newSession. The returned bool says whether the session was
// just opened, so the caller knows whether it still needs to start the reader
// goroutine (started exactly once per session, see runNotifyReader).
//
// Guarded by the shared per-tab open lock (lockForTabKey, terminal.go) for the
// same reason console/terminal are: two near-simultaneous requests for the
// same brand-new tab would otherwise both see "no live session", both open a
// database connection, and the loser's connection would leak forever since
// closeNotifySession can only reach whichever one won the final Store.
func openOrReuseNotifySession(clientID, tabID string, info *ConnectionInfo, newSession func(*ConnectionInfo) (*notifySession, error)) (*notifySession, bool, error) {
	key := cursorKey(clientID, tabID)
	mu := lockForTabKey("notify", key)
	mu.Lock()
	defer mu.Unlock()
	if v, ok := notifySessions.Load(key); ok {
		return v.(*notifySession), false, nil
	}

	sess, err := newSession(info)
	if err != nil {
		return nil, false, err
	}
	sess.ctx, sess.cancel = context.WithCancel(context.Background())
	notifySessions.Store(key, sess)
	return sess, true, nil
}

// runNotifyStart opens (or reuses) this tab's session, re-syncs it with the
// channels persisted for the connection, and — only for a session it just
// opened — starts the single long-lived reader goroutine for it.
func runNotifyStart(upstream *url.URL, cookie, clientID string, q notifyRequestData, contextCode int, info *ConnectionInfo) {
	newSession := newPostgresNotifySession
	if isOracle(info.Technology) {
		newSession = newOracleNotifySession
	}

	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		return
	}
	appdb, err := openAppDB(upstream)
	if err != nil {
		queueNotifyError(cookie, contextCode, err)
		return
	}
	channels, err := fetchNotifyChannels(appdb, int64(who.UserID), q.databaseIndexInt())
	appdb.Close()
	if err != nil {
		queueNotifyError(cookie, contextCode, err)
		return
	}

	sess, fresh, err := openOrReuseNotifySession(clientID, q.VTabID, info, newSession)
	if err != nil {
		queueNotifyError(cookie, contextCode, err)
		return
	}

	startNotifyListening(sess.ctx, sess, channels)
	if fresh {
		go runNotifyReader(sess.ctx, cookie, clientID, q.VTabID, contextCode, sess)
	}
}

func queueNotifyError(cookie string, contextCode int, err error) {
	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseMessageException,
		"v_context_code": contextCode,
		"v_error":        true,
		"v_data":         err.Error(),
	})
}

// startNotifyListening subscribes the session to every persisted channel that
// isn't paused, and unsubscribes it from the paused ones — so it also works as
// a "re-sync the session with the stored state" call, not only as first-time
// setup.
func startNotifyListening(ctx context.Context, sess *notifySession, channels []notifyChannel) {
	for _, c := range channels {
		var err error
		if c.Active {
			err = sess.listen(ctx, c.Name)
		} else {
			err = sess.unlisten(ctx, c.Name)
		}
		if err != nil {
			log.Printf("notify session (%s): channel %q: %v", sess.technology, c.Name, err)
		}
	}
}

// listen subscribes the session's backend to a channel, recording it so a
// later re-listen is a no-op. Oracle's REGISTER and Postgres's LISTEN are both
// idempotent server-side; the map exists so the panel can tell what a live
// session is actually subscribed to.
func (s *notifySession) listen(ctx context.Context, channel string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.backend.listen(ctx, channel); err != nil {
		return err
	}
	if s.channels == nil {
		s.channels = map[string]bool{}
	}
	s.channels[channel] = true
	return nil
}

func (s *notifySession) unlisten(ctx context.Context, channel string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.backend.unlisten(ctx, channel); err != nil {
		return err
	}
	delete(s.channels, channel)
	return nil
}

// liveNotifySession returns the running session for a tab, if any — used by
// the REST handlers to apply an add/delete/pause/resume to the live
// subscription right away. Safe for tabs that never opened one.
func liveNotifySession(clientID, tabID string) (*notifySession, bool) {
	v, ok := notifySessions.Load(cursorKey(clientID, tabID))
	if !ok {
		return nil, false
	}
	return v.(*notifySession), true
}

// closeNotifySession releases a tab's live subscription, if any. Safe to call
// for tabs that never opened one (same contract as closeCursor/
// closeConsoleSession/closeTerminalSession). Cancelling the session context
// unblocks whichever goroutine is currently parked in waitForMessage.
func closeNotifySession(clientID, tabID string) {
	v, ok := notifySessions.LoadAndDelete(cursorKey(clientID, tabID))
	if !ok {
		return
	}
	closeNotifySessionValue(v.(*notifySession))
}

func closeNotifySessionsForClient(clientID string) {
	prefix := clientID + "|"
	var keys []string
	notifySessions.Range(func(key, _ any) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
		return true
	})
	for _, k := range keys {
		if v, ok := notifySessions.LoadAndDelete(k); ok {
			closeNotifySessionValue(v.(*notifySession))
		}
	}
}

func closeNotifySessionValue(sess *notifySession) {
	// Cancel first, without holding sess.mu: the reader has to be out of
	// waitForMessage (and off the connection) before backend.close can take
	// it, and a listen/unlisten still in flight holds sess.mu meanwhile.
	if sess.cancel != nil {
		sess.cancel()
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()
	if err := sess.backend.close(); err != nil {
		log.Printf("notify session (%s): close: %v", sess.technology, err)
	}
}

// notifyQueueBackpressureLimit caps how far behind the browser's long-polling
// queue may fall before a Notify session gives up on it — see
// runNotifyReader.
const notifyQueueBackpressureLimit = 500

// runNotifyReader pushes every incoming notification straight into the
// client's long-polling queue, for as long as the session stays open. Like
// runTerminalReader (and unlike every request-scoped goroutine here) it's
// started exactly once per session and lives for the whole lifetime of the
// tab, so it never removes its context.
//
// The backpressure check exists because this is the only producer in the
// application that can emit without any user action: pollingClient.returning
// is one shared, unbounded queue per client, and if the browser stops draining
// it (backgrounded tab, wedged JS, network drop) a chatty NOTIFY channel would
// grow it without limit. Rather than block (which would stall the database
// connection and, on Oracle, hold the pinned session), the reader stops
// producing entirely, tells the frontend why, and closes the session; restart
// is manual from the panel.
func runNotifyReader(ctx context.Context, cookie, clientID, tabID string, contextCode int, sess *notifySession) {
	for {
		channel, payload, err := sess.backend.waitForMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			// A genuine backend failure (connection dropped, server hung up).
			// Drop the session as well as the reader, the same way
			// runTerminalReader does — leaving it in notifySessions would make
			// openOrReuseNotifySession hand a later restart the same dead
			// session with nothing reading from it.
			log.Printf("notify reader (%s): %v", sess.technology, err)
			closeNotifySession(clientID, tabID)
			return
		}

		if pollingQueueLength(cookie) >= notifyQueueBackpressureLimit {
			queueNativeResponse(cookie, map[string]any{
				"v_code":         responseNotifyMessage,
				"v_context_code": contextCode,
				"v_error":        false,
				"v_data": map[string]any{
					"v_stopped": true,
					"v_reason":  "backpressure",
					"v_message": "Listening was stopped automatically because incoming messages were not being consumed fast enough.",
				},
			})
			closeNotifySession(clientID, tabID)
			return
		}

		queueNativeResponse(cookie, map[string]any{
			"v_code":         responseNotifyMessage,
			"v_context_code": contextCode,
			"v_error":        false,
			"v_data": map[string]any{
				"v_channel":   channel,
				"v_payload":   payload,
				"v_timestamp": time.Now().Format(time.RFC3339),
			},
		})
	}
}

// --- PostgreSQL backend ---

// notifyPostgresBackend holds a dedicated native pgx connection rather than a
// database/sql one: WaitForNotification is a pgx-only API with no
// database/sql equivalent, and it's designed for exactly this — one connection
// held open for the lifetime of the subscription. postgresqlDSN already
// produces a "postgres://" URL that pgx.Connect accepts unchanged.
//
// Unlike database/sql's *sql.Conn (which serializes concurrent use itself —
// see the Oracle backend, which relies on that), a *pgx.Conn is NOT safe for
// concurrent use, and here two goroutines genuinely do want it at once: the
// reader parked in WaitForNotification, and a request goroutine running
// LISTEN/UNLISTEN for an add/pause/resume. Hence connMu plus the interrupt
// machinery below.
type notifyPostgresBackend struct {
	connMu sync.Mutex
	conn   *pgx.Conn

	interruptMu sync.Mutex
	interrupt   context.CancelFunc // cancels the wait currently in progress, if any
}

// notifyPostgresWaitWindow bounds a single WaitForNotification call. Cancelling
// its context is what lets a LISTEN/UNLISTEN take the connection (pgx handles
// this by setting a net deadline, so the connection stays usable afterwards
// and no notification is lost — an unread one is still buffered server-side
// until the next wait). The window is a backstop only: exec interrupts the
// wait directly, and this bounds the case where Go's mutex handoff lets the
// reader back in first.
const notifyPostgresWaitWindow = 2 * time.Second

func newPostgresNotifySession(info *ConnectionInfo) (*notifySession, error) {
	conn, err := pgx.Connect(context.Background(), postgresqlDSN(info))
	if err != nil {
		return nil, err
	}
	return &notifySession{
		backend:    &notifyPostgresBackend{conn: conn},
		technology: info.Technology,
		channels:   map[string]bool{},
	}, nil
}

// exec runs one statement on the shared connection, first breaking the reader
// out of its wait so the connection is actually free to take.
func (b *notifyPostgresBackend) exec(ctx context.Context, stmt string) error {
	b.interruptMu.Lock()
	if b.interrupt != nil {
		b.interrupt()
	}
	b.interruptMu.Unlock()

	b.connMu.Lock()
	defer b.connMu.Unlock()
	_, err := b.conn.Exec(ctx, stmt)
	return err
}

// listen/unlisten build the statement text by hand because LISTEN/UNLISTEN
// take an identifier, not a value — a bind parameter is a syntax error there.
// The channel name is double-quoted (and its own quotes doubled) so it's
// interpreted as a single literal identifier whatever it contains.
func (b *notifyPostgresBackend) listen(ctx context.Context, channel string) error {
	return b.exec(ctx, `LISTEN `+quotePostgresIdentifierDoubleQuoted(channel))
}

func (b *notifyPostgresBackend) unlisten(ctx context.Context, channel string) error {
	return b.exec(ctx, `UNLISTEN `+quotePostgresIdentifierDoubleQuoted(channel))
}

func (b *notifyPostgresBackend) waitForMessage(ctx context.Context) (string, string, error) {
	for {
		if err := ctx.Err(); err != nil {
			return "", "", err
		}

		waitCtx, cancel := context.WithTimeout(ctx, notifyPostgresWaitWindow)
		b.interruptMu.Lock()
		b.interrupt = cancel
		b.interruptMu.Unlock()

		b.connMu.Lock()
		n, err := b.conn.WaitForNotification(waitCtx)
		b.connMu.Unlock()

		b.interruptMu.Lock()
		b.interrupt = nil
		b.interruptMu.Unlock()
		cancel()

		if err != nil {
			// The window expired, or a listen/unlisten interrupted us to get
			// at the connection — neither is a failure, just resume waiting.
			// Anything else (server hung up, connection broken) is real and
			// ends the reader.
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				if ctx.Err() != nil {
					return "", "", ctx.Err()
				}
				continue
			}
			return "", "", err
		}
		return n.Channel, n.Payload, nil
	}
}

func (b *notifyPostgresBackend) close() error {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	return b.conn.Close(context.Background())
}
