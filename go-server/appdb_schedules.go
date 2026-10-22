package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Scheduled queries: SQL a user asked OmniDB to run on a connection every N
// minutes, with the outcome of each run kept as a short history. The
// scheduler lives inside the server process, so it only runs while OmniDB
// does (a run that came due while it was closed happens once at the next
// start, not once per missed interval).

const scheduleTableDDL = `
CREATE TABLE IF NOT EXISTS "OmniDB_app_schedule" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"connection_id" integer NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"name" varchar(200) NOT NULL,
	"sql" text NOT NULL,
	"interval_minutes" integer NOT NULL,
	"enabled" bool NOT NULL DEFAULT 1,
	"next_run" integer NOT NULL,
	"create_date" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_schedule_user_id" ON "OmniDB_app_schedule" ("user_id");
CREATE TABLE IF NOT EXISTS "OmniDB_app_schedule_run" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"schedule_id" integer NOT NULL REFERENCES "OmniDB_app_schedule" ("id") ON DELETE CASCADE,
	"started" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" varchar(10) NOT NULL,
	"message" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_schedule_run_schedule_id" ON "OmniDB_app_schedule_run" ("schedule_id");`

const (
	minScheduleInterval = 1
	maxScheduleInterval = 7 * 24 * 60
	// scheduleRunTimeout bounds one run so a hung query cannot hold a
	// schedule (or the process's connections) forever.
	scheduleRunTimeout = 10 * time.Minute
	// scheduleRunsKept is how many past runs each schedule remembers.
	scheduleRunsKept = 50
	// scheduleMessageMax caps the stored outcome text of a run.
	scheduleMessageMax = 2000
	schedulerTick      = 30 * time.Second
)

type schedule struct {
	ID           int64
	ConnectionID int64
	Alias        string
	Name         string
	SQL          string
	Interval     int
	Enabled      bool
	NextRun      int64
	LastStarted  int64
	LastStatus   string
	LastMessage  string
}

type scheduleRun struct {
	ID         int64
	Started    int64
	DurationMS int64
	Status     string
	Message    string
}

