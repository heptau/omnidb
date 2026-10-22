package main

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

// codes lists "code@text" for every diagnostic, sorted, so a test can state
// exactly what is flagged and where.
func codes(text string, diags []sqlDiagnostic) []string {
	var out []string
	for _, d := range diags {
		out = append(out, d.Code+"@"+text[d.Start:d.End])
	}
	sort.Strings(out)
	return out
}

func TestInspectSQL(t *testing.T) {
	cases := []struct {
		sql  string
		want []string
	}{
		{"update t set a = 1", []string{"no_where_update@update"}},
		{"UPDATE t SET a = 1 WHERE id = 3", nil},
		{"delete from t", []string{"no_where_delete@delete"}},
		{"delete from t where id in (select id from u where x = 1)", nil},
		{"delete from t where id in (select id from u)", nil},
		{"with d as (select id from u) delete from t using d", []string{"no_where_delete@delete"}},
		{"update t set a = (select max(b) from u where u.k = t.k)", []string{"no_where_update@update"}},
		{"update t set a = null where b = 1", nil},
		{"select * from t where a = null", []string{"null_comparison@= null"}},
		{"select * from t where a <> null and b != NULL", []string{"null_comparison@<> null", "null_comparison@!= NULL"}},
		{"select * from t where a >= 1 and b <= 2 and c is null", nil},
		{"select a = null from t", nil},
		{"update t set a = null", []string{"no_where_update@update"}},
		{"select * from a join b", []string{"join_without_on@join"}},
		{"select * from a join b on a.id = b.id", nil},
		{"select * from a join b using (id)", nil},
		{"select * from a cross join b", nil},
		{"select * from a natural join b", nil},
		{"select * from a join b x where x.id = 1", []string{"join_without_on@join"}},
		{"select * from a left join (select 1 as id) s on true", []string{"unused_alias@s"}},
		{"select * from a join lateral (select 1) s on true", nil},
		{"select * from customer c where 1 = 1", []string{"unused_alias@c"}},
		{"select c.id from customer c", nil},
		{"select c.id from customer as c join region r on c.r = r.id", nil},
		{"select c.id from customer as c join region r on c.r = c.id", []string{"unused_alias@r"}},
		{"select 1; update t set a = 1; delete from u where 1 = 1", []string{"no_where_update@update"}},
		{"select 'a = null' from t -- where x = null\nwhere y = 1", nil},
		{"", nil},
	}
	for _, c := range cases {
		got := codes(c.sql, inspectSQL(c.sql))
		want := append([]string(nil), c.want...)
		sort.Strings(want)
		if len(got) == 0 && len(want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("%q\n got %v\nwant %v", c.sql, got, want)
		}
	}
}

func TestByteToRowColumn(t *testing.T) {
	text := "select 1;\nžlutý = null"
	i := strings.Index(text, "=")
	if row, col := byteToRowColumn(text, i); row != 1 || col != 6 {
		t.Errorf("row, col = %d, %d, want 1, 6 (columns count characters)", row, col)
	}
	if row, col := byteToRowColumn(text, 0); row != 0 || col != 0 {
		t.Errorf("start = %d, %d", row, col)
	}
	if row, _ := byteToRowColumn(text, 9999); row != 1 {
		t.Errorf("past the end row = %d", row)
	}
}

func TestInspectTables(t *testing.T) {
	db, _ := newCompletionTestDB(t)
	probeCache.Range(func(k, _ any) bool { probeCache.Delete(k); return true })
	cases := []struct {
		sql  string
		want []string
	}{
		{"select * from customer c join region r on c.region_id = r.id", nil},
		{"select * from custmer", []string{"unknown_table@custmer"}},
		{"select * from customer c join regoin r on 1 = 1", []string{"unknown_table@regoin"}},
		{"update ghost_t set a = 1 where 1 = 1", []string{"unknown_table@ghost_t"}},
		{"insert into ghost_t (a) values (1)", []string{"unknown_table@ghost_t"}},
		{"delete from ghost_t where 1 = 1", []string{"unknown_table@ghost_t"}},
		{"with c as (select 1 x) select * from c", nil},
		{"select * into newtable from customer", nil},
		{"select extract(year from d), trim(x from y) from customer where a is distinct from b", nil},
		{"select * from (select 1) s", nil},
		{"select 1; select * from gone", []string{"unknown_table@gone"}},
	}
	for _, c := range cases {
		got := codes(c.sql, inspectTables(db, "test", c.sql))
		if len(got) == 0 && len(c.want) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%q\n got %v\nwant %v", c.sql, got, c.want)
		}
	}

	// A data-modifying CTE is left alone entirely.
	unsafe := "with d as (delete from customer returning id) select * from ghost_t"
	if got := inspectTables(db, "test", unsafe); len(got) != 0 {
		t.Errorf("unsafe CTE statement was probed: %v", got)
	}
}

func TestMissingObjectErrors(t *testing.T) {
	for _, msg := range []string{
		`ERROR: relation "x" does not exist (SQLSTATE 42P01)`, "no such table: x", "Table 'db.x' doesn't exist",
		"Invalid object name 'x'.", "ORA-00942: table or view does not exist", "Table unknown X",
	} {
		if !missingObjectRe.MatchString(msg) {
			t.Errorf("%q not recognised as a missing object", msg)
		}
	}
	for _, msg := range []string{"permission denied for table x", "connection refused", "syntax error at or near ;"} {
		if missingObjectRe.MatchString(msg) {
			t.Errorf("%q wrongly treated as a missing object", msg)
		}
	}
}
