package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckReadOnlySQL(t *testing.T) {
	allowed := []string{
		"select * from t",
		"  SELECT 1;",
		"-- note\nselect a from t where x = 'delete me'",
		"select \"update\" from t",
		"with x as (select 1) select * from x",
		"show tables",
		"explain select * from t",
		"begin; select 1; commit",
		"set search_path to public",
		"pragma table_info(t)",
		"(select 1) union (select 2)",
		"select replace(a, 'x', 'y') from t",
		"select 1; select 2;",
	}
	for _, s := range allowed {
		if err := checkReadOnlySQL(s); err != nil {
			t.Errorf("checkReadOnlySQL(%q) = %v, want nil", s, err)
		}
	}
	refused := []string{
		"insert into t values (1)",
		"update t set a = 1",
		"delete from t",
		"drop table t",
		"truncate t",
		"create table x (a int)",
		"select 1; delete from t",
		"/* c */ update t set a = 1",
		"with x as (delete from t returning *) select * from x",
		"select * into newt from t",
		"select * from t for update",
		"explain analyze update t set a = 1",
		"set default_transaction_read_only = off",
		"set transaction read write",
		"pragma query_only = 0",
		"call do_it()",
		"merge into t using s on 1=1 when matched then delete",
	}
	for _, s := range refused {
		err := checkReadOnlySQL(s)
		if err == nil || !strings.Contains(err.Error(), "read-only") {
			t.Errorf("checkReadOnlySQL(%q) = %v, want a read-only error", s, err)
		}
	}
}

func TestOpenSQLiteTargetReadOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "with space.db")
	rw, err := openSQLiteTarget(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rw.Exec("create table t (a int)"); err != nil {
		t.Fatal(err)
	}
	rw.Close()

	ro, err := openSQLiteTargetReadOnly(path)
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()
	// Several connections of the pool must all be read-only.
	ro.SetMaxOpenConns(3)
	for i := 0; i < 3; i++ {
		if _, err := ro.Exec("insert into t values (1)"); err == nil {
			t.Fatalf("insert %d succeeded on a read-only SQLite connection", i)
		}
	}
	var n int
	if err := ro.QueryRow("select count(*) from t").Scan(&n); err != nil || n != 0 {
		t.Fatalf("select on read-only connection: n=%d err=%v", n, err)
	}
}
