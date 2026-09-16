package main

import (
	"strings"
	"testing"
)

// withTestSecretKey swaps the process-wide cached AES key for a fixed
// 32-byte test key for the duration of one test, so these tests never touch
// the real OS keychain (which secretKey() would otherwise hit lazily on
// first use, leaving a stray "omnidb-server" entry in the machine running
// the suite) or the HOME_DIR key-file fallback.
func withTestSecretKey(t *testing.T) {
	t.Helper()
	secretKeyMu.Lock()
	prevVal, prevErr := secretKeyVal, secretKeyErr
	secretKeyVal = []byte("01234567890123456789012345678901") // 32 bytes
	secretKeyErr = nil
	secretKeyMu.Unlock()
	t.Cleanup(func() {
		secretKeyMu.Lock()
		secretKeyVal, secretKeyErr = prevVal, prevErr
		secretKeyMu.Unlock()
	})
}

func TestEncryptDecryptSecretRoundTrip(t *testing.T) {
	withTestSecretKey(t)

	const plaintext = "hunter2"
	enc, err := encryptSecret(plaintext)
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if !strings.HasPrefix(enc, encSecretPrefix) {
		t.Fatalf("encrypted value missing prefix: %q", enc)
	}
	if enc == plaintext {
		t.Fatalf("encryptSecret did not transform the plaintext")
	}

	got, err := decryptSecret(enc)
	if err != nil {
		t.Fatalf("decryptSecret: %v", err)
	}
	if got != plaintext {
		t.Fatalf("decryptSecret = %q, want %q", got, plaintext)
	}
}

func TestEncryptSecretBlankStaysBlank(t *testing.T) {
	withTestSecretKey(t)

	enc, err := encryptSecret("")
	if err != nil {
		t.Fatalf("encryptSecret(\"\"): %v", err)
	}
	if enc != "" {
		t.Fatalf("encryptSecret(\"\") = %q, want \"\"", enc)
	}
}

func TestDecryptSecretPassesThroughLegacyPlaintext(t *testing.T) {
	withTestSecretKey(t)

	const legacy = "still-plaintext-from-before-this-feature"
	got, err := decryptSecret(legacy)
	if err != nil {
		t.Fatalf("decryptSecret: %v", err)
	}
	if got != legacy {
		t.Fatalf("decryptSecret(%q) = %q, want unchanged", legacy, got)
	}
}

func TestDecryptSecretRejectsCorruptedCiphertext(t *testing.T) {
	withTestSecretKey(t)

	if _, err := decryptSecret(encSecretPrefix + "not-valid-base64-or-ciphertext!!"); err == nil {
		t.Fatalf("decryptSecret accepted corrupted ciphertext without error")
	}
}

func TestEncryptExistingConnectionSecretsMigratesAndIsIdempotent(t *testing.T) {
	withTestSecretKey(t)
	db := newConnectionOrderDB(t)

	if _, err := db.Exec(`update OmniDB_app_connection set password = 'plainpw', ssh_password = 'plainssh',
		ssh_key = 'ssh-rsa AAAAplainkey' where id = 10`); err != nil {
		t.Fatalf("seed plaintext secrets: %v", err)
	}

	if err := encryptExistingConnectionSecrets(db); err != nil {
		t.Fatalf("encryptExistingConnectionSecrets (first run): %v", err)
	}

	var password, sshPassword, sshKey string
	scanRow := func() {
		t.Helper()
		if err := db.QueryRow(`select password, ssh_password, ssh_key from OmniDB_app_connection where id = 10`).
			Scan(&password, &sshPassword, &sshKey); err != nil {
			t.Fatalf("scan row 10: %v", err)
		}
	}
	scanRow()

	for name, got := range map[string]string{"password": password, "ssh_password": sshPassword, "ssh_key": sshKey} {
		if !strings.HasPrefix(got, encSecretPrefix) {
			t.Fatalf("%s not encrypted after migration: %q", name, got)
		}
	}
	gotPassword, err := decryptSecret(password)
	if err != nil || gotPassword != "plainpw" {
		t.Fatalf("decrypt migrated password = %q, %v, want plainpw", gotPassword, err)
	}

	// A second run must be a no-op: already-encrypted values are left
	// exactly as they are, not re-encrypted (GCM's random nonce would
	// otherwise change the stored bytes every time this runs at startup).
	if err := encryptExistingConnectionSecrets(db); err != nil {
		t.Fatalf("encryptExistingConnectionSecrets (second run): %v", err)
	}
	var password2, sshPassword2, sshKey2 string
	if err := db.QueryRow(`select password, ssh_password, ssh_key from OmniDB_app_connection where id = 10`).
		Scan(&password2, &sshPassword2, &sshKey2); err != nil {
		t.Fatalf("scan row 10 after second run: %v", err)
	}
	if password2 != password || sshPassword2 != sshPassword || sshKey2 != sshKey {
		t.Fatalf("second migration run changed already-encrypted values")
	}

	// A row whose secrets were always blank stays blank, not encrypted.
	var blankPassword string
	if err := db.QueryRow(`select password from OmniDB_app_connection where id = 11`).Scan(&blankPassword); err != nil {
		t.Fatalf("scan row 11: %v", err)
	}
	if blankPassword != "" {
		t.Fatalf("blank password got encrypted: %q", blankPassword)
	}
}

