package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/ssocreds"
	"github.com/aws/aws-sdk-go-v2/feature/rds/auth"
)

// AWS IAM database authentication, profile credentials -- the shell half of
// go-server/aws_iam_auth.go. go-server asks this process for a token
// (/aws-token) whenever a connection uses an AWS profile, because the
// sandboxed macOS build can't read ~/.aws from go-server: App Sandbox
// redirects $HOME into the app container, the same problem .pgpass has (see
// pgpassdialog.go). The user grants the real ~/.aws folder once through a
// native folder picker (/aws-config-grant); its security-scoped bookmark is
// persisted like the .pgpass one, and every token is then signed with the
// shared config/credentials files and SSO token cache inside that folder.
// Only the signed token goes back to go-server, never the credentials.
//
// Outside the sandbox (Windows, Linux, `wails dev`) there is nothing to
// grant: without a saved folder the SDK's default lookup in the real home
// directory is used, exactly as the AWS CLI would.

// awsConfigLocationFileName holds the granted ~/.aws folder, in
// encodePgpassLocation's format.
const awsConfigLocationFileName = "aws-config-bookmark.dat"

var awsConfigAccess = &grantedLocationStore{fileName: awsConfigLocationFileName}

// awsTokenRequest/awsTokenResponse mirror go-server/aws_iam_auth.go's own
// types. Granted false (with no Error) means "the AWS configuration can't
// be read until the user grants the folder".
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

// awsConfigResponse answers both /aws-config-status and /aws-config-grant.
// Needed means profile-based IAM auth won't work until the user grants the
// folder.
type awsConfigResponse struct {
	Needed    bool   `json:"needed"`
	Granted   bool   `json:"granted"`
	Cancelled bool   `json:"cancelled"`
	Path      string `json:"path"`
	Error     string `json:"error"`
}

// awsTokenTimeout mirrors go-server's awsIAMTokenTimeout.
const awsTokenTimeout = 20 * time.Second

func (a *App) handleAWSTokenRequest(w http.ResponseWriter, r *http.Request) {
	var req awsTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePgpassJSON(w, awsTokenResponse{Granted: true, Error: err.Error()})
		return
	}

	dir, granted := awsConfigAccess.get()
	if !granted && sandboxed() {
		writePgpassJSON(w, awsTokenResponse{Granted: false})
		return
	}

	token, err := signAWSIAMToken(req, dir)
	if err != nil && dir != "" {
		// A grant resolved earlier this launch can stop working while the
		// app runs; one retry through a freshly-resolved grant recovers
		// from that, like readGrantedPassfile does.
		awsConfigAccess.release()
		if dir, granted = awsConfigAccess.get(); granted {
			token, err = signAWSIAMToken(req, dir)
		}
	}
	if err != nil {
		writePgpassJSON(w, awsTokenResponse{Granted: true, Error: err.Error()})
		return
	}
	writePgpassJSON(w, awsTokenResponse{Granted: true, Token: token})
}

// signAWSIAMToken resolves the profile's credentials and signs the token.
// dir is the granted .aws folder, or "" for the SDK's own default lookup.
func signAWSIAMToken(req awsTokenRequest, dir string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), awsTokenTimeout)
	defer cancel()

	opts := awsConfigDirOptions(dir)
	if req.Profile != "" {
		opts = append(opts, config.WithSharedConfigProfile(req.Profile))
	}
	if req.Region != "" {
		opts = append(opts, config.WithRegion(req.Region))
	}
	cfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return "", errors.New("AWS configuration: " + err.Error())
	}
	if cfg.Region == "" {
		return "", errors.New("AWS IAM authentication needs an AWS region: set one on the connection or in the AWS profile")
	}
	token, err := auth.BuildAuthToken(ctx, req.Endpoint, cfg.Region, req.User, cfg.Credentials)
	if err != nil {
		return "", errors.New("AWS IAM token: " + err.Error())
	}
	return token, nil
}

