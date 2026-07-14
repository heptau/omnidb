package main

import (
	"database/sql"
	"errors"
	"math"
	"time"
)

const chCmdsPerPage = 20 // mirrors settings.py's CH_CMDS_PER_PAGE

// closeWelcome mirrors workspace.py's close_welcome — silently a no-op if the
// user has no UserDetails row yet, matching Python's try/except-and-ignore.
func closeWelcome(db *sql.DB, userID int64) error {
	_, err := db.Exec(`update OmniDB_app_userdetails set welcome_closed = 1 where user_id = ?`, userID)
	return err
}

// saveConfigUser mirrors save_config_user's UserDetails write ONLY — the
// password-change branch (json_object['p_pwd'] != ”) needs Django's
// PBKDF2 hashing (update_session_auth_hash, etc.) and stays entirely
// out of scope until Fáze 7 native auth, same boundary as the rest of
// users.py; the caller (handleSaveConfigUser) falls back to Django whenever
// p_pwd is non-blank instead of calling this at all. Unlike Python (which
// raises UserDetails.DoesNotExist if the row is somehow missing), a 0-row
// update here is surfaced explicitly rather than silently ignored, since a
// missing row would otherwise look like a silent no-op success.
func saveConfigUser(db *sql.DB, userID int64, theme string, fontSize int, csvEncoding, csvDelimiter string) error {
	res, err := db.Exec(
		`update OmniDB_app_userdetails set theme = ?, font_size = ?, csv_encoding = ?, csv_delimiter = ? where user_id = ?`,
		theme, fontSize, csvEncoding, csvDelimiter, userID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("UserDetails matching query does not exist.")
	}
	return nil
}

// userDetailsRow mirrors the UserDetails columns workspace.py's index()
// reads to build its render context — a superset of userCSVPrefs's two
// fields (native_login.go), which only needed csv_encoding/csv_delimiter at
// login time.
type userDetailsRow struct {
	Theme         string
	FontSize      int
	CSVEncoding   string
	CSVDelimiter  string
	WelcomeClosed bool
}

// fetchUserDetails mirrors workspace.py's "UserDetails.objects.get(user=...)
// except: create with defaults" fallback, same defaults as userCSVPrefs.
func fetchUserDetails(db *sql.DB, userID int64) (userDetailsRow, error) {
	var row userDetailsRow
	err := db.QueryRow(
		`select theme, font_size, csv_encoding, csv_delimiter, welcome_closed from OmniDB_app_userdetails where user_id = ?`,
		userID,
	).Scan(&row.Theme, &row.FontSize, &row.CSVEncoding, &row.CSVDelimiter, &row.WelcomeClosed)
	if err == sql.ErrNoRows {
		if _, insertErr := db.Exec(
			`insert into OmniDB_app_userdetails (user_id, theme, font_size, csv_encoding, csv_delimiter, welcome_closed) values (?, 'light', 12, 'utf-8', ';', 0)`,
			userID,
		); insertErr != nil {
			return userDetailsRow{}, insertErr
		}
		return userDetailsRow{Theme: "light", FontSize: 12, CSVEncoding: "utf-8", CSVDelimiter: ";", WelcomeClosed: false}, nil
	}
	if err != nil {
		return userDetailsRow{}, err
	}
	return row, nil
}

