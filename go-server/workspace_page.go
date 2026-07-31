package main

import (
	_ "embed"
	"encoding/json"
	htmlescape "html"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

//go:embed static/workspace.html
var workspaceHTMLTemplate string

// workspaceVarNames are the "{{ name }}" substitutions left in workspace.html
// now that everything the page's JavaScript needs travels as one JSON
// document instead (see workspaceBootstrap and renderWorkspacePage). These
// four are the ones that appear in real HTML — asset URLs, the version badge
// — rather than inside a <script> block. "user_name" is handled separately in
// renderWorkspacePage rather than through the generic loop, because it also
// appears in an HTML text node and needs HTML escaping there.
var workspaceVarNames = []string{
	"url_folder", "static_cache_bust", "omnidb_short_version", "omnidb_version",
	"user_name",
}

// workspaceBootstrap is the JSON document rendered into workspace.html's
// <script type="application/json" id="omnidb_bootstrap"> block, which
// frontend/src/bootstrap-globals.js reads and publishes onto window.
//
// This replaced ~25 individual substitutions into JavaScript string literals.
// Every one of them needed hand-rolled escaping to survive a value containing
// a quote or a newline, and "user_name" needed two different escapings of the
// same value because it appeared in both a JS string and an HTML text node.
// json.Marshal handles all of it, and escapes <, > and & to <-style
// sequences by default, so the payload cannot break out of the script tag.
type workspaceBootstrap struct {
	URLFolder                 string                       `json:"url_folder"`
	OmnidbVersion             string                       `json:"omnidb_version"`
	OmnidbShortVersion        string                       `json:"omnidb_short_version"`
	CSRFCookieName            string                       `json:"csrf_cookie_name"`
	EditorTheme               string                       `json:"editor_theme"`
	Theme                     string                       `json:"theme"`
	FontSize                  int                          `json:"font_size"`
	UserID                    int                          `json:"user_id"`
	UserKey                   string                       `json:"user_key"`
	UserName                  string                       `json:"user_name"`
	CSVEncoding               string                       `json:"csv_encoding"`
	CSVDelimiter              string                       `json:"csv_delimiter"`
	IndentUnit                string                       `json:"indent_unit"`
	IndentChar                string                       `json:"indent_char"`
	IndentSize                int                          `json:"indent_size"`
	CommaStyle                string                       `json:"comma_style"`
	KeywordCase               string                       `json:"keyword_case"`
	AutocompleteDisabledTypes string                       `json:"autocomplete_disabled_types"`
	WelcomeClosed             bool                         `json:"welcome_closed"`
	DesktopMode               bool                         `json:"desktop_mode"`
	TabToken                  string                       `json:"tab_token"`
	ShowTerminalOption        bool                         `json:"show_terminal_option"`
	MenuItem                  string                       `json:"menu_item"`
	SuperUser                 bool                         `json:"super_user"`
	Shortcuts                 map[string]workspaceShortcut `json:"shortcuts"`
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

// renderWorkspacePage mirrors workspace.py index()'s context-building +
// template.render(), minus the Django-session bookkeeping (handled
// separately by ensureDjangoSession, since it's a side effect on Django's
// own session store, not something the rendered HTML needs).
func renderWorkspacePage(who *WhoAmI, ud userDetailsRow, shortcuts map[string]workspaceShortcut) (string, error) {
	tabToken, err := randomLowerAlnum(20)
	if err != nil {
		return "", err
	}

	editorTheme := "omnidb"
	if ud.Theme != "light" {
		editorTheme = "omnidb_dark"
	}

	desktopMode := appToken != ""

	bootstrapJSON, err := json.Marshal(workspaceBootstrap{
		URLFolder:                 "",
		OmnidbVersion:             omnidbVersion,
		OmnidbShortVersion:        omnidbShortVersion,
		CSRFCookieName:            csrfCookieName,
		EditorTheme:               editorTheme,
		Theme:                     ud.Theme,
		FontSize:                  ud.FontSize,
		UserID:                    who.UserID,
		UserKey:                   "",
		UserName:                  who.Username,
		CSVEncoding:               ud.CSVEncoding,
		CSVDelimiter:              ud.CSVDelimiter,
		IndentUnit:                ud.IndentUnit,
		IndentChar:                ud.IndentChar,
		IndentSize:                ud.IndentSize,
		CommaStyle:                ud.CommaStyle,
		KeywordCase:               ud.KeywordCase,
		AutocompleteDisabledTypes: ud.AutocompleteDisabledTypes,
		WelcomeClosed:             ud.WelcomeClosed,
		DesktopMode:               desktopMode,
		TabToken:                  tabToken,
		ShowTerminalOption:        false,
		MenuItem:                  "workspace",
		SuperUser:                 who.SuperUser,
		Shortcuts:                 shortcuts,
	})
	if err != nil {
		return "", err
	}

	html := stripWorkspaceConditionals(workspaceHTMLTemplate, desktopMode, who.SuperUser)
	html = strings.Replace(html, "{{ bootstrap_json }}", string(bootstrapJSON), 1)

	values := map[string]string{
		"url_folder":           "",
		"static_cache_bust":    staticCacheBust,
		"omnidb_short_version": omnidbShortVersion,
		"omnidb_version":       omnidbVersion,
		// The only remaining occurrence is an HTML text node, so this is the
		// only escaping it needs now — the JS-string copy went into the JSON.
		"user_name": htmlescape.EscapeString(who.Username),
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
