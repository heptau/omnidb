package main

import (
	"strings"
	"testing"
)

func TestMSSQLDSNPrefersConnStringWhenServerBlank(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "sqlserver://sa:test@127.0.0.1:1433?database=master",
	}
	got := mssqlDSN(info)
	if got != info.ConnString {
		t.Fatalf("expected raw connstring %q, got %q", info.ConnString, got)
	}
}

func TestMSSQLDSNSubstitutesDatabaseIntoConnString(t *testing.T) {
	info := &ConnectionInfo{
		ConnString: "sqlserver://sa:test@127.0.0.1:1433?database=master&encrypt=disable",
		Database:   "seconddb",
	}
	got := mssqlDSN(info)
	if !strings.Contains(got, "database=seconddb") {
		t.Fatalf("expected database=seconddb, got %q", got)
	}
	if !strings.Contains(got, "encrypt=disable") {
		t.Fatalf("expected other connstring params preserved, got %q", got)
	}
	if !strings.Contains(got, "127.0.0.1:1433") || !strings.Contains(got, "sa:test@") {
		t.Fatalf("expected host/credentials preserved, got %q", got)
	}
}

func TestMSSQLDSNIgnoresConnStringWhenServerSet(t *testing.T) {
	info := &ConnectionInfo{
		Server:     "10.0.0.5",
		Port:       "1434",
		Database:   "mydb",
		Username:   "u",
		Password:   "p",
		ConnString: "sqlserver://someone-else@unrelated-host:1433?database=other",
	}
	got := mssqlDSN(info)
	if strings.Contains(got, "unrelated-host") {
		t.Fatalf("expected discrete fields to win over stale connstring, got %q", got)
	}
	if !strings.Contains(got, "10.0.0.5:1434") || !strings.Contains(got, "database=mydb") {
		t.Fatalf("expected DSN built from discrete fields, got %q", got)
	}
}

func TestMSSQLDSNBuildsFromPartsWhenNoConnString(t *testing.T) {
	info := &ConnectionInfo{
		Server:   "localhost",
		Database: "master",
		Username: "sa",
		Password: "test",
	}
	got := mssqlDSN(info)
	if !strings.Contains(got, "localhost:1433") {
		t.Fatalf("expected default port 1433 in DSN, got %q", got)
	}
}
