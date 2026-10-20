package main

import (
	"context"
	"net/url"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestAWSIAMRegionFromRDSHostname(t *testing.T) {
	for endpoint, want := range map[string]string{
		"mydb.abc123.eu-central-1.rds.amazonaws.com:5432":               "eu-central-1",
		"cluster-ro-x.cluster-abc.us-gov-west-1.rds.amazonaws.com:3306": "us-gov-west-1",
		"proxy.proxy-abc.cn-north-1.rds.amazonaws.com.cn:5432":          "cn-north-1",
		"db.internal.example.com:5432":                                  "",
		"127.0.0.1:5432":                                                "",
	} {
		if got := awsIAMRegion("", endpoint); got != want {
			t.Errorf("awsIAMRegion(%q) = %q, want %q", endpoint, got, want)
		}
	}
	if got := awsIAMRegion("us-east-1", "mydb.abc.eu-west-1.rds.amazonaws.com:5432"); got != "us-east-1" {
		t.Errorf("configured region should win, got %q", got)
	}
}

func TestAWSIAMTokenWithStaticKeySignsForEndpointAndUser(t *testing.T) {
	info := &ConnectionInfo{
		Technology:         "postgresql",
		AuthMethod:         authMethodAWSIAM,
		AWSAccessKeyID:     "AKIAIOSFODNN7EXAMPLE",
		AWSSecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	}
	endpoint := "mydb.abc123.eu-central-1.rds.amazonaws.com:5432"
	token, err := awsIAMAuthToken(context.Background(), info, endpoint, "iam_user")
	if err != nil {
		t.Fatalf("awsIAMAuthToken: %v", err)
	}
	u, err := url.Parse("https://" + token)
	if err != nil {
		t.Fatalf("token is not a presigned URL: %v", err)
	}
	q := u.Query()
	if u.Host != endpoint || q.Get("Action") != "connect" || q.Get("DBUser") != "iam_user" {
		t.Fatalf("unexpected token %q", token)
	}
	if !strings.Contains(q.Get("X-Amz-Credential"), "AKIAIOSFODNN7EXAMPLE/") || !strings.Contains(q.Get("X-Amz-Credential"), "/eu-central-1/rds-db/") {
		t.Fatalf("token not signed with the stored key for the endpoint's region: %q", q.Get("X-Amz-Credential"))
	}

	again, err := awsIAMAuthToken(context.Background(), info, endpoint, "iam_user")
	if err != nil || again != token {
		t.Fatalf("expected the cached token back, got %q (%v)", again, err)
	}
}

func TestAWSIAMTokenWithStaticKeyNeedsRegion(t *testing.T) {
	info := &ConnectionInfo{Technology: "mysql", AuthMethod: authMethodAWSIAM, AWSAccessKeyID: "AKIA", AWSSecretAccessKey: "x"}
	if _, err := awsIAMAuthToken(context.Background(), info, "db.example.com:3306", "u"); err == nil {
		t.Fatal("expected an error without a region")
	}
}

func TestAWSIAMEndpointUsesRealHostBehindTunnel(t *testing.T) {
	info := &ConnectionInfo{Technology: "mysql", IAMEndpointHost: "mydb.rds.amazonaws.com"}
	if got := info.awsIAMEndpoint("127.0.0.1", "61234"); got != "mydb.rds.amazonaws.com:3306" {
		t.Fatalf("got %q", got)
	}
	info = &ConnectionInfo{Technology: "postgresql"}
	if got := info.awsIAMEndpoint("db.example.com", "5433"); got != "db.example.com:5433" {
		t.Fatalf("got %q", got)
	}
}

func TestRequirePostgreSQLTLSDropsPlaintextFallbacks(t *testing.T) {
	for _, mode := range []string{"prefer", "allow", "require"} {
		cfg, err := pgx.ParseConfig("postgres://u@db.example.com:5432/db?sslmode=" + mode)
		if err != nil {
			t.Fatal(err)
		}
		if err := requirePostgreSQLTLS(cfg); err != nil {
			t.Fatalf("sslmode=%s: %v", mode, err)
		}
		if cfg.TLSConfig == nil {
			t.Fatalf("sslmode=%s: primary attempt is plaintext", mode)
		}
		for _, fb := range cfg.Fallbacks {
			if fb.TLSConfig == nil {
				t.Fatalf("sslmode=%s: plaintext fallback kept", mode)
			}
		}
	}
	cfg, _ := pgx.ParseConfig("postgres://u@db.example.com:5432/db?sslmode=disable")
	if err := requirePostgreSQLTLS(cfg); err == nil {
		t.Fatal("sslmode=disable should be rejected")
	}
}

func TestPostgreSQLConnConfigPutsIAMTokenInPassword(t *testing.T) {
	info := &ConnectionInfo{
		Technology:         "postgresql",
		Server:             "mydb.abc.eu-west-1.rds.amazonaws.com",
		Port:               "5432",
		Database:           "app",
		Username:           "iam_user",
		Password:           "ignored",
		AuthMethod:         authMethodAWSIAM,
		AWSAccessKeyID:     "AKIAIOSFODNN7EXAMPLE",
		AWSSecretAccessKey: "secret",
	}
	cfg, err := postgresqlConnConfig(info)
	if err != nil {
		t.Fatalf("postgresqlConnConfig: %v", err)
	}
	if !strings.HasPrefix(cfg.Password, "mydb.abc.eu-west-1.rds.amazonaws.com:5432?Action=connect") {
		t.Fatalf("password is not an IAM token: %q", cfg.Password)
	}
}

func TestSaveConnectionStoresAWSIAMSettings(t *testing.T) {
	withTestSecretKey(t)
	db := newConnectionOrderDB(t)

	in := saveConnectionInput{
		ID: -1, Technology: "postgresql", Server: "db", Port: "5432", Database: "d", Username: "u", Alias: "iam",
		AuthMethod: authMethodAWSIAM, AWSRegion: "eu-west-1", AWSAccessKeyID: "AKIAEXAMPLE", AWSSecretAccessKey: "topsecret",
	}
	id, err := saveConnection(db, 1, in)
	if err != nil {
		t.Fatalf("saveConnection: %v", err)
	}
	var raw string
	if err := db.QueryRow(`select aws_secret_access_key from OmniDB_app_connection where id = ?`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(raw, encSecretPrefix) {
		t.Fatalf("secret stored in plaintext: %q", raw)
	}

	// Blank secret on update keeps the stored one.
	in.ID, in.AWSSecretAccessKey = id, ""
	if _, err := saveConnection(db, 1, in); err != nil {
		t.Fatal(err)
	}
	c, err := fetchConnectionByID(db, id)
	if err != nil {
		t.Fatal(err)
	}
	if c.AuthMethod != authMethodAWSIAM || c.AWSRegion != "eu-west-1" || c.AWSAccessKeyID != "AKIAEXAMPLE" || c.AWSSecretAccessKey != "topsecret" {
		t.Fatalf("unexpected stored settings: %+v", c)
	}

	// Switching to profile credentials forgets the key pair.
	in.AWSAccessKeyID, in.AWSProfile = "", "prod"
	if _, err := saveConnection(db, 1, in); err != nil {
		t.Fatal(err)
	}
	if c, _ = fetchConnectionByID(db, id); c.AWSAccessKeyID != "" || c.AWSSecretAccessKey != "" || c.AWSProfile != "prod" {
		t.Fatalf("key pair not cleared: %+v", c)
	}

	in.AuthMethod = "kerberos"
	if _, err := saveConnection(db, 1, in); err == nil {
		t.Fatal("unknown auth method should be rejected")
	}
}

func TestCheckAWSIAMAllowedRestrictsProfileOnServer(t *testing.T) {
	saved := appToken
	t.Cleanup(func() { appToken = saved })
	appToken = ""

	profile := &ConnectionInfo{Technology: "postgresql", AuthMethod: authMethodAWSIAM}
	key := &ConnectionInfo{Technology: "postgresql", AuthMethod: authMethodAWSIAM, AWSAccessKeyID: "AKIA"}
	if err := checkAWSIAMAllowed(profile, &WhoAmI{}); err != errAWSProfileRestricted {
		t.Fatalf("profile credentials should be superuser-only on a server, got %v", err)
	}
	if err := checkAWSIAMAllowed(profile, &WhoAmI{SuperUser: true}); err != nil {
		t.Fatalf("superuser: %v", err)
	}
	if err := checkAWSIAMAllowed(key, &WhoAmI{}); err != nil {
		t.Fatalf("access key credentials: %v", err)
	}
}
