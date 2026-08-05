package main

import (
	"strings"
	"testing"
)

func TestFormatTemplateColumnList(t *testing.T) {
	t.Run("trailing comma, no comments", func(t *testing.T) {
		got := formatTemplateColumnList([]string{"a", "b", "c"}, []string{"", "", ""}, "    ")
		want := "a,\n    b,\n    c"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	t.Run("comma lands before the inline comment, not after", func(t *testing.T) {
		got := formatTemplateColumnList([]string{"?", "?"}, []string{"id int4 PRIMARY KEY", "name text"}, "  ")
		want := "?, -- id int4 PRIMARY KEY\n  ? -- name text"
		if got != want {
			t.Fatalf("got %q, want %q\n(a comma placed after \"--\" would be swallowed into the comment and silently drop a real column separator)", got, want)
		}
		// The comma must come strictly before "--" for the line to be valid
		// SQL (anything after "--" is a line comment the parser never sees
		// as tokens).
		line := "?, -- id int4 PRIMARY KEY"
		commaIdx := strings.IndexByte(line, ',')
		commentIdx := strings.Index(line, "--")
		if commaIdx == -1 || commentIdx == -1 || commaIdx > commentIdx {
			t.Fatalf("comma must precede the inline comment in %q", line)
		}
	})

	t.Run("last line never gets a trailing comma", func(t *testing.T) {
		got := formatTemplateColumnList([]string{"x", "y"}, []string{"", ""}, "\t")
		want := "x,\n\ty"
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	t.Run("uses tab when indentUnit is a tab", func(t *testing.T) {
		got := formatTemplateColumnList([]string{"a", "b"}, []string{"", ""}, "\t")
		if got != "a,\n\tb" {
			t.Fatalf("got %q, want tab-indented continuation", got)
		}
	})
}
