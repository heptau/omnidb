package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"
)

// consoleSession holds one console tab's persistent, single connection
// between separate HTTP requests — mirrors what Python keeps alive on
// tab_object['omnidatabase'].v_connection for the lifetime of a console tab
// (Session.py never closes it between keystrokes the same way a query tab's
// cursor gets closed on result-set exhaustion).
//
// Deliberately a raw *sql.Conn, NOT a *sql.Tx: a console user can type
// "BEGIN"/"COMMIT"/"ROLLBACK" as literal SQL text, exactly like typing it
// into a real psql/mysql/sqlplus session — Go's sql.Tx wraps its own
// Commit()/Rollback() methods and doesn't expect the underlying connection
// to see those as ordinary statements, so using it here would fight the
// user's own typed transaction commands instead of just relaying them to
// the server like Python's raw DB-API connection does.
type consoleSession struct {
	mu            sync.Mutex
	db            *sql.DB
	conn          *sql.Conn
	technology    string
	expanded      bool // "\x" toggle
	timing        bool // "\timing" toggle
	autocommitOff bool // updated from v_autocommit on every request
	inTx          bool // an implicit transaction is open (autocommit off)
	txErrored     bool // last statement in that transaction failed
}

var consoleSessions sync.Map // map[string]*consoleSession, keyed by cursorKey(clientID, tabID)

// openOrReuseConsoleSession mirrors thread_console's `if not v_con or
// GetConStatus()==0: Open() else: v_start=True` — reuse an already-open
// session for this tab if its connection still answers, otherwise open a
// fresh one (replacing whatever was there).
func openOrReuseConsoleSession(clientID, tabID string, info *ConnectionInfo) (*consoleSession, error) {
	key := cursorKey(clientID, tabID)
	if v, ok := consoleSessions.Load(key); ok {
		sess := v.(*consoleSession)
		if sess.conn.PingContext(context.Background()) == nil {
			return sess, nil
		}
		closeConsoleSession(clientID, tabID)
	}

	db, err := openNativeQueryTarget(info)
	if err != nil {
		return nil, err
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		db.Close()
		return nil, err
	}
	sess := &consoleSession{db: db, conn: conn, technology: info.Technology}
	consoleSessions.Store(key, sess)
	return sess, nil
}

// closeConsoleSession releases a tab's persistent console connection, if
// any. Safe to call for tabs Go never touched.
func closeConsoleSession(clientID, tabID string) {
	key := cursorKey(clientID, tabID)
	v, ok := consoleSessions.LoadAndDelete(key)
	if !ok {
		return
	}
	sess := v.(*consoleSession)
	sess.mu.Lock()
	defer sess.mu.Unlock()
	sess.conn.Close()
	sess.db.Close()
}

// closeConsoleSessionsForClient releases every console session a client
// still holds open — used on /clear_client/ so an abandoned tab doesn't
// leak an open connection indefinitely.
func closeConsoleSessionsForClient(clientID string) {
	prefix := clientID + "|"
	var keys []string
	consoleSessions.Range(func(key, _ any) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
		return true
	})
	for _, k := range keys {
		if v, ok := consoleSessions.LoadAndDelete(k); ok {
			sess := v.(*consoleSession)
			sess.mu.Lock()
			sess.conn.Close()
			sess.db.Close()
			sess.mu.Unlock()
		}
	}
}

// conStatus mirrors query.js's setTabStatus codes (1=idle, 3=idle in
// transaction, 4=idle in transaction, aborted) — not a byte-for-byte port of
// psycopg2's get_transaction_status() (which only Postgres has), but the
// same practical states the UI actually distinguishes, derived generically
// from the BEGIN/COMMIT/ROLLBACK bookkeeping every engine's session tracks
// the same way here.
func (s *consoleSession) conStatus() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.inTx && s.txErrored {
		return 4
	}
	if s.inTx {
		return 3
	}
	return 1
}

// consoleFirstWord mirrors Special()'s `p_sql.lstrip().split(' ')[0].rstrip('+')`.
func consoleFirstWord(stmt string) string {
	trimmed := strings.TrimLeft(stmt, " \t\r\n")
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return ""
	}
	return strings.TrimRight(fields[0], "+")
}

