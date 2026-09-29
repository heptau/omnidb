package main

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoginThrottleLocksAfterRepeatedFailures(t *testing.T) {
	loginThrottleMu.Lock()
	loginThrottle = map[string]*loginFailures{}
	loginThrottleMu.Unlock()

	r := httptest.NewRequest("POST", "/sign_in/", nil)
	r.RemoteAddr = "192.0.2.1:1234"
	for i := 0; i < loginMaxFailures; i++ {
		if loginThrottled(r, "alice") {
			t.Fatalf("throttled after only %d failures", i)
		}
		recordLoginFailure(r, "alice")
	}
	if !loginThrottled(r, "alice") {
		t.Fatal("not throttled after loginMaxFailures failures")
	}
	other := httptest.NewRequest("POST", "/sign_in/", nil)
	other.RemoteAddr = "192.0.2.2:1234"
	if !loginThrottled(other, "ALICE") {
		t.Fatal("username lockout should apply from any address, case-insensitively")
	}
	if loginThrottled(other, "bob") {
		t.Fatal("an unrelated user from an unrelated address must not be throttled")
	}
}

func TestSyncNativeSessionsForUser(t *testing.T) {
	nativeSessionsMu.Lock()
	nativeSessions["zz-a"] = &nativeSession{UserID: 4242, SuperUser: true, ExpiresAt: time.Now().Add(time.Hour)}
	nativeSessions["zz-b"] = &nativeSession{UserID: 4242, SuperUser: true, ExpiresAt: time.Now().Add(time.Hour)}
	nativeSessionsMu.Unlock()
	defer func() {
		nativeSessionsMu.Lock()
		delete(nativeSessions, "zz-a")
		delete(nativeSessions, "zz-b")
		nativeSessionsMu.Unlock()
	}()

	syncNativeSessionsForUser(4242, "u", false, false, false, "")
	if s, _ := lookupNativeSession("zz-a"); s == nil || s.SuperUser {
		t.Fatal("demotion was not applied to the live session")
	}
	syncNativeSessionsForUser(4242, "u", false, true, false, "zz-a")
	if _, ok := lookupNativeSession("zz-b"); ok {
		t.Fatal("password change must end the user's other sessions")
	}
	if _, ok := lookupNativeSession("zz-a"); !ok {
		t.Fatal("password change must keep the caller's own session")
	}
	syncNativeSessionsForUser(4242, "", false, false, true, "")
	if _, ok := lookupNativeSession("zz-a"); ok {
		t.Fatal("deleting the user must end all of their sessions")
	}
}
