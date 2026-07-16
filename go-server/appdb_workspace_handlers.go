package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type indentSQLRequest struct {
	PSQL        string `json:"p_sql"`
	IndentUnit  string `json:"p_indent_unit"`
	CommaStyle  string `json:"p_comma_style"`
	KeywordCase string `json:"p_keyword_case"`
}

// handleIndentSQL mirrors workspace.py's indent_sql — Python called
// sqlparse.format(v_sql, reindent=True), a generic (not engine-specific)
// tokenizer-based reformatter; reindentSQL (sql_indent.go) replicates that
// same generic behavior natively, since indent_sql's wire contract only
// ever carries the raw SQL text, no connection/technology context.
//
// A second, PostgreSQL-specific tier is planned on top of this: dispatch
// to the user's own pg_procrustes (github.com/heptau/pg_procrustes, a
// native Go formatter driven by the real PostgreSQL parser) specifically
// for PostgreSQL connections, once its formatter/config packages are made
// importable (they currently live under internal/, which Go blocks
// external modules from importing) — that tier needs a wire contract
// change (passing which engine a tab is connected to) this generic pass
// doesn't need. See go-backend-migration memory for the full writeup,
// including a real cgo/cross-compile caveat (pg_procrustes depends on
// pg_query_go, which uses cgo to compile actual PostgreSQL parser source —
// this build's other dependencies are deliberately pure-Go for exactly the
// cross-compilation reasons this would reintroduce, so that tier needs to
// be weighed, not just wired in, once the API is available).
func handleIndentSQL(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req indentSQLRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		opts := IndentOptions{
			IndentUnit:  req.IndentUnit,
			CommaStyle:  req.CommaStyle,
			KeywordCase: req.KeywordCase,
		}
		if opts.IndentUnit == "" {
			opts.IndentUnit = DefaultIndentOptions.IndentUnit
		} else if opts.IndentUnit == `\t` {
			opts.IndentUnit = "\t"
		}
		if opts.CommaStyle == "" {
			opts.CommaStyle = DefaultIndentOptions.CommaStyle
		}
		if opts.KeywordCase == "" {
			opts.KeywordCase = DefaultIndentOptions.KeywordCase
		}
		writeEnvelope(w, reindentSQLSafe(req.PSQL, opts), false, -1)
	}
}

// staticCacheBust mirrors settings.py's STATIC_CACHE_BUST — computed once at
// process start for the same reason Django computes its own: busting
// browser caches for static assets across deploys. The two processes' values
// don't need to match each other; this only needs to change between
// restarts of whichever process actually renders the page.
var staticCacheBust = strconv.FormatInt(time.Now().Unix(), 10)

func handleCloseWelcome(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := closeWelcome(db, int64(who.UserID)); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type saveShortcutsRequest struct {
	PShortcuts []struct {
		ShortcutCode string   `json:"shortcut_code"`
		CtrlPressed  flexBool `json:"ctrl_pressed"`
		ShiftPressed flexBool `json:"shift_pressed"`
		AltPressed   flexBool `json:"alt_pressed"`
		MetaPressed  flexBool `json:"meta_pressed"`
		ShortcutKey  string   `json:"shortcut_key"`
	} `json:"p_shortcuts"`
	PCurrentOS string `json:"p_current_os"`
}

// flexBool accepts JSON true/false or 0/1 (number), since the server renders
// shortcuts as 0/1 but frontend defaults and user edits use booleans.
type flexBool bool

func (f *flexBool) UnmarshalJSON(b []byte) error {
	switch string(b) {
	case "true", "1":
		*f = true
	case "false", "0":
		*f = false
	default:
		var v bool
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		*f = flexBool(v)
	}
	return nil
}

func handleSaveShortcuts(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody saveShortcutsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		shortcuts := make([]shortcutInput, 0, len(reqBody.PShortcuts))
		for _, s := range reqBody.PShortcuts {
			shortcuts = append(shortcuts, shortcutInput{
				Code:         s.ShortcutCode,
				CtrlPressed:  bool(s.CtrlPressed),
				ShiftPressed: bool(s.ShiftPressed),
				AltPressed:   bool(s.AltPressed),
				MetaPressed:  bool(s.MetaPressed),
				Key:          s.ShortcutKey,
			})
		}

		if err := saveShortcuts(db, int64(who.UserID), reqBody.PCurrentOS, shortcuts); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type commandListRequest struct {
	PCurrentPage     int    `json:"p_current_page"`
	PDatabaseIndex   int64  `json:"p_database_index"`
	PCommandContains string `json:"p_command_contains"`
	PCommandFrom     string `json:"p_command_from"`
	PCommandTo       string `json:"p_command_to"`
}

func handleGetCommandList(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody commandListRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		rows, count, err := fetchQueryHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, jsDatetimeToSQLite(reqBody.PCommandFrom), jsDatetimeToSQLite(reqBody.PCommandTo), reqBody.PCurrentPage)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		commandList := make([][]string, 0, len(rows))
		for _, cmd := range rows {
			commandList = append(commandList, []string{
				sqliteDatetimeToJS(cmd.StartTime),
				sqliteDatetimeToJS(cmd.EndTime),
				cmd.Duration,
				statusIconHTML(cmd.Status),
				cmd.Snippet,
			})
		}
		writeEnvelope(w, map[string]any{
			"commandList": commandList,
			"pages":       pageCount(count),
		}, false, -1)
	}
}

