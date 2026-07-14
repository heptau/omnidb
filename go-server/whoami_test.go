package main

import (
	"testing"
)

func TestResolveIdentityWithValidNativeSession(t *testing.T) {
	key, err := createNativeSession(1, "admin", true, "utf-8", ";")
	if err != nil {
		t.Fatalf("createNativeSession: %v", err)
	}
	defer destroyNativeSession(key)

	who, err := resolveIdentity(nil, nativeSessionCookieName+"="+key)
	if err != nil {
		t.Fatalf("resolveIdentity: %v", err)
	}
	if !who.Authenticated || who.Username != "admin" || !who.SuperUser || who.CSVEncoding != "utf-8" || who.CSVDelimiter != ";" {
		t.Errorf("unexpected result: %+v", who)
	}
}

func TestResolveIdentityUnauthenticated(t *testing.T) {
	who, err := resolveIdentity(nil, "")
	if err != nil {
		t.Fatalf("resolveIdentity: %v", err)
	}
	if who.Authenticated {
		t.Errorf("expected unauthenticated, got %+v", who)
	}
}

func TestResolveIdentityWithUnknownSessionCookie(t *testing.T) {
	who, err := resolveIdentity(nil, nativeSessionCookieName+"=does-not-exist")
	if err != nil {
		t.Fatalf("resolveIdentity: %v", err)
	}
	if who.Authenticated {
		t.Errorf("expected unauthenticated for unknown session key, got %+v", who)
	}
}
