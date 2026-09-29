package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/zalando/go-keyring"
)

// encSecretPrefix marks a stored password/ssh_password/ssh_key value as
// AES-256-GCM ciphertext (base64-encoded nonce+ciphertext) rather than the
// plaintext every such column held before this was added — lets
// decryptSecret and encryptExistingConnectionSecrets tell old, unencrypted
// rows apart from already-encrypted ones without a schema/version column.
const encSecretPrefix = "enc:v1:"

const (
	keyringService = "omnidb-server"
	keyringUser    = "connection-secret-key"
)

var (
	secretKeyMu  sync.Mutex
	secretKeyVal []byte
	secretKeyErr error
)

// secretKey returns the AES-256 key used to encrypt every saved
// connection's password/ssh_password/ssh_key column, generating and
// persisting one on first use. Preferred storage is the OS's own secret
// store (macOS Keychain, Windows Credential Manager, Linux Secret Service
// via D-Bus) — invisible to the user and needs no master password to
// remember or type. Falls back to a key file under HOME_DIR (see
// homedir.go) for hosts with no secret-service backend at all (typically
// a headless Linux server) — still keeps omnidb.db from carrying its own
// decryption key in the clear right next to itself.
//
// Cached for the process's lifetime, the same way appdb.go's
// appDBPathVal/resolveAppDBPath cache HOME_DIR's resolved path — the key
// can't change under a running process, so there's no reason to hit the
// keyring/disk again on every request.
func secretKey() ([]byte, error) {
	secretKeyMu.Lock()
	defer secretKeyMu.Unlock()
	if secretKeyVal != nil || secretKeyErr != nil {
		return secretKeyVal, secretKeyErr
	}

	// An existing key file always wins: once any row has been encrypted
	// under it, switching to the keyring later (a Secret Service that
	// wasn't reachable at first boot, a keychain that was locked for one
	// launch) would mint a second key and leave those rows undecryptable.
	if key, ok, err := readFileKey(); ok || err != nil {
		secretKeyVal, secretKeyErr = key, err
		return secretKeyVal, secretKeyErr
	}
	key, err := loadOrCreateKeyringKey()
	if err != nil {
		key, err = loadOrCreateFileKey()
	}
	secretKeyVal, secretKeyErr = key, err
	return secretKeyVal, secretKeyErr
}

func loadOrCreateKeyringKey() ([]byte, error) {
	encoded, err := keyring.Get(keyringService, keyringUser)
	if err == nil {
		return base64.StdEncoding.DecodeString(encoded)
	}
	if !errors.Is(err, keyring.ErrNotFound) {
		return nil, err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	if err := keyring.Set(keyringService, keyringUser, base64.StdEncoding.EncodeToString(raw)); err != nil {
		return nil, err
	}
	return raw, nil
}

// loadOrCreateFileKey is secretKey's fallback for a host with no OS secret
// store reachable at all (loadOrCreateKeyringKey failed outright, not just
// "not found yet"). The file lives beside omnidb.db under the same
// HOME_DIR resolveAppDBPath uses, so app-mode and server-mode installs
// (different HOME_DIRs, see homedir.go) each get their own key file rather
// than fighting over one OS keyring entry.
func fileKeyPath() (string, error) {
	dir, _, err := homeDirPath(os.Args[1:])
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, ".connection_secret_key"), nil
}

// readFileKey returns the key file's key if the file exists (ok=true).
func readFileKey() (key []byte, ok bool, err error) {
	path, err := fileKeyPath()
	if err != nil {
		return nil, false, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, true, err
	}
	key, err = base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
	return key, true, err
}

func loadOrCreateFileKey() ([]byte, error) {
	dir, err := resolveHomeDir(os.Args[1:])
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, ".connection_secret_key")

	if data, err := os.ReadFile(path); err == nil {
		return base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
	} else if !os.IsNotExist(err) {
		return nil, err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(raw)), 0o600); err != nil {
		return nil, err
	}
	fmt.Fprintln(os.Stderr, "omnidb-server: no OS secret store available, storing the connection encryption key at "+path)
	return raw, nil
}

