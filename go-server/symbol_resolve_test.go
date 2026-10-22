package main

import (
	"reflect"
	"strings"
	"testing"
)

// resolve puts the cursor at the "|" of text and resolves the name there.
func resolve(t *testing.T, text string) (symbolInfo, string) {
	t.Helper()
	i := strings.Index(text, "|")
	sql := text[:i] + text[i+1:]
	return resolveSymbol(sql, i), sql
}

func spans(sql string, rs []symbolRange) []string {
	var out []string
	for _, r := range rs {
		out = append(out, sql[r.Start:r.End])
	}
	return out
}

func TestResolveSymbol(t *testing.T) {
	// An alias used in the select list: its definition is the alias after the table.
	info, sql := resolve(t, "select c|.name from customer as c join region r on c.region_id = r.id")
	if info.Kind != "alias" || info.Table != "customer" || info.Definition == nil || sql[info.Definition.Start:info.Definition.End] != "c" || info.Definition.Start < 30 {
		t.Fatalf("alias = %+v", info)
	}
	if got := spans(sql, info.Usages); !reflect.DeepEqual(got, []string{"c", "c", "c"}) {
		t.Errorf("alias mentions = %v", got)
	}
	// Clicking the definition itself resolves the same way.
	info, _ = resolve(t, "select c.name from customer as |c")
	if info.Kind != "alias" || info.Table != "customer" {
		t.Errorf("alias at definition = %+v", info)
	}

	// A CTE, used and defined.
	info, sql = resolve(t, "with big as (select 1 x) select * from b|ig where big.x = 1")
	if info.Kind != "cte" || info.Definition == nil || sql[info.Definition.Start:info.Definition.End] != "big" || info.Definition.Start != 5 {
		t.Fatalf("cte = %+v", info)
	}
	if len(info.Usages) != 3 {
		t.Errorf("cte mentions = %v", spans(sql, info.Usages))
	}

	// Table references: by name, by schema-qualified name, and through a table-name qualifier.
	for text, want := range map[string]string{
		"select * from cust|omer c":                             "customer",
		"select * from public.cust|omer":                        "public.customer",
		"select * from pub|lic.customer":                        "public.customer",
		"select customer.i|d from customer":                     "",
		"select cust|omer.id from customer":                     "customer",
		"select * from \"My Tab\" t where t.x = 1 and |t.y = 2": "",
	} {
		info, _ := resolve(t, text)
		if want == "" {
			continue
		}
		if info.Kind != "table" || info.Table != want {
			t.Errorf("%q => %+v, want table %q", text, info, want)
		}
	}

	// A column resolves to the table it belongs to.
	info, _ = resolve(t, "select c.na|me from customer c")
	if info.Kind != "column" || info.Table != "customer" || info.Name != "name" {
		t.Errorf("column = %+v", info)
	}
	info, _ = resolve(t, "select x.na|me from (select 1 name) x")
	if info.Kind != "column" || info.Table != "" {
		t.Errorf("column of a subquery = %+v", info)
	}

	// Scope: another statement's alias is not this one's.
	info, sql = resolve(t, "select 1 from a x; select x|.id from b x where x.y = 1")
	if info.Kind != "alias" || info.Table != "b" || len(info.Usages) != 3 {
		t.Errorf("second statement alias = %+v (%v)", info, spans(sql, info.Usages))
	}

	// Nothing under the cursor, keywords of no interest, strings.
	for _, text := range []string{"select | from t", "select 'cu|st' from t", "select * from t where a = 1|", "|"} {
		if info, _ := resolve(t, text); info.Kind == "alias" || info.Kind == "cte" {
			t.Errorf("%q => %+v", text, info)
		}
	}
	if info, _ := resolve(t, "select foo| from t"); info.Kind != "" {
		t.Errorf("unknown bare name => %+v", info)
	}
}