// workspaceShortcut mirrors workspace.py index()'s per-shortcut sub-dict —
// ctrl/shift/alt/meta are rendered as 0/1 ints (not JSON booleans), matching
// Python's "1 if shortcut.ctrl_pressed else 0" exactly, since the frontend
// (shortcuts.js) compares these against numeric event flags.
type workspaceShortcut struct {
	CtrlPressed  int    `json:"ctrl_pressed"`
	ShiftPressed int    `json:"shift_pressed"`
	AltPressed   int    `json:"alt_pressed"`
	MetaPressed  int    `json:"meta_pressed"`
	ShortcutKey  string `json:"shortcut_key"`
	OS           string `json:"os"`
	ShortcutCode string `json:"shortcut_code"`
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// fetchWorkspaceShortcuts mirrors workspace.py index()'s Shortcut.objects.
// filter(user=request.user) loop, keyed by shortcut code same as Python's
// shortcut_object dict.
func fetchWorkspaceShortcuts(db *sql.DB, userID int64) (map[string]workspaceShortcut, error) {
	rows, err := db.Query(
		`select code, os, ctrl_pressed, shift_pressed, alt_pressed, meta_pressed, key from OmniDB_app_shortcut where user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]workspaceShortcut{}
	for rows.Next() {
		var code, os, key string
		var ctrl, shift, alt, meta bool
		if err := rows.Scan(&code, &os, &ctrl, &shift, &alt, &meta, &key); err != nil {
			return nil, err
		}
		out[code] = workspaceShortcut{
			CtrlPressed:  b2i(ctrl),
			ShiftPressed: b2i(shift),
			AltPressed:   b2i(alt),
			MetaPressed:  b2i(meta),
			ShortcutKey:  key,
			OS:           os,
			ShortcutCode: code,
		}
	}
	return out, rows.Err()
}

type shortcutInput struct {
	Code         string
	CtrlPressed  bool
	ShiftPressed bool
	AltPressed   bool
	MetaPressed  bool
	Key          string
}

// saveShortcuts mirrors save_shortcuts — replaces the user's entire shortcut
// set (delete-then-insert), same as the Python original.
func saveShortcuts(db *sql.DB, userID int64, currentOS string, shortcuts []shortcutInput) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`delete from OmniDB_app_shortcut where user_id = ?`, userID); err != nil {
		return err
	}
	for _, s := range shortcuts {
		if _, err := tx.Exec(`
			insert into OmniDB_app_shortcut (user_id, code, os, ctrl_pressed, shift_pressed, alt_pressed, meta_pressed, key)
			values (?, ?, ?, ?, ?, ?, ?, ?)
		`, userID, s.Code, currentOS, s.CtrlPressed, s.ShiftPressed, s.AltPressed, s.MetaPressed, s.Key); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// sqliteDatetimeToJS reformats a datetime string as SQLite/Django stored it
// ("YYYY-MM-DD HH:MM:SS[.ffffff]", naive UTC — USE_TZ=True but the SQLite
// backend stores the wall-clock UTC value as text) into an ISO 8601 string
// with a "Z" suffix, matching what DjangoJSONEncoder would have produced.
// The frontend feeds this straight into `new Date(...)` (see
// command_history.js), which needs a real ISO 8601 string, not SQLite's
// space-separated format.
func sqliteDatetimeToJS(s string) string {
	for _, layout := range []string{"2006-01-02 15:04:05.999999", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format("2006-01-02T15:04:05.000Z")
		}
	}
	return s
}

type queryHistoryRow struct {
	StartTime string
	EndTime   string
	Duration  string
	Status    string
	Snippet   string
}

// statusIconHTML mirrors get_command_list's inline success/error icon markup.
func statusIconHTML(status string) string {
	if status == "success" {
		return `<div class='text-center'><i title='Success' class='fas fa-check text-success action-grid action-status-ok'></i></div>`
	}
	return `<div class='text-center'><i title='Error' class='fas fa-exclamation-circle text-danger action-grid action-status-error'></i></div>`
}

// fetchQueryHistory mirrors get_command_list's query+pagination. connID is
// p_database_index used directly as the connection id — same as Python,
// which only ever uses v_database.v_conn_id, and v_database is looked up
// from v_session.v_databases keyed BY connection id in the first place, so
// v_conn_id == p_database_index always.
func fetchQueryHistory(db *sql.DB, userID, connID int64, contains, from, to string, page int) ([]queryHistoryRow, int, error) {
	where := `where user_id = ? and connection_id = ? and snippet like ?`
	args := []any{userID, connID, "%" + contains + "%"}
	if from != "" {
		where += ` and start_time >= ?`
		args = append(args, from)
	}
	if to != "" {
		where += ` and start_time <= ?`
		args = append(args, to)
	}

	var count int
	if err := db.QueryRow(`select count(*) from OmniDB_app_queryhistory `+where, args...).Scan(&count); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * chCmdsPerPage
	rows, err := db.Query(`
		select start_time, end_time, duration, status, snippet
		from OmniDB_app_queryhistory `+where+`
		order by start_time desc
		limit ? offset ?
	`, append(args, chCmdsPerPage, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []queryHistoryRow
	for rows.Next() {
		var r queryHistoryRow
		if err := rows.Scan(&r.StartTime, &r.EndTime, &r.Duration, &r.Status, &r.Snippet); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, count, rows.Err()
}

// clearQueryHistory mirrors clear_command_list.
func clearQueryHistory(db *sql.DB, userID, connID int64, contains, from, to string) error {
	where := `where user_id = ? and connection_id = ? and snippet like ?`
	args := []any{userID, connID, "%" + contains + "%"}
	if from != "" {
		where += ` and start_time >= ?`
		args = append(args, from)
	}
	if to != "" {
		where += ` and start_time <= ?`
		args = append(args, to)
	}
	_, err := db.Exec(`delete from OmniDB_app_queryhistory `+where, args...)
	return err
}

type consoleHistoryRow struct {
	StartTime string
	Snippet   string
}

// fetchConsoleHistory mirrors get_console_history.
func fetchConsoleHistory(db *sql.DB, userID, connID int64, contains, from, to string, page int) ([]consoleHistoryRow, int, error) {
	where := `where user_id = ? and connection_id = ? and snippet like ?`
	args := []any{userID, connID, "%" + contains + "%"}
	if from != "" {
		where += ` and start_time >= ?`
		args = append(args, from)
	}
	if to != "" {
		where += ` and start_time <= ?`
		args = append(args, to)
	}

	var count int
	if err := db.QueryRow(`select count(*) from OmniDB_app_consolehistory `+where, args...).Scan(&count); err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * chCmdsPerPage
	rows, err := db.Query(`
		select start_time, snippet
		from OmniDB_app_consolehistory `+where+`
		order by start_time desc
		limit ? offset ?
	`, append(args, chCmdsPerPage, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []consoleHistoryRow
	for rows.Next() {
		var r consoleHistoryRow
		if err := rows.Scan(&r.StartTime, &r.Snippet); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, count, rows.Err()
}

// clearConsoleHistory mirrors clear_console_list.
func clearConsoleHistory(db *sql.DB, userID, connID int64, contains, from, to string) error {
	where := `where user_id = ? and connection_id = ? and snippet like ?`
	args := []any{userID, connID, "%" + contains + "%"}
	if from != "" {
		where += ` and start_time >= ?`
		args = append(args, from)
	}
	if to != "" {
		where += ` and start_time <= ?`
		args = append(args, to)
	}
	_, err := db.Exec(`delete from OmniDB_app_consolehistory `+where, args...)
	return err
}

// pageCount mirrors "ceil(v_count/settings.CH_CMDS_PER_PAGE)", floored at 1.
func pageCount(count int) int {
	pages := int(math.Ceil(float64(count) / float64(chCmdsPerPage)))
	if pages == 0 {
		return 1
	}
	return pages
}