func handleClearCommandList(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody commandListRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := clearQueryHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, jsDatetimeToSQLite(reqBody.PCommandFrom), jsDatetimeToSQLite(reqBody.PCommandTo)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type consoleHistoryRequest struct {
	PCurrentPage     int    `json:"p_current_page"`
	PDatabaseIndex   int64  `json:"p_database_index"`
	PCommandContains string `json:"p_command_contains"`
	PCommandFrom     string `json:"p_command_from"`
	PCommandTo       string `json:"p_command_to"`
}

func handleGetConsoleHistory(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody consoleHistoryRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		rows, count, err := fetchConsoleHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, jsDatetimeToSQLite(reqBody.PCommandFrom), jsDatetimeToSQLite(reqBody.PCommandTo), reqBody.PCurrentPage)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		commandList := make([][]string, 0, len(rows))
		for _, cmd := range rows {
			commandList = append(commandList, []string{sqliteDatetimeToJS(cmd.StartTime), cmd.Snippet})
		}
		writeEnvelope(w, map[string]any{
			"commandList": commandList,
			"pages":       pageCount(count),
		}, false, -1)
	}
}

// clearConsoleListRequest mirrors clear_console_list's distinct field names
// (p_console_* not p_command_*, verified against console.js — not a typo).
type clearConsoleListRequest struct {
	PDatabaseIndex   int64  `json:"p_database_index"`
	PConsoleContains string `json:"p_console_contains"`
	PConsoleFrom     string `json:"p_console_from"`
	PConsoleTo       string `json:"p_console_to"`
}

func handleClearConsoleList(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody clearConsoleListRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := clearConsoleHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PConsoleContains, jsDatetimeToSQLite(reqBody.PConsoleFrom), jsDatetimeToSQLite(reqBody.PConsoleTo)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type changeActiveDatabaseRequest struct {
	baseRequest
	PDatabase string `json:"p_database"`
}

// handleChangeActiveDatabase mirrors workspace.py's change_active_database:
// v_session.v_tabs_databases[p_tab_id] = p_database, a per-tab override of
// "which database this tab's connection is currently targeting", consulted
// by every native route via applyActiveDatabaseOverride. This used to be a
// no-op, on the theory that every Go-native route re-resolves the
// connection fresh per request anyway — true, but they all resolve it from
// the saved connection's static Database field, which is exactly what
// tree_postgresql.js's checkCurrentDatabase flow needs to override when a
// user switches to a sibling database within the same tab (p_database_index
// stays the same connection; only p_database changes). Without actually
// storing it here, the tab's UI showed the switch but every query/listing
// kept hitting the original database.
func handleChangeActiveDatabase(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req changeActiveDatabaseRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		if req.PDatabase != "" {
			rememberActiveDatabase(nativeSessionCookieValue(r), req.PTabID, req.PDatabase)
		}
		writeEnvelope(w, map[string]any{}, false, -1)
	}
}

type saveConfigUserRequest struct {
	PFontSize     string `json:"p_font_size"`
	PTheme        string `json:"p_theme"`
	PPwd          string `json:"p_pwd"`
	PCSVEncoding  string `json:"p_csv_encoding"`
	PCSVDelimiter string `json:"p_csv_delimiter"`
	PIndentUnit   string `json:"p_indent_unit"`
	PCommaStyle   string `json:"p_comma_style"`
	PKeywordCase  string `json:"p_keyword_case"`
}