// encryptSecret encrypts a connection's password/ssh_password/ssh_key
// before it's written to OmniDB_app_connection. Blank stays blank —
// keeps every "" NOT NULL column exactly as blank as it already was
// instead of encrypting an empty string, and matters to callers like
// saveConnection that check the caller's own blank-vs-non-blank input
// before ever reaching this function.
func encryptSecret(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	key, err := secretKey()
	if err != nil {
		return "", fmt.Errorf("connection secret key: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encSecretPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// decryptSecret reverses encryptSecret. A value with no encSecretPrefix is
// passed through unchanged — a pre-upgrade plaintext row that
// encryptExistingConnectionSecrets' backfill hasn't gotten to yet (or, for
// a blank value, never will — there's nothing to encrypt).
func decryptSecret(stored string) (string, error) {
	rest, ok := strings.CutPrefix(stored, encSecretPrefix)
	if !ok {
		return stored, nil
	}
	key, err := secretKey()
	if err != nil {
		return "", fmt.Errorf("connection secret key: %w", err)
	}
	sealed, err := base64.StdEncoding.DecodeString(rest)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(sealed) < gcm.NonceSize() {
		return "", errors.New("stored connection secret is truncated")
	}
	nonce, ciphertext := sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// decryptConnectionSecrets decrypts all three secret columns of a fetched
// OmniDB_app_connection row in one call — used by both
// fetchConnectionsForUser and fetchConnectionByID right where the raw row
// comes back from SQL, the single choke point every consumer of
// appConnection's Password/SSHPassword/SSHKey fields goes through.
func decryptConnectionSecrets(password, sshPassword, sshKey string) (string, string, string, error) {
	password, err := decryptSecret(password)
	if err != nil {
		return "", "", "", fmt.Errorf("decrypt password: %w", err)
	}
	sshPassword, err = decryptSecret(sshPassword)
	if err != nil {
		return "", "", "", fmt.Errorf("decrypt ssh_password: %w", err)
	}
	sshKey, err = decryptSecret(sshKey)
	if err != nil {
		return "", "", "", fmt.Errorf("decrypt ssh_key: %w", err)
	}
	return password, sshPassword, sshKey, nil
}

// encryptConnectionSecrets encrypts all three secret fields of a brand-new
// connection in one call — saveConnection's insert branch always writes
// whatever it was given, blank or not (there's no existing row's value to
// fall back to), and encryptSecret already passes a blank straight through
// unencrypted, so this needs no blank check of its own.
func encryptConnectionSecrets(password, sshPassword, sshKey string) (string, string, string, error) {
	password, err := encryptSecret(password)
	if err != nil {
		return "", "", "", fmt.Errorf("encrypt password: %w", err)
	}
	sshPassword, err = encryptSecret(sshPassword)
	if err != nil {
		return "", "", "", fmt.Errorf("encrypt ssh_password: %w", err)
	}
	sshKey, err = encryptSecret(sshKey)
	if err != nil {
		return "", "", "", fmt.Errorf("encrypt ssh_key: %w", err)
	}
	return password, sshPassword, sshKey, nil
}

// needsEncryption reports whether a raw column value is a pre-upgrade
// plaintext secret that encryptExistingConnectionSecrets still needs to
// encrypt — true for any non-blank value not already carrying
// encSecretPrefix.
func needsEncryption(value string) bool {
	return value != "" && !strings.HasPrefix(value, encSecretPrefix)
}

// encryptExistingConnectionSecrets is migrateAppDB's one-time backfill for
// installs that predate connection-secret encryption: every
// password/ssh_password/ssh_key column written before this feature existed
// is still plaintext, and would otherwise stay that way forever, since
// saveConnection's update path only ever rewrites the columns a user
// actually edits. Idempotent — rows already fully encrypted are skipped —
// so re-running this on every startup (there's no separate schema-version
// marker for it, unlike migrateAppDB's column checks) costs one SELECT
// plus zero UPDATEs once a database is fully migrated.
func encryptExistingConnectionSecrets(db *sql.DB) error {
	rows, err := db.Query(`select id, password, ssh_password, ssh_key from OmniDB_app_connection`)
	if err != nil {
		return err
	}
	type plainRow struct {
		id                            int64
		password, sshPassword, sshKey string
	}
	var pending []plainRow
	for rows.Next() {
		var r plainRow
		if err := rows.Scan(&r.id, &r.password, &r.sshPassword, &r.sshKey); err != nil {
			rows.Close()
			return err
		}
		if needsEncryption(r.password) || needsEncryption(r.sshPassword) || needsEncryption(r.sshKey) {
			pending = append(pending, r)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range pending {
		password, sshPassword, sshKey := r.password, r.sshPassword, r.sshKey
		if needsEncryption(password) {
			if password, err = encryptSecret(password); err != nil {
				return err
			}
		}
		if needsEncryption(sshPassword) {
			if sshPassword, err = encryptSecret(sshPassword); err != nil {
				return err
			}
		}
		if needsEncryption(sshKey) {
			if sshKey, err = encryptSecret(sshKey); err != nil {
				return err
			}
		}
		if _, err := db.Exec(
			`update OmniDB_app_connection set password = ?, ssh_password = ?, ssh_key = ? where id = ?`,
			password, sshPassword, sshKey, r.id,
		); err != nil {
			return err
		}
	}
	return nil
}