// awsConfigDirOptions points the SDK at the granted folder instead of
// $HOME/.aws -- which in the sandbox is the container's, not the user's.
// That's every file the SDK reads or writes there: the shared config and
// credentials files, the SSO token cache (`aws sso login` writes it, the
// SDK refreshes it) and the `aws login` token cache. The cache file names
// themselves (hashes of the SSO session / start URL) are kept as the SDK
// computed them, only moved into the granted folder, so the CLI and OmniDB
// keep sharing one cache.
func awsConfigDirOptions(dir string) []func(*config.LoadOptions) error {
	if dir == "" {
		return nil
	}
	ssoCache := filepath.Join(dir, "sso", "cache")
	rebase := func(path string) string { return filepath.Join(ssoCache, filepath.Base(path)) }
	if os.Getenv("AWS_LOGIN_CACHE_DIRECTORY") == "" {
		// Read by the SDK on every LoadDefaultConfig, with no option
		// equivalent; only this process's AWS lookups ever read it.
		_ = os.Setenv("AWS_LOGIN_CACHE_DIRECTORY", filepath.Join(dir, "login", "cache"))
	}
	return []func(*config.LoadOptions) error{
		config.WithSharedConfigFiles([]string{filepath.Join(dir, "config")}),
		config.WithSharedCredentialsFiles([]string{filepath.Join(dir, "credentials")}),
		// sso-session profiles.
		config.WithSSOTokenProviderOptions(func(o *ssocreds.SSOTokenProviderOptions) {
			o.CachedTokenFilepath = rebase(o.CachedTokenFilepath)
		}),
		// Legacy profiles with sso_start_url and no sso-session (the
		// sso-session case overrides this with its own token provider).
		config.WithSSOProviderOptions(func(o *ssocreds.Options) {
			if path, err := ssocreds.StandardCachedTokenFilepath(o.StartURL); err == nil {
				o.CachedTokenFilepath = rebase(path)
			}
		}),
	}
}

// handleAWSConfigStatusRequest reports whether the folder grant is still
// needed, so the connection form only offers it where it helps.
func (a *App) handleAWSConfigStatusRequest(w http.ResponseWriter, r *http.Request) {
	dir, granted := awsConfigAccess.get()
	writePgpassJSON(w, awsConfigResponse{Needed: sandboxed() && !granted, Granted: granted, Path: dir})
}

// handleAWSConfigGrantRequest is the connection form's "Allow access to
// ~/.aws" button: a native folder picker opening in the real ~/.aws, then
// the pick is persisted for every later launch. Like
// handlePgpassGrantRequest it always shows the picker, even with a grant
// already in place -- a click means the user wants to (re)choose.
func (a *App) handleAWSConfigGrantRequest(w http.ResponseWriter, r *http.Request) {
	path, bookmark, cancelled, err := pickAWSConfigDir(a.ctx)
	if err != nil {
		writePgpassJSON(w, awsConfigResponse{Error: err.Error()})
		return
	}
	if cancelled {
		writePgpassJSON(w, awsConfigResponse{Cancelled: true})
		return
	}

	// Checked through the pick's own access, before replacing a working
	// saved grant with a folder that can't be what the user meant.
	if !fileExists(filepath.Join(path, "config")) && !fileExists(filepath.Join(path, "credentials")) {
		writePgpassJSON(w, awsConfigResponse{Error: "That folder has no AWS \"config\" or \"credentials\" file. Select the .aws folder in your home directory."})
		return
	}

	if err := awsConfigAccess.save(encodePgpassLocation(path, bookmark)); err != nil {
		writePgpassJSON(w, awsConfigResponse{Error: "Could not remember that folder: " + err.Error()})
		return
	}
	awsConfigAccess.release()
	writePgpassJSON(w, awsConfigResponse{Granted: true, Path: path})
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