// handleSaveConfigUser mirrors workspace.py's save_config_user, now
// including its password-change branch (p_pwd != "") — deferred until
// Fáze 7 gave Go its own Django-compatible PBKDF2 hashing
// (hashDjangoPassword), since a Go-written hash in a different format
// would have broken Django-owned auth at the time. Deliberately doesn't
// call anything like Django's update_session_auth_hash: that mechanism
// exists purely to stop Django's own session-cookie-based auth from
// invalidating on password change, but TrustedUserMiddleware (see
// OmniDB_app/middleware.py) already unconditionally overwrites request.user
// from the trusted header on every request that has one, independent of
// whatever Django's own session auth hash check would have decided — so
// there's nothing here for an equivalent call to protect against. See
// saveConfigUser's comment for why a missing UserDetails row is surfaced
// as an error instead of ignored.
func handleSaveConfigUser(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveConfigUserRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		fontSize, _ := strconv.Atoi(req.PFontSize)
		if req.PIndentUnit == "" {
			req.PIndentUnit = "    "
		} else if req.PIndentUnit == `\t` {
			req.PIndentUnit = "\t"
		}
		if req.PCommaStyle == "" {
			req.PCommaStyle = "leading"
		}
		if req.PKeywordCase == "" {
			req.PKeywordCase = "preserve"
		}
		if err := saveConfigUser(db, int64(who.UserID), req.PTheme, fontSize, req.PCSVEncoding, req.PCSVDelimiter, req.PIndentUnit, req.PCommaStyle, req.PKeywordCase); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		if req.PPwd != "" {
			if err := setUserPassword(db, int64(who.UserID), req.PPwd); err != nil {
				writeEnvelope(w, err.Error(), true, -1)
				return
			}
		}
		// Mirrors Python mutating v_session.v_csv_encoding/v_csv_delimiter
		// live (not just the UserDetails row) — see native_session.go's
		// updateNativeSessionCSVPrefs comment.
		updateNativeSessionCSVPrefs(nativeSessionCookieValue(r), req.PCSVEncoding, req.PCSVDelimiter)
		writeEnvelope(w, "", false, -1)
	}
}

// handleGetDatabaseList mirrors workspace.py's get_database_list — reads no
// request body at all (Python doesn't parse one either), just the session
// cookie. Deliberately does NOT reuse the live Session-object cache;
// everything here is re-derivable straight from Connection/Group/
// GroupConnection/Tab each request, same as every other Fáze 6 route.
func handleGetDatabaseList(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		conns, err := fetchConnectionsForUser(db, int64(who.UserID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		databases, terminals := buildDatabaseList(conns)

		groups, err := fetchGroupsForUser(db, int64(who.UserID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		groupList := []map[string]any{{"v_group_id": 0, "v_name": "All connections", "conn_list": []int64{}}}
		for _, g := range groups {
			connIDs, err := fetchGroupConnectionIDs(db, g.ID)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
			groupList = append(groupList, map[string]any{"v_group_id": g.ID, "v_name": g.Name, "conn_list": connIDs})
		}

		tabs, err := fetchExistingTabs(db, int64(who.UserID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		existingTabs := make([]map[string]any, 0, len(tabs))
		for _, t := range tabs {
			existingTabs = append(existingTabs, map[string]any{
				"index":     t.ConnID,
				"snippet":   t.Snippet,
				"title":     t.Title,
				"tab_db_id": t.TabDBID,
			})
		}

		databaseList := make([]map[string]any, 0, len(databases))
		for _, d := range databases {
			databaseList = append(databaseList, map[string]any{
				"v_db_type":      d.DBType,
				"v_alias":        d.Alias,
				"v_conn_id":      d.ConnID,
				"v_console_help": d.ConsoleHelp,
				"v_database":     d.Database,
				"v_conn_string":  d.ConnString,
				"v_details1":     d.Details1,
				"v_details2":     d.Details2,
				"v_public":       d.Public,
			})
		}
		terminalList := make([]map[string]any, 0, len(terminals))
		for _, t := range terminals {
			terminalList = append(terminalList, map[string]any{
				"v_conn_id": t.ConnID,
				"v_alias":   t.Alias,
				"v_details": t.Details,
				"v_public":  t.Public,
			})
		}

		writeEnvelope(w, map[string]any{
			"v_select_html":       nil,
			"v_select_group_html": nil,
			"v_connections":       databaseList,
			"v_groups":            groupList,
			"v_remote_terminals":  terminalList,
			"v_id":                selectedDatabaseIndexPlaceholder(len(conns) > 0),
			"v_existing_tabs":     existingTabs,
		}, false, -1)
	}
}
