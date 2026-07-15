package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
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
func resolveTestConnectionSecrets(db *sql.DB, req *testConnectionRequest) (password, sshPassword, sshKey string, err error) {
	password = req.Password
	sshPassword = req.Tunnel.Password
	sshKey = req.Tunnel.Key

	if req.ID != -1 {
		conn, ferr := fetchConnectionByID(db, req.ID)
		if ferr != nil {
			return "", "", "", ferr
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

func testConnectionMessage(technology string, info *ConnectionInfo) string {
	switch technology {
	case "sqlite":
		return testSQLiteConnectionMessage(info.Database)
	case "postgresql":
		return testPostgreSQLConnectionMessage(info)
	default: // mysql, mariadb, oracle
		return testGenericPingMessage(info)
	}
}

// testSQLiteConnectionMessage mirrors SQLite.py's TestConnection — a plain
// file-existence check, no actual sqlite Open() at all.
func testSQLiteConnectionMessage(path string) string {
	if _, err := os.Stat(path); err == nil {
		return "Connection successful."
	} else if os.IsNotExist(err) {
		return "File does not exist, if you try to manage this connection a database file will be created."
	} else {
		return err.Error()
	}
}

// testPostgreSQLConnectionMessage mirrors PostgreSQL.py's TestConnection —
// unlike every other engine, success requires actually finding at least one
// schema, not just a bare connect.
func testPostgreSQLConnectionMessage(info *ConnectionInfo) string {
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
		return "Connection successful."
	}
	return ""
}

// testGenericPingMessage mirrors MySQL/MariaDB/Oracle's TestConnection —
// just Open()+Close(); database/sql's Open() is lazy, so Ping() is what
// actually forces the connection attempt here.
func testGenericPingMessage(info *ConnectionInfo) string {
	db, err := openNativeQueryTarget(info)
	if err != nil {
		return err.Error()
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return err.Error()
	}
	return "Connection successful."
}

// runTestConnection mirrors test_connection's full branch: a "terminal"
// connection just dials+closes the SSH client itself; every other
// technology optionally tunnels through SSH first (openSSHForward),
// pointing the driver at the local forwarded port instead of the real
// remote address — same trick Python's sshtunnel-based version uses.
func runTestConnection(req *testConnectionRequest, password, sshPassword, sshKey string) (message string, isError bool) {
	if req.Type == "terminal" {
		client, err := dialSSH(req.Tunnel.User, req.Tunnel.Server, req.Tunnel.Port, sshPassword, sshKey)
		if err != nil {
			return err.Error(), true
		}
		client.Close()
		return "Connection successful.", false
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

	message = testConnectionMessage(req.Type, info)
	return message, message != "Connection successful."
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

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		password, sshPassword, sshKey, err := resolveTestConnectionSecrets(appDB, &req)
		appDB.Close()
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		message, isError := runTestConnection(&req, password, sshPassword, sshKey)
		writeEnvelope(w, message, isError, -1)
	}
}
