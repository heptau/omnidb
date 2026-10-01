package main

import (
	"strings"
	"testing"
)

var testOpts = DefaultIndentOptions

func check(t *testing.T, in string, opts IndentOptions, want string) {
	t.Helper()
	got := reindentSQL(in, opts)
	if got != want {
		t.Fatalf("input: %s\ngot:\n%s\nwant:\n%s", in, got, want)
	}
}

func TestReindentSQLBasicSelect(t *testing.T) {
	check(t, "select a, b, c from mytable where a = 1 and b = 2 order by a", testOpts,
		"SELECT\n    a,\n    b,\n    c\nFROM mytable\nWHERE a = 1\n    AND b = 2\nORDER BY a")
}

func TestReindentSQLSingleItemStaysOnKeywordLine(t *testing.T) {
	check(t, "select a from t", testOpts, "SELECT a\nFROM t")
}

func TestReindentSQLCompactLayoutLeadingStyle(t *testing.T) {
	opts := testOpts
	opts.Layout, opts.CommaStyle, opts.LogicalOperator, opts.KeywordCase = "compact", "leading", "trailing", "lower"
	opts.IndentUnit = "  "
	check(t, "SELECT a, b FROM t WHERE a = 1 AND b = 2", opts,
		"select a\n  , b\nfrom t\nwhere a = 1 and\n  b = 2")
}

func TestReindentSQLKeywordCase(t *testing.T) {
	opts := testOpts
	opts.KeywordCase = "preserve"
	check(t, "Select A From T", opts, "Select A\nFrom T")
	opts.KeywordCase = "lower"
	check(t, "SELECT A FROM T", opts, "select A\nfrom T")
}

func TestReindentSQLTabIndent(t *testing.T) {
	opts := testOpts
	opts.IndentUnit = "\t"
	check(t, "select a, b from t", opts, "SELECT\n\ta,\n\tb\nFROM t")
}

func TestReindentSQLJoin(t *testing.T) {
	check(t, "select t.id from orders t left outer join customers c on t.customer_id = c.id where c.active = true", testOpts,
		"SELECT t.id\nFROM orders t\nLEFT OUTER JOIN customers c ON t.customer_id = c.id\nWHERE c.active = TRUE")
}

func TestReindentSQLSubqueryIndented(t *testing.T) {
	check(t, "select * from (select x, y from t) sub where x in (select id from u)", testOpts,
		"SELECT *\nFROM (\n    SELECT\n        x,\n        y\n    FROM t\n) sub\nWHERE x IN (\n    SELECT id\n    FROM u\n)")
}

func TestReindentSQLCTE(t *testing.T) {
	check(t, "with a as (select 1), b as (select 2) select * from a, b", testOpts,
		"WITH a AS (\n    SELECT 1\n),\nb AS (\n    SELECT 2\n)\nSELECT *\nFROM\n    a,\n    b")
}

func TestReindentSQLCase(t *testing.T) {
	check(t, "select case when a = 1 then 'x' when a = 2 then 'y' else 'z' end as k, case when b then 1 end from t", testOpts,
		"SELECT\n    CASE\n        WHEN a = 1 THEN 'x'\n        WHEN a = 2 THEN 'y'\n        ELSE 'z'\n    END AS k,\n    CASE WHEN b THEN 1 END\nFROM t")
}

func TestReindentSQLBetweenAndNotSplit(t *testing.T) {
	check(t, "select 1 from t where a between 1 and 2 and b = 3", testOpts,
		"SELECT 1\nFROM t\nWHERE a BETWEEN 1 AND 2\n    AND b = 3")
}

func TestReindentSQLFunctionCallsStayInline(t *testing.T) {
	check(t, "select count(a, b), sum(x) over (partition by y order by z) from t", testOpts,
		"SELECT\n    count(a, b),\n    sum(x) OVER (PARTITION BY y ORDER BY z)\nFROM t")
}

func TestReindentSQLLongListWraps(t *testing.T) {
	opts := testOpts
	opts.WrapWidth = 40
	check(t, "select a from t where x in (1111111111, 2222222222, 3333333333, 4444444444)", opts,
		"SELECT a\nFROM t\nWHERE x IN (\n    1111111111,\n    2222222222,\n    3333333333,\n    4444444444\n)")
}

func TestReindentSQLCreateTableExpanded(t *testing.T) {
	check(t, "create table t (id serial primary key, name varchar(10) not null)", testOpts,
		"CREATE TABLE t (\n    id serial PRIMARY KEY,\n    name varchar(10) NOT NULL\n)")
}

