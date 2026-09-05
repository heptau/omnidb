package main

import (
	"context"
	"errors"
	"strconv"
	"sync"

	"github.com/nakagami/firebirdsql"
)

// firebirdIgnorableUnsubscribeError reports whether err from
// (*firebirdsql.Subscription).Unsubscribe is the benign
// "already closed" race documented on resubscribeLocked below, rather than a
// real failure to tear down.
func firebirdIgnorableUnsubscribeError(err error) bool {
	return errors.Is(err, firebirdsql.ErrFbEventClosed)
}

// notifyFirebirdBackend is the Firebird half of the Notify panel. Firebird's
// asynchronous mechanism is POST_EVENT 'name' (issued from a trigger or
// stored procedure) paired with the client-side event-alerting API the
// driver wraps as FbEvent/Subscription -- a genuine server push, like
// Postgres's LISTEN/NOTIFY, not a poll loop like Oracle's DBMS_ALERT.WAITANY.
//
// The driver's Subscribe call is callback-based and fixes the whole set of
// event names for the lifetime of one *firebirdsql.Subscription -- there is
// no "add/remove one name from a live subscription" call. So listen/unlisten
// both go through resubscribe: tear down the current Subscription (if any)
// and open a fresh one covering the new full channels set. That costs one
// extra round trip per change, not a correctness compromise -- Firebird's own
// wire protocol re-registers the whole event list on every que_events call
// regardless (see the vendored driver's Subscription.queueEvents, called
// after every delivered event to re-arm).
//
// Unlike notifyPostgresBackend, waitForMessage here never touches the
// network connection itself -- it only ever reads from the buffered `events`
// channel that the driver's callback goroutine feeds. So there is no
// interrupt-an-in-flight-wait dance: listen/unlisten/close can safely run
// while a reader is parked in waitForMessage. mu still guards `sub` and
// `channels` because a request goroutine (listen/unlisten, via the REST
// handlers) and the teardown path (close, via tab close) must not race to
// replace/close the same *Subscription -- the same "genuine async push needs
// a mutex around shared subscription state" shape notifyPostgresBackend has,
// just without its extra interrupt machinery.
type notifyFirebirdBackend struct {
	mu       sync.Mutex
	fbEvent  *firebirdsql.FbEvent
	channels map[string]bool
	sub      *firebirdsql.Subscription

	// events carries one message per delivered Firebird event from the
	// driver's callback (invoked on its own goroutine per event, see
	// firebirdsql's Subscription.doEventCounts) to waitForMessage. Buffered
	// so a short burst of events doesn't stall the callback goroutine while
	// runNotifyReader is busy queuing the previous one; done lets a callback
	// still in flight when close() runs give up on that send instead of
	// leaking a goroutine blocked on a channel nobody drains anymore.
	events chan firebirdNotifyMessage
	done   chan struct{}
}

// notifyFirebirdEventBuffer bounds the events channel above. There is no
// principled derivation for this number -- it only needs to absorb a short
// burst between two runNotifyReader loop iterations, and the reader's own
// backpressure cutoff (notifyQueueBackpressureLimit, notify_session.go)
// is what actually protects against a sustained flood.
const notifyFirebirdEventBuffer = 64

// firebirdNotifyMessage is one delivered event, already turned into the
// (channel, payload) shape notifyBackend.waitForMessage returns.
type firebirdNotifyMessage struct {
	channel string
	payload string
}

// firebirdEventNameMaxBytes caps a POST_EVENT/Subscribe event name. This is
// not a guess: github.com/nakagami/firebirdsql's remoteEvent.go hardcodes
// maxEventNameLength = 255 and rejects (ErrWrongLengthEvent) any longer name
// before it ever reaches the wire -- the Event Parameter Block the classic
// isc_event_block/que_events API (and this pure-Go reimplementation of it)
// builds stores each event name preceded by a single length byte, so 255 is
// a hard structural ceiling, not a version-specific server setting. Rejecting
// it here, at /add_notify_channel/, gives an immediate error instead of
// deferring the same failure to whenever a live session next tries to
// (re)subscribe.
const firebirdEventNameMaxBytes = 255

