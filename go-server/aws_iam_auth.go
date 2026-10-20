package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/rds/auth"
)

// AWS IAM database authentication (Amazon RDS / Aurora, PostgreSQL and
// MySQL/MariaDB): instead of a stored password, every new physical
// connection authenticates with a short-lived token -- a SigV4-presigned
// "connect" request for one endpoint+user, valid for 15 minutes, signed
// locally with the user's AWS credentials (no network call involved in the
// signing itself). The token is sent as the password over the engine's
// normal protocol; RDS refuses it over a plaintext connection, which is why
// both drivers' TLS settings are tightened below.
//
// Two credential sources, picked per connection (appConnection's fields):
//   - a stored access key pair (AWSAccessKeyID non-blank; the secret is
//     encrypted like any other connection secret) -- signed right here;
//   - an AWS profile / the SDK's default credential chain (shared config
//     and credentials files, SSO, assume-role, credential_process, env
//     vars, instance/container roles). In the desktop app this is resolved
//     by the wails shell instead (see awsIAMTokenFromShell), because the
//     sandboxed macOS build can't read ~/.aws from this process -- the same
//     reason .pgpass goes through the shell (see pgpass_resolve.go).
const authMethodAWSIAM = "aws_iam"

// awsIAMSupported reports whether technology can use AWS IAM auth at all --
// RDS IAM auth only exists for these engines.
func awsIAMSupported(technology string) bool {
	return technology == "postgresql" || isMySQLFamily(technology)
}

// usesAWSIAM reports whether info authenticates with an IAM token instead
// of a password.
func (info *ConnectionInfo) usesAWSIAM() bool {
	return info.AuthMethod == authMethodAWSIAM && awsIAMSupported(info.Technology)
}

// awsIAMEndpoint is the host:port a token gets signed for: the real
// database endpoint, which isn't the address the driver dials when an SSH
// tunnel rewrote Server/Port to the tunnel's local end (see
// test_connection.go's runTestConnection) -- RDS verifies the token against
// its own endpoint name.
func (info *ConnectionInfo) awsIAMEndpoint(dialHost, dialPort string) string {
	if info.IAMEndpointHost != "" {
		port := info.IAMEndpointPort
		if port == "" {
			port = "5432"
			if isMySQLFamily(info.Technology) {
				port = "3306"
			}
		}
		return net.JoinHostPort(info.IAMEndpointHost, port)
	}
	return net.JoinHostPort(dialHost, dialPort)
}

// errAWSProfileRestricted mirrors errSQLiteRestricted: on a multi-user
// server, "use the AWS profile" means "use the OmniDB server's own AWS
// identity", which isn't something an ordinary user should be able to
// borrow. A stored access key is the user's own credential and stays
// allowed for everyone.
var errAWSProfileRestricted = errors.New("AWS IAM authentication with the server's AWS profile is restricted to superusers on a multi-user OmniDB server; use an access key instead")

// awsProfileAllowedFor reports whether who may use profile-based IAM auth.
func awsProfileAllowedFor(who *WhoAmI) bool {
	return appToken != "" || who.SuperUser
}

// checkAWSIAMAllowed is the connect-time gate for errAWSProfileRestricted.
func checkAWSIAMAllowed(info *ConnectionInfo, who *WhoAmI) error {
	if info.usesAWSIAM() && info.AWSAccessKeyID == "" && !awsProfileAllowedFor(who) {
		return errAWSProfileRestricted
	}
	return nil
}

// errAWSConfigNotGranted is what a profile-based connection fails with in
// the sandboxed macOS app until the user has pointed OmniDB at their .aws
// folder once (the connection form's "Allow access to ~/.aws" button).
var errAWSConfigNotGranted = errors.New("OmniDB can't read your AWS configuration yet: open this connection in the Connections section and click \"Allow access to ~/.aws\"")

// rdsHostnameRegion matches the region inside an RDS/Aurora/RDS Proxy
// endpoint name, e.g. "mydb.abc123.eu-central-1.rds.amazonaws.com".
var rdsHostnameRegion = regexp.MustCompile(`\.([a-z]{2}(?:-[a-z]+)+-\d+)\.rds\.amazonaws\.com(?:\.cn)?\.?$`)

