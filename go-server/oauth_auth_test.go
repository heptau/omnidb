package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestParseOAuthCommandOutput(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"abc.def\n", "abc.def"},
		{`{"accessToken":"tok1","expiresOn":"x"}`, "tok1"},
		{`{"access_token":"tok2"}`, "tok2"},
	} {
		got, err := parseOAuthCommandOutput(tc.in)
		if err != nil || got != tc.want {
			t.Errorf("parse(%q) = %q, %v; want %q", tc.in, got, err, tc.want)
		}
	}
	for _, bad := range []string{"", "  \n", "two words", `{"x":1}`} {
		if _, err := parseOAuthCommandOutput(bad); err == nil {
			t.Errorf("parse(%q) should fail", bad)
		}
	}
}

func TestOAuthTokenFromCommand(t *testing.T) {
	got, err := oauthTokenFromCommand(context.Background(), "echo hello-token")
	if err != nil || got != "hello-token" {
		t.Fatalf("got %q, %v", got, err)
	}
	if _, err := oauthTokenFromCommand(context.Background(), "echo boom >&2; exit 3"); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("want stderr in error, got %v", err)
	}
}

func TestOAuthClientCredentialsAndCache(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		r.ParseForm()
		if r.Form.Get("grant_type") != "client_credentials" || r.Form.Get("client_id") != "cid" ||
			r.Form.Get("client_secret") != "shh" || r.Form.Get("scope") != "db.login" {
			http.Error(w, `{"error":"invalid_request"}`, 400)
			return
		}
		w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
	}))
	defer srv.Close()

	cfg := &oauthConfig{Mode: oauthModeClientCredentials, TokenURL: srv.URL, ClientID: "cid", Scope: "db.login"}
	for i := 0; i < 2; i++ {
		tok, err := oauthTokenFromClientCredentials(context.Background(), cfg, "shh")
		if err != nil || tok != "tok" {
			t.Fatalf("got %q, %v", tok, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("token not cached: %d requests", calls.Load())
	}
	if _, err := oauthTokenFromClientCredentials(context.Background(), cfg, "wrong"); err == nil || !strings.Contains(err.Error(), "invalid_request") {
		t.Fatalf("want endpoint error, got %v", err)
	}
}

func TestCheckOAuthTokenURL(t *testing.T) {
	for _, ok := range []string{"https://login.example.com/token", "http://localhost:8080/t", "http://127.0.0.1/t"} {
		if _, err := checkOAuthTokenURL(ok); err != nil {
			t.Errorf("%s rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "http://169.254.169.254/token", "ftp://x/y", "login.example.com"} {
		if _, err := checkOAuthTokenURL(bad); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
}

func TestOAuthCommandGate(t *testing.T) {
	info := &ConnectionInfo{Technology: "postgresql", AuthMethod: authMethodOAuth, OAuth: oauthConfig{Mode: oauthModeCommand}}
	if err := checkOAuthAllowed(info, &WhoAmI{}); err != errOAuthCommandRestricted {
		t.Fatalf("got %v", err)
	}
	if err := checkOAuthAllowed(info, &WhoAmI{SuperUser: true}); err != nil {
		t.Fatal(err)
	}
	info.OAuth.Mode = oauthModeToken
	if err := checkOAuthAllowed(info, &WhoAmI{}); err != nil {
		t.Fatal(err)
	}
}

func TestSaveConnectionStoresOAuthSettings(t *testing.T) {
	withTestSecretKey(t)
	db := newConnectionOrderDB(t)

	in := saveConnectionInput{
		ID: -1, Technology: "postgresql", Server: "db", Port: "5432", Database: "d", Username: "u", Alias: "oauth",
		AuthMethod: authMethodOAuth,
		OAuth: oauthConfig{Mode: oauthModeClientCredentials, Delivery: oauthDeliveryBearer,
			TokenURL: "https://idp.example.com/token", ClientID: "cid", Command: "ignored"},
		OAuthSecret: "topsecret",
	}
	id, err := saveConnection(db, 1, in)
	if err != nil {
		t.Fatal(err)
	}
	var raw string
	db.QueryRow(`select oauth_secret from OmniDB_app_connection where id = ?`, id).Scan(&raw)
	if !strings.HasPrefix(raw, encSecretPrefix) {
		t.Fatalf("secret stored in plaintext: %q", raw)
	}

	in.ID, in.OAuthSecret = id, ""
	if _, err := saveConnection(db, 1, in); err != nil {
		t.Fatal(err)
	}
	c, _ := fetchConnectionByID(db, id)
	if c.OAuthSecret != "topsecret" || c.OAuth.ClientID != "cid" || c.OAuth.Command != "" {
		t.Fatalf("unexpected: %+v", c)
	}

	// Command mode keeps no secret.
	in.OAuth = oauthConfig{Mode: oauthModeCommand, Delivery: oauthDeliveryPassword, Command: "gcloud auth print-access-token"}
	if _, err := saveConnection(db, 1, in); err != nil {
		t.Fatal(err)
	}
	if c, _ = fetchConnectionByID(db, id); c.OAuthSecret != "" || c.OAuth.Command == "" {
		t.Fatalf("unexpected: %+v", c)
	}

	in.OAuth.Delivery = "carrier-pigeon"
	if _, err := saveConnection(db, 1, in); err == nil {
		t.Fatal("bad delivery accepted")
	}
	in.OAuth.Delivery = oauthDeliveryBearer
	in.Technology = "mysql"
	if _, err := saveConnection(db, 1, in); err == nil {
		t.Fatal("OAuth accepted for mysql")
	}
}

func TestPostgreSQLOAuthDelivery(t *testing.T) {
	info := &ConnectionInfo{Technology: "postgresql", AuthMethod: authMethodOAuth,
		OAuth: oauthConfig{Mode: oauthModeToken, Delivery: oauthDeliveryBearer}, OAuthSecret: "tok"}
	cfg, err := postgresqlConnConfig(&ConnectionInfo{Technology: "postgresql", Server: "h", Port: "5432", Database: "d", Username: "u",
		AuthMethod: info.AuthMethod, OAuth: info.OAuth, OAuthSecret: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.OAuthTokenProvider == nil || cfg.Password != "" {
		t.Fatalf("OAUTHBEARER provider not installed: %+v", cfg.Password)
	}
	if tok, _ := cfg.OAuthTokenProvider(context.Background()); tok != "tok" {
		t.Fatalf("provider returned %q", tok)
	}

	info.OAuth.Delivery = oauthDeliveryPassword
	cfg, err = postgresqlConnConfig(&ConnectionInfo{Technology: "postgresql", Server: "h", Port: "5432", Database: "d", Username: "u",
		AuthMethod: info.AuthMethod, OAuth: info.OAuth, OAuthSecret: "tok"})
	if err != nil || cfg.Password != "tok" || cfg.OAuthTokenProvider != nil {
		t.Fatalf("password delivery: %v %+v", err, cfg.Password)
	}
}
