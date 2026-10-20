package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"omnidb-server/i18n"
)

type indentSQLRequest struct {
	PSQL            string `json:"p_sql"`
	IndentChar      string `json:"p_indent_char"`
	IndentSize      int    `json:"p_indent_size"`
	CommaStyle      string `json:"p_comma_style"`
	KeywordCase     string `json:"p_keyword_case"`
	Layout          string `json:"p_sql_layout"`
	LogicalOperator string `json:"p_sql_logical_operator"`
	WrapWidth       int    `json:"p_wrap_width"`
}

// indentUnitFromCharSize builds the actual indent string ("  ", "   ",
// "    ", or "\t") from the two-axis setting (character type + size).
func indentUnitFromCharSize(char string, size int) string {
	if char == "tab" {
		return "\t"
	}
	if size < 1 {
		size = 4
	}
	return strings.Repeat(" ", size)
}

// handleIndentSQL formats the SQL text of an editor with reindentSQL
// (sql_indent.go), using the caller's formatting settings. The wire contract
// only carries the SQL and the settings — no connection/engine context — so
// the formatter is dialect-agnostic.
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

		// blank/unknown values fall back to the defaults inside reindentSQL
		opts := IndentOptions{
			IndentUnit:      indentUnitFromCharSize(req.IndentChar, req.IndentSize),
			CommaStyle:      req.CommaStyle,
			KeywordCase:     req.KeywordCase,
			Layout:          req.Layout,
			LogicalOperator: req.LogicalOperator,
			WrapWidth:       req.WrapWidth,
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

type saveTabRequest struct {
	PTabDBID *int64 `json:"p_tab_db_id"`
	PConnID  int64  `json:"p_conn_id"`
	PTitle   string `json:"p_title"`
	PSnippet string `json:"p_snippet"`
}

// handleSaveTab autosaves a query tab's title and editor text, so edits
// survive without the query ever having been run.
func handleSaveTab(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveTabRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		id, err := saveTabContent(db, int64(who.UserID), req.PTabDBID, req.PConnID, req.PTitle, req.PSnippet)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"tab_db_id": id}, false, -1)
	}
}

type saveConfigUserRequest struct {
	PFontSize                  string `json:"p_font_size"`
	PTheme                     string `json:"p_theme"`
	PPwd                       string `json:"p_pwd"`
	PCSVEncoding               string `json:"p_csv_encoding"`
	PCSVDelimiter              string `json:"p_csv_delimiter"`
	PIndentChar                string `json:"p_indent_char"`
	PIndentSize                int    `json:"p_indent_size"`
	PCommaStyle                string `json:"p_comma_style"`
	PKeywordCase               string `json:"p_keyword_case"`
	PSQLLayout                 string `json:"p_sql_layout"`
	PSQLLogicalOperator        string `json:"p_sql_logical_operator"`
	PRulerColumn               int    `json:"p_ruler_column"`
	PAutocompleteDisabledTypes string `json:"p_autocomplete_disabled_types"`
	PLanguage                  string `json:"p_language"`
}

// autocompleteGroupTypes are every group "type" the autocomplete popup can
// show (see workspace.html's #div_autocomplete rows and autocomplete.js's
// v_autocomplete_object.elements) - the only values PAutocompleteDisabledTypes
// is allowed to contain, so a tampered/stale request can't smuggle arbitrary
// text into a value that gets echoed back into workspace.html's inline
// <script> block (see escapeJSSingleQuoted's comment on that same risk).
var autocompleteGroupTypes = map[string]bool{
	"keyword": true, "database": true, "role": true, "tablespace": true,
	"schema": true, "extension": true, "table": true, "view": true,
	"column": true, "function": true, "index": true,
}

// sanitizeAutocompleteDisabledTypes keeps only recognized, deduplicated group
// types from a comma-separated list, dropping anything else silently (same
// "ignore unknown input" posture as PIndentChar/PCommaStyle's blank fallback
// below, rather than rejecting the whole save over one bad value).
func sanitizeAutocompleteDisabledTypes(raw string) string {
	seen := map[string]bool{}
	var out []string
	for _, t := range strings.Split(raw, ",") {
		t = strings.TrimSpace(t)
		if autocompleteGroupTypes[t] && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return strings.Join(out, ",")
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
		if req.PTheme != "light" && req.PTheme != "dark" {
			req.PTheme = "auto"
		}
		if req.PIndentChar == "" {
			req.PIndentChar = "space"
		}
		if req.PIndentSize <= 0 {
			req.PIndentSize = 4
		}
		indentUnit := indentUnitFromCharSize(req.PIndentChar, req.PIndentSize)
		if req.PCommaStyle != "leading" {
			req.PCommaStyle = "trailing"
		}
		if req.PKeywordCase != "preserve" && req.PKeywordCase != "lower" {
			req.PKeywordCase = "upper"
		}
		if req.PSQLLayout != "compact" {
			req.PSQLLayout = "block"
		}
		if req.PSQLLogicalOperator != "trailing" {
			req.PSQLLogicalOperator = "leading"
		}
		if req.PRulerColumn < 24 || req.PRulerColumn > 999 {
			req.PRulerColumn = 128
		}
		if req.PLanguage != "auto" && !i18n.IsSupported(req.PLanguage) {
			req.PLanguage = "auto"
		}
		autocompleteDisabledTypes := sanitizeAutocompleteDisabledTypes(req.PAutocompleteDisabledTypes)
		if err := saveConfigUser(db, int64(who.UserID), req.PTheme, fontSize, req.PCSVEncoding, req.PCSVDelimiter, indentUnit, req.PIndentChar, req.PIndentSize, req.PCommaStyle, req.PKeywordCase, req.PSQLLayout, req.PSQLLogicalOperator, req.PRulerColumn, autocompleteDisabledTypes, req.PLanguage); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		if req.PPwd != "" {
			if err := setUserPassword(db, int64(who.UserID), req.PPwd); err != nil {
				writeEnvelope(w, err.Error(), true, -1)
				return
			}
			syncNativeSessionsForUser(who.UserID, who.Username, who.SuperUser, true, false, nativeSessionCookieValue(r))
		}
		// Mirrors Python mutating v_session.v_csv_encoding/v_csv_delimiter
		// live (not just the UserDetails row) — see native_session.go's
		// updateNativeSessionCSVPrefs comment.
		updateNativeSessionCSVPrefs(nativeSessionCookieValue(r), req.PCSVEncoding, req.PCSVDelimiter)
		updateNativeSessionLanguage(nativeSessionCookieValue(r), req.PLanguage)
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
		databases, terminals := buildDatabaseList(conns, int64(who.UserID))

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
				"v_environment":  d.Environment,
				// Discrete (not display-formatted) fields, used only by
				// passwords.js's own .pgpass matching (the browser
				// fallback's, and the desktop grant's "does this file even
				// have an entry for this connection" check) -- deliberately
				// separate from v_database above (see
				// resolvePgpassMatchFields's comment on why a ConnString-only
				// connection's real database name can't just be read off
				// that field).
				"v_server":          d.Server,
				"v_port":            d.Port,
				"v_username":        d.Username,
				"v_pgpass_database": d.PgpassDatabase,
				"v_aws_iam":         d.AWSIAM,
				"v_oauth":           d.OAuth,
			})
		}
		terminalList := make([]map[string]any, 0, len(terminals))
		for _, t := range terminals {
			terminalList = append(terminalList, map[string]any{
				"v_conn_id":     t.ConnID,
				"v_alias":       t.Alias,
				"v_details":     t.Details,
				"v_public":      t.Public,
				"v_environment": t.Environment,
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
