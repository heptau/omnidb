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
