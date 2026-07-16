package main

import (
	_ "embed"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

//go:embed static/workspace.html
var workspaceHTMLTemplate string

// workspaceVarNames are every "{{ name }}" substitution workspace.html uses
// (see the grep inventory in go-backend-migration memory) — "shortcuts" is
// deliberately excluded, it needs the "|safe" filter's raw-JSON substitution
// handled separately (see renderWorkspacePage).
var workspaceVarNames = []string{
	"url_folder", "static_cache_bust", "omnidb_short_version", "omnidb_version",
	"csrf_cookie_name", "editor_theme", "theme", "font_size", "user_id",
	"user_key", "user_name", "csv_encoding", "csv_delimiter", "indent_unit",
	"comma_style", "keyword_case", "welcome_closed",
	"menu_item", "tab_token", "show_terminal_option", "super_user", "desktop_mode",
}

// workspaceVarPatterns matches both spaced ("{{ user_name }}") and unspaced
// ("{{url_folder}}") forms Django's own template used interchangeably —
// compiled once since renderWorkspacePage runs on every /workspace/ load.
var workspaceVarPatterns = func() map[string]*regexp.Regexp {
	out := make(map[string]*regexp.Regexp, len(workspaceVarNames))
	for _, name := range workspaceVarNames {
		out[name] = regexp.MustCompile(`\{\{\s*` + regexp.QuoteMeta(name) + `\s*\}\}`)
	}
	return out
}()

var (
	workspaceIfLineRe    = regexp.MustCompile(`^(\s*)\{%\s*if\s+(.+?)\s*%\}\s*$`)
	workspaceEndifLineRe = regexp.MustCompile(`^\s*\{%\s*endif\s*%\}\s*$`)
)

// evalWorkspaceCondition understands exactly the two "{% if %}" expressions
// workspace.html actually contains — this deliberately isn't a general
// Django-template-condition evaluator, same "just enough" scope as every
// other static-HTML port in this migration (see native_login.go).
func evalWorkspaceCondition(expr string, desktopMode, superUser bool) bool {
	switch strings.TrimSpace(expr) {
	case "not desktop_mode":
		return !desktopMode
	case "super_user == 1":
		return superUser
	default:
		log.Printf("workspace.html: unrecognized {%% if %s %%} condition, treating as false", expr)
		return false
	}
}

// stripWorkspaceConditionals removes workspace.html's 3 "{% if %}...{% endif
// %}" blocks (one nested), keeping only the enclosed lines whose condition
// evaluates true — mirrors Django's own template engine for this file only.
func stripWorkspaceConditionals(html string, desktopMode, superUser bool) string {
	lines := strings.Split(html, "\n")
	out := make([]string, 0, len(lines))
	var stack []bool

	visible := func() bool {
		for _, v := range stack {
			if !v {
				return false
			}
		}
		return true
	}

	for _, line := range lines {
		if m := workspaceIfLineRe.FindStringSubmatch(line); m != nil {
			stack = append(stack, evalWorkspaceCondition(m[2], desktopMode, superUser))
			continue
		}
		if workspaceEndifLineRe.MatchString(line) {
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
			continue
		}
		if visible() {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

// pythonBoolStr mirrors Python's str(True)/str(False) — workspace.html's own
// inline script compares against these exact capitalized strings
// ("gv_desktopMode = ('{{ desktop_mode }}' === 'True')").
func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func pythonBoolStr(b bool) string {
	if b {
		return "True"
	}
	return "False"
}

// renderWorkspacePage mirrors workspace.py index()'s context-building +
// template.render(), minus the Django-session bookkeeping (handled
// separately by ensureDjangoSession, since it's a side effect on Django's
// own session store, not something the rendered HTML needs).
func renderWorkspacePage(who *WhoAmI, ud userDetailsRow, shortcuts map[string]workspaceShortcut) (string, error) {
	shortcutsJSON, err := json.Marshal(shortcuts)
	if err != nil {
		return "", err
	}

	tabToken, err := randomLowerAlnum(20)
	if err != nil {
		return "", err
	}

	editorTheme := "omnidb"
	if ud.Theme != "light" {
		editorTheme = "omnidb_dark"
	}

	desktopMode := appToken != ""

	html := stripWorkspaceConditionals(workspaceHTMLTemplate, desktopMode, who.SuperUser)
	html = strings.Replace(html, "{{ shortcuts| safe}}", string(shortcutsJSON), 1)

	values := map[string]string{
		"url_folder":           "",
		"static_cache_bust":    staticCacheBust,
		"omnidb_short_version": omnidbShortVersion,
		"omnidb_version":       omnidbVersion,
		"csrf_cookie_name":     csrfCookieName,
		"editor_theme":         editorTheme,
		"theme":                ud.Theme,
		"font_size":            strconv.Itoa(ud.FontSize),
		"user_id":              strconv.Itoa(who.UserID),
		"user_key":             "",
		"user_name":            who.Username,
		"csv_encoding":         ud.CSVEncoding,
		"csv_delimiter":        ud.CSVDelimiter,
		"indent_unit":          ud.IndentUnit,
		"comma_style":          ud.CommaStyle,
		"keyword_case":         ud.KeywordCase,
		"welcome_closed":       boolStr(ud.WelcomeClosed),
		"menu_item":            "workspace",
		"tab_token":            tabToken,
		"show_terminal_option": "false",
		"super_user":           boolStr(who.SuperUser),
		"desktop_mode":         pythonBoolStr(desktopMode),
	}

	for name, val := range values {
		html = workspaceVarPatterns[name].ReplaceAllLiteralString(html, val)
	}

	return html, nil
}

// handleWorkspacePage mirrors workspace.py's index() — the main SPA shell.
//
// Earlier revisions of this handler also called Django's internal
// prepare_workspace_session bridge (OmniDB_app/views/internal.py) to keep
// request.session.session_key non-empty for /long_polling/,
// /client_keep_alive/, and create_request's queue_response_internal call —
// all three used to key their in-memory client_object by that value.
// Removed once native long-polling (native_polling.go) and native
// resolveConnection (connection_info.go) eliminated every remaining
// caller of those Django-session-dependent bridges: a route-by-route
// audit against urls.py (excluding commented-out/dead routes and
// expanding the mysql/mariadb suffix loop) confirmed every browser-
// reachable Django route is now natively handled — the bridge is still
// declared in internal.py but nothing in this process calls it anymore.
func handleWorkspacePage(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			http.Redirect(w, r, "/omnidb_login/", http.StatusFound)
			return
		}

		db, err := openAppDB(upstream)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		defer db.Close()

		ud, err := fetchUserDetails(db, int64(who.UserID))
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Matches workspace.py's "except Exception: None" around the
		// Shortcut query — any failure here just yields an empty shortcut
		// set, not a broken page.
		shortcuts, err := fetchWorkspaceShortcuts(db, int64(who.UserID))
		if err != nil {
			shortcuts = map[string]workspaceShortcut{}
		}

		html, err := renderWorkspacePage(who, ud, shortcuts)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	}
}

// handleCheckSession mirrors login.py's check_session — the root "/"
// route. Django's own version bootstrapped its session here before
// redirecting; Go no longer needs to (see handleWorkspacePage's comment —
// nothing downstream depends on Django's session anymore), so this is just
// the auth check + redirect.
func handleCheckSession(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			http.Redirect(w, r, "/omnidb_login/", http.StatusFound)
			return
		}
		http.Redirect(w, r, "/workspace/", http.StatusFound)
	}
}

// handleCheckSessionMessage mirrors login.py's check_session_message.
// omnidb_alert_message is only ever set by a line that's been commented out
// in workspace.py since before this migration started (see
// go-backend-migration memory) — so the real Python behavior today is
// already just "always empty", faithfully reproduced here.
func handleCheckSessionMessage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeEnvelope(w, "", false, -1)
	}
}

// handleRoot special-cases the exact "/" path for handleCheckSession
// (Go's ServeMux treats "/" as a catch-all, not an exact match) and falls
// back to the Django proxy for every other unmatched path, same as before
// this handler existed.
func handleRoot(upstream *url.URL, proxy http.Handler) http.HandlerFunc {
	checkSession := handleCheckSession(upstream)
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			checkSession(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	}
}