// consoleReturnsRows reports whether a statement's first keyword produces a
// result set (so it must run via Query, not Exec, to get columns/rows back)
// — this is a Go/database/sql necessity (Python's DB-API cursor.execute()
// handles both uniformly), not a port of anything in Special() itself.
func consoleReturnsRows(stmt string) bool {
	switch strings.ToUpper(consoleFirstWord(stmt)) {
	case "SELECT", "WITH", "SHOW", "EXPLAIN", "DESC", "DESCRIBE", "PRAGMA", "VALUES":
		return true
	}
	return false
}

// consoleStatusLine mirrors MySQL/MariaDB/Oracle's Special() status text —
// standardized across all 4 engines in this port (see console.go's package
// comment on the Postgres server-cursor simplification): "N rows in set"
// for a row-returning statement, "N rows affected" otherwise, singular for
// exactly one row.
func consoleStatusLine(count int, returnsRows bool) string {
	noun := "rows"
	if count == 1 {
		noun = "row"
	}
	verb := "affected"
	if returnsRows {
		verb = "in set"
	}
	return fmt.Sprintf("%d %s %s", count, noun, verb)
}

// consoleHelpTable mirrors v_help — deliberately the same 3 rows for every
// engine (\?, \x, \timing), NOT Postgres's much larger pgspecial-backed set
// (\dt, \d, \du, \l, \df, ...). Porting pgspecial's catalog-query-driven
// meta-commands is a real, separately-scoped chunk of work (see
// go-backend-migration memory) — deliberately deferred rather than
// advertising commands this port doesn't actually implement.
func consoleHelpTable() (cols []string, rows [][]string) {
	cols = []string{"Command", "Syntax", "Description"}
	rows = [][]string{
		{`\?`, `\?`, "Show Commands."},
		{`\x`, `\x`, "Toggle expanded output."},
		{`\timing`, `\timing`, "Toggle timing of commands."},
	}
	return cols, rows
}

// runStatement executes one already-trimmed, semicolon-stripped SQL
// statement (or backslash meta-command) and returns its console transcript
// text — the Go equivalent of Spartacus.Database.<Engine>.Special(), unified
// across all 4 engines (see this file's package-level comments for why that
// unification is possible/deliberate here, unlike Python's original).
func (s *consoleSession) runStatement(ctx context.Context, stmt string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	command := consoleFirstWord(stmt)
	switch command {
	case `\?`:
		cols, rows := consoleHelpTable()
		return consolePretty(cols, rows, s.expanded), nil
	case `\x`:
		s.expanded = !s.expanded
		if s.expanded {
			return "Expanded display is on.", nil
		}
		return "Expanded display is off.", nil
	case `\timing`:
		s.timing = !s.timing
		if s.timing {
			return "Timing is on.", nil
		}
		return "Timing is off.", nil
	}

	var timeStart time.Time
	if s.timing {
		timeStart = time.Now()
	}

	text, err := s.runSQLLocked(ctx, stmt, command)
	if err != nil {
		if s.autocommitOff {
			s.txErrored = true
		}
		return "", err
	}

	if s.timing {
		text += "\nTime: " + formatDuration(time.Since(timeStart))
	}
	return text, nil
}

