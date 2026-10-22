package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
)

// Per-user interface preferences that are a small JSON document rather than
// a column of their own (OmniDB_app_userdetails): today the layout of the
// left section rail. Stored as key/value so the next one needs no migration.

const uiPrefTableDDL = `
CREATE TABLE IF NOT EXISTS "OmniDB_app_uipref" (
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"key" varchar(50) NOT NULL,
	"value" text NOT NULL,
	PRIMARY KEY ("user_id", "key")
);`

const navLayoutKey = "nav_layout"

// navLayout is the order of the section rail's items ("|" is the divider
// between its upper and lower part) and the items hidden from it. The ids
// are the client's own (section_switcher.js); here they are only checked for
// shape, so a client can add an item without a server change.
type navLayout struct {
	Order  []string `json:"order"`
	Hidden []string `json:"hidden"`
}

var navIDPattern = regexp.MustCompile(`^(\||[a-z][a-z0-9_]{0,30})$`)

const maxNavItems = 40

// canonicalNavLayout parses and validates a layout and returns it re-encoded:
// ids of the right shape, no duplicates, at most one divider, bounded size.
func canonicalNavLayout(raw string) (string, error) {
	var l navLayout
	if err := json.Unmarshal([]byte(raw), &l); err != nil {
		return "", errors.New("invalid layout")
	}
	clean := func(ids []string, allowDivider bool) ([]string, error) {
		if len(ids) > maxNavItems {
			return nil, errors.New("invalid layout")
		}
		seen := map[string]bool{}
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			if !navIDPattern.MatchString(id) || (id == "|" && !allowDivider) || seen[id] {
				return nil, errors.New("invalid layout")
			}
			seen[id] = true
			out = append(out, id)
		}
		return out, nil
	}
	var err error
	if l.Order, err = clean(l.Order, true); err != nil {
		return "", err
	}
	if l.Hidden, err = clean(l.Hidden, false); err != nil {
		return "", err
	}
	out, err := json.Marshal(l)
	return string(out), err
}

func getUIPref(db *sql.DB, userID int64, key string) string {
	var v string
	if err := db.QueryRow(`select value from OmniDB_app_uipref where user_id = ? and key = ?`, userID, key).Scan(&v); err != nil {
		return ""
	}
	return v
}

func setUIPref(db *sql.DB, userID int64, key, value string) error {
	_, err := db.Exec(`insert into OmniDB_app_uipref (user_id, key, value) values (?, ?, ?)
		on conflict (user_id, key) do update set value = excluded.value`, userID, key, value)
	return err
}

func deleteUIPref(db *sql.DB, userID int64, key string) error {
	_, err := db.Exec(`delete from OmniDB_app_uipref where user_id = ? and key = ?`, userID, key)
	return err
}

type saveNavLayoutRequest struct {
	// Layout is the JSON document; blank resets to the default layout.
	Layout string `json:"p_layout"`
}

func handleSaveNavLayout(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveNavLayoutRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		if req.Layout == "" {
			err = deleteUIPref(db, int64(who.UserID), navLayoutKey)
		} else {
			var canon string
			if canon, err = canonicalNavLayout(req.Layout); err == nil {
				err = setUIPref(db, int64(who.UserID), navLayoutKey, canon)
			}
		}
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