// awsIAMRegion picks the region a token is signed for: the connection's
// own setting, else the one embedded in an RDS endpoint name. "" means
// "let the profile decide" (only meaningful for profile credentials).
func awsIAMRegion(configured, endpoint string) string {
	if configured != "" {
		return configured
	}
	host, _, err := net.SplitHostPort(endpoint)
	if err != nil {
		host = endpoint
	}
	if m := rdsHostnameRegion.FindStringSubmatch(strings.ToLower(host)); m != nil {
		return m[1]
	}
	return ""
}

// awsIAMTokenReuse is how long a generated token is handed out again
// before a fresh one is signed -- comfortably inside its 15-minute
// validity, so a token can never expire between being picked from the
// cache and the server checking it. Caching matters because a connection
// is opened per request (see openPostgreSQLTarget), and resolving profile
// credentials can mean an STS/SSO round trip or a hop to the shell.
const awsIAMTokenReuse = 10 * time.Minute

type awsIAMTokenKey struct {
	endpoint, region, user, profile, accessKeyID, secretHash string
}

type awsIAMCachedToken struct {
	token   string
	created time.Time
}

var (
	awsIAMTokenMu    sync.Mutex
	awsIAMTokenCache = map[awsIAMTokenKey]awsIAMCachedToken{}
)

// awsIAMAuthToken returns a token for user at endpoint, from the cache
// when a recent enough one exists.
func awsIAMAuthToken(ctx context.Context, info *ConnectionInfo, endpoint, user string) (string, error) {
	if user == "" {
		return "", errors.New("AWS IAM authentication needs a database user name")
	}
	region := awsIAMRegion(info.AWSRegion, endpoint)
	key := awsIAMTokenKey{endpoint: endpoint, region: region, user: user, profile: info.AWSProfile, accessKeyID: info.AWSAccessKeyID}
	if info.AWSAccessKeyID != "" {
		sum := sha256.Sum256([]byte(info.AWSSecretAccessKey))
		key.secretHash = hex.EncodeToString(sum[:])
	}

	awsIAMTokenMu.Lock()
	cached, ok := awsIAMTokenCache[key]
	awsIAMTokenMu.Unlock()
	if ok && time.Since(cached.created) < awsIAMTokenReuse {
		return cached.token, nil
	}

	token, err := buildAWSIAMToken(ctx, info, endpoint, region, user)
	if err != nil {
		return "", err
	}

	awsIAMTokenMu.Lock()
	for k, v := range awsIAMTokenCache {
		if time.Since(v.created) >= awsIAMTokenReuse {
			delete(awsIAMTokenCache, k)
		}
	}
	awsIAMTokenCache[key] = awsIAMCachedToken{token: token, created: time.Now()}
	awsIAMTokenMu.Unlock()
	return token, nil
}

// awsIAMTokenTimeout bounds credential resolution -- an SSO or assume-role
// profile means network calls, and a wedged one must not hang a connect.
const awsIAMTokenTimeout = 20 * time.Second

func buildAWSIAMToken(ctx context.Context, info *ConnectionInfo, endpoint, region, user string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, awsIAMTokenTimeout)
	defer cancel()

	if info.AWSAccessKeyID != "" {
		if region == "" {
			return "", errors.New("AWS IAM authentication needs an AWS region for this endpoint")
		}
		creds := credentials.NewStaticCredentialsProvider(info.AWSAccessKeyID, info.AWSSecretAccessKey, "")
		return signAWSIAMToken(ctx, endpoint, region, user, creds)
	}

	if url := os.Getenv(omnidbAWSTokenURLEnv); url != "" {
		return awsIAMTokenFromShell(url, awsTokenRequest{
			Endpoint: endpoint,
			Region:   region,
			User:     user,
			Profile:  info.AWSProfile,
		})
	}

	var opts []func(*config.LoadOptions) error
	if info.AWSProfile != "" {
		opts = append(opts, config.WithSharedConfigProfile(info.AWSProfile))
	}
	if region != "" {
		opts = append(opts, config.WithRegion(region))
	}
	cfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return "", fmt.Errorf("AWS configuration: %w", err)
	}
	if cfg.Region == "" {
		return "", errors.New("AWS IAM authentication needs an AWS region: set one on the connection or in the AWS profile")
	}
	return signAWSIAMToken(ctx, endpoint, cfg.Region, user, cfg.Credentials)
}