// runSQLLocked runs a real (non-backslash) SQL statement. Caller holds s.mu.
func (s *consoleSession) runSQLLocked(ctx context.Context, stmt, command string) (string, error) {
	// Mirrors psycopg2/pymysql/sqlite3's classic DB-API behavior: with
	// autocommit off, an implicit transaction opens before the first
	// statement of each work unit, without the user needing to type BEGIN
	// themselves — QueryBlock's `if not v_autocommit ...: BEGIN;` does this
	// for Postgres specifically; generalized here to every engine except
	// Oracle, which has no explicit BEGIN statement (its transactions start
	// implicitly with the first DML) and so needs no equivalent trigger.
	if s.autocommitOff && !s.inTx && s.technology != "oracle" {
		if _, err := s.conn.ExecContext(ctx, "BEGIN"); err != nil {
			return "", err
		}
		s.inTx = true
	}

	upperCmd := strings.ToUpper(command)
	returnsRows := consoleReturnsRows(stmt)

	var text string
	if returnsRows {
		rows, err := s.conn.QueryContext(ctx, stmt)
		if err != nil {
			return "", err
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			return "", err
		}
		var data [][]string
		for rows.Next() {
			row, err := scanRowConsole(rows, len(cols))
			if err != nil {
				return "", err
			}
			data = append(data, row)
		}
		if err := rows.Err(); err != nil {
			return "", err
		}

		status := consoleStatusLine(len(data), true)
		if len(data) > 0 {
			text = consolePretty(cols, data, s.expanded) + "\n" + status
		} else {
			text = status
		}
	} else {
		result, err := s.conn.ExecContext(ctx, stmt)
		if err != nil {
			return "", err
		}
		n, _ := result.RowsAffected()
		text = consoleStatusLine(int(n), false)
	}

	if upperCmd == "COMMIT" || upperCmd == "ROLLBACK" || upperCmd == "END" {
		s.inTx = false
		s.txErrored = false
	}
	return text, nil
}

func scanRowConsole(rows *sql.Rows, numCols int) ([]string, error) {
	values := make([]any, numCols)
	ptrs := make([]any, numCols)
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	out := make([]string, numCols)
	for i, v := range values {
		out[i] = consoleValueToString(v)
	}
	return out, nil
}

