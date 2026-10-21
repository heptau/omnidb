package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

// Local history of the query editor: snapshots of what a user had typed on a
// connection, kept so an earlier state can be compared with the current one and
// restored. Per user and connection (not per tab), newest first.

const editorVersionTableDDL = `
CREATE TABLE IF NOT EXISTS "OmniDB_app_editorversion" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"connection_id" integer NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"create_date" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"text" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_editorversion_user_conn" ON "OmniDB_app_editorversion" ("user_id", "connection_id", "id");`

const (
	// maxEditorVersions is how many snapshots a user keeps per connection.
	maxEditorVersions = 100
	// maxEditorVersionBytes is the largest single snapshot that is stored.
	maxEditorVersionBytes = 1 << 20
	editorPreviewRunes    = 100
)

type editorVersion struct {
	ID      int64
	Date    string
	Size    int
	Preview string
}

// saveEditorVersion stores a snapshot unless it is blank or identical to the
// newest one, then drops the oldest beyond the per-connection limit. It
// reports whether a row was stored.
func saveEditorVersion(db *sql.DB, userID, connectionID int64, text string) (bool, error) {
	if strings.TrimSpace(text) == "" {
		return false, nil
	}
	if len(text) > maxEditorVersionBytes {
		return false, errors.New("the editor content is too large for the local history")
	}
	var visible int
	if err := db.QueryRow(`select count(*) from OmniDB_app_connection where id = ? and (user_id = ? or public = 1)`,
		connectionID, userID).Scan(&visible); err != nil {
		return false, err
	}
	if visible == 0 {
		return false, errors.New("connection not found")
	}
	var latest string
	err := db.QueryRow(`select text from OmniDB_app_editorversion where user_id = ? and connection_id = ? order by id desc limit 1`,
		userID, connectionID).Scan(&latest)
	if err == nil && latest == text {
		return false, nil
	}
	if err != nil && err != sql.ErrNoRows {
		return false, err
	}
	if _, err := db.Exec(`insert into OmniDB_app_editorversion (user_id, connection_id, create_date, text) values (?, ?, ?, ?)`,
		userID, connectionID, time.Now().UTC().Format("2006-01-02 15:04:05"), text); err != nil {
		return false, err
	}
	_, err = db.Exec(`delete from OmniDB_app_editorversion where user_id = ? and connection_id = ? and id not in
		(select id from OmniDB_app_editorversion where user_id = ? and connection_id = ? order by id desc limit ?)`,
		userID, connectionID, userID, connectionID, maxEditorVersions)
	return true, err
}

// fetchEditorVersions lists a connection's snapshots, newest first, without
// their full text.
func fetchEditorVersions(db *sql.DB, userID, connectionID int64) ([]editorVersion, error) {
	rows, err := db.Query(`select id, create_date, length(text), text from OmniDB_app_editorversion
		where user_id = ? and connection_id = ? order by id desc`, userID, connectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []editorVersion{}
	for rows.Next() {
		var v editorVersion
		var text string
		if err := rows.Scan(&v.ID, &v.Date, &v.Size, &text); err != nil {
			return nil, err
		}
		v.Preview = editorPreview(text)
		out = append(out, v)
	}
	return out, rows.Err()
}

// editorPreview is the first non-blank line of text, cut to a readable length.
func editorPreview(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if utf8.RuneCountInString(line) > editorPreviewRunes {
			return string([]rune(line)[:editorPreviewRunes]) + "…"
		}
		return line
	}
	return ""
}

// fetchEditorVersionText returns one of the user's own snapshots.
func fetchEditorVersionText(db *sql.DB, userID, id int64) (string, error) {
	var text string
	err := db.QueryRow(`select text from OmniDB_app_editorversion where id = ? and user_id = ?`, id, userID).Scan(&text)
	if err == sql.ErrNoRows {
		return "", errors.New("version not found")
	}
	return text, err
}

type editorVersionRequest struct {
	ConnID int64  `json:"p_conn_id"`
	ID     int64  `json:"p_id"`
	Text   string `json:"p_text"`
}

func editorVersionHandler(upstream *url.URL, run func(db *sql.DB, userID int64, req editorVersionRequest) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req editorVersionRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		data, err := run(db, int64(who.UserID), req)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, data, false, -1)
	}
}

func handleSaveEditorVersion(upstream *url.URL) http.HandlerFunc {
	return editorVersionHandler(upstream, func(db *sql.DB, userID int64, req editorVersionRequest) (any, error) {
		stored, err := saveEditorVersion(db, userID, req.ConnID, req.Text)
		return map[string]any{"stored": stored}, err
	})
}

func handleGetEditorVersions(upstream *url.URL) http.HandlerFunc {
	return editorVersionHandler(upstream, func(db *sql.DB, userID int64, req editorVersionRequest) (any, error) {
		list, err := fetchEditorVersions(db, userID, req.ConnID)
		if err != nil {
			return nil, err
		}
		out := make([]map[string]any, len(list))
		for i, v := range list {
			out[i] = map[string]any{"id": v.ID, "date": editorVersionDate(v.Date), "size": v.Size, "preview": v.Preview}
		}
		return out, nil
	})
}

func handleGetEditorVersion(upstream *url.URL) http.HandlerFunc {
	return editorVersionHandler(upstream, func(db *sql.DB, userID int64, req editorVersionRequest) (any, error) {
		return fetchEditorVersionText(db, userID, req.ID)
	})
}

// editorVersionDate renders a stored create_date as RFC 3339 in UTC. The column
// is written as "2006-01-02 15:04:05" (UTC) but the SQLite driver hands a
// datetime column back already reformatted, so both shapes are accepted.
func editorVersionDate(raw string) string {
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.ParseInLocation(layout, raw, time.UTC); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return raw
}