func signAWSIAMToken(ctx context.Context, endpoint, region, user string, creds aws.CredentialsProvider) (string, error) {
	token, err := auth.BuildAuthToken(ctx, endpoint, region, user, creds)
	if err != nil {
		return "", fmt.Errorf("AWS IAM token: %w", err)
	}
	return token, nil
}

// omnidbAWSTokenURLEnv/omnidbAWSGrantURLEnv/omnidbAWSStatusURLEnv are set
// by wails-app/backend.go when it spawns this process -- the same loopback
// relay as the .pgpass ones (see pgpass_resolve.go).
const (
	omnidbAWSTokenURLEnv  = "OMNIDB_AWS_TOKEN_URL"
	omnidbAWSGrantURLEnv  = "OMNIDB_AWS_GRANT_URL"
	omnidbAWSStatusURLEnv = "OMNIDB_AWS_STATUS_URL"
)

// awsTokenRequest/awsTokenResponse mirror wails-app/awsiam.go's own types.
type awsTokenRequest struct {
	Endpoint string `json:"endpoint"`
	Region   string `json:"region"`
	User     string `json:"user"`
	Profile  string `json:"profile"`
}

type awsTokenResponse struct {
	Token   string `json:"token"`
	Granted bool   `json:"granted"`
	Error   string `json:"error"`
}

// awsIAMTokenFromShell has the desktop shell sign the token with the
// user's profile. Only the token crosses back -- never the credentials,
// for the same reason only one password ever leaves the shell's .pgpass
// lookup.
func awsIAMTokenFromShell(url string, req awsTokenRequest) (string, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: awsIAMTokenTimeout + 5*time.Second}
	resp, err := postToShell(client, url, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("could not reach the desktop app for an AWS IAM token: %w", err)
	}
	defer resp.Body.Close()

	var out awsTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("unexpected AWS IAM token response from the desktop app: %w", err)
	}
	if out.Error != "" {
		return "", errors.New(out.Error)
	}
	if !out.Granted {
		return "", errAWSConfigNotGranted
	}
	return out.Token, nil
}

// handleAWSConfigStatus tells the connection form whether profile-based
// IAM auth still needs the one-time "Allow access to ~/.aws" grant (only
// ever true in the sandboxed macOS app).
func handleAWSConfigStatus(w http.ResponseWriter, r *http.Request) {
	relayAWSConfigRequest(w, r, os.Getenv(omnidbAWSStatusURLEnv), false)
}

// handleAWSConfigGrant relays the connection form's "Allow access to
// ~/.aws" click to the shell, which shows a native folder picker and
// remembers the pick (see wails-app/awsiam.go). Mirrors handlePgpassGrant.
func handleAWSConfigGrant(w http.ResponseWriter, r *http.Request) {
	relayAWSConfigRequest(w, r, os.Getenv(omnidbAWSGrantURLEnv), true)
}

// awsConfigRelayResponse mirrors wails-app/awsiam.go's awsConfigResponse.
type awsConfigRelayResponse struct {
	Needed    bool   `json:"needed"`
	Granted   bool   `json:"granted"`
	Cancelled bool   `json:"cancelled"`
	Path      string `json:"path"`
	Error     string `json:"error"`
}

func relayAWSConfigRequest(w http.ResponseWriter, r *http.Request, url string, isGrant bool) {
	who, err := resolveIdentity(nil, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if url == "" {
		// Not running inside the desktop app: this process reads the AWS
		// configuration itself, so there is nothing to grant.
		out := awsConfigRelayResponse{}
		if isGrant {
			out.Error = "Can't open the folder picker: this page isn't running inside the OmniDB desktop app (or it needs to be rebuilt)."
		}
		_ = json.NewEncoder(w).Encode(out)
		return
	}

	resp, err := postToShell(nil, url, strings.NewReader("{}"))
	if err != nil {
		_ = json.NewEncoder(w).Encode(awsConfigRelayResponse{Error: "Could not reach the desktop app: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	var out awsConfigRelayResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		_ = json.NewEncoder(w).Encode(awsConfigRelayResponse{Error: "Unexpected response from the desktop app."})
		return
	}
	if isGrant && out.Granted {
		// A new pick may mean different credentials for the same
		// endpoint+user; don't keep handing out tokens signed with the old
		// ones.
		awsIAMTokenMu.Lock()
		clear(awsIAMTokenCache)
		awsIAMTokenMu.Unlock()
	}
	_ = json.NewEncoder(w).Encode(out)
}
