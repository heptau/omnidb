package main

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// terminalSession holds one remote-terminal tab's persistent SSH shell —
// mirrors what Python keeps on tab_object['terminal_object']/
// ['terminal_ssh_client']/['terminal_transport'] for the tab's entire
// lifetime. Unlike every other feature in this migration, a terminal tab's
// background output-reader goroutine is started exactly ONCE (on the first
// keystroke) and keeps running independently for as long as the tab stays
// open — later requests for the same tab just write more bytes to stdin,
// they don't re-enter runTerminalReader (see handleTerminalRequest).
type terminalSession struct {
	mu     sync.Mutex
	client *ssh.Client
	sess   *ssh.Session
	stdin  io.WriteCloser
	stdout io.Reader
}

var terminalSessions sync.Map // map[string]*terminalSession, keyed by cursorKey(clientID, tabID)

func (t *terminalSession) alive() bool {
	// Mirrors Python's `if not tab_object['terminal_transport'].is_active()`
	// check — a lightweight round trip is the closest Go equivalent to
	// paramiko's Transport.is_active() (which just checks a local flag, but
	// Go's ssh.Client has no public equivalent to peek at without a call).
	_, _, err := t.client.SendRequest("keepalive@omnidb", true, nil)
	return err == nil
}

// closeTerminalSession releases a tab's SSH session, if any. Safe to call
// for tabs Go never touched. Closing client unblocks any goroutine currently
// parked in a blocking stdout.Read() (see runTerminalReader) — that's the Go
// equivalent of Python's self.cancel flag combined with a periodic recv
// timeout, done here as a single unblocking Close() instead of polling.
func closeTerminalSession(clientID, tabID string) {
	key := cursorKey(clientID, tabID)
	v, ok := terminalSessions.LoadAndDelete(key)
	if !ok {
		return
	}
	t := v.(*terminalSession)
	t.mu.Lock()
	defer t.mu.Unlock()
	t.sess.Close()
	t.client.Close()
}

func closeTerminalSessionsForClient(clientID string) {
	prefix := clientID + "|"
	var keys []string
	terminalSessions.Range(func(key, _ any) bool {
		if k, ok := key.(string); ok && strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
		return true
	})
	for _, k := range keys {
		if v, ok := terminalSessions.LoadAndDelete(k); ok {
			t := v.(*terminalSession)
			t.mu.Lock()
			t.sess.Close()
			t.client.Close()
			t.mu.Unlock()
		}
	}
}

// preferredHostKeyAlgorithms biases which host key algorithm the client
// proposes during key exchange toward whatever's already recorded in
// known_hosts for this host, mirroring what a real ssh/paramiko client does
// (it consults known_hosts before connecting, not after). This matters
// because host key algorithm selection happens once, during KEX, driven
// entirely by the client's *offered* algorithm list — the server just picks
// the first one from that list it also supports and has a key for. If Go's
// default list (which starts with ecdsa, not ed25519) doesn't happen to
// match whatever single key type a user's known_hosts records for a host
// that offers multiple types, the server would pick a type with no
// known_hosts entry at all and the connection would fail with a spurious
// "key mismatch" even though the host genuinely is trusted — this isn't a
// hypothetical, it's exactly what happened testing this against a real
// multi-algorithm OpenSSH server (see go-backend-migration memory). Returns
// nil (falls back to Go's built-in default order) if nothing matches, so a
// genuinely unknown host still gets the default order and is correctly
// rejected by the HostKeyCallback afterward.
func preferredHostKeyAlgorithms(knownHostsPath, host, port string) []string {
	data, err := os.ReadFile(knownHostsPath)
	if err != nil {
		return nil
	}

	targets := map[string]bool{host: true}
	if port != "" && port != "22" {
		targets[fmt.Sprintf("[%s]:%s", host, port)] = true
	}

	var seen []string
	seenSet := map[string]bool{}
	rest := data
	for {
		_, hosts, pubKey, _, remaining, err := ssh.ParseKnownHosts(rest)
		if err != nil {
			break
		}
		rest = remaining

		matched := false
		for _, h := range hosts {
			if targets[h] {
				matched = true
				break
			}
			if strings.HasPrefix(h, "|1|") && hashedHostMatches(h, host, port) {
				matched = true
				break
			}
		}
		if matched && !seenSet[pubKey.Type()] {
			seenSet[pubKey.Type()] = true
			seen = append(seen, pubKey.Type())
		}
	}
	return seen
}

