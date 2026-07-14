package main

import (
	_ "embed"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

//go:embed static/shortcuts.html
var shortcutsHTMLTemplate string

type indentSQLRequest struct {
	PSQL string `json:"p_sql"`
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

		writeEnvelope(w, reindentSQLSafe(req.PSQL), false, -1)
	}
}

// staticCacheBust mirrors settings.py's STATIC_CACHE_BUST — computed once at
// process start for the same reason Django computes its own: busting
// browser caches for static assets across deploys. The two processes' values
// don't need to match each other; this only needs to change between
// restarts of whichever process actually renders the page.
var staticCacheBust = strconv.FormatInt(time.Now().Unix(), 10)

// handleShortcutsPage mirrors workspace.py's shortcuts() — a static help
// page with no session/DB dependency at all, safe to serve without any
// auth check the same way Python's @user_authenticated still requires a
// logged-in browser session cookie to have reached this far via the SPA,
// but the content itself doesn't vary by user.
func handleShortcutsPage(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			http.Redirect(w, r, "/omnidb_login/", http.StatusFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(strings.ReplaceAll(shortcutsHTMLTemplate, "{{static_cache_bust}}", staticCacheBust)))
	}
}

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
		ShortcutCode string `json:"shortcut_code"`
		CtrlPressed  int    `json:"ctrl_pressed"`
		ShiftPressed int    `json:"shift_pressed"`
		AltPressed   int    `json:"alt_pressed"`
		MetaPressed  int    `json:"meta_pressed"`
		ShortcutKey  string `json:"shortcut_key"`
	} `json:"p_shortcuts"`
	PCurrentOS string `json:"p_current_os"`
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
				CtrlPressed:  s.CtrlPressed == 1,
				ShiftPressed: s.ShiftPressed == 1,
				AltPressed:   s.AltPressed == 1,
				MetaPressed:  s.MetaPressed == 1,
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

		rows, count, err := fetchQueryHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, reqBody.PCommandFrom, reqBody.PCommandTo, reqBody.PCurrentPage)
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

		if err := clearQueryHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, reqBody.PCommandFrom, reqBody.PCommandTo); err != nil {
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

		rows, count, err := fetchConsoleHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PCommandContains, reqBody.PCommandFrom, reqBody.PCommandTo, reqBody.PCurrentPage)
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

		if err := clearConsoleHistory(db, int64(who.UserID), reqBody.PDatabaseIndex, reqBody.PConsoleContains, reqBody.PConsoleFrom, reqBody.PConsoleTo); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// handleChangeActiveDatabase mirrors workspace.py's change_active_database.
// In Python this writes v_session.v_tabs_databases[p_tab_id] = p_database —
// a per-connection-tab cache of "which connection's database name is this
// tab currently showing", consulted by get_database_tab_object(). Read
// through that call chain before porting: the value written here
// (v_conn_object.v_database, from the frontend's own already-fetched
// connection list) is never anything other than what
// /internal/connection/'s Database field already returns fresh for that
// connection id — and every Go-native route (Query/Console/EditData/
// Terminal, all shipped earlier this session) re-resolves the connection
// fresh every request instead of consulting any such cache. So there is
// nothing on the Go side for this route to actually update — a genuine
// no-op is the correct, safe port, not a corner cut. Confirmed via
// workspace.js's changeDatabase()/changeActiveDatabaseThreadSafe(): the
// frontend never inspects this response beyond firing the next queued call.
func handleChangeActiveDatabase(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		writeEnvelope(w, map[string]any{}, false, -1)
	}
}

type saveConfigUserRequest struct {
	PFontSize     int    `json:"p_font_size"`
	PTheme        string `json:"p_theme"`
	PPwd          string `json:"p_pwd"`
	PCSVEncoding  string `json:"p_csv_encoding"`
	PCSVDelimiter string `json:"p_csv_delimiter"`
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

		if err := saveConfigUser(db, int64(who.UserID), req.PTheme, req.PFontSize, req.PCSVEncoding, req.PCSVDelimiter); err != nil {
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
