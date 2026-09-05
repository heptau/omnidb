package main

import (
	"context"
	"database/sql"

	go_ora "github.com/sijms/go-ora/v2"
)

// notifyOracleBackend is the DBMS_ALERT half of the Notify panel — Oracle's
// closest equivalent to Postgres LISTEN/NOTIFY.
//
// conn is pinned (taken once via db.Conn and never returned to the pool) for
// a correctness reason, not a performance one: DBMS_ALERT's registration state
// lives on the Oracle *session*, so REGISTER, REMOVE and WAITANY must all run
// on the same one. Handing any of them back to the pool would silently
// register on one session and wait on another, and nothing would ever arrive.
//
// That also means listen/unlisten (called from a request goroutine) and
// waitForMessage (called from the reader goroutine) contend for a single
// session. Oracle can't multiplex two statements on one session anyway, and
// database/sql serializes concurrent use of an *sql.Conn for us, so a REGISTER
// issued in the middle of a running WAITANY simply waits for it — up to
// notifyOracleWaitSeconds. That's expected, not a hang.
type notifyOracleBackend struct {
	db   *sql.DB
	conn *sql.Conn
}

// notifyOracleWaitSeconds is the WAITANY timeout. DBMS_ALERT has no push
// model, so the wait has to be re-issued in a loop; a short-ish window keeps
// context cancellation (tab close) and a pending REGISTER responsive without
// making the loop busy.
const notifyOracleWaitSeconds = 15

func newOracleNotifySession(info *ConnectionInfo) (*notifySession, error) {
	db, err := openOracleTarget(info)
	if err != nil {
		return nil, err
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		db.Close()
		return nil, err
	}
	return &notifySession{
		backend:    &notifyOracleBackend{db: db, conn: conn},
		technology: info.Technology,
		channels:   map[string]bool{},
	}, nil
}

func (b *notifyOracleBackend) listen(ctx context.Context, channel string) error {
	_, err := b.conn.ExecContext(ctx, "begin dbms_alert.register(:1); end;", channel)
	return err
}

func (b *notifyOracleBackend) unlisten(ctx context.Context, channel string) error {
	_, err := b.conn.ExecContext(ctx, "begin dbms_alert.remove(:1); end;", channel)
	return err
}

// waitForMessage loops WAITANY until an alert actually arrives — its status
// OUT parameter is 0 for "alert received" and 1 for "timed out", and a timeout
// just means nothing was signalled during the window, so it re-waits.
func (b *notifyOracleBackend) waitForMessage(ctx context.Context) (string, string, error) {
	for {
		if err := ctx.Err(); err != nil {
			return "", "", err
		}
		var name, message string
		var status int64
		_, err := b.conn.ExecContext(ctx,
			"begin dbms_alert.waitany(:1, :2, :3, :4); end;",
			go_ora.Out{Dest: &name, Size: 128},
			go_ora.Out{Dest: &message, Size: 4000},
			go_ora.Out{Dest: &status},
			notifyOracleWaitSeconds,
		)
		if err != nil {
			return "", "", err
		}
		if status == 0 {
			return name, message, nil
		}
	}
}

func (b *notifyOracleBackend) close() error {
	b.conn.Close()
	return b.db.Close()
}