func TestReindentSQLInsertUpdateDelete(t *testing.T) {
	check(t, "insert into t (a, b) values (1, 2)", testOpts, "INSERT INTO t (a, b)\nVALUES (1, 2)")
	check(t, "update t set a = 1, b = 2 where id = 3", testOpts,
		"UPDATE t\nSET\n    a = 1,\n    b = 2\nWHERE id = 3")
	check(t, "delete from t where id = 3", testOpts, "DELETE FROM t\nWHERE id = 3")
}

func TestReindentSQLMultipleStatements(t *testing.T) {
	check(t, "select 1; select 2;", testOpts, "SELECT 1;\n\nSELECT 2;")
}

func TestReindentSQLGrantStaysFlat(t *testing.T) {
	check(t, "grant select, insert on t to bob", testOpts, "GRANT SELECT, INSERT ON t TO bob")
}

func TestReindentSQLOperatorsAndCasts(t *testing.T) {
	check(t, "select a::int, -1, b-1, x->>'k', a<>b, t.* from t", testOpts,
		"SELECT\n    a::int,\n    -1,\n    b - 1,\n    x ->> 'k',\n    a <> b,\n    t.*\nFROM t")
}

func TestReindentSQLDollarQuoteAndUnicode(t *testing.T) {
	in := "create function f() returns int as $$ select 1 from t where a = 1 $$ language sql"
	got := reindentSQL(in, testOpts)
	if !strings.Contains(got, "$$ select 1 from t where a = 1 $$") {
		t.Fatalf("dollar-quoted body must survive verbatim, got:\n%s", got)
	}
	check(t, "select 'čeština' as č from tabulka", testOpts, "SELECT 'čeština' AS č\nFROM tabulka")
}

func TestReindentSQLPreservesStringLiteralsVerbatim(t *testing.T) {
	for _, lit := range []string{"'select from where and or'", "'it''s'", `'a\'b'`, "E'x\\ny'"} {
		got := reindentSQL("select * from t where name = "+lit, testOpts)
		if !strings.Contains(got, lit) {
			t.Fatalf("literal %s must survive verbatim, got:\n%s", lit, got)
		}
	}
}

func TestReindentSQLQuotedIdentifiers(t *testing.T) {
	for _, id := range []string{"`my col`", `"MyCol"`, "[my col]"} {
		got := reindentSQL("select "+id+" from t", testOpts)
		if !strings.Contains(got, id) {
			t.Fatalf("quoted identifier %s must survive verbatim, got:\n%s", id, got)
		}
	}
	check(t, "select arr[1], array[1,2] from t", testOpts, "SELECT\n    arr[1],\n    array[1, 2]\nFROM t")
}

func TestReindentSQLComments(t *testing.T) {
	check(t, "select a, -- first\n b -- second\n from t", testOpts,
		"SELECT\n    a, -- first\n    b -- second\nFROM t")
	check(t, "-- head\nselect 1 /* c */ from t", testOpts, "-- head\nSELECT 1 /* c */\nFROM t")
}

func TestReindentSQLAlterTable(t *testing.T) {
	check(t, "alter table t add column a int, drop column b", testOpts,
		"ALTER TABLE t ADD COLUMN a int,\n    DROP COLUMN b")
}

func TestReindentSQLIdempotent(t *testing.T) {
	in := "with a as (select 1), b as (select x from a where x in (select id from t)) select case when a=1 then 2 when a=3 then 4 end, count(*) from a join b using (x) where a > 1 and (b or c) group by 1 order by 1 limit 5"
	once := reindentSQL(in, testOpts)
	if twice := reindentSQL(once, testOpts); twice != once {
		t.Fatalf("formatting must be idempotent\nonce:\n%s\ntwice:\n%s", once, twice)
	}
}

func TestReindentSQLEmptyInput(t *testing.T) {
	if got := reindentSQL("", testOpts); got != "" {
		t.Fatalf("expected empty output for empty input, got %q", got)
	}
}

func TestReindentSQLSafeNeverPanics(t *testing.T) {
	for _, in := range []string{"", "(((", ")))", "'unterminated", `"unterminated`, "select", "-- just a comment",
		"/* unterminated block comment", "case when", "end end", "select (", "]]][[[", "$$", "$a$ x", "select [", ";;;", "select a, , b"} {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("reindentSQLSafe panicked on %q: %v", in, r)
				}
			}()
			reindentSQLSafe(in, testOpts)
			reindentSQL(in, testOpts)
		}()
	}
}