// hashedHostMatches replicates OpenSSH's HashKnownHosts entry format
// ("|1|<base64 salt>|<base64 HMAC-SHA1(salt, host)>") since ssh.
// ParseKnownHosts returns that marker as an opaque string rather than
// expanding it — needed because HashKnownHosts is a common ssh_config
// default, so plenty of real known_hosts files never contain a plaintext
// hostname at all.
func hashedHostMatches(entry, host, port string) bool {
	parts := strings.Split(entry, "|")
	if len(parts) != 4 {
		return false
	}
	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	wantHash, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}

	candidates := []string{host}
	if port != "" && port != "22" {
		candidates = append(candidates, fmt.Sprintf("[%s]:%s", host, port))
	}
	for _, c := range candidates {
		mac := hmac.New(sha1.New, salt)
		mac.Write([]byte(c))
		if hmac.Equal(mac.Sum(nil), wantHash) {
			return true
		}
	}
	return false
}

// dialTerminalSSH mirrors the connect logic in polling.py's `requestType.
// Terminal` branch. See dialSSH for the shared auth/host-key logic (also
// used by test_connection's tunnel path — see ssh_tunnel.go).
func dialTerminalSSH(conn *appConnection) (*ssh.Client, error) {
	return dialSSH(conn.SSHUser, conn.SSHServer, conn.SSHPort, conn.SSHPassword, conn.SSHKey)
}

// dialSSH is the shared SSH-client-dial logic behind both the remote
// terminal (dialTerminalSSH above) and test_connection/tunneled-connection
// support (ssh_tunnel.go) — key-based auth when a key is configured (with
// an optional passphrase, Python's `key_filename`+`passphrase`), else
// password auth. Host key verification mirrors Python's
// `client.load_system_host_keys()` + `client.set_missing_host_key_policy
// (paramiko.RejectPolicy())` — an unknown or mismatched host key REJECTS
// the connection outright (no trust-on-first-use, no auto-add), checking
// only the user's own ~/.ssh/known_hosts (paramiko's primary source), not
// /etc/ssh/ssh_known_hosts — a narrow, unlikely-to-matter gap on a
// single-user desktop app.
func dialSSH(user, server, port, password, key string) (*ssh.Client, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")

	hostKeyCallback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		return nil, fmt.Errorf("load known_hosts: %w", err)
	}

	config := &ssh.ClientConfig{
		User:              user,
		HostKeyCallback:   hostKeyCallback,
		HostKeyAlgorithms: preferredHostKeyAlgorithms(knownHostsPath, server, port),
		Timeout:           60 * time.Second,
	}
	if strings.TrimSpace(key) != "" {
		var signer ssh.Signer
		if password != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(key), []byte(password))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(key))
		}
		if err != nil {
			return nil, err
		}
		config.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	} else {
		config.Auth = []ssh.AuthMethod{ssh.Password(password)}
	}

	addr := fmt.Sprintf("%s:%s", server, port)
	return ssh.Dial("tcp", addr, config)
}

// openTerminalSession mirrors invoke_shell() + SSHClientInteraction's
// constructor — a PTY-backed interactive shell, stdin/stdout wired up for
// runTerminalReader/handleTerminalRequest to use. width/height start at
// 80x24 like Python's SSHClientInteraction defaults; the frontend
// immediately follows up with a "stty rows N cols M" command over the same
// channel to resize it (see terminal.js's startTerminal), so the exact
// initial values here don't matter.
func openTerminalSession(conn *appConnection) (*terminalSession, error) {
	client, err := dialTerminalSSH(conn)
	if err != nil {
		return nil, err
	}
	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, err
	}
	if err := sess.RequestPty("xterm", 24, 80, ssh.TerminalModes{}); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	if err := sess.Shell(); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	return &terminalSession{client: client, sess: sess, stdin: stdin, stdout: stdout}, nil
}

