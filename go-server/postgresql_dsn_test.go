package main

import (
	"strings"
	"testing"
)

func TestPostgresqlDSNPrefersConnStringWhenServerBlank(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "postgres://postgres:test@127.0.0.1:55432/postgres",
	}
	got := postgresqlDSN(info)
	if got != info.ConnString {
		t.Fatalf("expected raw connstring %q, got %q", info.ConnString, got)
	}
}

func TestPostgresqlDSNSubstitutesDatabaseIntoConnString(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "postgres://postgres:test@127.0.0.1:55432/postgres?sslmode=disable",
		Database:   "seconddb",
	}
	got := postgresqlDSN(info)
	if !strings.HasSuffix(strings.Split(got, "?")[0], "/seconddb") {
		t.Fatalf("expected path /seconddb, got %q", got)
	}
	if !strings.Contains(got, "sslmode=disable") {
		t.Fatalf("expected other connstring params preserved, got %q", got)
	}
	if !strings.Contains(got, "127.0.0.1:55432") || !strings.Contains(got, "postgres:test@") {
		t.Fatalf("expected host/credentials preserved, got %q", got)
	}
}

func TestPostgresqlDSNIgnoresConnStringWhenServerSet(t *testing.T) {
	info := &ConnectionInfo{
		Server:     "10.0.0.5",
		Port:       "5433",
		Database:   "mydb",
		Username:   "u",
		Password:   "p",
		ConnString: "postgres://someone-else@unrelated-host:5432/other",
	}
	got := postgresqlDSN(info)
	if strings.Contains(got, "unrelated-host") {
		t.Fatalf("expected discrete fields to win over stale connstring, got %q", got)
	}
	if !strings.Contains(got, "10.0.0.5:5433") || !strings.Contains(got, "/mydb") {
		t.Fatalf("expected DSN built from discrete fields, got %q", got)
	}
}

// TestPostgresqlDSNMergesPasswordIntoConnString covers a real bug: a
// ConnString-only connection (Server left blank, the common shape for
// "postgresql://user@host:port/db" saved via the connection-string field
// rather than discrete Server/Port/Database/User) never embeds a password
// -- it's expected to rely on ~/.pgpass, exactly what passwords.js's "Use
// .pgpass" button and the manual password prompt both exist for. Before
// this fix, postgresqlDSN's ConnString branch never looked at info.Password
// at all, so every retry (a typed password, or one filled in from
// .pgpass) silently reopened the exact same passwordless ConnString and
// failed identically every time -- indistinguishable, from the user's
// side, from the password never having been used at all.
func TestPostgresqlDSNMergesPasswordIntoConnString(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "postgres://app_deployment@10.32.20.2:5432/retail?application_name=ZbynekVanzura",
		Password:   "correcthorsebatterystaple",
	}
	got := postgresqlDSN(info)
	if !strings.Contains(got, "app_deployment:correcthorsebatterystaple@") {
		t.Fatalf("expected password merged into connstring credentials, got %q", got)
	}
	if !strings.Contains(got, "10.32.20.2:5432/retail") {
		t.Fatalf("expected host/database preserved, got %q", got)
	}
	if !strings.Contains(got, "application_name=ZbynekVanzura") {
		t.Fatalf("expected other connstring params preserved, got %q", got)
	}
}

// TestPostgresqlDSNMergesPasswordAndDatabaseTogether covers the same bug
// alongside an active-database override (see active_database.go) landing
// in the same request -- both substitutions need to survive one
// url.Parse/rebuild round trip.
func TestPostgresqlDSNMergesPasswordAndDatabaseTogether(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "postgres://app_deployment@10.32.20.2:5432/retail",
		Database:   "siblingdb",
		Password:   "correcthorsebatterystaple",
	}
	got := postgresqlDSN(info)
	if !strings.Contains(got, "app_deployment:correcthorsebatterystaple@") {
		t.Fatalf("expected password merged into connstring credentials, got %q", got)
	}
	if !strings.HasSuffix(strings.Split(got, "?")[0], "/siblingdb") {
		t.Fatalf("expected database override path /siblingdb, got %q", got)
	}
}

func TestPostgresqlDSNBuildsFromPartsWhenNoConnString(t *testing.T) {
	info := &ConnectionInfo{
		Server:   "localhost",
		Database: "postgres",
		Username: "postgres",
		Password: "test",
	}
	got := postgresqlDSN(info)
	if !strings.Contains(got, "localhost:5432") {
		t.Fatalf("expected default port 5432 in DSN, got %q", got)
	}
}
