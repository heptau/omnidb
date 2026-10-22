package main

import (
	"reflect"
	"strings"
	"testing"
)

// at runs analyzeCompletion with the cursor at the "|" in text, taking the word
// before it (letters, digits, "_" and ".") as the word typed so far.
func at(t *testing.T, text string) (completionContext, string) {
	t.Helper()
	i := strings.Index(text, "|")
	if i < 0 {
		t.Fatalf("no cursor in %q", text)
	}
	sql := text[:i] + text[i+1:]
	start := i
	for start > 0 && (isWordByte(sql[start-1]) || sql[start-1] == '.') {
		start--
	}
	word := sql[start:i]
	return analyzeCompletion(sql, len([]rune(sql[:i])), word), word
}

func TestClauseAt(t *testing.T) {
	cases := map[string]string{
		"select |":                                    "select",
		"select a, b|":                                "select",
		"select a from |":                             "from",
		"select a from t |":                           "from",
		"select * from t join |":                      "join",
		"select * from t left outer join u on |":      "on",
		"select * from t where |":                     "where",
		"select * from t where a = 1 and b|":          "where",
		"select a from t group by |":                  "group",
		"select a from t order by |":                  "order",
		"select a from t group by a having |":         "having",
		"update t set |":                              "set",
		"insert into t (|":                            "insert_columns",
		"insert into t (a, b) values (|":              "values_list",
		"insert into t (a) values (1) returning |":    "returning",
		"select * from (select | from u) x":           "select",
		"select * from (select a from u) x where |":   "where",
		"select * from t where a in (|":               "",
		"select 'from' as f, \"where\" |":             "select",
		"select 1 -- from t\n, |":                     "select",
		"/* where */ select |":                        "select",
		"select 1; select * from t where |":           "where",
		"select 1;\n|":                                "",
		"select * from t where x = $$ from $$ and |":  "where",
		"delete from |":                               "from",
		"select a from t limit |":                     "limit",
		"with c as (select 1) select | from c":        "select",
		"with c as (select a from |) select * from c": "from",
	}
	for text, want := range cases {
		ctx, _ := at(t, text)
		if ctx.Clause != want {
			t.Errorf("clause of %q = %q, want %q", text, ctx.Clause, want)
		}
	}
}

func TestTableRefs(t *testing.T) {
	type ref struct{ name, alias, sub string }
	cases := []struct {
		text string
		want []ref
	}{
		{"select * from customer c where c.|", []ref{{"customer", "c", ""}}},
		{"select * from public.customer as c, orders o|", []ref{{"public.customer", "c", ""}, {"orders", "o", ""}}},
		{"select * from t join u on t.id = u.t_id left join \"Order Line\" ol on 1|", []ref{{"t", "", ""}, {"u", "", ""}, {`"Order Line"`, "ol", ""}}},
		{"select * from (select 1 as a) sub join v using (a) where |", []ref{{"", "sub", "(select 1 as a)"}, {"v", "", ""}}},
		{"update tbl set a = 1 where |", []ref{{"tbl", "", ""}}},
		{"insert into tbl (a) values (1) |", []ref{{"tbl", "", ""}}},
		{"delete from tbl where |", []ref{{"tbl", "", ""}}},
		{"select * from t where x > 1 and |", []ref{{"t", "", ""}}},
		{"select * from t order by |", []ref{{"t", "", ""}}},
		{"select 1; select * from other o where |", []ref{{"other", "o", ""}}},
		{"select * from a -- from comment\n, b |", []ref{{"a", "", ""}, {"b", "", ""}}},
	}
	for _, c := range cases {
		ctx, _ := at(t, c.text)
		var got []ref
		for _, r := range ctx.Refs {
			got = append(got, ref{r.Name, r.Alias, r.Subquery})
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("refs of %q = %+v, want %+v", c.text, got, c.want)
		}
	}
}

func TestCTEs(t *testing.T) {
	ctx, _ := at(t, "with recursive a(n) as (select 1), b as materialized (select n from a) select | from b")
	if len(ctx.CTEs) != 2 || ctx.CTEs[0].Name != "a" || ctx.CTEs[1].Name != "b" {
		t.Fatalf("CTEs = %+v", ctx.CTEs)
	}
	if !strings.HasPrefix(ctx.CTEPrefix, "with recursive a(n)") {
		t.Errorf("prefix = %q", ctx.CTEPrefix)
	}
	if !strings.HasSuffix(ctx.CTEPrefix, "(select n from a) ") {
		t.Errorf("prefix does not end at the last CTE: %q", ctx.CTEPrefix)
	}
	if ctx, _ := at(t, "select | from t"); len(ctx.CTEs) != 0 || ctx.CTEPrefix != "" {
		t.Errorf("no WITH, got %+v", ctx)
	}
	// An unfinished WITH clause must not produce a prefix that cannot run.
	if ctx, _ := at(t, "with a as (select 1 select |"); ctx.CTEPrefix != "" {
		t.Errorf("unbalanced WITH gave prefix %q", ctx.CTEPrefix)
	}
}

func TestFindRef(t *testing.T) {
	ctx, _ := at(t, "with c as (select 1 x) select * from \"My Tab\" as T, c, other o where |")
	for qualifier, want := range map[string]string{"t": "\"My Tab\"", "T": "\"My Tab\"", "o": "other", "c": "c", "other": ""} {
		r, ok := ctx.findRef(qualifier)
		if want == "" {
			if ok && r.Alias == "" {
				// "other" is only reachable through its alias o
				t.Errorf("findRef(%q) matched a reference hidden behind an alias: %+v", qualifier, r)
			}
			continue
		}
		if !ok || r.Name != want {
			t.Errorf("findRef(%q) = %+v, %v; want %q", qualifier, r, ok, want)
		}
	}
	ctx, _ = at(t, "select * from schema1.customer where |")
	if r, ok := ctx.findRef("customer"); !ok || r.Name != "schema1.customer" {
		t.Errorf("findRef by table name = %+v, %v", r, ok)
	}
	if _, ok := ctx.findRef("nope"); ok {
		t.Error("unknown qualifier matched")
	}
}

func TestSplitSchemaTable(t *testing.T) {
	for in, want := range map[string][2]string{
		"customer":           {"", "customer"},
		"public.customer":    {"public", "customer"},
		`"My S"."My T"`:      {`"My S"`, `"My T"`},
		"db.public.customer": {"public", "customer"},
	} {
		s, tb := splitSchemaTable(in)
		if s != want[0] || tb != want[1] {
			t.Errorf("splitSchemaTable(%q) = %q, %q", in, s, tb)
		}
	}
}

func TestRuneIndexToByte(t *testing.T) {
	s := "ž=1 č"
	if got := runeIndexToByte(s, 2); got != 3 { // "ž" is two bytes
		t.Errorf("index 2 = %d", got)
	}
	if got := runeIndexToByte(s, 99); got != len(s) {
		t.Errorf("past the end = %d", got)
	}
	ctx := analyzeCompletion("select ž from t where ž", 22, "")
	_ = ctx // a cursor beyond the text must not panic
}
