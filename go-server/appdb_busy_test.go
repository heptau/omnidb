package main

import (
	"database/sql"
	"os"
	"testing"
	"time"
)

// A second pool writing while the first holds the write lock must wait, not
// fail with "database is locked".
func TestAppDBDSNWaitsForLock(t *testing.T) {
	dir := t.TempDir() + "/Application Support"
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	dsn := dir + "/x.db?_pragma=busy_timeout(10000)"
	a, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, _ := sql.Open("sqlite", dsn)
	defer b.Close()
	if _, err := a.Exec("create table t(x)"); err != nil {
		t.Fatal(err)
	}
	tx, _ := a.Begin()
	tx.Exec("insert into t values (1)")
	go func() { time.Sleep(500 * time.Millisecond); tx.Commit() }()
	if _, err := b.Exec("insert into t values (2)"); err != nil {
		t.Fatalf("second writer failed instead of waiting: %v", err)
	}
}
