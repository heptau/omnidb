package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// OAuth / access-token authentication for PostgreSQL: instead of a stored
// password, every new physical connection authenticates with a bearer
// token obtained from one of three sources (oauthConfig.Mode):
//   - "command": a shell command that prints the token (az account
//     get-access-token, gcloud auth print-access-token, ...). Runs on the
//     OmniDB host, so a multi-user server limits it to superusers -- the
//     same rule as AWS profile credentials (awsProfileAllowedFor);
//   - "token": a token stored encrypted with the connection (it expires, so
//     mostly useful for testing and short-lived credentials);
//   - "client_credentials": the OAuth 2.0 client credentials grant against
//     TokenURL, the client secret stored encrypted with the connection.
//
// And it is handed to the server one of two ways (oauthConfig.Delivery):
//   - "oauthbearer": the SASL OAUTHBEARER mechanism of PostgreSQL 18+
//     (pgx's OAuthTokenProvider);
//   - "password": as the password, which is how Azure Database for
//     PostgreSQL (Entra ID) and Cloud SQL (IAM) take their tokens.
//
// The Azure/GCP entries of the connection form are presets that just fill
// these fields in (Preset is only remembered so the form can show it again).
const authMethodOAuth = "oauth"

const (
	oauthModeCommand           = "command"
	oauthModeToken             = "token"
	oauthModeClientCredentials = "client_credentials"

	oauthDeliveryBearer   = "oauthbearer"
	oauthDeliveryPassword = "password"
)

// oauthConfig is the non-secret half of the setup, stored as JSON in
// OmniDB_app_connection.oauth_config. The secret (static token or client
// secret) lives encrypted in oauth_secret.
type oauthConfig struct {
	Preset   string `json:"preset,omitempty"`
	Mode     string `json:"mode"`
	Delivery string `json:"delivery"`
	Command  string `json:"command,omitempty"`
	TokenURL string `json:"token_url,omitempty"`
	ClientID string `json:"client_id,omitempty"`
	Scope    string `json:"scope,omitempty"`
}

// oauthRequestData is the connection form's OAuth block. A blank Secret
// means "keep the stored one", like every other secret field.
type oauthRequestData struct {
	oauthConfig
	Secret string `json:"secret"`
}

// oauthSupported reports whether technology can use OAuth auth at all.
func oauthSupported(technology string) bool {
	return technology == "postgresql"
}

func (info *ConnectionInfo) usesOAuth() bool {
	return info.AuthMethod == authMethodOAuth && oauthSupported(info.Technology)
}

// validate checks the config the way saveConnection and the test route
// need it: a known mode/delivery and the fields that mode can't do without.
func (c *oauthConfig) validate(secret string) error {
	switch c.Delivery {
	case oauthDeliveryBearer, oauthDeliveryPassword:
	default:
		return fmt.Errorf("unknown OAuth token delivery %q", c.Delivery)
	}
	switch c.Mode {
	case oauthModeCommand:
		if strings.TrimSpace(c.Command) == "" {
			return errors.New("OAuth: the token command is empty")
		}
	case oauthModeToken:
		// The secret may be the stored one (blank in the request).
	case oauthModeClientCredentials:
		if c.ClientID == "" {
			return errors.New("OAuth: the client ID is empty")
		}
		if _, err := checkOAuthTokenURL(c.TokenURL); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown OAuth token source %q", c.Mode)
	}
	return nil
}

// checkOAuthTokenURL accepts https endpoints, and plain http only on a
// loopback host (a local identity provider while developing).
func checkOAuthTokenURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return nil, errors.New("OAuth: the token URL is not a valid URL")
	}
	if u.Scheme == "https" {
		return u, nil
	}
	if u.Scheme == "http" {
		if ip := net.ParseIP(u.Hostname()); u.Hostname() == "localhost" || (ip != nil && ip.IsLoopback()) {
			return u, nil
		}
	}
	return nil, errors.New("OAuth: the token URL must use https")
}

// errOAuthCommandRestricted mirrors errAWSProfileRestricted: running a
// command is running code as the OmniDB server's own user.
var errOAuthCommandRestricted = errors.New("only a superuser may use a token command on a multi-user OmniDB server")

func oauthCommandAllowedFor(who *WhoAmI) bool {
	return awsProfileAllowedFor(who)
}

// checkOAuthAllowed is the connect-time gate for errOAuthCommandRestricted.
func checkOAuthAllowed(info *ConnectionInfo, who *WhoAmI) error {
	if info.usesOAuth() && info.OAuth.Mode == oauthModeCommand && !oauthCommandAllowedFor(who) {
		return errOAuthCommandRestricted
	}
	return nil
}

