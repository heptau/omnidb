package main

import "testing"

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