// fetchSchedules lists the user's schedules on connections they can still
// see, each with the outcome of its latest run.
func fetchSchedules(db *sql.DB, userID int64) ([]schedule, error) {
	rows, err := db.Query(`
		select s.id, s.connection_id, c.alias, s.name, s.sql, s.interval_minutes, s.enabled, s.next_run,
			coalesce((select r.started from OmniDB_app_schedule_run r where r.schedule_id = s.id order by r.id desc limit 1), 0),
			coalesce((select r.status from OmniDB_app_schedule_run r where r.schedule_id = s.id order by r.id desc limit 1), ''),
			coalesce((select r.message from OmniDB_app_schedule_run r where r.schedule_id = s.id order by r.id desc limit 1), '')
		from OmniDB_app_schedule s
		join OmniDB_app_connection c on c.id = s.connection_id
		where s.user_id = ? and (c.user_id = ? or c.public = 1)
		order by s.name, s.id`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []schedule{}
	for rows.Next() {
		var s schedule
		if err := rows.Scan(&s.ID, &s.ConnectionID, &s.Alias, &s.Name, &s.SQL, &s.Interval, &s.Enabled, &s.NextRun,
			&s.LastStarted, &s.LastStatus, &s.LastMessage); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// addSchedule saves a new, enabled schedule whose first run is one interval
// from now.
func addSchedule(db *sql.DB, userID, connectionID int64, name, sqlText string, interval int, now time.Time) (int64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, errors.New("a schedule needs a name")
	}
	if len(scriptStatements(sqlText)) == 0 {
		return 0, errors.New("a schedule needs SQL to run")
	}
	if interval < minScheduleInterval || interval > maxScheduleInterval {
		return 0, fmt.Errorf("the interval must be between %d and %d minutes", minScheduleInterval, maxScheduleInterval)
	}
	c, err := fetchConnectionByID(db, connectionID)
	if err != nil || (c.OwnerID != userID && !c.Public) {
		return 0, errors.New("connection not found")
	}
	if err := checkSchedulable(c); err != nil {
		return 0, err
	}
	res, err := db.Exec(`insert into OmniDB_app_schedule (user_id, connection_id, name, sql, interval_minutes, enabled, next_run)
		values (?, ?, ?, ?, ?, 1, ?)`, userID, connectionID, name, sqlText, interval, now.Add(time.Duration(interval)*time.Minute).Unix())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// checkSchedulable refuses connections a background job cannot open on its
// own: those needing an SSH tunnel or a token that only a signed-in browser
// session can supply.
func checkSchedulable(c *appConnection) error {
	if c.UseTunnel {
		return errors.New("connections that use an SSH tunnel cannot be scheduled")
	}
	if c.AuthMethod != "" {
		return errors.New("only password connections can be scheduled")
	}
	return nil
}

// setScheduleEnabled pauses or resumes one of the user's schedules; resuming
// restarts its countdown so it does not fire at once for time spent paused.
func setScheduleEnabled(db *sql.DB, userID, id int64, enabled bool, now time.Time) error {
	_, err := db.Exec(`update OmniDB_app_schedule set enabled = ?,
		next_run = case when ? then ? + interval_minutes * 60 else next_run end
		where id = ? and user_id = ?`, enabled, enabled, now.Unix(), id, userID)
	return err
}

func deleteSchedule(db *sql.DB, userID, id int64) error {
	var owned int
	if err := db.QueryRow(`select count(*) from OmniDB_app_schedule where id = ? and user_id = ?`, id, userID).Scan(&owned); err != nil {
		return err
	}
	if owned == 0 {
		return nil
	}
	if _, err := db.Exec(`delete from OmniDB_app_schedule_run where schedule_id = ?`, id); err != nil {
		return err
	}
	_, err := db.Exec(`delete from OmniDB_app_schedule where id = ?`, id)
	return err
}

// fetchScheduleRuns lists a schedule's remembered runs, newest first.
func fetchScheduleRuns(db *sql.DB, userID, id int64) ([]scheduleRun, error) {
	rows, err := db.Query(`select r.id, r.started, r.duration_ms, r.status, r.message
		from OmniDB_app_schedule_run r join OmniDB_app_schedule s on s.id = r.schedule_id
		where r.schedule_id = ? and s.user_id = ? order by r.id desc`, id, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []scheduleRun{}
	for rows.Next() {
		var r scheduleRun
		if err := rows.Scan(&r.ID, &r.Started, &r.DurationMS, &r.Status, &r.Message); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// rowReturningWords are the statements run as a query (their rows are
// counted) rather than as a command (their affected rows are reported).
var rowReturningWords = map[string]bool{
	"select": true, "with": true, "show": true, "explain": true, "pragma": true,
	"values": true, "describe": true, "desc": true, "table": true,
}

func firstWord(stmt string) string {
	fields := strings.Fields(strings.TrimLeft(sqlSkeleton(stmt), " \t\r\n("))
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(strings.TrimRight(fields[0], ";"))
}

// executeScheduledSQL runs the statements of a schedule one after another and
// describes what each did; it stops at the first one that fails.
func executeScheduledSQL(ctx context.Context, db *sql.DB, readOnly bool, sqlText string) (string, error) {
	if readOnly {
		if err := checkReadOnlySQL(sqlText); err != nil {
			return "", err
		}
	}
	var report []string
	for i, stmt := range scriptStatements(sqlText) {
		prefix := fmt.Sprintf("#%d ", i+1)
		if rowReturningWords[firstWord(stmt)] {
			rows, err := db.QueryContext(ctx, stmt)
			if err != nil {
				return strings.Join(report, "\n"), fmt.Errorf("%sfailed: %w", prefix, err)
			}
			cols, _ := rows.Columns()
			count := 0
			for rows.Next() {
				count++
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return strings.Join(report, "\n"), fmt.Errorf("%sfailed: %w", prefix, err)
			}
			report = append(report, fmt.Sprintf("%s%d rows, %d columns", prefix, count, len(cols)))
			continue
		}
		res, err := db.ExecContext(ctx, stmt)
		if err != nil {
			return strings.Join(report, "\n"), fmt.Errorf("%sfailed: %w", prefix, err)
		}
		if n, err := res.RowsAffected(); err == nil {
			report = append(report, fmt.Sprintf("%s%d rows affected", prefix, n))
		} else {
			report = append(report, prefix+"done")
		}
	}
	return strings.Join(report, "\n"), nil
}

func truncateMessage(s string) string {
	if len(s) <= scheduleMessageMax {
		return s
	}
	cut := scheduleMessageMax
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…"
}

// runningSchedules keeps a schedule from starting again while a previous run
// of it is still going.
var runningSchedules sync.Map

// runSchedule executes one schedule now and records the outcome. A run that
// is still in progress makes this a no-op that reports as much.
func runSchedule(appdb *sql.DB, id int64) (scheduleRun, error) {
	run := scheduleRun{Started: time.Now().Unix(), Status: "error"}
	if _, busy := runningSchedules.LoadOrStore(id, true); busy {
		return run, errors.New("this schedule is already running")
	}
	defer runningSchedules.Delete(id)

	var connID, userID int64
	var sqlText string
	if err := appdb.QueryRow(`select connection_id, user_id, sql from OmniDB_app_schedule where id = ?`, id).Scan(&connID, &userID, &sqlText); err != nil {
		return run, errors.New("schedule not found")
	}
	start := time.Now()
	message, err := func() (string, error) {
		c, err := fetchConnectionByID(appdb, connID)
		if err != nil || (c.OwnerID != userID && !c.Public) {
			return "", errors.New("connection not found")
		}
		if err := checkSchedulable(c); err != nil {
			return "", err
		}
		if c.Technology == "sqlite" && !sqliteAllowedFor(&WhoAmI{SuperUser: userIsSuperuser(appdb, userID)}) {
			return "", errSQLiteRestricted
		}
		if !nativeQueryTechnology(c.Technology) {
			return "", fmt.Errorf("%s connections cannot be scheduled", c.Technology)
		}
		target, err := openNativeQueryTarget(connectionInfoFromApp(c))
		if err != nil {
			return "", err
		}
		defer target.Close()
		ctx, cancel := context.WithTimeout(shutdownCtx, scheduleRunTimeout)
		defer cancel()
		return executeScheduledSQL(ctx, target, c.ReadOnly, sqlText)
	}()
	run.DurationMS = time.Since(start).Milliseconds()
	if err != nil {
		run.Message = truncateMessage(strings.TrimSpace(message + "\n" + err.Error()))
	} else {
		run.Status = "ok"
		run.Message = truncateMessage(message)
	}
	res, dbErr := appdb.Exec(`insert into OmniDB_app_schedule_run (schedule_id, started, duration_ms, status, message) values (?, ?, ?, ?, ?)`,
		id, run.Started, run.DurationMS, run.Status, run.Message)
	if dbErr != nil {
		return run, dbErr
	}
	run.ID, _ = res.LastInsertId()
	_, dbErr = appdb.Exec(`delete from OmniDB_app_schedule_run where schedule_id = ? and id not in
		(select id from OmniDB_app_schedule_run where schedule_id = ? order by id desc limit ?)`, id, id, scheduleRunsKept)
	return run, dbErr
}

func userIsSuperuser(db *sql.DB, userID int64) bool {
	var su bool
	if err := db.QueryRow(`select is_superuser from auth_user where id = ?`, userID).Scan(&su); err != nil {
		return false
	}
	return su
}

// dueSchedules claims the enabled schedules whose time has come: it moves
// each one's next run forward before returning it, so a slow run is never
// started a second time by the next tick.
func dueSchedules(db *sql.DB, now time.Time) ([]int64, error) {
	rows, err := db.Query(`select id, interval_minutes from OmniDB_app_schedule where enabled = 1 and next_run <= ?`, now.Unix())
	if err != nil {
		return nil, err
	}
	type due struct {
		id       int64
		interval int
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.interval); err != nil {
			rows.Close()
			return nil, err
		}
		list = append(list, d)
	}
	rows.Close()
	ids := make([]int64, 0, len(list))
	for _, d := range list {
		if _, err := db.Exec(`update OmniDB_app_schedule set next_run = ? where id = ?`,
			now.Add(time.Duration(d.interval)*time.Minute).Unix(), d.id); err != nil {
			return nil, err
		}
		ids = append(ids, d.id)
	}
	return ids, nil
}

// startScheduler runs due schedules until the process shuts down.
func startScheduler(upstream *url.URL) {
	go func() {
		ticker := time.NewTicker(schedulerTick)
		defer ticker.Stop()
		for {
			tickSchedules(upstream)
			select {
			case <-shutdownCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func tickSchedules(upstream *url.URL) {
	db, err := openAppDB(upstream)
	if err != nil {
		log.Printf("scheduler: %v", err)
		return
	}
	ids, err := dueSchedules(db, time.Now())
	db.Close()
	if err != nil {
		log.Printf("scheduler: %v", err)
		return
	}
	for _, id := range ids {
		go func(id int64) {
			db, err := openAppDB(upstream)
			if err != nil {
				log.Printf("scheduler: %v", err)
				return
			}
			defer db.Close()
			if _, err := runSchedule(db, id); err != nil {
				log.Printf("scheduler: schedule %d: %v", id, err)
			}
		}(id)
	}
}

func runJSON(r scheduleRun) map[string]any {
	return map[string]any{"id": r.ID, "started": r.Started, "duration_ms": r.DurationMS, "status": r.Status, "message": r.Message}
}

func handleGetSchedules(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		list, err := fetchSchedules(db, int64(who.UserID))
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		out := make([]map[string]any, len(list))
		for i, s := range list {
			out[i] = map[string]any{
				"id": s.ID, "conn_id": s.ConnectionID, "alias": s.Alias, "name": s.Name, "sql": s.SQL,
				"interval": s.Interval, "enabled": s.Enabled, "next_run": s.NextRun,
				"last_started": s.LastStarted, "last_status": s.LastStatus, "last_message": s.LastMessage,
			}
		}
		writeEnvelope(w, out, false, -1)
	}
}

type scheduleRequest struct {
	ID       int64  `json:"p_id"`
	ConnID   int64  `json:"p_conn_id"`
	Name     string `json:"p_name"`
	SQL      string `json:"p_sql"`
	Interval int    `json:"p_interval"`
	Enabled  bool   `json:"p_enabled"`
}

// scheduleHandler wraps the parse/auth boilerplate shared by the schedule
// endpoints; act returns the response data.
func scheduleHandler(upstream *url.URL, act func(db *sql.DB, userID int64, req scheduleRequest) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req scheduleRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		data, err := act(db, int64(who.UserID), req)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleAddSchedule(upstream *url.URL) http.HandlerFunc {
	return scheduleHandler(upstream, func(db *sql.DB, userID int64, req scheduleRequest) (any, error) {
		id, err := addSchedule(db, userID, req.ConnID, req.Name, req.SQL, req.Interval, time.Now())
		return id, err
	})
}

func handleSetScheduleEnabled(upstream *url.URL) http.HandlerFunc {
	return scheduleHandler(upstream, func(db *sql.DB, userID int64, req scheduleRequest) (any, error) {
		return "", setScheduleEnabled(db, userID, req.ID, req.Enabled, time.Now())
	})
}

func handleDeleteSchedule(upstream *url.URL) http.HandlerFunc {
	return scheduleHandler(upstream, func(db *sql.DB, userID int64, req scheduleRequest) (any, error) {
		return "", deleteSchedule(db, userID, req.ID)
	})
}

func handleGetScheduleRuns(upstream *url.URL) http.HandlerFunc {
	return scheduleHandler(upstream, func(db *sql.DB, userID int64, req scheduleRequest) (any, error) {
		runs, err := fetchScheduleRuns(db, userID, req.ID)
		out := make([]map[string]any, len(runs))
		for i, r := range runs {
			out[i] = runJSON(r)
		}
		return out, err
	})
}

func handleRunScheduleNow(upstream *url.URL) http.HandlerFunc {
	return scheduleHandler(upstream, func(db *sql.DB, userID int64, req scheduleRequest) (any, error) {
		var owned int
		if err := db.QueryRow(`select count(*) from OmniDB_app_schedule where id = ? and user_id = ?`, req.ID, userID).Scan(&owned); err != nil {
			return nil, err
		}
		if owned == 0 {
			return nil, errors.New("schedule not found")
		}
		run, err := runSchedule(db, req.ID)
		if err != nil && run.ID == 0 {
			return nil, err
		}
		return runJSON(run), nil
	})
}
