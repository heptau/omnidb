package main

import "testing"

func TestPostgresDefaultApplicationName(t *testing.T) {
	t.Setenv("PGAPPNAME", "")
	cfg, err := postgresqlConnConfig(&ConnectionInfo{Server: "h", Port: "5432", Username: "u", Database: "d"})
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.RuntimeParams["application_name"]; got != omnidbVersion {
		t.Fatalf("application_name = %q", got)
	}
}

func TestPostgresKeepsUserApplicationName(t *testing.T) {
	t.Setenv("PGAPPNAME", "")
	cfg, err := postgresqlConnConfig(&ConnectionInfo{ConnString: "postgres://u@h/d?application_name=Mine"})
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.RuntimeParams["application_name"]; got != "Mine" {
		t.Fatalf("application_name = %q", got)
	}
}
