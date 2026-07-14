package main

import (
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

//go:embed static/login.html static/animated_logo_omnidb.svg
var loginAssets embed.FS

// appToken is the desktop-app one-time auto-login secret — set once at
// startup (see isAppMode/generateAppToken, called from run()) if this
// process was launched with -A/--app, empty otherwise. Mirrors custom_
// settings.py's APP_TOKEN, but lives entirely in Go now: Django's own
// copy of this value (still generated independently by omnidb-server.py
// for its own now-unreachable login.py code) no longer needs to match —
// see run()'s ready-line rewriting, which substitutes Go's own token into
// the URL the frontend actually navigates to.
var appToken string

// appTokenAlphabet matches omnidb-server.py's own generator exactly
// (string.ascii_lowercase + string.digits).
const appTokenAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"

func isAppMode(args []string) bool {
	for _, a := range args {
		if a == "-A" || a == "--app" {
			return true
		}
	}
	return false
}

// randomLowerAlnum mirrors the "”.join(random.choice(string.ascii_lowercase +
// string.digits) for i in range(n))" pattern used both by omnidb-server.py's
// APP_TOKEN and by workspace.py index()'s tab_token.
func randomLowerAlnum(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, n)
	for i, b := range buf {
		out[i] = appTokenAlphabet[int(b)%len(appTokenAlphabet)]
	}
	return string(out), nil
}

// generateAppToken mirrors omnidb-server.py's `”.join(random.choice(
// string.ascii_lowercase + string.digits) for i in range(50))`.
func generateAppToken() (string, error) {
	return randomLowerAlnum(50)
}

var (
	loginHTMLOnce sync.Once
	loginHTML     string
)

// renderedLoginPage builds the login page once (its content is entirely
// static — no per-request data) mirroring login.py's index() template
// context: url_folder (always "", settings.PATH is never overridden — see
// custom_settings.py), static_cache_bust, omnidb_short_version,
// csrf_cookie_name, and the animated logo SVG that Django's template
// pulled in via {% include %}.
func renderedLoginPage() string {
	loginHTMLOnce.Do(func() {
		tmpl, err := loginAssets.ReadFile("static/login.html")
		if err != nil {
			loginHTML = "<html><body>failed to load login page</body></html>"
			return
		}
		svg, err := loginAssets.ReadFile("static/animated_logo_omnidb.svg")
		if err != nil {
			svg = []byte{}
		}
		html := string(tmpl)
		html = strings.ReplaceAll(html, "{{svg_logo}}", string(svg))
		html = strings.ReplaceAll(html, "{{url_folder}}", "")
		html = strings.ReplaceAll(html, "{{static_cache_bust}}", staticCacheBust)
		html = strings.ReplaceAll(html, "{{omnidb_short_version}}", omnidbShortVersion)
		html = strings.ReplaceAll(html, "{{csrf_cookie_name}}", csrfCookieName)
		loginHTML = html
	})
	return loginHTML
}

// appUser mirrors the columns native login needs from Django's own
// auth_user table (id/username/is_superuser/password/is_active) — read
// directly via database/sql, same as every other appdb.go-backed route in
// this migration, not via Django's ORM.
type appUser struct {
	ID           int64
	Username     string
	IsSuperuser  bool
	PasswordHash string
	IsActive     bool
}

// lookupAppUser mirrors ModelBackend.authenticate()'s user lookup —
// case-sensitive exact match on username, same as Django's default. sql.
// ErrNoRows means "no such user" (mirrors authenticate() returning None,
// not raising).
func lookupAppUser(db *sql.DB, username string) (*appUser, error) {
	var u appUser
	err := db.QueryRow(
		`select id, username, is_superuser, password, is_active from auth_user where username = ?`,
		username,
	).Scan(&u.ID, &u.Username, &u.IsSuperuser, &u.PasswordHash, &u.IsActive)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// userCSVPrefs mirrors login.py's UserDetails lookup — created lazily with
// defaults if missing, matching check_session's own
// "except: user_details = UserDetails(user=request.user); user_details.
// save()" fallback (UserDetails.csv_encoding/csv_delimiter default to
// 'utf-8'/';' per models/main.py).
func userCSVPrefs(db *sql.DB, userID int64) (encoding, delimiter string, err error) {
	err = db.QueryRow(`select csv_encoding, csv_delimiter from OmniDB_app_userdetails where user_id = ?`, userID).Scan(&encoding, &delimiter)
	if err == sql.ErrNoRows {
		if _, insertErr := db.Exec(
			`insert into OmniDB_app_userdetails (user_id, theme, font_size, csv_encoding, csv_delimiter, welcome_closed) values (?, 'light', 12, 'utf-8', ';', 0)`,
			userID,
		); insertErr != nil {
			return "", "", insertErr
		}
		return "utf-8", ";", nil
	}
	if err != nil {
		return "", "", err
	}
	return encoding, delimiter, nil
}

// authenticateAppUser mirrors django.contrib.auth.authenticate() +
// ModelBackend's user_can_authenticate (rejects inactive users) combined —
// returns (user, true) on success.
func authenticateAppUser(db *sql.DB, username, password string) (*appUser, bool) {
	user, err := lookupAppUser(db, username)
	if err != nil {
		return nil, false
	}
	if !user.IsActive {
		return nil, false
	}
	if !verifyDjangoPassword(password, user.PasswordHash) {
		return nil, false
	}
	return user, true
}

// finishLogin mirrors login.py's shared post-authenticate() tail (login.py's
// own django.contrib.auth.login() plus the Session()-object bootstrap
// check_session does) — creates the native session and sets its cookie.
func finishLogin(w http.ResponseWriter, db *sql.DB, user *appUser) error {
	csvEncoding, csvDelimiter, err := userCSVPrefs(db, user.ID)
	if err != nil {
		return err
	}
	sessionKey, err := createNativeSession(int(user.ID), user.Username, user.IsSuperuser, csvEncoding, csvDelimiter)
	if err != nil {
		return err
	}
	setNativeSessionCookie(w, sessionKey, nativeSessionTTL)
	return nil
}

// handleLoginPage mirrors login.py's index() — GET with both user/pwd query
// params present is the desktop auto-login path (sign_in_automatic);
// otherwise it's just the login page itself.
func handleLoginPage(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := r.URL.Query().Get("user")
		pwd := r.URL.Query().Get("pwd")

		if user != "" && pwd != "" {
			handleSignInAutomatic(w, r, upstream, user, pwd)
			return
		}

		ensureCSRFCookie(w, r)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(renderedLoginPage()))
	}
}

