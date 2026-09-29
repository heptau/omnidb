package main

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"
)

// nativeSessionCookieName is deliberately NOT "omnidb_sessionid" — that
// name stays owned by Django's own SessionMiddleware/django_session table,
// which keeps working completely unmodified for the routes still proxied
// to Django (see main.go's trusted-header injection and OmniDB_app/
// middleware.py's TrustedUserMiddleware). Using a different name means
// Go's own native session and Django's own session can coexist as two
// independent cookies without either clobbering the other.
const nativeSessionCookieName = "omnidb_go_session"

// csrfCookieName MUST match Django's CSRF_COOKIE_NAME exactly ("omnidb_
// csrftoken", settings.py) — unlike the session cookie, the frontend JS
// (ajax_control.js) reads this one cookie's value and sends it as the
// X-CSRFToken header on every AJAX POST, for both Go-native and
// Django-proxied routes alike, without knowing or caring which backend
// actually handles the request. Both sides therefore have to agree on the
// same physical cookie.
const csrfCookieName = "omnidb_csrftoken"

// nativeSessionTTL mirrors Django's own default SESSION_COOKIE_AGE (no
// override exists in settings.py/custom_settings.py) — 2 weeks.
const nativeSessionTTL = 14 * 24 * time.Hour

// trustedUserHeader is how this proxy tells the still-running Django
// process which user a forwarded request belongs to (see main.go's
// Director wrapper and OmniDB_app/middleware.py's TrustedUserMiddleware,
// which only trusts this header from loopback callers). Never accepted
// from an actual browser — main.go strips any client-supplied value before
// possibly setting its own.
const trustedUserHeader = "X-Omnidb-Trusted-User-Id"

// nativeSession is intentionally minimal — just enough to answer
// resolveIdentity()'s WhoAmI questions (see whoami.go). Unlike Python's
// Session class, it does NOT cache live per-connection database handles,
// SSH tunnels, or a v_databases-style connection pool — every native Go
// route already re-opens its own connection fresh per request (established
// pattern across this whole migration), so there was never a need for a
// session-scoped connection cache to replicate in the first place.
type nativeSession struct {
	UserID       int
	Username     string
	SuperUser    bool
	CSVEncoding  string
	CSVDelimiter string
	Language     string
	ExpiresAt    time.Time
}

var (
	nativeSessionsMu  sync.Mutex
	nativeSessions    = map[string]*nativeSession{}
	sessionReaperOnce sync.Once
)

// startSessionReaper launches a background goroutine that removes expired
// native session entries once per hour. Sessions that expire between
// requests (user logged in and never returned) would otherwise stay in the
// map forever — harmless on a desktop app with one user and a short-lived
// process, but a slow memory leak on a long-running server with many users.
// Started lazily from createNativeSession on the first-ever login.
func startSessionReaper() {
	sessionReaperOnce.Do(func() {
		go func() {
			for {
				time.Sleep(1 * time.Hour)
				now := time.Now()
				nativeSessionsMu.Lock()
				for k, s := range nativeSessions {
					if now.After(s.ExpiresAt) {
						delete(nativeSessions, k)
					}
				}
				live := make(map[string]struct{}, len(nativeSessions))
				for k := range nativeSessions {
					live[k] = struct{}{}
				}
				nativeSessionsMu.Unlock()

				// activeDatabaseMap (active_database.go) and
				// passwordMemoryMap (password_prompt.go) key everything off
				// this same session key with no expiry of their own — sweep
				// them here rather than giving each its own reaper
				// goroutine, since "session key still live" is exactly the
				// condition that already determines whether an entry can
				// ever be read again.
				reapActiveDatabaseMap(live)
				reapPasswordMemoryMap(live)
			}
		}()
	})
}

// randomToken returns a URL-safe random token with enough entropy for both
// session keys and CSRF tokens (32 bytes = 256 bits).
func randomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// createNativeSession mirrors login.py's Session(...) construction — but
// only the fields anything actually still reads (see nativeSession's
// comment). Returns the opaque session key to set as the cookie value.
func createNativeSession(userID int, username string, superuser bool, csvEncoding, csvDelimiter, language string) (string, error) {
	startSessionReaper()
	key, err := randomToken()
	if err != nil {
		return "", err
	}
	nativeSessionsMu.Lock()
	nativeSessions[key] = &nativeSession{
		UserID:       userID,
		Username:     username,
		SuperUser:    superuser,
		CSVEncoding:  csvEncoding,
		CSVDelimiter: csvDelimiter,
		Language:     language,
		ExpiresAt:    time.Now().Add(nativeSessionTTL),
	}
	nativeSessionsMu.Unlock()
	return key, nil
}

