package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newScheduleTestDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	withTestSecretKey(t)
	db := newConnectionOrderDB(t)
	db.SetMaxOpenConns(1)
	target := filepath.Join(t.TempDir(), "target.sqlite")
	for _, stmt := range []string{
		scheduleTableDDL,
		`create table auth_user (id integer primary key, is_superuser bool)`,
		`insert into auth_user values (1, 1), (2, 0)`,
		`insert into OmniDB_app_technology (id, name) values (2, 'sqlite')`,
		`insert into OmniDB_app_connection (id, user_id, technology_id, alias, public, conn_string, database,
			password, port, server, ssh_key, ssh_password, ssh_port, ssh_server, ssh_user, use_tunnel, username)
			values (30, 1, 2, 'file', 0, '', '` + target + `', '', '', '', '', '', '', '', '', 0, '')`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	return db, target
}

func TestScheduleLifecycle(t *testing.T) {
	db, _ := newScheduleTestDB(t)
	now := time.Unix(1_000_000, 0)

	if _, err := addSchedule(db, 1, 30, " ", "select 1", 5, now); err == nil {
		t.Error("blank name must fail")
	}
	if _, err := addSchedule(db, 1, 30, "x", "-- nothing", 5, now); err == nil {
		t.Error("SQL with no statement must fail")
	}
	if _, err := addSchedule(db, 1, 30, "x", "select 1", 0, now); err == nil {
		t.Error("interval below the minimum must fail")
	}
	if _, err := addSchedule(db, 1, 21, "x", "select 1", 5, now); err == nil {
		t.Error("somebody else's private connection must fail")
	}
	id, err := addSchedule(db, 1, 30, "make table", "create table t (a); insert into t values (1),(2); select * from t", 5, now)
	if err != nil {
		t.Fatal(err)
	}

	// Not due yet; due once the interval passed, and then pushed forward.
	if ids, _ := dueSchedules(db, now); len(ids) != 0 {
		t.Errorf("nothing is due at creation, got %v", ids)
	}
	later := now.Add(6 * time.Minute)
	ids, err := dueSchedules(db, later)
	if err != nil || len(ids) != 1 || ids[0] != id {
		t.Fatalf("due = %v, %v", ids, err)
	}
	if again, _ := dueSchedules(db, later); len(again) != 0 {
		t.Errorf("a claimed schedule must not be due again at once, got %v", again)
	}

	run, err := runSchedule(db, id)
	if err != nil || run.Status != "ok" {
		t.Fatalf("run = %+v, %v", run, err)
	}
	if !strings.Contains(run.Message, "2 rows affected") || !strings.Contains(run.Message, "#3 2 rows, 1 columns") {
		t.Errorf("message = %q", run.Message)
	}

	// A failing statement stops the run and is recorded.
	bad, _ := addSchedule(db, 1, 30, "bad", "select * from no_such_table", 5, now)
	run, _ = runSchedule(db, bad)
	if run.Status != "error" || !strings.Contains(run.Message, "no_such_table") {
		t.Errorf("failed run = %+v", run)
	}

	list, err := fetchSchedules(db, 1)
	if err != nil || len(list) != 2 {
		t.Fatalf("list = %v, %v", list, err)
	}
	for _, s := range list {
		if s.Name == "bad" && s.LastStatus != "error" {
			t.Errorf("latest status of bad = %q", s.LastStatus)
		}
	}
	if other, _ := fetchSchedules(db, 2); len(other) != 0 {
		t.Errorf("another user sees %d schedules", len(other))
	}

	// Editing changes the definition, keeps it enabled, and pulls a later run in.
	if err := updateSchedule(db, 1, id, "renamed", "select 2", 1, later); err != nil {
		t.Fatal(err)
	}
	if err := updateSchedule(db, 2, id, "x", "select 2", 1, later); err == nil {
		t.Error("another user must not edit it")
	}
	if err := updateSchedule(db, 1, id, "", "select 2", 1, later); err == nil {
		t.Error("a blank name must fail")
	}
	var gotName string
	var gotNext int64
	db.QueryRow(`select name, next_run from OmniDB_app_schedule where id = ?`, id).Scan(&gotName, &gotNext)
	if gotName != "renamed" || gotNext > later.Unix()+60 {
		t.Errorf("after update: name=%q next=%d", gotName, gotNext)
	}

	// Pausing keeps a schedule from being claimed; resuming restarts its countdown.
	if err := setScheduleEnabled(db, 1, id, false, later); err != nil {
		t.Fatal(err)
	}
	if ids, _ := dueSchedules(db, later.Add(time.Hour)); len(ids) != 1 || ids[0] == id {
		t.Errorf("paused schedule claimed: %v", ids)
	}
	if err := setScheduleEnabled(db, 1, id, true, later); err != nil {
		t.Fatal(err)
	}
	if ids, _ := dueSchedules(db, later); len(ids) != 0 {
		t.Errorf("resumed schedule must wait a full interval, got %v", ids)
	}

	// Somebody else cannot delete it; the owner can, runs included.
	deleteSchedule(db, 2, id)
	if runs, _ := fetchScheduleRuns(db, 1, id); len(runs) != 1 {
		t.Errorf("runs after a foreign delete = %d", len(runs))
	}
	if err := deleteSchedule(db, 1, id); err != nil {
		t.Fatal(err)
	}
	var left int
	db.QueryRow(`select count(*) from OmniDB_app_schedule_run where schedule_id = ?`, id).Scan(&left)
	if left != 0 {
		t.Errorf("%d runs left after delete", left)
	}
}

func TestScheduleRunsPrunedAndReadOnly(t *testing.T) {
	db, _ := newScheduleTestDB(t)
	id, err := addSchedule(db, 1, 30, "r", "select 1", 1, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < scheduleRunsKept+5; i++ {
		if _, err := runSchedule(db, id); err != nil {
			t.Fatal(err)
		}
	}
	if runs, _ := fetchScheduleRuns(db, 1, id); len(runs) != scheduleRunsKept {
		t.Errorf("kept %d runs, want %d", len(runs), scheduleRunsKept)
	}

	if _, err := db.Exec(`update OmniDB_app_connection set read_only = 1 where id = 30`); err != nil {
		t.Skipf("no read_only column in the test schema: %v", err)
	}
	w, _ := addSchedule(db, 1, 30, "w", "create table zz (a)", 1, time.Now())
	run, _ := runSchedule(db, w)
	if run.Status != "error" || !strings.Contains(run.Message, "read-only") {
		t.Errorf("write on a read-only connection: %+v", run)
	}
}

func TestScheduleRejectsTunnelAndSecondRun(t *testing.T) {
	db, _ := newScheduleTestDB(t)
	if _, err := db.Exec(`update OmniDB_app_connection set use_tunnel = 1 where id = 30`); err != nil {
		t.Fatal(err)
	}
	if _, err := addSchedule(db, 1, 30, "t", "select 1", 5, time.Now()); err == nil {
		t.Error("a tunneled connection must be refused")
	}
	runningSchedules.Store(int64(99), true)
	defer runningSchedules.Delete(int64(99))
	if _, err := runSchedule(db, 99); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Errorf("overlapping run: %v", err)
	}
}
