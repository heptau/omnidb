package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// requestType/response mirror the IntEnum values in polling.py — only the
// ones this file's handlers actually branch on.
const (
	requestTypeQuery         = 1
	requestTypeQueryEditData = 4
	requestTypeSaveEditData  = 5
	requestTypeCancelThread  = 6
	requestTypeCloseTab      = 8
	requestTypeConsole       = 10
	requestTypeTerminal      = 11

	responseQueryResult         = 1
	responseQueryEditDataResult = 2
	responseSaveEditDataResult  = 3
	responseMessageException    = 7
	responseConsoleResult       = 11
	responseTerminalResult      = 12
)

type createRequestBody struct {
	VCode        int             `json:"v_code"`
	VContextCode int             `json:"v_context_code"`
	VData        json.RawMessage `json:"v_data"`
}

type editDataFetchRequestData struct {
	VDBIndex json.Number         `json:"v_db_index"`
	VTabID   string              `json:"v_tab_id"`
	VTable   string              `json:"v_table"`
	VSchema  string              `json:"v_schema"`
	VFilter  string              `json:"v_filter"`
	VCount   int                 `json:"v_count"`
	VPKList  []editDataColumnRef `json:"v_pk_list"`
	VColumns []editDataColumnRef `json:"v_columns"`
}

type editDataSaveRequestData struct {
	VDBIndex  json.Number         `json:"v_db_index"`
	VTabID    string              `json:"v_tab_id"`
	VTable    string              `json:"v_table"`
	VSchema   string              `json:"v_schema"`
	VDataRows [][]*string         `json:"v_data_rows"`
	VRowsInfo []editDataRowInfo   `json:"v_rows_info"`
	VColumns  []editDataColumnRef `json:"v_columns"`
}

type queryRequestData struct {
	VSQLCmd     string      `json:"v_sql_cmd"`
	VCmdType    *string     `json:"v_cmd_type"`
	VDBIndex    json.Number `json:"v_db_index"`
	VTabID      string      `json:"v_tab_id"`
	VMode       int         `json:"v_mode"`
	VAllData    bool        `json:"v_all_data"`
	VAutocommit bool        `json:"v_autocommit"`
}

type consoleRequestData struct {
	VSQLCmd     string      `json:"v_sql_cmd"`
	VDBIndex    json.Number `json:"v_db_index"`
	VTabID      string      `json:"v_tab_id"`
	VMode       int         `json:"v_mode"`
	VAutocommit bool        `json:"v_autocommit"`
}

// databaseIndexInt parses v_db_index the same way ConsoleHistory's
// connection_id needs it — see appdb_workspace.go's fetchConsoleHistory
// comment on why p_database_index/v_conn_id are always the same value.
func (q consoleRequestData) databaseIndexInt() int64 {
	n, _ := q.VDBIndex.Int64()
	return n
}

// formatDuration mirrors polling.py's GetDuration for the common case
// (under a second) — cosmetic display text only, not parsed by the
// frontend, so exact float-formatting parity with Python's str() isn't
// required.
func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%g ms", float64(d.Microseconds())/1000.0)
	}
	total := int(d.Seconds())
	hours := total / 3600
	minutes := (total % 3600) / 60
	seconds := total % 60
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds)
}

// sessionCookieValue extracts the Django session cookie — the same
// identifier Django uses as request.session.session_key and thus as its
// global_object client id. Used to key this proxy's own per-tab cursor
// state so it lines up with "the same client" Django would recognize.
func sessionCookieValue(r *http.Request) string {
	c, err := r.Cookie("omnidb_sessionid")
	if err != nil {
		return ""
	}
	return c.Value
}