// oauthToken returns a token for one new connection.
func (info *ConnectionInfo) oauthToken(ctx context.Context) (string, error) {
	var token string
	var err error
	switch info.OAuth.Mode {
	case oauthModeCommand:
		token, err = oauthTokenFromCommand(ctx, info.OAuth.Command)
	case oauthModeToken:
		token = strings.TrimSpace(info.OAuthSecret)
		if token == "" {
			err = errors.New("no access token is stored for this connection")
		}
	case oauthModeClientCredentials:
		token, err = oauthTokenFromClientCredentials(ctx, &info.OAuth, info.OAuthSecret)
	default:
		err = fmt.Errorf("unknown OAuth token source %q", info.OAuth.Mode)
	}
	if err != nil {
		return "", fmt.Errorf("OAuth: %w", err)
	}
	return token, nil
}

const oauthMaxOutput = 1 << 20

// oauthCommandPath makes the usual CLI install locations findable: an app
// launched from the Finder/Start menu inherits a minimal PATH that lacks
// Homebrew, ~/.local/bin and the like.
func oauthCommandPath() string {
	path := os.Getenv("PATH")
	if runtime.GOOS == "windows" {
		return path
	}
	extra := []string{"/opt/homebrew/bin", "/usr/local/bin", "/usr/local/sbin", "/snap/bin"}
	if home, err := os.UserHomeDir(); err == nil {
		extra = append(extra, home+"/.local/bin", home+"/google-cloud-sdk/bin")
	}
	return path + string(os.PathListSeparator) + strings.Join(extra, string(os.PathListSeparator))
}

func oauthTokenFromCommand(ctx context.Context, command string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Env = append(os.Environ(), "PATH="+oauthCommandPath())
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitedWriter{w: &stdout, n: oauthMaxOutput}
	cmd.Stderr = &limitedWriter{w: &stderr, n: 4096}
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", errors.New("the token command timed out")
		}
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("the token command failed: %s", msg)
	}
	return parseOAuthCommandOutput(stdout.String())
}

// limitedWriter keeps at most n bytes and silently drops the rest.
type limitedWriter struct {
	w io.Writer
	n int
}

func (l *limitedWriter) Write(p []byte) (int, error) {
	if l.n > 0 {
		keep := p
		if len(keep) > l.n {
			keep = keep[:l.n]
		}
		l.w.Write(keep)
		l.n -= len(keep)
	}
	return len(p), nil
}

// parseOAuthCommandOutput takes the command's stdout: either the bare
// token, or a JSON document carrying it (az/gcloud with --format json,
// curl against a token endpoint).
func parseOAuthCommandOutput(out string) (string, error) {
	out = strings.TrimSpace(out)
	if out == "" {
		return "", errors.New("the token command printed nothing")
	}
	if strings.HasPrefix(out, "{") {
		var doc map[string]any
		if err := json.Unmarshal([]byte(out), &doc); err == nil {
			for _, key := range []string{"access_token", "accessToken", "token"} {
				if s, ok := doc[key].(string); ok && s != "" {
					return s, nil
				}
			}
			return "", errors.New("the token command's JSON output has no access_token")
		}
	}
	if strings.ContainsAny(out, " \t\r\n") {
		return "", errors.New("the token command's output is not a single token")
	}
	return out, nil
}

type oauthCachedToken struct {
	token   string
	expires time.Time
}

var oauthTokenCache sync.Map // sha256 of the grant parameters -> oauthCachedToken

var oauthHTTPClient = &http.Client{Timeout: 20 * time.Second}

// oauthTokenFromClientCredentials performs the RFC 6749 section 4.4 grant.
// Tokens are cached until shortly before they expire, so a pool opening
// several connections doesn't hit the identity provider each time.
func oauthTokenFromClientCredentials(ctx context.Context, cfg *oauthConfig, secret string) (string, error) {
	u, err := checkOAuthTokenURL(cfg.TokenURL)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(strings.Join([]string{u.String(), cfg.ClientID, secret, cfg.Scope}, "\x00")))
	key := hex.EncodeToString(sum[:])
	if v, ok := oauthTokenCache.Load(key); ok {
		if c := v.(oauthCachedToken); time.Now().Before(c.expires) {
			return c.token, nil
		}
	}

	form := url.Values{"grant_type": {"client_credentials"}, "client_id": {cfg.ClientID}}
	if secret != "" {
		form.Set("client_secret", secret)
	}
	if cfg.Scope != "" {
		form.Set("scope", cfg.Scope)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, oauthMaxOutput))
	var doc struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   any    `json:"expires_in"`
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	_ = json.Unmarshal(body, &doc)
	if resp.StatusCode != http.StatusOK || doc.AccessToken == "" {
		msg := doc.Error
		if doc.Description != "" {
			msg += ": " + doc.Description
		}
		if msg == "" {
			msg = "no access_token in the response"
		}
		return "", fmt.Errorf("the token endpoint answered %d (%s)", resp.StatusCode, msg)
	}

	lifetime := time.Hour
	switch v := doc.ExpiresIn.(type) {
	case float64:
		lifetime = time.Duration(v) * time.Second
	case string:
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			lifetime = time.Duration(n) * time.Second
		}
	}
	if lifetime > 60*time.Second {
		oauthTokenCache.Store(key, oauthCachedToken{doc.AccessToken, time.Now().Add(lifetime - 30*time.Second)})
	}
	return doc.AccessToken, nil
}
