package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequireRelayAuth(t *testing.T) {
	const addr, token = "127.0.0.1:5555", "s3cret"
	h := requireRelayAuth(addr, token, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	cases := []struct {
		name, method, host, auth string
		want                     int
	}{
		{"ok", http.MethodPost, addr, "Bearer " + token, http.StatusTeapot},
		{"no token", http.MethodPost, addr, "", http.StatusForbidden},
		{"wrong token", http.MethodPost, addr, "Bearer nope", http.StatusForbidden},
		{"GET", http.MethodGet, addr, "Bearer " + token, http.StatusForbidden},
		{"rebound host", http.MethodPost, "evil.example:5555", "Bearer " + token, http.StatusForbidden},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, "http://"+c.host+"/pgpass-resolve", strings.NewReader("{}"))
		r.Host = c.host
		if c.auth != "" {
			r.Header.Set("Authorization", c.auth)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, w.Code, c.want)
		}
	}
}