// handleCreateRequest serves /create_request/ for the one case this phase
// of the migration owns — running a SQL query (requestType.Query) against a
// sqlite connection, single-block or fetch-more, not an export and not a
// "fetch everything" request. Everything else (other request types, other
// technologies, export/all-data queries) proxies to Django completely
// unchanged, exactly like before this handler existed.
//
// Delivery of the result goes back through Django's own long-polling queue
// (see queueResponseOnDjango) rather than a parallel mechanism in this
// process — /long_polling/ itself is never intercepted, it's a plain proxy
// for the entire lifetime of this phase. Django's /long_polling/ blocks on a
// per-client lock that only queue_response() releases; if this proxy ever
// answered long-polling itself and let a forwarded-to-Django call time out,
// that lock (and the Django thread waiting on it) would stay stuck forever,
// since nothing would ever release it for a client whose queries all run
// here. Routing the result through Django's real queue avoids that.
func handleCreateRequest(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			fallback.ServeHTTP(w, r)
			return
		}

		var body createRequestBody
		if err := json.Unmarshal([]byte(raw), &body); err != nil {
			fallback.ServeHTTP(w, r)
			return
		}

		clientID := sessionCookieValue(r)

		// Terminal requests are structurally separate in Python too (checked
		// before the Query/Console/EditData dispatch, no v_database
		// involved) — see terminal.go's package comment.
		if handleCreateRequestTerminal(w, r, upstream, clientID, body) {
			return
		}

		// Opportunistically release any Go-held cursor for a cancelled or
		// closed tab, but ALWAYS still forward to Django too — Django may
		// own the same tab id for a different (non-sqlite) connection, and
		// its own cleanup must still run regardless of what Go did.
		if body.VCode == requestTypeCancelThread {
			var tabID string
			if json.Unmarshal(body.VData, &tabID) == nil {
				closeCursor(clientID, tabID)
				closeConsoleSession(clientID, tabID)
				closeTerminalSession(clientID, tabID)
			}
			fallback.ServeHTTP(w, r)
			return
		}
		if body.VCode == requestTypeCloseTab {
			var closes []struct {
				TabID string `json:"tab_id"`
			}
			if json.Unmarshal(body.VData, &closes) == nil {
				for _, c := range closes {
					closeCursor(clientID, c.TabID)
					closeConsoleSession(clientID, c.TabID)
					closeTerminalSession(clientID, c.TabID)
				}
			}
			fallback.ServeHTTP(w, r)
			return
		}

		if body.VCode == requestTypeConsole {
			var q consoleRequestData
			if err := json.Unmarshal(body.VData, &q); err != nil {
				fallback.ServeHTTP(w, r)
				return
			}
			cookie := r.Header.Get("Cookie")
			who, err := resolveIdentity(upstream, cookie)
			if err != nil || !who.Authenticated {
				fallback.ServeHTTP(w, r)
				return
			}
			info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
			if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
				fallback.ServeHTTP(w, r)
				return
			}
			applyRememberedPassword(r, q.VDBIndex.String(), info)

			go runConsole(upstream, cookie, clientID, q, body.VContextCode, info, who.UserID)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}

		if body.VCode == requestTypeQueryEditData {
			var q editDataFetchRequestData
			if err := json.Unmarshal(body.VData, &q); err != nil {
				fallback.ServeHTTP(w, r)
				return
			}
			cookie := r.Header.Get("Cookie")
			info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
			if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
				fallback.ServeHTTP(w, r)
				return
			}
			applyRememberedPassword(r, q.VDBIndex.String(), info)

			go runEditDataFetch(upstream, cookie, q, body.VContextCode, info)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}

		if body.VCode == requestTypeSaveEditData {
			var q editDataSaveRequestData
			if err := json.Unmarshal(body.VData, &q); err != nil {
				fallback.ServeHTTP(w, r)
				return
			}
			cookie := r.Header.Get("Cookie")
			info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
			if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
				fallback.ServeHTTP(w, r)
				return
			}
			applyRememberedPassword(r, q.VDBIndex.String(), info)

			go runEditDataSave(upstream, cookie, q, body.VContextCode, info)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}

		if body.VCode != requestTypeQuery {
			fallback.ServeHTTP(w, r)
			return
		}

		var q queryRequestData
		if err := json.Unmarshal(body.VData, &q); err != nil {
			fallback.ServeHTTP(w, r)
			return
		}

		cookie := r.Header.Get("Cookie")

		if q.VCmdType != nil && strings.HasPrefix(*q.VCmdType, "export_") {
			format := strings.TrimPrefix(*q.VCmdType, "export_")
			if !exportFormatSupported(format) {
				fallback.ServeHTTP(w, r)
				return
			}
			info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
			if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
				fallback.ServeHTTP(w, r)
				return
			}
			applyRememberedPassword(r, q.VDBIndex.String(), info)

			who, err := resolveIdentity(upstream, cookie)
			if err != nil || !who.Authenticated {
				fallback.ServeHTTP(w, r)
				return
			}

			go runQueryExport(upstream, cookie, q, format, body.VContextCode, info, who)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}

		// Mode 3/4 (COMMIT/ROLLBACK) act on whatever cursor/transaction a
		// prior mode-0 request already opened for this tab — no new
		// connection to resolve. If there's no Go-held cursor (autocommit
		// was on, so nothing is open, or this tab's connection isn't
		// Go-native to begin with), there's nothing for Go to do here; let
		// Django's own thread_query handle it exactly like before this
		// phase existed.
		if q.VMode == 3 || q.VMode == 4 {
			if handleCommitOrRollback(upstream, cookie, clientID, q, body.VContextCode) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte("{}"))
				return
			}
			fallback.ServeHTTP(w, r)
			return
		}

		// Mode 2 / v_all_data ("fetch everything") streams the whole result
		// set back in chunks over the same long-polling channel, rather
		// than waiting for repeated mode-1 "fetch more" requests — see
		// runNativeQueryAllData. Deliberately doesn't support cancellation
		// mid-stream (Python's self.cancel via requestTypeCancelThread) —
		// see that function's comment for why this is an acceptable, narrow
		// gap for now rather than something silently different.
		if q.VAllData || q.VMode == 2 {
			info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
			if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
				fallback.ServeHTTP(w, r)
				return
			}
			applyRememberedPassword(r, q.VDBIndex.String(), info)

			go runNativeQueryAllData(upstream, cookie, q, body.VContextCode, info)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("{}"))
			return
		}

		info, err := resolveConnection(upstream, cookie, q.VDBIndex.String())
		if err != nil || !info.Found || !nativeQueryTechnology(info.Technology) {
			fallback.ServeHTTP(w, r)
			return
		}

		applyRememberedPassword(r, q.VDBIndex.String(), info)
		go runNativeQuery(upstream, cookie, clientID, q, body.VContextCode, info)

		// Matches create_request's own contract: the real result always
		// arrives later via /long_polling/, this response body is ignored
		// by the frontend (see long_polling.js's createRequest()).
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
	}
}

