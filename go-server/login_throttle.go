package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Sign-in throttling: after loginMaxFailures failed attempts for the same
// username, or from the same client address, within loginFailureWindow,
// further attempts are refused until the window passes. Without it,
// /sign_in/ on a -H-exposed server allows unlimited online guessing (and
// each attempt costs a full PBKDF2 verify of server CPU).
const (
	loginMaxFailures   = 10
	loginFailureWindow = 15 * time.Minute
)

type loginFailures struct {
	count int
	first time.Time
}

var (
	loginThrottleMu sync.Mutex
	loginThrottle   = map[string]*loginFailures{}
)

func loginThrottleKeys(r *http.Request, username string) []string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return []string{"ip:" + host, "user:" + strings.ToLower(username)}
}

// loginThrottled reports whether any of the request's keys is currently
// locked out. Expired entries are dropped as they're seen.
func loginThrottled(r *http.Request, username string) bool {
	loginThrottleMu.Lock()
	defer loginThrottleMu.Unlock()
	now := time.Now()
	for _, k := range loginThrottleKeys(r, username) {
		f, ok := loginThrottle[k]
		if !ok {
			continue
		}
		if now.Sub(f.first) > loginFailureWindow {
			delete(loginThrottle, k)
			continue
		}
		if f.count >= loginMaxFailures {
			return true
		}
	}
	return false
}

func recordLoginFailure(r *http.Request, username string) {
	loginThrottleMu.Lock()
	defer loginThrottleMu.Unlock()
	now := time.Now()
	// Bound memory against a flood of distinct usernames/addresses.
	if len(loginThrottle) > 100000 {
		for k, f := range loginThrottle {
			if now.Sub(f.first) > loginFailureWindow {
				delete(loginThrottle, k)
			}
		}
	}
	for _, k := range loginThrottleKeys(r, username) {
		f, ok := loginThrottle[k]
		if !ok || now.Sub(f.first) > loginFailureWindow {
			loginThrottle[k] = &loginFailures{count: 1, first: now}
			continue
		}
		f.count++
	}
}

func clearLoginFailures(r *http.Request, username string) {
	loginThrottleMu.Lock()
	defer loginThrottleMu.Unlock()
	delete(loginThrottle, "user:"+strings.ToLower(username))
}