// runTerminalReader mirrors thread_terminal — reads whatever's currently
// available from the shell's combined stdout/stderr stream (a PTY merges
// both into one file descriptor, same as a real terminal) and pushes it
// straight through Django's long-polling queue, one chunk per read, for as
// long as the session stays open. There's no equivalent of Python's 10000-
// char rechunking here: a single read never approaches that size, so
// Python's own chunk loop only ever produces exactly one chunk in practice
// too — this just skips reproducing pointless machinery.
//
// Unlike every other native route, this goroutine runs for the entire
// lifetime of the tab, not just one request — it's started once (see
// handleTerminalRequest) and exits only when the session is closed
// (tab close/cancel, see closeTerminalSession) or the remote end hangs up.
func runTerminalReader(upstream *url.URL, cookie string, clientID, tabID string, contextCode int, t *terminalSession) {
	buf := make([]byte, 4096)
	for {
		n, err := t.stdout.Read(buf)
		if n > 0 {
			queueNativeResponse(cookie, map[string]any{
				"v_code":         responseTerminalResult,
				"v_context_code": contextCode,
				"v_error":        false,
				"v_data": map[string]any{
					"v_data":       string(buf[:n]),
					"v_last_block": true,
				},
			})
		}
		if err != nil {
			closeTerminalSession(clientID, tabID)
			return
		}
	}
}

type terminalRequestData struct {
	VCmd   string      `json:"v_cmd"`
	VTabID string      `json:"v_tab_id"`
	VSpawn bool        `json:"v_spawn"`
	VSSHID json.Number `json:"v_ssh_id"`
}

// handleTerminalRequest mirrors polling.py's `if v_code == requestType.
// Terminal:` branch at the very top of create_request — structurally
// separate from the Query/Console/EditData dispatch below it (no
// v_database, no get_database_tab_object; a terminal connection's "tunnel"
// fields ARE the target, not a proxy for a DB connection).
func handleTerminalRequest(upstream *url.URL, cookie, clientID string, q terminalRequestData, contextCode int, who *WhoAmI) {
	key := cursorKey(clientID, q.VTabID)
	if v, ok := terminalSessions.Load(key); ok {
		t := v.(*terminalSession)
		if t.alive() {
			t.mu.Lock()
			_, err := t.stdin.Write([]byte(q.VCmd))
			t.mu.Unlock()
			if err != nil {
				log.Printf("handleTerminalRequest: stdin write: %v", err)
			}
			return
		}
		closeTerminalSession(clientID, q.VTabID)
	}

	// No live session for this tab — open one, exactly like Python falling
	// through to the except-block reconnect logic.
	sshID, _ := q.VSSHID.Int64()
	db, err := openAppDB(upstream)
	if err != nil {
		queueTerminalError(upstream, cookie, contextCode, err)
		return
	}
	conn, err := fetchConnectionByID(db, sshID)
	db.Close()
	if err != nil {
		queueTerminalError(upstream, cookie, contextCode, err)
		return
	}
	// Mirrors the ownership check every other connection-resolving route
	// gets from Django's internal/connection endpoint — a terminal
	// connection never goes through that endpoint (it's resolved straight
	// from the app db here), so the same owner-or-public rule has to be
	// applied explicitly instead of inherited for free.
	if conn.OwnerID != int64(who.UserID) && !conn.Public {
		queueTerminalError(upstream, cookie, contextCode, fmt.Errorf("connection not found"))
		return
	}

	t, err := openTerminalSession(conn)
	if err != nil {
		queueTerminalError(upstream, cookie, contextCode, err)
		return
	}
	terminalSessions.Store(key, t)

	if q.VCmd != "" {
		t.mu.Lock()
		t.stdin.Write([]byte(q.VCmd))
		t.mu.Unlock()
	}

	go runTerminalReader(upstream, cookie, clientID, q.VTabID, contextCode, t)
}

func queueTerminalError(upstream *url.URL, cookie string, contextCode int, err error) {
	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseMessageException,
		"v_context_code": contextCode,
		"v_error":        true,
		"v_data":         err.Error(),
	})
}

// handleCreateRequestTerminal is called from handleCreateRequest before the
// Query/Console/EditData dispatch, mirroring Python's branch ordering.
// Returns true if this request was a Terminal request (handled here,
// regardless of outcome) so the caller doesn't also try Django's fallback.
func handleCreateRequestTerminal(w http.ResponseWriter, r *http.Request, upstream *url.URL, clientID string, body createRequestBody) bool {
	if body.VCode != requestTypeTerminal {
		return false
	}
	var q terminalRequestData
	if err := json.Unmarshal(body.VData, &q); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return true
	}
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return true
	}

	go handleTerminalRequest(upstream, cookie, clientID, q, body.VContextCode, who)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte("{}"))
	return true
}