// nativeQueryTechnology reports whether Go owns query execution for a given
// connection's engine — everything else still proxies to Django's own
// thread_query/long_polling machinery unchanged.
func nativeQueryTechnology(technology string) bool {
	return technology == "sqlite" || technology == "postgresql" || isMySQLFamily(technology) || isOracle(technology)
}

// openNativeQueryTarget opens the right native driver for mode-0 (fresh
// query) requests, dispatching on the connection's engine — the cursor
// machinery itself (queryCursor, fetchBlock, ...) is already
// database/sql-generic and needs no per-engine branching beyond this.
func openNativeQueryTarget(info *ConnectionInfo) (*sql.DB, error) {
	if info.Technology == "postgresql" {
		return openPostgreSQLTarget(info)
	}
	if isMySQLFamily(info.Technology) {
		return openMySQLTarget(info)
	}
	if isOracle(info.Technology) {
		return openOracleTarget(info)
	}
	return openSQLiteTarget(info.Database)
}

// runNativeQuery executes (or continues) a query and delivers its result via
// Django's real long-polling queue, same as Django's own thread_query would.
// info is the connection already resolved (and ownership-checked) by the
// caller before spawning this goroutine — mode 1 doesn't strictly need it
// (the cursor is already open), but resolving it up front keeps this
// function's error handling uniform between modes.
func runNativeQuery(upstream *url.URL, cookie, clientID string, q queryRequestData, contextCode int, info *ConnectionInfo) {
	const blockSize = 50
	start := time.Now()

	sqlText := q.VSQLCmd
	if len(sqlText) > 0 && sqlText[len(sqlText)-1] == ';' {
		sqlText = sqlText[:len(sqlText)-1]
	}

	var cursor *queryCursor
	var err error
	if q.VMode == 0 {
		db, openErr := openNativeQueryTarget(info)
		if openErr != nil {
			queueQueryError(upstream, cookie, contextCode, openErr)
			return
		}
		cursor, err = startCursor(clientID, q.VTabID, db, sqlText, q.VAutocommit)
	} else {
		var ok bool
		cursor, ok = continueCursor(clientID, q.VTabID)
		if !ok {
			queueQueryError(upstream, cookie, contextCode, fmt.Errorf("no open query for this tab, please re-run it"))
			return
		}
	}
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}

	// cursorExhausted tracks whether the underlying result set has no more
	// rows — that's an internal detail for deciding whether to keep this
	// tab's cursor open for a future "fetch more" (mode 1) call. It is NOT
	// the same thing as the wire-level v_last_block field: Django's own
	// thread_query always sends v_last_block=true for a single-block (mode
	// 0/1) response, full or not — the frontend infers "there might be
	// more" separately, from len(v_data) >= the block size, to decide
	// whether to show its own "fetch more"/"fetch all" buttons.
	rows, cursorExhausted, err := cursor.fetchBlock(blockSize)
	if err != nil {
		closeCursor(clientID, q.VTabID)
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}
	// Only auto-close on exhaustion when there's no explicit transaction to
	// preserve (autocommit on, or continuing an already-committed/rolled-
	// back cursor). With autocommit off, the whole point of the open
	// transaction is that it stays open — including a DML statement that
	// returns zero rows (UPDATE/DELETE/INSERT) and so looks "exhausted"
	// immediately — until the user explicitly COMMITs or ROLLBACKs (mode
	// 3/4) or closes the tab. Closing it here on exhaustion would silently
	// roll back every write the moment it ran, which is exactly the
	// autocommit-off contract this cursor exists to prevent.
	if cursorExhausted && cursor.autocommit {
		closeCursor(clientID, q.VTabID)
	}

	queueResponseOnDjango(upstream, cookie, map[string]any{
		"v_code":         responseQueryResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data": map[string]any{
			"v_col_names":      cursor.cols,
			"v_data":           rows,
			"v_last_block":     true,
			"v_duration":       formatDuration(time.Since(start)),
			"v_notices":        "",
			"v_notices_length": 0,
			"v_inserted_id":    nil,
			"v_status":         nil,
			"v_con_status":     1,
			"v_chunks":         true,
		},
	})
}

