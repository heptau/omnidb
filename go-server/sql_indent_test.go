package main

import (
	"strings"
	"testing"
)

func TestReindentSQLBasicSelect(t *testing.T) {
	in := "select a, b, c from mytable where a = 1 and b = 2 order by a"
	got := reindentSQL(in)
	want := "select a\n    , b\n    , c\nfrom mytable\nwhere a = 1\n    and b = 2\norder by a"
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestReindentSQLJoinFamily(t *testing.T) {
	in := "select t.id from orders t left outer join customers c on t.customer_id = c.id where c.active = true"
	got := reindentSQL(in)
	if !strings.Contains(got, "\nleft outer join customers c") {
		t.Fatalf("expected merged 'left outer join' on its own line, got:\n%s", got)
	}
	foundOn := false
	for _, line := range strings.Split(got, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "on t.customer_id") {
			foundOn = true
		}
	}
	if !foundOn {
		t.Fatalf("expected 'on' on its own (indented) line, got:\n%s", got)
	}
}

func TestReindentSQLFunctionCallCommasStayInline(t *testing.T) {
	in := "select count(a, b), sum(x) from t"
	got := reindentSQL(in)
	if strings.Contains(got, "count(a\n") {
		t.Fatalf("function-call args must not be broken across lines, got:\n%s", got)
	}
	if !strings.Contains(got, "count(a, b)") {
		t.Fatalf("expected inline function call args, got:\n%s", got)
	}
}

func TestReindentSQLPreservesStringLiteralsVerbatim(t *testing.T) {
	in := "select * from t where name = 'select from where and or'"
	got := reindentSQL(in)
	if !strings.Contains(got, "'select from where and or'") {
		t.Fatalf("string literal content must survive verbatim (not be reformatted as SQL keywords), got:\n%s", got)
	}
}

func TestReindentSQLPreservesDoubledQuoteEscape(t *testing.T) {
	in := "select 'it''s' as x"
	got := reindentSQL(in)
	if !strings.Contains(got, "'it''s'") {
		t.Fatalf("doubled-quote escape must survive intact, got:\n%s", got)
	}
}

func TestReindentSQLPreservesBackslashEscape(t *testing.T) {
	in := `select 'a\'b' as x`
	got := reindentSQL(in)
	if !strings.Contains(got, `'a\'b'`) {
		t.Fatalf("backslash escape must survive intact, got:\n%s", got)
	}
}

func TestReindentSQLLineCommentEndsLine(t *testing.T) {
	in := "select a -- comment here\nfrom t"
	got := reindentSQL(in)
	lines := strings.Split(got, "\n")
	found := false
	for _, l := range lines {
		if strings.Contains(l, "-- comment here") && !strings.Contains(l, "from") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected line comment on its own line, not swallowing following tokens, got:\n%s", got)
	}
}

func TestReindentSQLSubqueryParensDoNotBreakCommas(t *testing.T) {
	in := "select a from (select x, y, z from inner_table) sub"
	got := reindentSQL(in)
	if strings.Contains(got, "x\n") {
		t.Fatalf("commas inside parens (depth > 0) must stay inline, got:\n%s", got)
	}
}

func TestReindentSQLEmptyInput(t *testing.T) {
	if got := reindentSQL(""); got != "" {
		t.Fatalf("expected empty output for empty input, got %q", got)
	}
}

func TestReindentSQLSafeNeverPanics(t *testing.T) {
	inputs := []string{
		"",
		"(((",
		")))",
		"'unterminated",
		`"unterminated`,
		"select",
		"-- just a comment",
		"/* unterminated block comment",
	}
	for _, in := range inputs {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("reindentSQLSafe panicked on %q: %v", in, r)
				}
			}()
			reindentSQLSafe(in)
		}()
	}
}

func TestReindentSQLMySQLBacktickIdentifiers(t *testing.T) {
	in := "select `col` from `my table` where `col` = 1"
	got := reindentSQL(in)
	if !strings.Contains(got, "`col`") || !strings.Contains(got, "`my table`") {
		t.Fatalf("backtick-quoted identifiers must survive verbatim, got:\n%s", got)
	}
}

func TestReindentSQLOracleDoubleQuoteIdentifiers(t *testing.T) {
	in := `select "MyCol" from "MyTable" where "MyCol" = 1`
	got := reindentSQL(in)
	if !strings.Contains(got, `"MyCol"`) || !strings.Contains(got, `"MyTable"`) {
		t.Fatalf("double-quoted identifiers must survive verbatim, got:\n%s", got)
	}
}

func TestReindentSQLGroupByOrderByInsertDeleteMerge(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"select a from t group by a", "\ngroup by a"},
		{"select a from t order by a", "\norder by a"},
		{"insert into t (a) values (1)", "insert into t"},
		{"delete from t where a = 1", "delete from t"},
	}
	for _, c := range cases {
		got := reindentSQL(c.in)
		if !strings.Contains(got, c.want) {
			t.Fatalf("input %q: expected to contain %q, got:\n%s", c.in, c.want, got)
		}
	}
}