// splitSQLStatements mirrors sqlparse.split() closely enough for console
// use: splits on semicolons, respecting single/double-quoted strings and
// --line / block comments, dropping empty statements. Deliberately doesn't
// handle Postgres dollar-quoting ($$...$$ function bodies) — a script
// containing a semicolon inside a $$-quoted body would be split mid-body.
// Narrow, documented gap: console use is aimed at ad hoc statements, not
// multi-statement function definitions (those belong in the DDL/routine
// editor, which doesn't go through this splitter at all).
func splitSQLStatements(sqlText string) []string {
	var statements []string
	var current strings.Builder

	runes := []rune(sqlText)
	inSingle, inDouble, inLineComment, inBlockComment := false, false, false, false
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		var next rune
		if i+1 < len(runes) {
			next = runes[i+1]
		}

		if inLineComment {
			current.WriteRune(c)
			if c == '\n' {
				inLineComment = false
			}
			continue
		}
		if inBlockComment {
			current.WriteRune(c)
			if c == '*' && next == '/' {
				current.WriteRune(next)
				i++
				inBlockComment = false
			}
			continue
		}
		if inSingle {
			current.WriteRune(c)
			if c == '\'' {
				if next == '\'' {
					current.WriteRune(next)
					i++
				} else {
					inSingle = false
				}
			}
			continue
		}
		if inDouble {
			current.WriteRune(c)
			if c == '"' {
				if next == '"' {
					current.WriteRune(next)
					i++
				} else {
					inDouble = false
				}
			}
			continue
		}

		switch {
		case c == '\'':
			inSingle = true
			current.WriteRune(c)
		case c == '"':
			inDouble = true
			current.WriteRune(c)
		case c == '-' && next == '-':
			inLineComment = true
			current.WriteRune(c)
		case c == '/' && next == '*':
			inBlockComment = true
			current.WriteRune(c)
		case c == ';':
			statements = append(statements, current.String())
			current.Reset()
		default:
			current.WriteRune(c)
		}
	}
	if strings.TrimSpace(current.String()) != "" {
		statements = append(statements, current.String())
	}

	out := make([]string, 0, len(statements))
	for _, s := range statements {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// logConsoleHistory mirrors thread_console's mode-0 ConsoleHistory.save() —
// a direct insert into Django's own app db (OmniDB_app_consolehistory),
// same table appdb_workspace.go's fetchConsoleHistory/clearConsoleHistory
// already read/clear. Best-effort: a logging failure shouldn't fail the
// console run itself, just gets logged server-side (matches every other
// route in this file treating history logging as non-critical).
func logConsoleHistory(upstream *url.URL, userID int, connID int64, snippet string) {
	db, err := openAppDB(upstream)
	if err != nil {
		log.Printf("logConsoleHistory: openAppDB: %v", err)
		return
	}
	defer db.Close()

	startTime := time.Now().UTC().Format("2006-01-02 15:04:05.000000")
	if _, err := db.Exec(
		`insert into OmniDB_app_consolehistory (user_id, connection_id, start_time, snippet) values (?, ?, ?, ?)`,
		userID, connID, startTime, snippet,
	); err != nil {
		log.Printf("logConsoleHistory: insert: %v", err)
	}
}

// logQueryHistory mirrors thread_query's mode-0 QueryHistory.save() — a
// direct insert into Django's own app db (OmniDB_app_queryhistory), the
// same table appdb_workspace.go's fetchQueryHistory/clearQueryHistory
// already read/clear. This route existed on the read/delete side since the
// PostgreSQL long-tail migration but was never given a write side at all —
// every query run from the Query tab (unlike the Console tab, which
// logConsoleHistory already covers) silently never appeared in "Command
// History". Best-effort, same as logConsoleHistory: a logging failure
// shouldn't fail the query itself, just gets logged server-side.
func logQueryHistory(upstream *url.URL, userID int, connID int64, snippet, status string, start, end time.Time) {
	db, err := openAppDB(upstream)
	if err != nil {
		log.Printf("logQueryHistory: openAppDB: %v", err)
		return
	}
	defer db.Close()

	const layout = "2006-01-02 15:04:05.000000"
	if _, err := db.Exec(
		`insert into OmniDB_app_queryhistory (user_id, connection_id, start_time, end_time, duration, status, snippet) values (?, ?, ?, ?, ?, ?, ?)`,
		userID, connID, start.UTC().Format(layout), end.UTC().Format(layout), formatDuration(end.Sub(start)), status, snippet,
	); err != nil {
		log.Printf("logQueryHistory: insert: %v", err)
	}
}

// runConsole mirrors thread_console, simplified to always behave like a
// v_mode==0 request (see this file's package comment): Postgres's
// server-cursor-backed mid-statement pause/resume (v_mode 1/2/3, gated on
// v_use_server_cursor which Python only ever sets True for Postgres) is
// deliberately not ported — every statement runs to completion in one pass
// here for every engine, including Postgres. A console SELECT returning a
// huge result set renders as one large table instead of pausing every 50
// rows behind a "fetch more" button; the query grid tab remains the right
// tool for browsing genuinely large result sets. This was a deliberate
// scope decision (see go-backend-migration memory), not an oversight.
func runConsole(upstream *url.URL, cookie string, clientID string, q consoleRequestData, contextCode int, info *ConnectionInfo, userID int) {
	start := time.Now()

	sqlText := q.VSQLCmd
	if len(sqlText) > 0 && sqlText[len(sqlText)-1] == ';' {
		sqlText = sqlText[:len(sqlText)-1]
	}
	statements := splitSQLStatements(sqlText)

	sess, err := openOrReuseConsoleSession(clientID, q.VTabID, info)
	if err != nil {
		queueConsoleResult(upstream, cookie, contextCode, err.Error(), formatDuration(time.Since(start)), 0)
		return
	}
	sess.mu.Lock()
	sess.autocommitOff = !q.VAutocommit
	sess.mu.Unlock()

	ctx := context.Background()
	var out strings.Builder
	for _, stmt := range statements {
		out.WriteString("\n")
		out.WriteString(info.Database)
		out.WriteString("=# ")
		out.WriteString(stmt)
		out.WriteString("\n")

		text, err := sess.runStatement(ctx, stmt)
		if err != nil {
			out.WriteString(err.Error())
		} else {
			out.WriteString(text)
		}
	}

	logConsoleHistory(upstream, userID, q.databaseIndexInt(), sqlText)

	consoleText := strings.ReplaceAll(out.String(), "\n", "\r\n")
	queueConsoleResult(upstream, cookie, contextCode, consoleText, formatDuration(time.Since(start)), sess.conStatus())
}

func queueConsoleResult(upstream *url.URL, cookie string, contextCode int, text, duration string, conStatus int) {
	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseConsoleResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data": map[string]any{
			"v_data":              text,
			"v_last_block":        true,
			"v_duration":          duration,
			"v_show_fetch_button": false,
			"v_con_status":        conStatus,
		},
	})
}