// allDataBlockSize mirrors thread_query's mode-2 QueryBlock chunk size
// (10000 — bigger than the 50-row interactive block, since fetch-all is
// meant to stream the whole thing quickly, not support incremental
// browsing).
const allDataBlockSize = 10000

// runNativeQueryAllData mirrors thread_query's `elif v_mode==2 or
// v_all_data:` branch — fetches the entire result set in
// allDataBlockSize-row chunks, delivering each intermediate chunk via
// Django's queue as it goes (mirroring Python's repeated queue_response
// calls inside its own loop) and a final chunk with v_last_block=true.
//
// Unlike runNativeQuery, this doesn't need the shared queryCursors map at
// all — the entire fetch happens synchronously within this one goroutine,
// with its own local *sql.Rows, not something a later mode-1/3/4 request
// needs to find again.
//
// Deliberately does not support mid-stream cancellation (Python's
// StoppableThread.cancel flag, settable via requestTypeCancelThread) —
// today's requestTypeCancelThread handling only knows how to close a
// queryCursors entry, and this path doesn't have one. For a very large
// result set this means a cancel click won't stop the fetch already in
// flight; accepted as a narrow, documented gap rather than building
// cross-goroutine cancellation for a first cut of this mode.
func runNativeQueryAllData(upstream *url.URL, cookie string, q queryRequestData, contextCode int, info *ConnectionInfo) {
	start := time.Now()

	sqlText := q.VSQLCmd
	if len(sqlText) > 0 && sqlText[len(sqlText)-1] == ';' {
		sqlText = sqlText[:len(sqlText)-1]
	}

	db, err := openNativeQueryTarget(info)
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}
	defer db.Close()

	var rows *sql.Rows
	if q.VAutocommit {
		rows, err = db.Query(sqlText)
	} else {
		// Mode 2/all-data is a one-shot, read-only-in-practice fetch with
		// no COMMIT/ROLLBACK button of its own anywhere in the UI for it
		// (unlike mode 0/1's query tab) — so any implicit transaction it
		// opens is committed once the fetch finishes, rather than left
		// open for a later mode-3/4 request that will never come.
		var tx *sql.Tx
		tx, err = db.Begin()
		if err == nil {
			defer tx.Commit()
			rows, err = tx.Query(sqlText)
		}
	}
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}

	for {
		block := make([][]string, 0, allDataBlockSize)
		for len(block) < allDataBlockSize {
			if !rows.Next() {
				break
			}
			row, err := scanRowAsStrings(rows, len(cols))
			if err != nil {
				queueQueryError(upstream, cookie, contextCode, err)
				return
			}
			block = append(block, row)
		}

		lastBlock := len(block) < allDataBlockSize
		queueResponseOnDjango(upstream, cookie, map[string]any{
			"v_code":         responseQueryResult,
			"v_context_code": contextCode,
			"v_error":        false,
			"v_data": map[string]any{
				"v_col_names":      cols,
				"v_data":           block,
				"v_last_block":     lastBlock,
				"v_duration":       formatDuration(time.Since(start)),
				"v_notices":        "",
				"v_notices_length": 0,
				"v_inserted_id":    nil,
				"v_status":         nil,
				"v_con_status":     1,
				"v_chunks":         true,
			},
		})
		if lastBlock {
			return
		}
	}
}

