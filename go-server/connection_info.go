package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
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
func resolveConnection(upstream *url.URL, cookieHeader string, connID string) (*ConnectionInfo, error) {
	reqURL := fmt.Sprintf("%s://%s/internal/connection/?id=%s", upstream.Scheme, upstream.Host, url.QueryEscape(connID))
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if cookieHeader != "" {
		req.Header.Set("Cookie", cookieHeader)
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
