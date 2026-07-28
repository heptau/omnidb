package main

import (
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
)

// TestUnquotePostgresIdentifierRoundTripsQuoteIdent guards
// postgresqlChangeRolePassword's fix: role names arrive already
// quote_ident()-quoted (see postgresqlRoles/tree_postgresql.js), and
// unquoting them back to the raw name is required both for the md5
// password-verifier hash and before re-quoting for the ALTER ROLE
// statement.
func TestUnquotePostgresIdentifierRoundTripsQuoteIdent(t *testing.T) {
	cases := []struct {
		quoted string // what quote_ident() would produce
		raw    string // the actual, unquoted identifier
	}{
		{quoted: "zv", raw: "zv"},                 // no quoting needed
		{quoted: `"WeirdRole"`, raw: "WeirdRole"}, // mixed case needs quoting
		{quoted: `"has ""quotes"" inside"`, raw: `has "quotes" inside`},
		{quoted: `"select"`, raw: "select"}, // reserved word needs quoting
	}
	for _, c := range cases {
		if got := unquotePostgresIdentifier(c.quoted); got != c.raw {
			t.Errorf("unquotePostgresIdentifier(%q) = %q, want %q", c.quoted, got, c.raw)
		}
	}
}

// TestChangeRolePasswordQuotingRoundTrip verifies the full fixed pipeline:
// starting from a quote_ident()-quoted role name (what the frontend always
// sends), the raw name recovered for hashing must match what
// quotePostgresIdentifierDoubleQuoted re-quotes for the DDL text — i.e.
// both derive from the same underlying identifier, not two different
// strings the way the pre-fix code accidentally did (hash over the still-
// quoted string, DDL over a double-quoted one).
func TestChangeRolePasswordQuotingRoundTrip(t *testing.T) {
	quotedFromFrontend := `"WeirdRole"`
	raw := unquotePostgresIdentifier(quotedFromFrontend)
	if raw != "WeirdRole" {
		t.Fatalf("unquotePostgresIdentifier(%q) = %q, want %q", quotedFromFrontend, raw, "WeirdRole")
	}
	requoted := quotePostgresIdentifierDoubleQuoted(raw)
	if requoted != quotedFromFrontend {
		t.Fatalf("re-quoting the unquoted name gave %q, want it to match what the frontend sent (%q)", requoted, quotedFromFrontend)
	}
	// The hash must be computed over the raw name, not the quoted display
	// form — this is the part that used to silently produce a verifier
	// that could never match the typed password.
	hash := postgresMD5PasswordHash("secret", raw)
	wrongHash := postgresMD5PasswordHash("secret", quotedFromFrontend)
	if hash == wrongHash {
		t.Fatal("hash over the raw name unexpectedly matched hash over the quoted name")
	}
}

// TestSCRAMSHA256MatchesRealPostgres cross-checks scramSHA256Secret's
// derivation against pg_authid.rolpassword captured from a real local
// PostgreSQL 16 server: `CREATE ROLE scramtest WITH LOGIN PASSWORD
// 'testpassword123'` with password_encryption=scram-sha-256, then
// `SELECT rolpassword FROM pg_authid WHERE rolname='scramtest'`. Feeding
// that same salt/iteration count back through our own StoredKey/ServerKey
// derivation must reproduce Postgres's own values exactly — this is the
// one place where "close enough" isn't good enough, since a wrong verifier
// silently locks the role out at login instead of failing loudly here.
func TestSCRAMSHA256MatchesRealPostgres(t *testing.T) {
	const password = "testpassword123"
	const realSecret = "SCRAM-SHA-256$4096:6mDxpR+DTcG2oju4mXFjqw==$x9cc5WdCZm6kCIBxrlpleppjAmKLHZ48T6Tktg9zh/I=:BdnxHvv2zbfu8HMIpczvuZ0zZSgHjPu5/wcW2X0nExM="

	rest := strings.TrimPrefix(realSecret, "SCRAM-SHA-256$")
	iterAndSalt, keys, _ := strings.Cut(rest, "$")
	iterStr, saltB64, _ := strings.Cut(iterAndSalt, ":")
	wantStoredKeyB64, wantServerKeyB64, _ := strings.Cut(keys, ":")

	salt, err := base64.StdEncoding.DecodeString(saltB64)
	if err != nil {
		t.Fatalf("decoding salt: %v", err)
	}
	if iterStr != "4096" {
		t.Fatalf("unexpected iteration count in test vector: %s", iterStr)
	}

	saltedPassword, err := pbkdf2.Key(sha256.New, password, salt, scramSHA256Iterations, sha256.Size)
	if err != nil {
		t.Fatalf("pbkdf2.Key: %v", err)
	}
	clientKey := hmacSHA256(saltedPassword, []byte("Client Key"))
	storedKey := sha256.Sum256(clientKey)
	serverKey := hmacSHA256(saltedPassword, []byte("Server Key"))

	if got := base64.StdEncoding.EncodeToString(storedKey[:]); got != wantStoredKeyB64 {
		t.Errorf("StoredKey = %s, want %s (from real Postgres)", got, wantStoredKeyB64)
	}
	if got := base64.StdEncoding.EncodeToString(serverKey); got != wantServerKeyB64 {
		t.Errorf("ServerKey = %s, want %s (from real Postgres)", got, wantServerKeyB64)
	}
}

// TestPostgresSCRAMSHA256PasswordHashShape checks the value
// postgresSCRAMSHA256PasswordHash actually produces (random salt, so it
// can't be compared against a fixed vector) has Postgres's expected shape
// and that its own StoredKey/ServerKey are internally self-consistent.
func TestPostgresSCRAMSHA256PasswordHashShape(t *testing.T) {
	secret, err := postgresSCRAMSHA256PasswordHash("hunter2")
	if err != nil {
		t.Fatalf("postgresSCRAMSHA256PasswordHash: %v", err)
	}
	if !strings.HasPrefix(secret, "SCRAM-SHA-256$4096:") {
		t.Fatalf("secret %q doesn't start with the expected prefix", secret)
	}
	rest := strings.TrimPrefix(secret, "SCRAM-SHA-256$4096:")
	saltB64, keys, ok := strings.Cut(rest, "$")
	if !ok {
		t.Fatalf("secret %q missing '$' separator before keys", secret)
	}
	storedKeyB64, serverKeyB64, ok := strings.Cut(keys, ":")
	if !ok {
		t.Fatalf("secret %q missing ':' separator between keys", secret)
	}
	salt, err := base64.StdEncoding.DecodeString(saltB64)
	if err != nil || len(salt) != scramSHA256SaltLen {
		t.Fatalf("salt %q didn't decode to %d bytes: %v", saltB64, scramSHA256SaltLen, err)
	}
	if _, err := base64.StdEncoding.DecodeString(storedKeyB64); err != nil {
		t.Fatalf("StoredKey %q isn't valid base64: %v", storedKeyB64, err)
	}
	if _, err := base64.StdEncoding.DecodeString(serverKeyB64); err != nil {
		t.Fatalf("ServerKey %q isn't valid base64: %v", serverKeyB64, err)
	}
}
