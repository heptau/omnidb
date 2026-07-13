package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestResolveIdentityForwardsCookieAndParsesResponse(t *testing.T) {
	var gotCookie string
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/whoami/" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		gotCookie = r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"authenticated":true,"user_id":1,"username":"admin","super_user":true,"csv_encoding":"utf-8","csv_delimiter":";"}`))
	}))
	defer stub.Close()

	upstream, err := url.Parse(stub.URL)
	if err != nil {
		t.Fatalf("parse stub URL: %v", err)
	}

	who, err := resolveIdentity(upstream, "omnidb_sessionid=abc123")
	if err != nil {
		t.Fatalf("resolveIdentity: %v", err)
	}

	if gotCookie != "omnidb_sessionid=abc123" {
		t.Errorf("cookie not forwarded, got %q", gotCookie)
	}
	if !who.Authenticated || who.Username != "admin" || !who.SuperUser {
		t.Errorf("unexpected result: %+v", who)
	}
}

func TestResolveIdentityUnauthenticated(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"authenticated":false}`))
	}))
	defer stub.Close()

	upstream, err := url.Parse(stub.URL)
	if err != nil {
		t.Fatalf("parse stub URL: %v", err)
	}

	who, err := resolveIdentity(upstream, "")
	if err != nil {
		t.Fatalf("resolveIdentity: %v", err)
	}
	if who.Authenticated {
		t.Errorf("expected unauthenticated, got %+v", who)
	}
}
