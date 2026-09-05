package main

import (
	"database/sql"
)

// notifyChannel is one persisted LISTEN/DBMS_ALERT subscription — the Notify
// panel's channel list survives a restart (only the received messages are
// ephemeral), so the tree is rebuilt from these rows rather than from
// whatever a live session happens to be registered for.
type notifyChannel struct {
	ID     int64
	ConnID int64
	Name   string
	Active bool
}

func fetchNotifyChannels(db *sql.DB, userID, connID int64) ([]notifyChannel, error) {
	rows, err := db.Query(
		`select id, connection_id, channel_name, active from OmniDB_app_notifychannel where user_id = ? and connection_id = ? order by channel_name`,
		userID, connID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []notifyChannel
	for rows.Next() {
		var c notifyChannel
		if err := rows.Scan(&c.ID, &c.ConnID, &c.Name, &c.Active); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// addNotifyChannel inserts a channel, or returns the existing row's id when
// the (user, connection, name) unique constraint already covers it —
// re-adding a channel the user already has is a no-op, not an error, since
// the tree would look identical either way.
func addNotifyChannel(db *sql.DB, userID, connID int64, name string) (int64, error) {
	res, err := db.Exec(
		`insert into OmniDB_app_notifychannel (user_id, connection_id, channel_name, active) values (?, ?, ?, 1) on conflict do nothing`,
		userID, connID, name,
	)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return res.LastInsertId()
	}

	var id int64
	err = db.QueryRow(
		`select id from OmniDB_app_notifychannel where user_id = ? and connection_id = ? and channel_name = ?`,
		userID, connID, name,
	).Scan(&id)
	return id, err
}

// deleteNotifyChannel removes one channel. The user_id predicate is the
// ownership check — a row belonging to somebody else simply doesn't match,
// reported as sql.ErrNoRows like the snippet routes do.
func deleteNotifyChannel(db *sql.DB, userID, id int64) error {
	res, err := db.Exec(`delete from OmniDB_app_notifychannel where id = ? and user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// setNotifyChannelActive backs pause (active=false) and resume (active=true).
func setNotifyChannelActive(db *sql.DB, userID, id int64, active bool) error {
	res, err := db.Exec(`update OmniDB_app_notifychannel set active = ? where id = ? and user_id = ?`, active, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// notifyChannelByID resolves one owned channel row — the pause/resume/delete
// handlers need its name (and connection) to apply the same change to a live
// session, and the request body only carries the row id.
func notifyChannelByID(db *sql.DB, userID, id int64) (notifyChannel, error) {
	var c notifyChannel
	err := db.QueryRow(
		`select id, connection_id, channel_name, active from OmniDB_app_notifychannel where id = ? and user_id = ?`,
		id, userID,
	).Scan(&c.ID, &c.ConnID, &c.Name, &c.Active)
	return c, err
}