func newFirebirdNotifySession(info *ConnectionInfo) (*notifySession, error) {
	fbEvent, err := firebirdsql.NewFBEvent(firebirdDSN(info))
	if err != nil {
		return nil, err
	}
	return &notifySession{
		backend: &notifyFirebirdBackend{
			fbEvent:  fbEvent,
			channels: map[string]bool{},
			events:   make(chan firebirdNotifyMessage, notifyFirebirdEventBuffer),
			done:     make(chan struct{}),
		},
		technology: info.Technology,
		channels:   map[string]bool{},
	}, nil
}

func (b *notifyFirebirdBackend) listen(ctx context.Context, channel string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.channels[channel] {
		return nil
	}
	b.channels[channel] = true
	if err := b.resubscribeLocked(); err != nil {
		delete(b.channels, channel)
		return err
	}
	return nil
}

func (b *notifyFirebirdBackend) unlisten(ctx context.Context, channel string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.channels[channel] {
		return nil
	}
	delete(b.channels, channel)
	return b.resubscribeLocked()
}

// resubscribeLocked rebuilds the driver Subscription from the current
// channels set. Called with mu held. See the type doc comment for why this
// has to tear down and recreate rather than adjust in place.
//
// b.sub.Unsubscribe() below almost always returns firebirdsql.ErrFbEventClosed
// rather than nil, even on a perfectly healthy teardown -- confirmed against
// a live Firebird 4 server, not just read off the driver source. Unsubscribe
// itself first closes the event manager's aux socket, which asynchronously
// wakes that connection's own background reader goroutine with a read error;
// that goroutine races to call the Subscription's closeWithError concurrently
// with Unsubscribe's own later s.Close() call, and it usually wins, so
// Unsubscribe's final s.Close() observes "already closed" and returns
// ErrFbEventClosed even though both connections did get closed correctly.
// Treating that as a hard failure (as an earlier version of this function
// did) means bailing out here on almost every call -- before ever reaching
// the Subscribe call below -- so listen/unlisten after the very first one
// would silently stop delivering events for the whole channel set, not just
// fail to add/remove the one channel being changed.
func (b *notifyFirebirdBackend) resubscribeLocked() error {
	if b.sub != nil {
		err := b.sub.Unsubscribe()
		b.sub = nil
		if err != nil && !firebirdIgnorableUnsubscribeError(err) {
			return err
		}
	}
	if len(b.channels) == 0 {
		return nil
	}

	names := make([]string, 0, len(b.channels))
	for name := range b.channels {
		names = append(names, name)
	}

	sub, err := b.fbEvent.Subscribe(names, b.deliver)
	if err != nil {
		return err
	}
	b.sub = sub
	return nil
}

// deliver is the driver's EventHandler callback -- invoked on its own
// goroutine per fired event (see firebirdsql's Subscription.doEventCounts),
// never on the goroutine that's driving the subscription's own network read
// loop, so blocking here does not stall event delivery for other names.
//
// Firebird's native event payload is only a name plus how many times it
// fired since the subscription was last (re)armed -- there is no arbitrary
// string payload like Postgres NOTIFY's or Oracle DBMS_ALERT's message. The
// fire count is the only signal available, so it's synthesized as the
// payload string; a channel that fires as a pure signal (no data attached,
// the common case for POST_EVENT) will just show "1" here.
func (b *notifyFirebirdBackend) deliver(e firebirdsql.Event) {
	msg := firebirdNotifyMessage{channel: e.Name, payload: strconv.Itoa(e.Count)}
	select {
	case b.events <- msg:
	case <-b.done:
	}
}

func (b *notifyFirebirdBackend) waitForMessage(ctx context.Context) (string, string, error) {
	select {
	case <-ctx.Done():
		return "", "", ctx.Err()
	case msg, ok := <-b.events:
		if !ok {
			return "", "", errors.New("firebird notify: event channel closed")
		}
		return msg.channel, msg.payload, nil
	}
}

func (b *notifyFirebirdBackend) close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	close(b.done)

	var subErr error
	if b.sub != nil {
		// See resubscribeLocked's comment: Unsubscribe races its own
		// background reader goroutine and routinely returns
		// ErrFbEventClosed on a perfectly clean teardown, so that specific
		// error is not a real close failure worth surfacing (or logging,
		// per closeNotifySessionValue's caller) on every single tab close.
		if err := b.sub.Unsubscribe(); err != nil && !firebirdIgnorableUnsubscribeError(err) {
			subErr = err
		}
		b.sub = nil
	}
	fbErr := b.fbEvent.Close()
	if subErr != nil {
		return subErr
	}
	return fbErr
}
