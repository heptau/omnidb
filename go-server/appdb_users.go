package main

import (
	"database/sql"
	"errors"
	"time"
)

// errNotSuperuser mirrors the exact message get_users/new_user/remove_user/
// save_users all return when the requesting user isn't a superuser.
var errNotSuperuser = errors.New("You must be superuser to manage users.")

// appUserRow mirrors the columns get_users needs out of auth_user.
type appUserRow struct {
	ID          int64
	Username    string
	IsSuperuser bool
}

// fetchAllUsers mirrors get_users' "for user in User.objects.all()" loop —
// order isn't specified by Django's bare .all() (defaults to primary key
// order on SQLite), matched here with "order by id".
func fetchAllUsers(db *sql.DB) ([]appUserRow, error) {
	rows, err := db.Query(`select id, username, is_superuser from auth_user order by id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]appUserRow, 0)
	for rows.Next() {
		var u appUserRow
		if err := rows.Scan(&u.ID, &u.Username, &u.IsSuperuser); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// createDjangoUser mirrors User.objects.create_user(username=..., password=...,
// email="", is_superuser=False, first_name="", last_name="", is_staff=False,
// is_active=True, date_joined=now, last_login=now) — new_user/save_users'
// "new" branch never lets the frontend set is_superuser for a brand new user
// (matches Python: the created row is always non-superuser, promoting one to
// superuser is only possible afterwards via save_users' "edited" branch).
func createDjangoUser(db *sql.DB, username, password string) error {
	hash, err := hashDjangoPassword(password)
	if err != nil {
		return err
	}
	now := formatDjangoDatetime(time.Now())
	_, err = db.Exec(
		`insert into auth_user (password, last_login, is_superuser, username, last_name, email, is_staff, is_active, date_joined, first_name)
		 values (?, ?, 0, ?, '', '', 0, 1, ?, '')`,
		hash, now, username, now,
	)
	return err
}

// updateDjangoUser mirrors save_users' "edited" branch — always updates
// username/is_superuser, and only re-hashes+sets the password when a
// non-blank one was submitted (matches Python's `if r[1]!=""`).
func updateDjangoUser(db *sql.DB, userID int64, username string, isSuperuser bool, password string) error {
	if password != "" {
		hash, err := hashDjangoPassword(password)
		if err != nil {
			return err
		}
		_, err = db.Exec(`update auth_user set username = ?, is_superuser = ?, password = ? where id = ?`, username, isSuperuser, hash, userID)
		return err
	}
	_, err := db.Exec(`update auth_user set username = ?, is_superuser = ? where id = ?`, username, isSuperuser, userID)
	return err
}

// setUserPassword mirrors save_config_user's password branch specifically
// (`user.set_password(p_pwd); user.save()`) — narrower than updateDjangoUser
// on purpose: that function also rewrites username/is_superuser using
// whatever the caller passes in, and save_config_user's caller only has
// those two fields available from Go's own native session (cached at login
// time, not re-derived per-request the way Django's request.user is), so
// reusing updateDjangoUser here risks clobbering a value that went stale
// mid-session (e.g. a superuser demoting themselves via save_users
// elsewhere). This only ever touches the password column.
func setUserPassword(db *sql.DB, userID int64, password string) error {
	hash, err := hashDjangoPassword(password)
	if err != nil {
		return err
	}
	_, err = db.Exec(`update auth_user set password = ? where id = ?`, hash, userID)
	return err
}

// deleteUserCascade mirrors Django's user.delete() — every table main.py's
// models.py FKs to User with on_delete=CASCADE (verified by reading the
// actual model definitions, not assumed), plus Django's own built-in
// auth_user_groups/auth_user_user_permissions M2M-through tables and
// django_admin_log/social_auth_usersocialauth (also on_delete=CASCADE on
// their own User FK). None of this cascades at the SQLite schema level (same
// documented gap as deleteGroup/deleteSnippetFolderRecursive/
// cascadeDeleteConnection), so it's walked explicitly here, children before
// parents, inside one transaction for atomicity (matches Django wrapping
// .delete() in its own transaction).
func deleteUserCascade(db *sql.DB, userID int64) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	connRows, err := tx.Query(`select id from OmniDB_app_connection where user_id = ?`, userID)
	if err != nil {
		return err
	}
	var connIDs []int64
	for connRows.Next() {
		var id int64
		if err := connRows.Scan(&id); err != nil {
			connRows.Close()
			return err
		}
		connIDs = append(connIDs, id)
	}
	if err := connRows.Err(); err != nil {
		return err
	}
	connRows.Close()

	for _, connID := range connIDs {
		for _, stmt := range []string{
			`delete from OmniDB_app_tab where connection_id = ?`,
			`delete from OmniDB_app_queryhistory where connection_id = ?`,
			`delete from OmniDB_app_consolehistory where connection_id = ?`,
			`delete from OmniDB_app_monunitsconnections where connection_id = ?`,
			`delete from OmniDB_app_groupconnection where connection_id = ?`,
		} {
			if _, err := tx.Exec(stmt, connID); err != nil {
				return err
			}
		}
	}

	for _, stmt := range []string{
		`delete from OmniDB_app_connection where user_id = ?`,
		`delete from OmniDB_app_groupconnection where group_id in (select id from OmniDB_app_group where user_id = ?)`,
		`delete from OmniDB_app_group where user_id = ?`,
		`delete from OmniDB_app_snippetfile where user_id = ?`,
		`delete from OmniDB_app_snippetfolder where user_id = ?`,
		`delete from OmniDB_app_shortcut where user_id = ?`,
		`delete from OmniDB_app_monunits where user_id = ?`,
		`delete from OmniDB_app_userdetails where user_id = ?`,
		`delete from auth_user_groups where user_id = ?`,
		`delete from auth_user_user_permissions where user_id = ?`,
		`delete from django_admin_log where user_id = ?`,
		`delete from social_auth_usersocialauth where user_id = ?`,
		`delete from auth_user where id = ?`,
	} {
		if _, err := tx.Exec(stmt, userID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// formatDjangoDatetime mirrors DjangoJSONEncoder-adjacent needs elsewhere in
// this codebase (see sqliteDatetimeToJS) but in the other direction: Django
// stores naive "YYYY-MM-DD HH:MM:SS.ffffff" text for datetime columns on
// SQLite, so writing one from Go needs the same shape, not RFC3339.
func formatDjangoDatetime(t time.Time) string {
	return t.UTC().Format("2006-01-02 15:04:05.000000")
}
