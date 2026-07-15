package main

import "testing"

func TestJsDatetimeToSQLiteRoundTripsThroughSqliteDatetimeToJS(t *testing.T) {
	stored := "2026-07-15 18:05:12.639063"
	// sqliteDatetimeToJS truncates to millisecond precision, so the round
	// trip loses the trailing "063" — expected and fine for a daterange
	// bound (seconds-level granularity is all "Last 6 Hours" etc. need).
	// What matters is the output format matching what's actually stored.
	want := "2026-07-15 18:05:12.639000"
	if got := jsDatetimeToSQLite(sqliteDatetimeToJS(stored)); got != want {
		t.Fatalf("jsDatetimeToSQLite(sqliteDatetimeToJS(%q)) = %q, want %q", stored, got, want)
	}
}

func TestJsDatetimeToSQLiteOrdersCorrectlyAgainstStoredValues(t *testing.T) {
	// This is the actual bug: comparing a raw ISO "...Z" bound against a
	// stored space-separated value via plain string >=/<= silently
	// excluded every row, since ' ' (0x20) sorts before 'T' (0x54).
	from := jsDatetimeToSQLite("2026-07-15T12:05:12.640Z")
	stored := "2026-07-15 18:05:12.639063"
	if !(from <= stored) {
		t.Fatalf("expected normalized from-bound %q to sort before stored value %q", from, stored)
	}

	to := jsDatetimeToSQLite("2026-07-15T18:05:12.640Z")
	if !(stored <= to) {
		t.Fatalf("expected stored value %q to sort before normalized to-bound %q", stored, to)
	}
}

func TestJsDatetimeToSQLiteEmptyPassesThrough(t *testing.T) {
	if got := jsDatetimeToSQLite(""); got != "" {
		t.Fatalf("expected empty bound (no filter) to pass through unchanged, got %q", got)
	}
}
