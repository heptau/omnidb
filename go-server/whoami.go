package main

import (
	"net/http"
	"net/url"
)

// WhoAmI mirrors the shape Django's internal/whoami view used to return
// (OmniDB_app/views/internal.py) — kept unchanged even though resolveIdentity
// no longer calls that endpoint (Fáze 7: Go now owns login/session
// natively), since every existing native route already consumes this exact
// struct shape.
type WhoAmI struct {
	Authenticated bool
	UserID        int
	Username      string
	SuperUser     bool
	CSVEncoding   string
	CSVDelimiter  string
}

// resolveIdentity resolves who owns a given "Cookie" header value against
// Go's own native session store (see native_session.go) — no HTTP round
// trip to Django anymore. upstream is kept as a parameter purely so none of
// this function's ~16 existing call sites need to change; it's unused now.
//
// Before Fáze 7 this asked the still-running Django process (Django owned
// login/session until then); Django's own copy of session/auth machinery
// still exists and still runs for the handful of routes not yet natively
// ported, but it's no longer the source of truth for identity — see
// main.go's trusted-header injection for how those remaining routes learn
// who's asking without Go reimplementing Django's ORM/ModelBackend calls a
// second time.
func resolveIdentity(upstream *url.URL, cookieHeader string) (*WhoAmI, error) {
	_ = upstream
	req := &http.Request{Header: http.Header{}}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
	}

	c, err := req.Cookie(nativeSessionCookieName)
	if err != nil || c.Value == "" {
		return &WhoAmI{Authenticated: false}, nil
	}
	sess, ok := lookupNativeSession(c.Value)
	if !ok {
		return &WhoAmI{Authenticated: false}, nil
	}
	return &WhoAmI{
		Authenticated: true,
		UserID:        sess.UserID,
		Username:      sess.Username,
		SuperUser:     sess.SuperUser,
		CSVEncoding:   sess.CSVEncoding,
		CSVDelimiter:  sess.CSVDelimiter,
	}, nil
}
