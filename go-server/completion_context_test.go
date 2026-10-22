package main

import (
	"database/sql"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func newCompletionTestDB(t *testing.T) (*sql.DB, *ConnectionInfo) {
	t.Helper()
	db, err := openSQLiteTarget(filepath.Join(t.TempDir(), "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, stmt := range []string{
		`create table region (id integer primary key, name text)`,
		`create table customer (id integer primary key, name text, region_id integer references region(id))`,
		`create table order_line (order_id integer, line_no integer, customer_id integer references customer(id), qty int,
			primary key (order_id, line_no))`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	return db, &ConnectionInfo{Technology: "sqlite"}
}

// complete mimics the handler for a bare word or a "qualifier." word and returns
// the offered values of every group.
func complete(t *testing.T, db *sql.DB, info *ConnectionInfo, text string) map[string][]string {
	t.Helper()
	ctx, word := at(t, text)
	i := strings.Index(text, "|")
	_ = i
	var groups []autocompleteGroup
	if strings.HasSuffix(word, ".") {
		if g := qualifiedColumnGroup(db, ctx, word, strings.TrimSuffix(word, ".")); g != nil {
			groups = append(groups, *g)
		}
	} else {
		groups = contextualGroups(db, info, ctx, word)
	}
	out := map[string][]string{}
	for _, g := range groups {
		for _, e := range g.Elements {
			out[g.Type] = append(out[g.Type], e.Value)
		}
	}
	return out
}

func TestQualifiedCompletion(t *testing.T) {
	db, info := newCompletionTestDB(t)
	want := []string{"c.id", "c.name", "c.region_id"}
	for _, text := range []string{
		"select c.| from customer c",
		"select c.| from customer as c",
		"select * from customer as c where c.|",
		"select * from region r join customer c on r.id = c.|",
		"select c.| from customer c, region r",
	} {
		if got := complete(t, db, info, text)["column"]; !reflect.DeepEqual(got, want) {
			t.Errorf("%q => %v, want %v", text, got, want)
		}
	}
	// By table name, with no alias.
	if got := complete(t, db, info, "select customer.| from customer")["column"]; !reflect.DeepEqual(got, []string{"customer.id", "customer.name", "customer.region_id"}) {
		t.Errorf("by table name => %v", got)
	}
	// The alias of the other statement must not leak.
	if got := complete(t, db, info, "select 1 from region r; select r.| from customer r")["column"]; !reflect.DeepEqual(got, []string{"r.id", "r.name", "r.region_id"}) {
		t.Errorf("second statement => %v", got)
	}
	if got := complete(t, db, info, "select zz.| from customer c")["column"]; got != nil {
		t.Errorf("unknown qualifier => %v", got)
	}
}

func TestCTECompletion(t *testing.T) {
	db, info := newCompletionTestDB(t)
	text := "with big as (select id, name from customer where id > 1), pair as (select b.id as bid from big b) "
	for _, c := range []struct {
		sql  string
		want []string
	}{
		{text + "select b.| from big b", []string{"b.id", "b.name"}},
		{text + "select big.| from big", []string{"big.id", "big.name"}},
		{text + "select p.| from pair p", []string{"p.bid"}},
		{"with n(a, b) as (select 1, 2) select n.| from n", []string{"n.a", "n.b"}},
	} {
		if got := complete(t, db, info, c.sql)["column"]; !reflect.DeepEqual(got, c.want) {
			t.Errorf("%q => %v, want %v", c.sql, got, c.want)
		}
	}
	// Bare columns come from the CTE too.
	if got := complete(t, db, info, "with big as (select id, name from customer) select na| from big")["column"]; !reflect.DeepEqual(got, []string{"name"}) {
		t.Errorf("bare column from CTE => %v", got)
	}
	// A data-modifying CTE must never be probed.
	unsafe := "with d as (delete from customer returning id) select d.| from d"
	if got := complete(t, db, info, unsafe)["column"]; got != nil {
		t.Errorf("unsafe CTE was probed: %v", got)
	}
	var n int
	db.QueryRow(`select count(*) from customer`).Scan(&n)
	if n != 0 {
		t.Errorf("rows in customer = %d", n)
	}
}

func TestBareColumnCompletion(t *testing.T) {
	db, info := newCompletionTestDB(t)
	got := complete(t, db, info, "select na| from customer c join region r on c.region_id = r.id")
	if !reflect.DeepEqual(got["column"], []string{"name"}) {
		t.Errorf("bare name => %v", got)
	}
	ctx, _ := at(t, "select na| from customer c join region r on c.region_id = r.id")
	if g := unqualifiedColumnGroup(db, ctx, "na"); g == nil || g.Elements[0].Complement != "TEXT · c, r" && !strings.HasSuffix(g.Elements[0].Complement, "· c, r") {
		t.Errorf("complement should name both sources: %+v", g)
	}
	// Single table: no source in the complement.
	ctx, _ = at(t, "select | from region")
	if g := unqualifiedColumnGroup(db, ctx, ""); g == nil || len(g.Elements) != 2 || strings.Contains(g.Elements[0].Complement, "·") {
		t.Errorf("single table group = %+v", g)
	}
	// WHERE, GROUP BY, ORDER BY, UPDATE ... SET and INSERT column lists offer columns too.
	for _, text := range []string{
		"select * from customer where reg|", "select * from customer group by reg|", "select * from customer order by reg|",
		"update customer set reg|", "insert into customer (reg|",
	} {
		if got := complete(t, db, info, text)["column"]; !reflect.DeepEqual(got, []string{"region_id"}) {
			t.Errorf("%q => %v", text, got)
		}
	}
	// Nothing to suggest without a table.
	if got := complete(t, db, info, "select na|"); len(got) != 0 {
		t.Errorf("no tables => %v", got)
	}
	// After FROM the same word completes tables, not columns.
	if got := complete(t, db, info, "select * from cu|"); !reflect.DeepEqual(got["table"], []string{"customer"}) || got["column"] != nil {
		t.Errorf("from clause => %v", got)
	}
}

func TestJoinConditionCompletion(t *testing.T) {
	db, info := newCompletionTestDB(t)
	for text, want := range map[string]string{
		"select * from customer c join region r on |":                                          "c.region_id = r.id",
		"select * from region r join customer c on |":                                          "c.region_id = r.id",
		"select * from customer join region on |":                                              "customer.region_id = region.id",
		"select * from region r join customer c on c.|":                                        "",
		"select * from customer c join order_line ol on |":                                     "ol.customer_id = c.id",
		"select * from order_line ol left join customer c on ol.c|":                            "ol.customer_id = c.id",
		"select * from region r join customer c on c.region_id = r.id join order_line ol on |": "ol.customer_id = c.id",
	} {
		got := complete(t, db, info, text)["column"]
		if want == "" {
			continue
		}
		found := false
		for _, v := range got {
			if v == want {
				found = true
			}
		}
		if !found {
			t.Errorf("%q => %v, want to include %q", text, got, want)
		}
	}
	// Tables with no foreign key between them get plain columns only.
	got := complete(t, db, info, "select * from region r join order_line ol on |")["column"]
	for _, v := range got {
		if strings.Contains(v, " = ") {
			t.Errorf("a join condition was invented: %v", got)
		}
	}
}

func TestTableNameCompletion(t *testing.T) {
	db, info := newCompletionTestDB(t)
	got := complete(t, db, info, "with cte1 as (select 1 x) select * from c|")
	if !reflect.DeepEqual(got["table"], []string{"cte1", "customer"}) {
		t.Errorf("tables and CTEs => %v", got)
	}
	if got := complete(t, db, info, "select * from region r join |")["table"]; len(got) != 3 {
		t.Errorf("join clause lists %v", got)
	}
	if got := complete(t, db, info, "select * from region r where |")["table"]; got != nil {
		t.Errorf("where clause listed tables: %v", got)
	}
}
