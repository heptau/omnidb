package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// WhoAmI mirrors the JSON shape returned by Django's internal/whoami view
// (OmniDB_app/views/internal.py).
type WhoAmI struct {
	Authenticated bool   `json:"authenticated"`
	UserID        int    `json:"user_id"`
	Username      string `json:"username"`
	SuperUser     bool   `json:"super_user"`
	CSVEncoding   string `json:"csv_encoding"`
	CSVDelimiter  string `json:"csv_delimiter"`
}

// resolveIdentity asks the still-running Django process who owns the given
// session cookie. This lets a route that has already moved to a native Go
// handler (starting phase 2 of the migration plan) find out who's asking
// without reimplementing Django's session store — Django keeps owning
// login/session until the very last migration phase.
func resolveIdentity(upstream *url.URL, cookieHeader string) (*WhoAmI, error) {
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s://%s/internal/whoami/", upstream.Scheme, upstream.Host), nil)
	if err != nil {
		return nil, err
	}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call whoami: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("whoami: unexpected status %d", resp.StatusCode)
	}

	var who WhoAmI
	if err := json.NewDecoder(resp.Body).Decode(&who); err != nil {
		return nil, fmt.Errorf("decode whoami response: %w", err)
	}
	return &who, nil
}
