package main

import (
	"database/sql"
	"net/url"
	"strconv"
)

// ConnectionInfo mirrors the JSON shape Django's internal/connection view
// used to return (OmniDB_app/views/internal.py) — kept unchanged even
// though resolveConnection no longer calls that endpoint, since every
// existing native route already consumes this exact struct shape.
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
	ConnString string `json:"connstring"`
}

// resolveConnection resolves the raw saved-connection row behind a
// p_database_index directly against Django's own app database (see
// appdb_connections.go's fetchConnectionByID) — no HTTP round trip to
// Django anymore. Go opens its own native driver connection from this
// instead of reusing Django's in-memory OmniDatabase instances.
//
// Before Fáze 8b this was a direct Go-as-HTTP-client call to Django's
// /internal/connection/ bridge, on the hot path of every single query/
// console/edit-data/export/terminal request — the last such per-request
// bridge call remaining after native long-polling removed
// queueResponseOnDjango's. Replicates the exact same ownership check
// Django's own view did (Q(user=request.user) | Q(public=True), mirroring
// Session.RefreshDatabaseList()) since fetchConnectionByID itself
// deliberately doesn't filter by owner (it's shared with the terminal/
// tunnel route, which resolves a different, already-trusted id).
func resolveConnection(upstream *url.URL, cookieHeader string, connID string) (*ConnectionInfo, error) {
	who, err := resolveIdentity(upstream, cookieHeader)
	if err != nil || !who.Authenticated {
		return &ConnectionInfo{Found: false}, nil
	}

	id, err := strconv.ParseInt(connID, 10, 64)
	if err != nil {
		return &ConnectionInfo{Found: false}, nil
	}

	db, err := openAppDB(upstream)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	c, err := fetchConnectionByID(db, id)
	if err == sql.ErrNoRows {
		return &ConnectionInfo{Found: false}, nil
	}
	if err != nil {
		return nil, err
	}
	if c.OwnerID != int64(who.UserID) && !c.Public {
		return &ConnectionInfo{Found: false}, nil
	}

	return &ConnectionInfo{
		Found:      true,
		Technology: c.Technology,
		Server:     c.Server,
		Port:       c.Port,
		Database:   c.Database,
		Username:   c.Username,
		Password:   c.Password,
		Alias:      c.Alias,
		Public:     c.Public,
		ConnString: c.ConnString,
	}, nil
}
