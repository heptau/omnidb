package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// ConnectionInfo mirrors the JSON shape returned by Django's
// internal/connection view (OmniDB_app/views/internal.py).
type ConnectionInfo struct {
	Found      bool   `json:"found"`
	Technology string `json:"technology"`
	Server     string `json:"server"`
	Port       string `json:"port"`
	Database   string `json:"database"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	Alias      string `json:"alias"`
	Public     bool   `json:"public"`
}

// resolveConnection asks Django for the raw saved-connection row behind a
// p_database_index, already ownership-checked (owner or public) the same
// way Session.RefreshDatabaseList() does. Go opens its own native driver
// connection from this instead of reusing Django's in-memory OmniDatabase
// instances.
//
// This is a direct Go-as-HTTP-client call to Django, NOT a request this
// process's own reverse proxy forwards — so main.go's Director (the only
// place that injects X-Omnidb-Trusted-User-Id for proxied requests) never
// runs for it. Before Fáze 7, that didn't matter: Django's own session
// cookie (set by its own, then-still-active login.py) made
// request.user.is_authenticated true independent of any trusted header.
// Since Fáze 7 moved login to Go, a purely Go-native session never sets
// Django's own session cookie at all, so connection_info's ownership check
// (Q(user=request.user) | Q(public=True)) silently returned found:false for
// every non-public connection — a real regression, found by testing a
// brand-new Go-native session against a private connection. Fixed by
// setting the trusted header here too, mirroring the Director exactly.
func resolveConnection(upstream *url.URL, cookieHeader string, connID string) (*ConnectionInfo, error) {
	reqURL := fmt.Sprintf("%s://%s/internal/connection/?id=%s", upstream.Scheme, upstream.Host, url.QueryEscape(connID))
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
	}
	if who, err := resolveIdentity(upstream, cookieHeader); err == nil && who.Authenticated {
		req.Header.Set(trustedUserHeader, strconv.Itoa(who.UserID))
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call connection info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &ConnectionInfo{Found: false}, nil
	}

	var info ConnectionInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode connection info response: %w", err)
	}
	return &info, nil
}
