package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

// djangoPBKDF2Iterations mirrors Django 6.0's
// django.contrib.auth.hashers.PBKDF2PasswordHasher.iterations — only used
// when *creating* a new hash (e.g. a future native password-change route);
// verifying an existing hash reads its own iteration count out of the
// encoded string instead, so this constant is deliberately not load-bearing
// for login itself.
const djangoPBKDF2Iterations = 1_200_000

// verifyDjangoPassword mirrors PBKDF2PasswordHasher.verify() — checks a
// plaintext password against a Django-format encoded hash
// ("pbkdf2_sha256$<iterations>$<salt>$<base64 hash>"), computed exactly the
// same way Django does: hashlib.pbkdf2_hmac('sha256', password, salt,
// iterations, dklen=None) — dklen=None means the full 32-byte SHA-256
// digest length, which golang.org/x/crypto/pbkdf2.Key's keyLen=32 matches.
// Only the "pbkdf2_sha256" algorithm is supported — Django's other hashers
// (argon2, bcrypt, scrypt) aren't configured in this app (no
// PASSWORD_HASHERS override in settings.py/custom_settings.py, confirmed),
// so encountering one here would mean a hash this port was never meant to
// handle; it fails closed (returns false) rather than guessing.
func verifyDjangoPassword(password, encoded string) bool {
	parts := strings.SplitN(encoded, "$", 4)
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations <= 0 {
		return false
	}
	salt := parts[2]
	wantHash := parts[3]

	computed := pbkdf2.Key([]byte(password), []byte(salt), iterations, 32, sha256.New)
	computedEncoded := base64.StdEncoding.EncodeToString(computed)

	// constant_time_compare in Django compares the *whole encoded string*,
	// not just the hash segment — replicate that exactly rather than
	// comparing only the hash portion, in case that distinction ever
	// matters (it doesn't change the security property here, just mirrors
	// the original precisely).
	want := fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", iterations, salt, wantHash)
	got := fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", iterations, salt, computedEncoded)
	return subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}

// hashDjangoPassword mirrors PBKDF2PasswordHasher.encode() — produces a new
// Django-compatible encoded hash. Not needed for login itself (only
// verification is), but kept alongside it since password-change support
// (users.py, still Django-only) will need it later and the format is
// identical either way.
func hashDjangoPassword(password string) (string, error) {
	salt, err := randomDjangoSalt()
	if err != nil {
		return "", err
	}
	hash := pbkdf2.Key([]byte(password), []byte(salt), djangoPBKDF2Iterations, 32, sha256.New)
	encoded := base64.StdEncoding.EncodeToString(hash)
	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", djangoPBKDF2Iterations, salt, encoded), nil
}

// randomDjangoSalt mirrors django.utils.crypto.get_random_string's alphabet
// for password salts (letters+digits, no punctuation) at Django's default
// salt_entropy-driven length. Simplified to a fixed 22-character salt
// (matching Django's current default output length for this alphabet) —
// the salt only needs to be unique and unpredictable per hash, not any
// particular length; Django itself has changed the exact length across
// versions without breaking compatibility, since it's just read back
// verbatim from the encoded string at verify time.
func randomDjangoSalt() (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const length = 22

	buf := make([]byte, length)
	randBytes := make([]byte, length)
	if _, err := rand.Read(randBytes); err != nil {
		return "", err
	}
	for i, b := range randBytes {
		buf[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(buf), nil
}
