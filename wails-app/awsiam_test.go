package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// signAWSIAMToken must read the profile from the granted folder, not from
// $HOME/.aws -- which in the sandbox is the container's.
func TestSignAWSIAMTokenUsesGrantedFolder(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("AWS_LOGIN_CACHE_DIRECTORY", filepath.Join(dir, "login", "cache"))
	if err := os.WriteFile(filepath.Join(dir, "credentials"),
		[]byte("[omnidbtest]\naws_access_key_id = AKIAGRANTEDFOLDER\naws_secret_access_key = secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config"), []byte("[profile omnidbtest]\nregion = eu-north-1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	token, err := signAWSIAMToken(awsTokenRequest{
		Endpoint: "mydb.example.com:5432",
		User:     "iam_user",
		Profile:  "omnidbtest",
	}, dir)
	if err != nil {
		t.Fatalf("signAWSIAMToken: %v", err)
	}
	if !strings.HasPrefix(token, "mydb.example.com:5432?Action=connect&DBUser=iam_user") ||
		!strings.Contains(token, "AKIAGRANTEDFOLDER%2F") || !strings.Contains(token, "%2Feu-north-1%2Frds-db%2F") {
		t.Fatalf("token not signed with the granted folder's profile: %q", token)
	}
}

func TestSignAWSIAMTokenUnknownProfileFails(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("AWS_LOGIN_CACHE_DIRECTORY", filepath.Join(dir, "login", "cache"))
	if err := os.WriteFile(filepath.Join(dir, "config"), []byte("[default]\nregion = eu-north-1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := signAWSIAMToken(awsTokenRequest{Endpoint: "h:5432", User: "u", Profile: "missing"}, dir); err == nil {
		t.Fatal("expected an error for a profile that doesn't exist")
	}
}