// handleCommitOrRollback mirrors thread_query's mode 3/4 branch — commits
// or rolls back whatever transaction a prior mode-0 request opened for
// this tab. Returns false if there's no Go-held cursor for this tab at
// all, telling the caller to fall back to Django instead.
func handleCommitOrRollback(upstream *url.URL, cookie, clientID string, q queryRequestData, contextCode int) bool {
	var found bool
	var err error
	if q.VMode == 3 {
		found, err = commitCursor(clientID, q.VTabID)
	} else {
		found, err = rollbackCursor(clientID, q.VTabID)
	}
	if !found {
		return false
	}
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return true
	}

	queueResponseOnDjango(upstream, cookie, map[string]any{
		"v_code":         responseQueryResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data": map[string]any{
			"v_col_names":      nil,
			"v_data":           [][]string{},
			"v_last_block":     true,
			"v_duration":       "",
			"v_notices":        "",
			"v_notices_length": 0,
			"v_inserted_id":    nil,
			"v_status":         nil,
			"v_con_status":     1,
			"v_chunks":         false,
		},
	})
	return true
}

func queueQueryError(upstream *url.URL, cookie string, contextCode int, err error) {
	queueResponseOnDjango(upstream, cookie, map[string]any{
		"v_code":         responseMessageException,
		"v_context_code": contextCode,
		"v_error":        true,
		"v_data":         err.Error(),
	})
}

// queueResponseOnDjango delivers a response through Django's own
// /internal/queue_response/ bridge (see OmniDB_app/views/internal.py),
// which calls the real queue_response()/get_client_object() Django uses for
// every other feature — so the browser's existing long-polling loop, still
// talking to Django exactly as before, picks this up with no changes on
// either the frontend or the proxy's handling of /long_polling/ itself.
//
// This is a direct Go-as-HTTP-client call to Django, not something this
// process's own reverse proxy forwards — so main.go's Director (the only
// place X-Omnidb-Trusted-User-Id gets added to a proxied request) never
// runs for it. queue_response_internal checks request.user.is_authenticated
// same as connection_info does (see resolveConnection's comment for the
// full explanation of why this broke specifically for a Go-native-only
// login since Fáze 7) — same fix needed here.
func queueResponseOnDjango(upstream *url.URL, cookie string, payload map[string]any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s://%s/internal/queue_response/", upstream.Scheme, upstream.Host), bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if who, err := resolveIdentity(upstream, cookie); err == nil && who.Authenticated {
		req.Header.Set(trustedUserHeader, strconv.Itoa(who.UserID))
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("queueResponseOnDjango: %v", err)
		return
	}
	resp.Body.Close()
}

// handleClearClient releases this proxy's own per-client cursor state (an
// abandoned mid-page query would otherwise leak an open SQLite handle) and
// always still forwards to Django too — Django owns the same client id for
// every feature this phase doesn't natively implement, and needs its own
// teardown regardless of what Go was holding.
func handleClearClient(fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if clientID := sessionCookieValue(r); clientID != "" {
			closeCursorsForClient(clientID)
			closeConsoleSessionsForClient(clientID)
			closeTerminalSessionsForClient(clientID)
		}
		fallback.ServeHTTP(w, r)
	}
}
