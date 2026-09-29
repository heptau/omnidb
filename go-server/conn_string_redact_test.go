package main

import (
	"strings"
	"testing"
)

func TestRedactConnStringSecrets(t *testing.T) {
	for _, in := range []string{
		"postgresql://alice:s3cret@db.example/app",
		"postgresql://alice@db.example/app?password=s3cret",
		"host=db.example user=alice password=s3cret dbname=app",
		"host=db.example password='s3 cret' dbname=app",
		"Server=db;User Id=alice;Password=s3cret;",
	} {
		if got := redactConnStringSecrets(in); strings.Contains(got, "s3cret") || strings.Contains(got, "s3 cret") {
			t.Errorf("redactConnStringSecrets(%q) = %q still contains the secret", in, got)
		}
	}
	if got := redactConnStringSecrets("postgresql://alice@db.example/app"); got != "postgresql://alice@db.example/app" {
		t.Errorf("secret-free connstring changed: %q", got)
	}
}