// handleSignInAutomatic mirrors sign_in_automatic(), combined with index()'s
// handling of its return value.
//
// Deliberate security fix, not a straight port: Python's original only
// checked the token `if valid_token and token != valid_token` — meaning
// when APP_TOKEN is unset (any non-desktop/server deployment), this GET
// endpoint authenticated ANY username/password from a bare query string
// with no CSRF protection and no rate limiting at all. Here, the whole
// auto-login path is only reachable when this process was launched in app
// mode (appToken != "", see isAppMode) — in server mode there is no
// unauthenticated backdoor via this URL, full stop. See go-backend-
// migration memory for the discussion that led to this decision.
func handleSignInAutomatic(w http.ResponseWriter, r *http.Request, upstream *url.URL, username, pwd string) {
	if appToken == "" {
		http.Error(w, "Automatic sign-in is only available when running as a desktop app.", http.StatusForbidden)
		return
	}

	token := r.URL.Query().Get("token")
	if token != appToken {
		w.Write([]byte("INVALID APP TOKEN"))
		return
	}

	db, err := openAppDB(upstream)
	if err != nil {
		w.Write([]byte("INVALID APP TOKEN"))
		return
	}
	defer db.Close()

	user, ok := authenticateAppUser(db, username, pwd)
	if !ok {
		// Matches Python exactly: a bad-credentials result and a bad-token
		// result render the identical "INVALID APP TOKEN" text — index()
		// only ever distinguishes ">= 0" (success) from anything else.
		w.Write([]byte("INVALID APP TOKEN"))
		return
	}

	if err := finishLogin(w, db, user); err != nil {
		w.Write([]byte("INVALID APP TOKEN"))
		return
	}

	http.Redirect(w, r, "/", http.StatusFound)
}

type signInRequest struct {
	PUsername string `json:"p_username"`
	PPwd      string `json:"p_pwd"`
}

// handleSignIn mirrors sign_in() — the manual username/password POST used
// for server/web deployments. Unlike handleSignInAutomatic's token check,
// this endpoint's own "disabled entirely in app mode" gate is NOT a
// security fix — it's Python's original, intentional UX behavior (desktop
// users are expected to go through the one-time auto-login link, not type
// a password), kept as-is.
func handleSignIn(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if appToken != "" {
			writeEnvelope(w, -2, false, -1)
			return
		}
		if !checkCSRF(r) {
			writeBadRequest(w)
			return
		}

		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeEnvelope(w, "Invalid or missing request data.", true, -1)
			return
		}
		var req signInRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeEnvelope(w, "Invalid or missing request data.", true, -1)
			return
		}

		db, err := openAppDB(upstream)
		if err != nil {
			writeEnvelope(w, -1, false, -1)
			return
		}
		defer db.Close()

		user, ok := authenticateAppUser(db, req.PUsername, req.PPwd)
		if !ok {
			// Matches Python precisely: v_data stays at its -1 default and
			// v_error is NOT set true for bad credentials — only for
			// malformed request bodies (handled above).
			writeEnvelope(w, -1, false, -1)
			return
		}

		if err := finishLogin(w, db, user); err != nil {
			writeEnvelope(w, -1, false, -1)
			return
		}

		writeEnvelope(w, 0, false, -1)
	}
}

// handleLogout mirrors login.py's logout() — destroys the native session
// (so subsequent requests, native or proxied-to-Django alike, are treated
// as anonymous — see main.go's trusted-header injection) and redirects to
// the login page, same as Python's redirect(settings.PATH + '/omnidb_login').
func handleLogout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		destroyNativeSession(nativeSessionCookieValue(r))
		clearNativeSessionCookie(w)
		http.Redirect(w, r, "/omnidb_login", http.StatusFound)
	}
}
