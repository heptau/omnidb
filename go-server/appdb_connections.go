package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// errConnectionNotOwned mirrors the "This connection does not belong to
// you." message save_connection/delete_connection return when the
// requesting user isn't the connection's owner.
var errConnectionNotOwned = errors.New("This connection does not belong to you.")

// connectionLookupErrorMessage mirrors Django's Connection.DoesNotExist
// message text for a missing connection id, instead of surfacing Go's raw
// "sql: no rows in result set" — same pattern as groupLookupErrorMessage.
func connectionLookupErrorMessage(err error) string {
	if err == sql.ErrNoRows {
		return "Connection matching query does not exist."
	}
	return err.Error()
}

// appConnection mirrors the columns get_connections needs out of
// OmniDB_app_connection, joined with OmniDB_app_technology for the
// technology name.
type appConnection struct {
	ID          int64
	OwnerID     int64
	Public      bool
	Technology  string
	Alias       string
	ConnString  string
	Server      string
	Port        string
	Database    string
	Username    string
	Password    string
	UseTunnel   bool
	SSHServer   string
	SSHPort     string
	SSHUser     string
	SSHPassword string
	SSHKey      string
	// Environment is one of "" (none), "production", "uat", "development" or
	// "archive" -- a free-form-but-frontend-constrained tag the Connections
	// sidebar/detail form and open Database tabs color-code, purely for the
	// user's own visual organization. Never validated server-side against
	// that set: an unrecognized value just renders with no color client-side.
	Environment string
	// AWS IAM database authentication -- see aws_iam_auth.go. AuthMethod is
	// "" (password, the default) or authMethodAWSIAM. AWSAccessKeyID non-blank
	// means "sign with this stored key pair"; blank means "use the AWS
	// profile/default credential chain" (AWSProfile, blank = default).
	AuthMethod         string
	AWSRegion          string
	AWSProfile         string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	// OAuth token authentication -- see oauth_auth.go. Used when AuthMethod
	// is authMethodOAuth; OAuthSecret is the decrypted static token or
	// client secret.
	OAuth       oauthConfig
	OAuthSecret string
	// ReadOnly blocks writes through this connection -- see readonly.go.
	ReadOnly bool
}

// appConnectionColumns/scanAppConnection are the shared column list and
// row scan of fetchConnectionsForUser and fetchConnectionByID, which select
// exactly the same columns.
const appConnectionColumns = `c.id, c.user_id, c.public, t.name, c.alias, c.conn_string,
	c.server, c.port, c.database, c.username, c.password,
	c.use_tunnel, c.ssh_server, c.ssh_port, c.ssh_user, c.ssh_password, c.ssh_key, c.environment,
	c.auth_method, c.aws_region, c.aws_profile, c.aws_access_key_id, c.aws_secret_access_key,
	c.oauth_config, c.oauth_secret, c.read_only`

func scanAppConnection(row interface{ Scan(...any) error }) (*appConnection, error) {
	var c appConnection
	var oauthJSON string
	if err := row.Scan(&c.ID, &c.OwnerID, &c.Public, &c.Technology, &c.Alias, &c.ConnString,
		&c.Server, &c.Port, &c.Database, &c.Username, &c.Password,
		&c.UseTunnel, &c.SSHServer, &c.SSHPort, &c.SSHUser, &c.SSHPassword, &c.SSHKey, &c.Environment,
		&c.AuthMethod, &c.AWSRegion, &c.AWSProfile, &c.AWSAccessKeyID, &c.AWSSecretAccessKey,
		&oauthJSON, &c.OAuthSecret, &c.ReadOnly); err != nil {
		return nil, err
	}
	var err error
	if c.Password, c.SSHPassword, c.SSHKey, err = decryptConnectionSecrets(c.Password, c.SSHPassword, c.SSHKey); err != nil {
		return nil, err
	}
	if c.AWSSecretAccessKey, err = decryptSecret(c.AWSSecretAccessKey); err != nil {
		return nil, fmt.Errorf("decrypt aws_secret_access_key: %w", err)
	}
	if c.OAuthSecret, err = decryptSecret(c.OAuthSecret); err != nil {
		return nil, fmt.Errorf("decrypt oauth_secret: %w", err)
	}
	if oauthJSON != "" {
		if err := json.Unmarshal([]byte(oauthJSON), &c.OAuth); err != nil {
			return nil, fmt.Errorf("parse oauth_config: %w", err)
		}
	}
	return &c, nil
}

