package main

import (
	"database/sql"
	"errors"
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
// (Q(user=request.user) | Q(public=True)).
func fetchConnectionsForUser(db *sql.DB, userID int64) ([]appConnection, error) {
	rows, err := db.Query(`
		select c.id, c.user_id, c.public, t.name, c.alias, c.conn_string,
			   c.server, c.port, c.database, c.username, c.password,
			   c.use_tunnel, c.ssh_server, c.ssh_port, c.ssh_user, c.ssh_password, c.ssh_key
		from OmniDB_app_connection c
		join OmniDB_app_technology t on t.id = c.technology_id
		where c.user_id = ? or c.public = 1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []appConnection
	for rows.Next() {
		var c appConnection
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.Public, &c.Technology, &c.Alias, &c.ConnString,
			&c.Server, &c.Port, &c.Database, &c.Username, &c.Password,
			&c.UseTunnel, &c.SSHServer, &c.SSHPort, &c.SSHUser, &c.SSHPassword, &c.SSHKey); err != nil {
			return nil, err
		}
		out = append(out, c)
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
	var c appConnection
	err := db.QueryRow(`
		select c.id, c.user_id, c.public, t.name, c.alias, c.conn_string,
			   c.server, c.port, c.database, c.username, c.password,
			   c.use_tunnel, c.ssh_server, c.ssh_port, c.ssh_user, c.ssh_password, c.ssh_key
		from OmniDB_app_connection c
		join OmniDB_app_technology t on t.id = c.technology_id
		where c.id = ?
	`, connID).Scan(&c.ID, &c.OwnerID, &c.Public, &c.Technology, &c.Alias, &c.ConnString,
		&c.Server, &c.Port, &c.Database, &c.Username, &c.Password,
		&c.UseTunnel, &c.SSHServer, &c.SSHPort, &c.SSHUser, &c.SSHPassword, &c.SSHKey)
	if err != nil {
		return nil, err
	}
	return &c, nil
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

	if in.ID == -1 {
		res, err := db.Exec(`
			insert into OmniDB_app_connection
				(user_id, technology_id, server, port, database, username, password, alias,
				 ssh_server, ssh_port, ssh_user, ssh_password, ssh_key, use_tunnel, conn_string, public)
			values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, userID, techID, in.Server, in.Port, in.Database, in.Username, in.Password, in.Alias,
			in.SSHServer, in.SSHPort, in.SSHUser, in.SSHPassword, in.SSHKey, in.UseTunnel, in.ConnString, in.Public)
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
		"ssh_server = ?", "ssh_port = ?", "ssh_user = ?", "use_tunnel = ?", "conn_string = ?", "public = ?",
	}
	args := []any{
		techID, in.Server, in.Port, in.Database, in.Username, in.Alias,
		in.SSHServer, in.SSHPort, in.SSHUser, in.UseTunnel, in.ConnString, in.Public,
	}
	if in.Password != "" {
		setParts = append(setParts, "password = ?")
		args = append(args, in.Password)
	}
	if in.SSHPassword != "" {
		setParts = append(setParts, "ssh_password = ?")
		args = append(args, in.SSHPassword)
	}
	if in.SSHKey != "" {
		setParts = append(setParts, "ssh_key = ?")
		args = append(args, in.SSHKey)
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
	} {
		if _, err := db.Exec(stmt, connID); err != nil {
			return err
		}
	}
	_, err := db.Exec(`delete from OmniDB_app_connection where id = ?`, connID)
	return err
}
