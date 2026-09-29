package main

import (
	"net/url"
	"regexp"
	"strings"
)

// keywordSecretPattern matches password-bearing key=value pairs in a
// libpq-style ("host=h password=secret") or ADO-style ("Password=secret;")
// connection string, with optional single-quoted values.
var keywordSecretPattern = regexp.MustCompile(`(?i)\b(password|pwd|sslpassword|passwd)(\s*=\s*)('(?:[^'\\]|\\.)*'|[^\s;&]*)`)

// redactConnStringSecrets masks any password a connection string embeds,
// for showing a *public* connection's string to users other than its owner
// (get_connections/get_database_list used to send it verbatim, so a
// "postgresql://u:secret@host/db" connection string disclosed the owner's
// password to every user, defeating the password-as-boolean redaction the
// same responses already apply to the password field itself).
func redactConnStringSecrets(s string) string {
	if s == "" {
		return s
	}
	if u, err := url.Parse(s); err == nil && u.Scheme != "" && u.Host != "" {
		if _, ok := u.User.Password(); ok {
			u.User = url.UserPassword(u.User.Username(), "xxxxx")
		}
		q := u.Query()
		changed := false
		for k := range q {
			switch strings.ToLower(k) {
			case "password", "pwd", "sslpassword", "passwd":
				q.Set(k, "xxxxx")
				changed = true
			}
		}
		if changed {
			u.RawQuery = q.Encode()
		}
		return u.String()
	}
	return keywordSecretPattern.ReplaceAllString(s, "${1}${2}xxxxx")
}
