package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// Bookmarks: database objects (tables) a user pinned for quick access, kept
// per user and connection in the app database. See the "Bookmarks" section of
// the workspace UI.

const bookmarkTableDDL = `
CREATE TABLE IF NOT EXISTS "OmniDB_app_bookmark" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"connection_id" integer NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"kind" varchar(20) NOT NULL,
	"schema_name" varchar(200) NOT NULL DEFAULT '',
	"name" varchar(500) NOT NULL,
	"create_date" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "unique_bookmark" UNIQUE ("user_id", "connection_id", "kind", "schema_name", "name")
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_bookmark_user_id" ON "OmniDB_app_bookmark" ("user_id");`

type bookmark struct {
	ID           int64
	ConnectionID int64
	Kind         string
	Schema       string
	Name         string
	Alias        string
	Technology   string
}

// bookmarkKinds are the object kinds a bookmark can point at.
var bookmarkKinds = map[string]bool{"table": true}

// fetchBookmarks lists the user's bookmarks on connections they can still see
// (their own or public), ordered by connection and name.
func fetchBookmarks(db *sql.DB, userID int64) ([]bookmark, error) {
	rows, err := db.Query(`
		select b.id, b.connection_id, b.kind, b.schema_name, b.name, c.alias, t.name
		from OmniDB_app_bookmark b
		join OmniDB_app_connection c on c.id = b.connection_id
		join OmniDB_app_technology t on t.id = c.technology_id
		where b.user_id = ? and (c.user_id = ? or c.public = 1)
		order by c.alias, b.schema_name, b.name`, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []bookmark{}
	for rows.Next() {
		var b bookmark
		if err := rows.Scan(&b.ID, &b.ConnectionID, &b.Kind, &b.Schema, &b.Name, &b.Alias, &b.Technology); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// addBookmark pins an object; pinning it twice is not an error.
func addBookmark(db *sql.DB, userID, connectionID int64, kind, schema, name string) error {
	if !bookmarkKinds[kind] {
		return errors.New("unknown bookmark kind")
	}
	if strings.TrimSpace(name) == "" {
		return errors.New("a bookmark needs an object name")
	}
	var visible int
	if err := db.QueryRow(`select count(*) from OmniDB_app_connection where id = ? and (user_id = ? or public = 1)`,
		connectionID, userID).Scan(&visible); err != nil {
		return err
	}
	if visible == 0 {
		return errors.New("connection not found")
	}
	_, err := db.Exec(`insert or ignore into OmniDB_app_bookmark (user_id, connection_id, kind, schema_name, name)
		values (?, ?, ?, ?, ?)`, userID, connectionID, kind, schema, name)
	return err
}

// deleteBookmark removes one of the user's own bookmarks.
func deleteBookmark(db *sql.DB, userID, id int64) error {
	_, err := db.Exec(`delete from OmniDB_app_bookmark where id = ? and user_id = ?`, id, userID)
	return err
}

func handleGetBookmarks(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		list, err := fetchBookmarks(db, int64(who.UserID))
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		out := make([]map[string]any, len(list))
		for i, b := range list {
			out[i] = map[string]any{
				"id": b.ID, "conn_id": b.ConnectionID, "kind": b.Kind,
				"schema": b.Schema, "name": b.Name, "alias": b.Alias, "technology": b.Technology,
			}
		}
		writeEnvelope(w, out, false, -1)
	}
}

type addBookmarkRequest struct {
	ConnID int64  `json:"p_conn_id"`
	Kind   string `json:"p_kind"`
	Schema string `json:"p_schema"`
	Name   string `json:"p_name"`
}

func handleAddBookmark(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req addBookmarkRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		if err := addBookmark(db, int64(who.UserID), req.ConnID, req.Kind, req.Schema, req.Name); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type deleteBookmarkRequest struct {
	ID int64 `json:"p_id"`
}

func handleDeleteBookmark(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req deleteBookmarkRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		if err := deleteBookmark(db, int64(who.UserID), req.ID); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