// lookupNativeSession returns the session for a cookie value, if valid and
// unexpired.
func lookupNativeSession(key string) (*nativeSession, bool) {
	if key == "" {
		return nil, false
	}
	nativeSessionsMu.Lock()
	defer nativeSessionsMu.Unlock()
	sess, ok := nativeSessions[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(sess.ExpiresAt) {
		delete(nativeSessions, key)
		return nil, false
	}
	return sess, true
}

// destroyNativeSession mirrors login.py's logout() — removes the session
// so subsequent requests (native or proxied-to-Django, since Django only
// ever sees a trusted-user header derived from this) are treated as
// anonymous.
func destroyNativeSession(key string) {
	if key == "" {
		return
	}
	nativeSessionsMu.Lock()
	delete(nativeSessions, key)
	nativeSessionsMu.Unlock()
}

// updateNativeSessionCSVPrefs mirrors save_config_user's live mutation of
// v_session.v_csv_encoding/v_csv_delimiter — Python updates the in-memory
// Session object immediately (not just the UserDetails row) so a CSV
// export moments later already sees the new preference without needing a
// fresh login. no-op if the session no longer exists.
func updateNativeSessionCSVPrefs(key, csvEncoding, csvDelimiter string) {
	if key == "" {
		return
	}
	nativeSessionsMu.Lock()
	defer nativeSessionsMu.Unlock()
	if sess, ok := nativeSessions[key]; ok {
		sess.CSVEncoding = csvEncoding
		sess.CSVDelimiter = csvDelimiter
	}
}

// updateNativeSessionLanguage mirrors updateNativeSessionCSVPrefs — keeps the
// in-memory session's Language field (see WhoAmI.Language) in sync the
// moment Settings saves a new preference, so a subsequent request in the
// same session (e.g. the reload triggered by the language switcher itself)
// already sees it without needing a fresh login.
func updateNativeSessionLanguage(key, language string) {
	if key == "" {
		return
	}
	nativeSessionsMu.Lock()
	defer nativeSessionsMu.Unlock()
	if sess, ok := nativeSessions[key]; ok {
		sess.Language = language
	}
}

// syncNativeSessionsForUser propagates a user-management change to every
// live session of that user — the session caches UserID/Username/SuperUser
// at login and resolveIdentity trusts it for the session's whole TTL, so
// without this a demoted superuser kept superuser rights (and a deleted
// user kept full access) for up to nativeSessionTTL.
//
//   - deleted: every session of the user is destroyed.
//   - passwordChanged: every session except keepKey (the caller's own, when
//     users change their own password) is destroyed, so a stolen session
//     doesn't survive the password reset meant to lock it out.
//   - otherwise username/superuser are updated in place.
func syncNativeSessionsForUser(userID int, username string, superuser, passwordChanged, deleted bool, keepKey string) {
	nativeSessionsMu.Lock()
	defer nativeSessionsMu.Unlock()
	for key, sess := range nativeSessions {
		if sess.UserID != userID {
			continue
		}
		if deleted || (passwordChanged && key != keepKey) {
			delete(nativeSessions, key)
			continue
		}
		if username != "" {
			sess.Username = username
		}
		sess.SuperUser = superuser
	}
}

// nativeSessionCookieValue reads the Go-native session cookie (distinct
// from sessionCookieValue, which reads Django's own "omnidb_sessionid" —
// still used to key query cursors/console sessions/terminal sessions,
// unrelated to identity).
func nativeSessionCookieValue(r *http.Request) string {
	c, err := r.Cookie(nativeSessionCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// isRequestSecure reports whether r reached this process over a channel a
// browser would itself consider secure — either TLS terminated directly by
// this process (r.TLS != nil; today's Server never does this, see main.go,
// but the check costs nothing and keeps this correct if that ever changes),
// or TLS terminated by a reverse proxy in front of it, which is expected to
// set X-Forwarded-Proto the same way every common one (nginx, Caddy, an
// ALB, ...) does by default. Desktop/app mode and a bare `-H`-exposed
// server both talk plain HTTP with no proxy at all, so Secure would
// otherwise never be set anywhere this app runs — checking the request
// itself, rather than a static build-time flag, is what lets this be
// correct in both cases without any new configuration.
func isRequestSecure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// setNativeSessionCookie mirrors Django's own session cookie attributes
// (HttpOnly, SameSite=Lax) plus Secure, set from the request that's actually
// being served rather than left off unconditionally (see isRequestSecure).
func setNativeSessionCookie(w http.ResponseWriter, r *http.Request, value string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     nativeSessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		HttpOnly: true,
		Secure:   isRequestSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearNativeSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     nativeSessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isRequestSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
}

// ensureCSRFCookie mirrors what Django's CsrfViewMiddleware does the first
// time a view renders {% csrf_token %} — issues the cookie if the browser
// doesn't already have one. Deliberately NOT HttpOnly (the frontend's own
// JS reads this cookie's value directly to build the X-CSRFToken header —
// same double-submit contract the existing frontend already implements
// unchanged, see ajax_control.js). Secure is set from the request the same
// way setNativeSessionCookie's is — see isRequestSecure.
func ensureCSRFCookie(w http.ResponseWriter, r *http.Request) string {
	if c, err := r.Cookie(csrfCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	token, err := randomToken()
	if err != nil {
		return ""
	}
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(nativeSessionTTL.Seconds()),
		HttpOnly: false,
		Secure:   isRequestSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
	return token
}

// checkCSRF mirrors the double-submit pattern the existing frontend already
// speaks (reads the omnidb_csrftoken cookie, sends it back as
// X-CSRFToken) — deliberately NOT trying to replicate Django's own
// masked-token CSRF scheme (BREACH-resistant XOR masking); a classic
// double-submit check is equally secure against CSRF and, critically, is
// exactly what the unmodified frontend JS already does on both sides of
// this cutover (see native_session.go's csrfCookieName comment on why both
// Go-native and Django-proxied routes have to agree on the same cookie).
func checkCSRF(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookieName)
	if err != nil || cookie.Value == "" {
		return false
	}
	header := r.Header.Get("X-CSRFToken")
	return header != "" && header == cookie.Value
}

// csrfExemptPrefixes are the only non-safe-method routes that skip the
// double-submit check: /internal/shutdown/ is called by the Wails shell
// process (not a browser) and requires the shell's shared secret instead
// (see handleShutdown/shell_relay.go); /sign_in/ calls checkCSRF itself
// (excluded only because requireCSRF would otherwise run before
// handleSignIn's own app-token short-circuit). Every raw fetch() the
// frontend sends (export save dialog, open URL, .pgpass grant/import,
// window title) carries X-CSRFToken via ajax_control.js's jsonPostHeaders,
// so those routes are no longer exempt — a same-site page on another
// 127.0.0.1 port would otherwise ride the SameSite=Lax session cookie.
var csrfExemptPrefixes = []string{
	"/internal/shutdown/",
	"/sign_in/",
}

// requireCSRF wraps the entire mux so every native POST route gets the
// same double-submit check handleSignIn already applied to itself — the
// machinery existed (checkCSRF/ensureCSRFCookie) but was previously wired
// into exactly one handler, leaving every other state-changing route
// (save/delete connection, users, snippets, monitor units, role passwords,
// kill-backend, edit-data, ...) relying solely on the SameSite=Lax cookie
// attribute. GET/HEAD/OPTIONS are left unchecked — csrfSafeMethod in
// ajax_control.js already treats them as safe and never attaches the
// header for them, and no route in this app performs a state change on a
// safe method. Applied once here rather than at each of the ~250
// mux.Handle call sites, since every one of them already goes through this
// same net/http.Server.
func requireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		for _, prefix := range csrfExemptPrefixes {
			if strings.HasPrefix(r.URL.Path, prefix) {
				next.ServeHTTP(w, r)
				return
			}
		}
		if !checkCSRF(r) {
			writeBadRequest(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}
