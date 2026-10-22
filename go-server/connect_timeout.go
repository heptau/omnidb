package main

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// connectTimeout bounds how long opening a connection may take. Without it an
// unreachable host (a dead VPN, a firewall that drops packets instead of
// refusing them) holds the UI on a spinner for the operating system's own
// connect timeout, often over a minute. Five seconds is generous for a
// reachable server and short enough that the error appears before the user
// gives up on the window.
var connectTimeout = 5 * time.Second

// pingWithTimeout is the connectivity check at the end of every open*Target.
func pingWithTimeout(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("could not connect within %d seconds: %w", int(connectTimeout.Seconds()), err)
		}
		return err
	}
	return nil
}