// fetchTechnologies mirrors the "for tech in Technology.objects.all()" loop
// in get_connections.
func fetchTechnologies(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`select name from OmniDB_app_technology`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// fetchConnectionsForUser mirrors get_connections' Connection.objects.filter
// (Q(user=request.user) | Q(public=True)), ordered by this user's own manual
// arrangement of the sidebar list (OmniDB_app_connectionorder, written by
// saveConnectionOrder when a row is dragged). Connections with no row there --
// every connection until the user drags something for the first time, plus any
// created afterwards -- keep sorting by id after the arranged ones, so a brand
// new connection lands at the bottom of the list instead of somewhere random.
func fetchConnectionsForUser(db *sql.DB, userID int64) ([]appConnection, error) {
	rows, err := db.Query(`
		select `+appConnectionColumns+`
		from OmniDB_app_connection c
		join OmniDB_app_technology t on t.id = c.technology_id
		left join OmniDB_app_connectionorder o on o.connection_id = c.id and o.user_id = ?
		where c.user_id = ? or c.public = 1
		order by case when o.position is null then 1 else 0 end, o.position, c.id
	`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []appConnection
	for rows.Next() {
		c, err := scanAppConnection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// fetchConnectionByID returns a single connection row for ANY owner — it
// does no ownership check itself. Every caller MUST check
// `c.OwnerID != callingUserID && !c.Public` before trusting the returned
// secrets (password/ssh_password/ssh_key), the same way
// connection_info.go's resolveConnection and terminal.go's
// handleTerminalRequest already do. test_connection.go's
// resolveTestConnectionSecrets was found NOT doing this (a real IDOR: any
// authenticated user could read another user's stored connection/tunnel
// password) and was fixed to check it too — don't add a new caller of this
// function without the same check.
func fetchConnectionByID(db *sql.DB, connID int64) (*appConnection, error) {
	return scanAppConnection(db.QueryRow(`
		select `+appConnectionColumns+`
		from OmniDB_app_connection c
		join OmniDB_app_technology t on t.id = c.technology_id
		where c.id = ?
	`, connID))
}

type appGroup struct {
	ID   int64
	Name string
}

// fetchGroupsForUser mirrors get_groups' Group.objects.filter(user=request.user).
func fetchGroupsForUser(db *sql.DB, userID int64) ([]appGroup, error) {
	rows, err := db.Query(`select id, name from OmniDB_app_group where user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []appGroup
	for rows.Next() {
		var g appGroup
		if err := rows.Scan(&g.ID, &g.Name); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// fetchGroupConnectionIDs mirrors the inner GroupConnection.objects.filter
// (group=group) loop in get_groups. Always returns a non-nil slice — Python's
// v_current_group_data['conn_list'] starts as [] and the frontend expects an
// array back, not JSON null, for a group with no connections.
func fetchGroupConnectionIDs(db *sql.DB, groupID int64) ([]int64, error) {
	out := []int64{}
	rows, err := db.Query(`select connection_id from OmniDB_app_groupconnection where group_id = ?`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// newGroup mirrors new_group.
func newGroup(db *sql.DB, userID int64, name string) error {
	_, err := db.Exec(`insert into OmniDB_app_group (user_id, name) values (?, ?)`, userID, name)
	return err
}

// groupOwner returns the owning user_id of a group, or sql.ErrNoRows if it
// doesn't exist.
func groupOwner(db *sql.DB, groupID int64) (int64, error) {
	var owner int64
	err := db.QueryRow(`select user_id from OmniDB_app_group where id = ?`, groupID).Scan(&owner)
	return owner, err
}

// editGroup mirrors edit_group — caller must have already confirmed
// ownership via groupOwner.
func editGroup(db *sql.DB, groupID int64, name string) error {
	_, err := db.Exec(`update OmniDB_app_group set name = ? where id = ?`, name, groupID)
	return err
}

// deleteGroup mirrors delete_group. Same as the snippet folder deletion,
// GroupConnection rows referencing this group aren't cascade-deleted by
// SQLite itself (no ON DELETE CASCADE in the actual schema — Django's ORM
// cascade only ever happens in Python), so they're deleted explicitly first.
func deleteGroup(db *sql.DB, groupID int64) error {
	if _, err := db.Exec(`delete from OmniDB_app_groupconnection where group_id = ?`, groupID); err != nil {
		return err
	}
	_, err := db.Exec(`delete from OmniDB_app_group where id = ?`, groupID)
	return err
}

// connectionOwner returns the owning user_id of a connection, or
// sql.ErrNoRows if it doesn't exist — used by saveGroupConnections, which
// (unlike get_connections) only allows adding the user's *own* connections
// to a group, not public ones belonging to someone else (matches Python's
// Connection.objects.get(id=..., user=request.user), not the Q(public=True)
// variant get_connections uses).
func connectionOwner(db *sql.DB, connID int64) (int64, error) {
	var owner int64
	err := db.QueryRow(`select user_id from OmniDB_app_connection where id = ?`, connID).Scan(&owner)
	return owner, err
}

// setGroupConnection mirrors one iteration of save_group_connections' loop —
// selected=true adds the connection to the group (INSERT OR IGNORE, since
// OmniDB_app_groupconnection already has a unique(group_id, connection_id)
// constraint doing what Django's get_or_create relied on), selected=false
// removes it.
func setGroupConnection(db *sql.DB, groupID, connID int64, selected bool) error {
	if selected {
		_, err := db.Exec(`insert or ignore into OmniDB_app_groupconnection (group_id, connection_id) values (?, ?)`, groupID, connID)
		return err
	}
	_, err := db.Exec(`delete from OmniDB_app_groupconnection where group_id = ? and connection_id = ?`, groupID, connID)
	return err
}

// technologyID mirrors Technology.objects.get(name=...) — resolves a
// technology name to its OmniDB_app_technology row id.
func technologyID(db *sql.DB, name string) (int64, error) {
	var id int64
	err := db.QueryRow(`select id from OmniDB_app_technology where name = ?`, name).Scan(&id)
	return id, err
}

// saveConnectionInput mirrors the fields save_connection reads out of its
// request body (already blank-vs-keep-existing resolved by the caller —
// see resolveTestConnectionSecrets/test_connection.go's comment on why an
// edit form round-trips an unchanged secret as blank).
type saveConnectionInput struct {
	ID          int64
	Technology  string
	Server      string
	Port        string
	Database    string
	Username    string
	Password    string
	Alias       string
	SSHServer   string
	SSHPort     string
	SSHUser     string
	SSHPassword string
	SSHKey      string
	UseTunnel   bool
	ConnString  string
	Public      bool
	Environment string
	// See appConnection's fields of the same names. AWSSecretAccessKey
	// follows Password's "blank means keep the stored one" rule on update;
	// a blank AWSAccessKeyID (profile credentials) always clears it.
	AuthMethod         string
	AWSRegion          string
	AWSProfile         string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	// OAuth/OAuthSecret: see appConnection. A blank OAuthSecret keeps the
	// stored one on update (unless the mode no longer uses one).
	OAuth       oauthConfig
	OAuthSecret string
	// ReadOnly: see appConnection.
	ReadOnly bool
}

// saveConnection mirrors save_connection's insert/update branch. Unlike the
// update path, a brand-new connection (ID==-1) always writes whatever
// password/ssh_password/ssh_key it was given, blank or not — matches
// Python's insert branch, which never applies the "blank means keep
// existing" rule (there's nothing existing yet).
func saveConnection(db *sql.DB, userID int64, in saveConnectionInput) (connID int64, err error) {
	techID, err := technologyID(db, in.Technology)
	if err != nil {
		return 0, err
	}

	if in.AuthMethod != "" && in.AuthMethod != authMethodAWSIAM && in.AuthMethod != authMethodOAuth {
		return 0, fmt.Errorf("unknown authentication method %q", in.AuthMethod)
	}
	oauthJSON := ""
	if in.AuthMethod == authMethodOAuth {
		if !oauthSupported(in.Technology) {
			return 0, fmt.Errorf("OAuth authentication is not available for %s", in.Technology)
		}
		if err := in.OAuth.validate(in.OAuthSecret); err != nil {
			return 0, err
		}
		if in.OAuth.Mode == oauthModeCommand {
			in.OAuth.TokenURL, in.OAuth.ClientID, in.OAuth.Scope = "", "", ""
		} else {
			in.OAuth.Command = ""
		}
		b, err := json.Marshal(in.OAuth)
		if err != nil {
			return 0, err
		}
		oauthJSON = string(b)
	}
	// Only the token and client-credentials modes keep a secret.
	oauthUsesSecret := in.AuthMethod == authMethodOAuth && in.OAuth.Mode != oauthModeCommand
	if !oauthUsesSecret {
		in.OAuthSecret = ""
	}
	if in.AuthMethod == "" || in.AWSAccessKeyID == "" {
		in.AWSAccessKeyID = ""
		in.AWSSecretAccessKey = ""
	}

	if in.ID == -1 {
		encAWSSecret, err := encryptSecret(in.AWSSecretAccessKey)
		if err != nil {
			return 0, err
		}
		encOAuthSecret, err := encryptSecret(in.OAuthSecret)
		if err != nil {
			return 0, err
		}
		encPassword, encSSHPassword, encSSHKey, err := encryptConnectionSecrets(in.Password, in.SSHPassword, in.SSHKey)
		if err != nil {
			return 0, err
		}
		res, err := db.Exec(`
			insert into OmniDB_app_connection
				(user_id, technology_id, server, port, database, username, password, alias,
				 ssh_server, ssh_port, ssh_user, ssh_password, ssh_key, use_tunnel, conn_string, public, environment,
				 auth_method, aws_region, aws_profile, aws_access_key_id, aws_secret_access_key,
				 oauth_config, oauth_secret, read_only)
			values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, userID, techID, in.Server, in.Port, in.Database, in.Username, encPassword, in.Alias,
			in.SSHServer, in.SSHPort, in.SSHUser, encSSHPassword, encSSHKey, in.UseTunnel, in.ConnString, in.Public, in.Environment,
			in.AuthMethod, in.AWSRegion, in.AWSProfile, in.AWSAccessKeyID, encAWSSecret,
			oauthJSON, encOAuthSecret, in.ReadOnly)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}

	owner, err := connectionOwner(db, in.ID)
	if err != nil {
		return 0, err
	}
	if owner != userID {
		return 0, errConnectionNotOwned
	}

	setParts := []string{
		"technology_id = ?", "server = ?", "port = ?", "database = ?", "username = ?", "alias = ?",
		"ssh_server = ?", "ssh_port = ?", "ssh_user = ?", "use_tunnel = ?", "conn_string = ?", "public = ?", "environment = ?",
		"auth_method = ?", "aws_region = ?", "aws_profile = ?", "aws_access_key_id = ?", "oauth_config = ?", "read_only = ?",
	}
	args := []any{
		techID, in.Server, in.Port, in.Database, in.Username, in.Alias,
		in.SSHServer, in.SSHPort, in.SSHUser, in.UseTunnel, in.ConnString, in.Public, in.Environment,
		in.AuthMethod, in.AWSRegion, in.AWSProfile, in.AWSAccessKeyID, oauthJSON, in.ReadOnly,
	}
	if in.AWSAccessKeyID == "" {
		setParts = append(setParts, "aws_secret_access_key = ''")
	} else if in.AWSSecretAccessKey != "" {
		enc, err := encryptSecret(in.AWSSecretAccessKey)
		if err != nil {
			return 0, err
		}
		setParts = append(setParts, "aws_secret_access_key = ?")
		args = append(args, enc)
	}
	if !oauthUsesSecret {
		setParts = append(setParts, "oauth_secret = ''")
	} else if in.OAuthSecret != "" {
		enc, err := encryptSecret(in.OAuthSecret)
		if err != nil {
			return 0, err
		}
		setParts = append(setParts, "oauth_secret = ?")
		args = append(args, enc)
	}
	if in.Password != "" {
		enc, err := encryptSecret(in.Password)
		if err != nil {
			return 0, err
		}
		setParts = append(setParts, "password = ?")
		args = append(args, enc)
	}
	if in.SSHPassword != "" {
		enc, err := encryptSecret(in.SSHPassword)
		if err != nil {
			return 0, err
		}
		setParts = append(setParts, "ssh_password = ?")
		args = append(args, enc)
	}
	if in.SSHKey != "" {
		enc, err := encryptSecret(in.SSHKey)
		if err != nil {
			return 0, err
		}
		setParts = append(setParts, "ssh_key = ?")
		args = append(args, enc)
	}
	args = append(args, in.ID)
	_, err = db.Exec(`update OmniDB_app_connection set `+strings.Join(setParts, ", ")+` where id = ?`, args...)
	return in.ID, err
}

// deleteConnectionRow mirrors delete_connection's ownership check + delete.
// Session.RemoveDatabase has no Go equivalent — see go-backend-migration
// memory for why that's a safe, self-healing gap (index()'s
// RefreshDatabaseList() rebuilds Session.v_databases from the DB on every
// full page load anyway).
func deleteConnectionRow(db *sql.DB, userID, connID int64) error {
	owner, err := connectionOwner(db, connID)
	if err != nil {
		return err
	}
	if owner != userID {
		return errConnectionNotOwned
	}
	return cascadeDeleteConnection(db, connID)
}

// cascadeDeleteConnection deletes every row that Django's models.py FKs to
// Connection with on_delete=CASCADE (Tab, QueryHistory, ConsoleHistory,
// MonUnitsConnections, GroupConnection), then the connection row itself —
// none of this is enforced by the SQLite schema (no ON DELETE CASCADE, same
// gap documented for deleteGroup/deleteSnippetFolderRecursive), and this
// specific set was missing entirely until found while scoping remove_user's
// own cascade (users.py), which needs it to be correct one level down.
func cascadeDeleteConnection(db *sql.DB, connID int64) error {
	for _, stmt := range []string{
		`delete from OmniDB_app_tab where connection_id = ?`,
		`delete from OmniDB_app_queryhistory where connection_id = ?`,
		`delete from OmniDB_app_consolehistory where connection_id = ?`,
		`delete from OmniDB_app_monunitsconnections where connection_id = ?`,
		`delete from OmniDB_app_groupconnection where connection_id = ?`,
		`delete from OmniDB_app_connectionorder where connection_id = ?`,
		`delete from OmniDB_app_bookmark where connection_id = ?`,
	} {
		if _, err := db.Exec(stmt, connID); err != nil {
			return err
		}
	}
	_, err := db.Exec(`delete from OmniDB_app_connection where id = ?`, connID)
	return err
}

// saveConnectionOrder replaces userID's manual arrangement of the Connections
// sidebar with connIDs, in the given order (see fetchConnectionsForUser).
// Ordering is per user, so a public connection owned by somebody else can be
// placed anywhere in this user's list without moving in anybody else's --
// which is also why ids the user cannot even see are dropped instead of
// stored: the list this comes from is the one get_connections produced, so
// anything outside it is either a stale row from another session or a forged
// id, and neither belongs in the table.
func saveConnectionOrder(db *sql.DB, userID int64, connIDs []int64) error {
	visible := make(map[int64]bool)
	rows, err := db.Query(`select id from OmniDB_app_connection where user_id = ? or public = 1`, userID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		visible[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`delete from OmniDB_app_connectionorder where user_id = ?`, userID); err != nil {
		return err
	}
	position := 0
	seen := make(map[int64]bool, len(connIDs))
	for _, connID := range connIDs {
		if !visible[connID] || seen[connID] {
			continue
		}
		seen[connID] = true
		if _, err := tx.Exec(
			`insert into OmniDB_app_connectionorder (user_id, connection_id, position) values (?, ?, ?)`,
			userID, connID, position,
		); err != nil {
			return err
		}
		position++
	}
	return tx.Commit()
}
