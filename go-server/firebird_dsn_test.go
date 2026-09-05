package main

import (
	"strings"
	"testing"
)

func TestFirebirdDSNPrefersConnStringWhenServerBlank(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "sysdba:masterkey@127.0.0.1:3050/var/lib/firebird/data/test.fdb",
	}
	got := firebirdDSN(info)
	if got != info.ConnString {
		t.Fatalf("expected raw connstring %q, got %q", info.ConnString, got)
	}
}

func TestFirebirdDSNSubstitutesDatabaseIntoConnString(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "sysdba:masterkey@127.0.0.1:3050/var/lib/firebird/data/test.fdb",
		Database:   "/var/lib/firebird/data/seconddb.fdb",
	}
	got := firebirdDSN(info)
	if !strings.Contains(got, "/var/lib/firebird/data/seconddb.fdb") {
		t.Fatalf("expected substituted database path, got %q", got)
	}
	if !strings.Contains(got, "127.0.0.1:3050") || !strings.Contains(got, "sysdba:masterkey@") {
		t.Fatalf("expected host/credentials preserved, got %q", got)
	}
}

func TestFirebirdDSNIgnoresConnStringWhenServerSet(t *testing.T) {
	info := &ConnectionInfo{
		Server:     "10.0.0.5",
		Port:       "3051",
		Database:   "/data/mydb.fdb",
		Username:   "u",
		Password:   "p",
		ConnString: "someone-else:pw@unrelated-host:3050/other.fdb",
	}
	got := firebirdDSN(info)
	if strings.Contains(got, "unrelated-host") {
		t.Fatalf("expected discrete fields to win over stale connstring, got %q", got)
	}
	if !strings.Contains(got, "10.0.0.5:3051") || !strings.Contains(got, "/data/mydb.fdb") {
		t.Fatalf("expected DSN built from discrete fields, got %q", got)
	}
}

func TestFirebirdDSNBuildsFromPartsWhenNoConnString(t *testing.T) {
	info := &ConnectionInfo{
		Server:   "localhost",
		Database: "/var/lib/firebird/data/employee.fdb",
		Username: "sysdba",
		Password: "masterkey",
	}
	got := firebirdDSN(info)
	if !strings.Contains(got, "localhost:3050") {
		t.Fatalf("expected default port 3050 in DSN, got %q", got)
	}
	if !strings.Contains(got, "/var/lib/firebird/data/employee.fdb") {
		t.Fatalf("expected database path in DSN, got %q", got)
	}
	if !strings.Contains(got, "sysdba:masterkey@") {
		t.Fatalf("expected credentials in DSN, got %q", got)
	}
}
