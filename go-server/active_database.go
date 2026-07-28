package main

import (
	"net/http"
	"strings"
	"sync"
)

// activeDatabaseMap remembers, per browser session + tab, that the tab is
// now targeting a different database than its saved connection's static
// Database field — see tree_postgresql.js's checkCurrentDatabase, which lets
// a user switch which sibling database (same server/connection) a tab
// browses/queries without opening a new connection. Mirrors
// password_prompt.go's passwordMemoryMap pattern.
var (
	activeDatabaseMu  sync.Mutex
	activeDatabaseMap = map[string]string{}
)

// outerTabID normalizes an inner tab id (a Query/Console sub-tab, whose id
// is built as "<outer connection tab id>_tabs_tab<N>_<timestamp>" — see
// tabs.js's tab-control id construction) back to its owning outer connection
// tab id. tree_postgresql.js's checkCurrentDatabase sends the outer id
// directly (normalizing it here is then a no-op); query.js/console.js send
// whichever inner tab issued the request instead. Without this, the
// override recorded for the connection would never match the id sent by an
// actual query execution, silently leaving it inert.
func outerTabID(tabID string) string {
	if idx := strings.Index(tabID, "_tabs_tab"); idx != -1 {
		return tabID[:idx]
	}
	return tabID
}

func activeDatabaseKey(sessionKey, tabID string) string {
	return sessionKey + "|" + outerTabID(tabID)
}

// reapActiveDatabaseMap removes every entry whose session key is no longer
// in liveSessionKeys — called from startSessionReaper's hourly sweep
// (native_session.go). Unlike nativeSessions/pollingClients (each fixed
// with their own reaper in 3.8.0), this map had no cleanup at all: an
// override recorded for a session lived forever, even after that session
// expired and got reaped, since nothing here ever re-checked. Piggybacks
// on nativeSessions' own expiry instead of tracking a separate timestamp —
// once a session is gone there's no way to ever recall this override again
// anyway (recalledActiveDatabase's key always starts with the same
// sessionKey), so there's nothing to preserve.
func reapActiveDatabaseMap(liveSessionKeys map[string]struct{}) {
	activeDatabaseMu.Lock()
	defer activeDatabaseMu.Unlock()
	for k := range activeDatabaseMap {
		sessionKey, _, _ := strings.Cut(k, "|")
		if _, ok := liveSessionKeys[sessionKey]; !ok {
			delete(activeDatabaseMap, k)
		}
	}
}

// rememberActiveDatabase is called from handleChangeActiveDatabase.
func rememberActiveDatabase(sessionKey, tabID, database string) {
	if sessionKey == "" || tabID == "" || database == "" {
		return
	}
	activeDatabaseMu.Lock()
	defer activeDatabaseMu.Unlock()
	activeDatabaseMap[activeDatabaseKey(sessionKey, tabID)] = database
}

func recalledActiveDatabase(sessionKey, tabID string) (string, bool) {
	if sessionKey == "" || tabID == "" {
		return "", false
	}
	activeDatabaseMu.Lock()
	defer activeDatabaseMu.Unlock()
	db, ok := activeDatabaseMap[activeDatabaseKey(sessionKey, tabID)]
	return db, ok
}

// applyActiveDatabaseOverride swaps in a remembered per-tab database switch
// before a connection is opened. Every native route resolves its *sql.DB
// fresh per request from the saved connection's static Database field
// (resolveConnection); without this, switching databases in the tree
// updated the tab's UI but every actual query/listing kept hitting the
// connection's original database.
func applyActiveDatabaseOverride(r *http.Request, tabID string, info *ConnectionInfo) {
	if db, ok := recalledActiveDatabase(nativeSessionCookieValue(r), tabID); ok {
		info.Database = db
	}
}
