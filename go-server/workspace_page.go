package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
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
	"user_key", "user_name", "csv_encoding", "csv_delimiter", "welcome_closed",
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
		"welcome_closed":       strconv.Itoa(b2i(ud.WelcomeClosed)),
		"menu_item":            "workspace",
		"tab_token":            tabToken,
		"show_terminal_option": "false",
		"super_user":           strconv.Itoa(b2i(who.SuperUser)),
		"desktop_mode":         pythonBoolStr(desktopMode),
	}

	for name, val := range values {
		html = workspaceVarPatterns[name].ReplaceAllLiteralString(html, val)
	}

	return html, nil
}

// ensureDjangoSession calls Django's internal prepare_workspace_session
// bridge (see OmniDB_app/views/internal.py) so /long_polling/,
// /client_keep_alive/, and the still-Django part of /create_request/ (Fáze
// 8b's remaining item — none of these are natively ported yet) keep working:
// all three key their in-memory client_object by request.session.session_key,
// which only exists once a real Django session has been saved at least once.
// Before this page became native, visiting Django's own check_session then
// workspace.index() did this as an unavoidable side effect; this replicates
// it explicitly instead. Returns the cookies (just omnidb_sessionid, and
// only on this browser's first-ever call) the caller must relay onto its own
// response — see handleWorkspacePage.
func ensureDjangoSession(upstream *url.URL, cookie string, userID int) ([]*http.Cookie, error) {
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s://%s/internal/prepare_workspace_session/", upstream.Scheme, upstream.Host), nil)
	if err != nil {
		return nil, err
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	req.Header.Set(trustedUserHeader, strconv.Itoa(userID))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prepare_workspace_session: unexpected status %d", resp.StatusCode)
	}
	return resp.Cookies(), nil
}

// handleWorkspacePage mirrors workspace.py's index() — the main SPA shell.
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

		// Deliberately non-fatal: a Django hiccup here degrades real-time
		// query result delivery (still-Django long-polling), not the page
		// render itself.
		if setCookies, err := ensureDjangoSession(upstream, cookie, who.UserID); err != nil {
			log.Printf("ensureDjangoSession: %v", err)
		} else {
			for _, c := range setCookies {
				http.SetCookie(w, c)
			}
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

// handleCheckSession mirrors login.py's check_session — the root "/" route.
// The Django-session bootstrap it used to perform now happens inside
// handleWorkspacePage (via ensureDjangoSession) instead, right before the
// redirect target actually renders — same effective ordering as before,
// since Python's own check_session immediately redirected to /workspace/
// too.
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
