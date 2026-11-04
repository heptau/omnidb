package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHardenHTTPAllowedHostsEnv(t *testing.T) {
	t.Setenv(allowedHostsEnv, "omnidb.example.com, omnidb-server:8000")
	h := hardenHTTP("127.0.0.1", 9000, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	for host, want := range map[string]int{
		"127.0.0.1:9000":         200,
		"omnidb.example.com":     200,
		"omnidb.example.com:443": 200,
		"omnidb-server:8000":     200,
		"omnidb-server:9":        421,
		"evil.example":           421,
	} {
		req := httptest.NewRequest("GET", "/", nil)
		req.Host = host
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Errorf("Host %q: got %d, want %d", host, rec.Code, want)
		}
	}
}
