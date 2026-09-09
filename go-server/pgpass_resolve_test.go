package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5"
)

// parseTestPgpassConfig parses dsn with pgx's own passfile lookup neutered,
// so a .pgpass in the machine running the test can't decide the outcome —
// what's under test is applyPgpassPassword's relay, not pgx's built-in
// fallback (which does the job on every non-sandboxed platform, see
// applyPgpassPassword's comment).
func parseTestPgpassConfig(t *testing.T, dsn string) *pgx.ConnConfig {
	t.Helper()
	t.Setenv("PGPASSFILE", filepath.Join(t.TempDir(), "no-such-passfile"))
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("ParseConfig(%q): %v", dsn, err)
	}
	if cfg.Password != "" {
		t.Fatalf("ParseConfig(%q) already produced a password (%q) — test setup is wrong", dsn, cfg.Password)
	}
	return cfg
}

// fakePgpassShell stands in for wails-app's loopback relay, recording the
// match it was asked for and answering with resp.
func fakePgpassShell(t *testing.T, resp pgpassResolveResponse) (*pgpassMatch, *httptest.Server) {
	t.Helper()
	var got pgpassMatch
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode resolve request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(server.Close)
	return &got, server
}

func TestApplyPgpassPasswordFillsBlankPasswordFromShell(t *testing.T) {
	cfg := parseTestPgpassConfig(t, "postgres://reporter@db.example.com:5433/sales?sslmode=prefer")
	got, server := fakePgpassShell(t, pgpassResolveResponse{Granted: true, Password: "s3cret"})
	t.Setenv(omnidbPgpassResolveURLEnv, server.URL)

	applyPgpassPassword(cfg)

	if cfg.Password != "s3cret" {
		t.Errorf("cfg.Password = %q, want s3cret", cfg.Password)
	}
	// The match must be what pgx itself would have looked up, defaults
	// included — a connection whose DSN omits the port has to be matched
	// against 5432, not against "".
	want := pgpassMatch{Hostname: "db.example.com", Port: "5433", Database: "sales", Username: "reporter"}
	if *got != want {
		t.Errorf("relay asked for %+v, want %+v", *got, want)
	}
}

func TestApplyPgpassPasswordMatchesUnixSocketAsLocalhost(t *testing.T) {
	// Mirrors pgconn's own rule: an entry for a Unix-socket connection is
	// written against "localhost", not the socket directory.
	cfg := parseTestPgpassConfig(t, "postgres://reporter@/sales?host=/tmp")
	got, server := fakePgpassShell(t, pgpassResolveResponse{Granted: true, Password: "s3cret"})
	t.Setenv(omnidbPgpassResolveURLEnv, server.URL)

	applyPgpassPassword(cfg)

	if got.Hostname != "localhost" {
		t.Errorf("relay asked for hostname %q, want localhost", got.Hostname)
	}
	if got.Port != "5432" {
		t.Errorf("relay asked for port %q, want the default 5432", got.Port)
	}
}

func TestApplyPgpassPasswordKeepsAPasswordItWasGiven(t *testing.T) {
	cfg := parseTestPgpassConfig(t, "postgres://reporter@db.example.com:5432/sales")
	cfg.Password = "typed-by-the-user"
	_, server := fakePgpassShell(t, pgpassResolveResponse{Granted: true, Password: "from-pgpass"})
	t.Setenv(omnidbPgpassResolveURLEnv, server.URL)

	applyPgpassPassword(cfg)

	if cfg.Password != "typed-by-the-user" {
		t.Errorf("cfg.Password = %q, want the password already on the config", cfg.Password)
	}
}

func TestApplyPgpassPasswordNoOpWithoutARelay(t *testing.T) {
	// Every non-desktop deployment: pgx has already done the .pgpass lookup
	// itself and there is no shell process to ask.
	cfg := parseTestPgpassConfig(t, "postgres://reporter@db.example.com:5432/sales")
	os.Unsetenv(omnidbPgpassResolveURLEnv)

	applyPgpassPassword(cfg)

	if cfg.Password != "" {
		t.Errorf("cfg.Password = %q, want it left blank", cfg.Password)
	}
}

func TestApplyPgpassPasswordSurvivesAnUngrantedFile(t *testing.T) {
	// "Never granted access" and "granted, but nothing matches this
	// connection" both come back as an empty password, and neither may fail
	// the connect: the blank password reaches Postgres, comes back as 28P01,
	// and the frontend turns that into the prompt with the grant button.
	cfg := parseTestPgpassConfig(t, "postgres://reporter@db.example.com:5432/sales")
	_, server := fakePgpassShell(t, pgpassResolveResponse{Granted: false})
	t.Setenv(omnidbPgpassResolveURLEnv, server.URL)

	applyPgpassPassword(cfg)

	if cfg.Password != "" {
		t.Errorf("cfg.Password = %q, want it left blank", cfg.Password)
	}
}

func TestApplyPgpassPasswordSurvivesAnUnreachableRelay(t *testing.T) {
	cfg := parseTestPgpassConfig(t, "postgres://reporter@db.example.com:5432/sales")
	// A port nothing is listening on — the shell process died, or the
	// listener moved.
	t.Setenv(omnidbPgpassResolveURLEnv, "http://127.0.0.1:1/pgpass-resolve")

	applyPgpassPassword(cfg)

	if cfg.Password != "" {
		t.Errorf("cfg.Password = %q, want it left blank", cfg.Password)
	}
}
