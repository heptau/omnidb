package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"

	"omnidb-server/i18n"
)

// testConnectionRequest mirrors connections.py's test_connection body —
// note the field names have no "p_" prefix here, unlike most of
// workspace.py's requests (verified against the Python source, not a typo).
type testConnectionRequest struct {
	ID           int64             `json:"id"`
	Type         string            `json:"type"`
	Server       string            `json:"server"`
	Port         string            `json:"port"`
	Database     string            `json:"database"`
	User         string            `json:"user"`
	Password     string            `json:"password"`
	ConnString   string            `json:"connstring"`
	Public       bool              `json:"public"`
	TempPassword *string           `json:"temp_password"`
	Tunnel       tunnelRequestData `json:"tunnel"`
}

type tunnelRequestData struct {
	Enabled  bool   `json:"enabled"`
	Server   string `json:"server"`
	Port     string `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Key      string `json:"key"`
}

// resolveTestConnectionSecrets mirrors test_connection's "blank means reuse
// the already-saved secret" logic — a stored connection's password/tunnel
// password/tunnel key are only replaced if the request actually supplies a
// new, non-blank value; otherwise the existing (possibly already-blank)
// stored value is reused, and temp_password (a one-shot password typed into
// a "this connection needs a password" prompt, not saved) wins over
// everything if present.
//
// who is required to enforce the same owner-or-public check every other
// fetchConnectionByID caller applies explicitly (connection_info.go's
// resolveConnection, terminal.go's handleTerminalRequest) — this route was
// found calling fetchConnectionByID with no such check at all, letting any
// authenticated user reuse another user's stored connection/tunnel secret
// by passing that connection's id with a blank password and an
// attacker-controlled server/port (the secret would then be dialed to a
// host the attacker controls). Fixed rather than left as a "trusted since
// resolveIdentity already ran" case like fetchConnectionByID's own comment
// claims — that reasoning holds for the *existence* of a session, not for
// which connections that session is allowed to read secrets from.
func resolveTestConnectionSecrets(db *sql.DB, req *testConnectionRequest, who *WhoAmI) (password, sshPassword, sshKey string, err error) {
	password = req.Password
	sshPassword = req.Tunnel.Password
	sshKey = req.Tunnel.Key

	if req.ID != -1 {
		conn, ferr := fetchConnectionByID(db, req.ID)
		if ferr != nil {
			return "", "", "", ferr
		}
		if conn.OwnerID != int64(who.UserID) && !conn.Public {
			return "", "", "", fmt.Errorf("connection not found")
		}
		if req.Password == "" {
			password = conn.Password
		}
		if req.Tunnel.Password == "" {
			sshPassword = conn.SSHPassword
		}
		if req.Tunnel.Key == "" {
			sshKey = conn.SSHKey
		}
	}
	if req.TempPassword != nil {
		password = *req.TempPassword
	}
	return password, sshPassword, sshKey, nil
}

func testConnectionMessage(lang, technology string, info *ConnectionInfo) string {
	switch technology {
	case "sqlite":
		return testSQLiteConnectionMessage(lang, info.Database)
	case "postgresql":
		return testPostgreSQLConnectionMessage(lang, info)
	default: // mysql, mariadb, oracle, mssql, firebird
		return testGenericPingMessage(lang, info)
	}
}

// testSQLiteConnectionMessage mirrors SQLite.py's TestConnection — a plain
// file-existence check, no actual sqlite Open() at all.
func testSQLiteConnectionMessage(lang, path string) string {
	if _, err := os.Stat(path); err == nil {
		return i18n.T(lang, "test_connection.successful")
	} else if os.IsNotExist(err) {
		return i18n.T(lang, "test_connection.sqlite_file_missing")
	} else {
		return err.Error()
	}
}

// testPostgreSQLConnectionMessage mirrors PostgreSQL.py's TestConnection —
// unlike every other engine, success requires actually finding at least one
// schema, not just a bare connect.
func testPostgreSQLConnectionMessage(lang string, info *ConnectionInfo) string {
	db, err := openPostgreSQLTarget(info)
	if err != nil {
		return err.Error()
	}
	defer db.Close()
	schemas, err := postgresqlSchemas(db)
	if err != nil {
		return err.Error()
	}
	if len(schemas) > 0 {
		return i18n.T(lang, "test_connection.successful")
	}
	return ""
}

// testGenericPingMessage mirrors MySQL/MariaDB/Oracle's TestConnection —
// just Open()+Close(); database/sql's Open() is lazy, so Ping() is what
// actually forces the connection attempt here.
func testGenericPingMessage(lang string, info *ConnectionInfo) string {
	db, err := openNativeQueryTarget(info)
	if err != nil {
		return err.Error()
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return err.Error()
	}
	return i18n.T(lang, "test_connection.successful")
}

// runTestConnection mirrors test_connection's full branch: a "terminal"
// connection just dials+closes the SSH client itself; every other
// technology optionally tunnels through SSH first (openSSHForward),
// pointing the driver at the local forwarded port instead of the real
// remote address — same trick Python's sshtunnel-based version uses.
func runTestConnection(lang string, req *testConnectionRequest, password, sshPassword, sshKey string) (message string, isError bool) {
	if req.Type == "terminal" {
		client, err := dialSSH(req.Tunnel.User, req.Tunnel.Server, req.Tunnel.Port, sshPassword, sshKey)
		if err != nil {
			return err.Error(), true
		}
		client.Close()
		return i18n.T(lang, "test_connection.successful"), false
	}

	info := &ConnectionInfo{
		Found:      true,
		Technology: req.Type,
		Server:     req.Server,
		Port:       req.Port,
		Database:   req.Database,
		Username:   req.User,
		Password:   password,
		ConnString: req.ConnString,
	}

	if req.Tunnel.Enabled {
		client, err := dialSSH(req.Tunnel.User, req.Tunnel.Server, req.Tunnel.Port, sshPassword, sshKey)
		if err != nil {
			return err.Error(), true
		}
		defer client.Close()

		localAddr, closeForward, err := openSSHForward(client, fmt.Sprintf("%s:%s", req.Server, req.Port))
		if err != nil {
			return err.Error(), true
		}
		defer closeForward()

		host, port, err := splitHostPort(localAddr)
		if err != nil {
			return err.Error(), true
		}
		info.Server = host
		info.Port = port
	}

	message = testConnectionMessage(lang, req.Type, info)
	return message, message != i18n.T(lang, "test_connection.successful")
}

func splitHostPort(addr string) (host, port string, err error) {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i], addr[i+1:], nil
		}
	}
	return "", "", fmt.Errorf("invalid address %q", addr)
}

// handleTestConnection mirrors connections.py's test_connection.
func handleTestConnection(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req testConnectionRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		lang := i18n.ResolveLanguage(who.Language, r.Header.Get("Accept-Language"))

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()
		password, sshPassword, sshKey, err := resolveTestConnectionSecrets(appDB, &req, who)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		message, isError := runTestConnection(lang, &req, password, sshPassword, sshKey)
		writeEnvelope(w, message, isError, -1)
	}
}