func TestSaveConnectionEncryptsAtRestAndFetchDecrypts(t *testing.T) {
	withTestSecretKey(t)
	db := newConnectionOrderDB(t)

	connID, err := saveConnection(db, 1, saveConnectionInput{
		ID:          -1,
		Technology:  "postgresql",
		Server:      "db.example.com",
		Port:        "5432",
		Database:    "mydb",
		Username:    "alice",
		Password:    "s3cr3t",
		Alias:       "prod",
		SSHPassword: "tunnelpw",
		SSHKey:      "ssh-rsa AAAAkeydata",
	})
	if err != nil {
		t.Fatalf("saveConnection: %v", err)
	}

	var rawPassword, rawSSHPassword, rawSSHKey string
	if err := db.QueryRow(`select password, ssh_password, ssh_key from OmniDB_app_connection where id = ?`, connID).
		Scan(&rawPassword, &rawSSHPassword, &rawSSHKey); err != nil {
		t.Fatalf("scan raw row: %v", err)
	}
	for name, raw := range map[string]string{"password": rawPassword, "ssh_password": rawSSHPassword, "ssh_key": rawSSHKey} {
		if !strings.HasPrefix(raw, encSecretPrefix) {
			t.Fatalf("%s stored in plaintext: %q", name, raw)
		}
	}

	fetched, err := fetchConnectionByID(db, connID)
	if err != nil {
		t.Fatalf("fetchConnectionByID: %v", err)
	}
	if fetched.Password != "s3cr3t" || fetched.SSHPassword != "tunnelpw" || fetched.SSHKey != "ssh-rsa AAAAkeydata" {
		t.Fatalf("fetchConnectionByID did not decrypt secrets: %+v", fetched)
	}

	// Editing the connection without supplying a new password must keep the
	// original secret readable — the "blank means keep existing" update path
	// (saveConnection) must not encrypt an empty string over the real value.
	if _, err := saveConnection(db, 1, saveConnectionInput{
		ID:         connID,
		Technology: "postgresql",
		Server:     "db.example.com",
		Port:       "5432",
		Database:   "mydb",
		Username:   "alice",
		Alias:      "prod-renamed",
	}); err != nil {
		t.Fatalf("saveConnection (update, blank secrets): %v", err)
	}
	refetched, err := fetchConnectionByID(db, connID)
	if err != nil {
		t.Fatalf("fetchConnectionByID after update: %v", err)
	}
	if refetched.Password != "s3cr3t" || refetched.SSHPassword != "tunnelpw" || refetched.SSHKey != "ssh-rsa AAAAkeydata" {
		t.Fatalf("update with blank secrets lost the original values: %+v", refetched)
	}
	if refetched.Alias != "prod-renamed" {
		t.Fatalf("update did not apply non-secret field change: %+v", refetched)
	}
}
