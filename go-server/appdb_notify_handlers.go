package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// The Notify panel's channel CRUD. These are plain synchronous REST endpoints
// rather than /create_request/ codes because they're quick app-db writes, not
// long-running database work — only the listening itself goes through the
// long-polling dispatch (see requestTypeNotifyListen).
//
// Every one of them carries p_tab_id on top of the snippet-style body: after
// the app-db write they also apply the change to that tab's live session, if
// one is running, so add/delete/pause/resume take effect immediately instead
// of at the next tab reopen.

// flexInt on every id field for the same reason appdb_handlers.go uses it:
// these values reach the frontend as tree-node tags and come back quoted as
// often as not.
type notifyChannelsRequest struct {
	PConnID flexInt `json:"p_conn_id"`
}

func handleGetNotifyChannels(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody notifyChannelsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		channels, err := fetchNotifyChannels(db, int64(who.UserID), int64(reqBody.PConnID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		list := make([]map[string]any, 0, len(channels))
		for _, c := range channels {
			list = append(list, map[string]any{
				"v_id":           c.ID,
				"v_channel_name": c.Name,
				"v_active":       c.Active,
			})
		}
		writeEnvelope(w, list, false, -1)
	}
}

type addNotifyChannelRequest struct {
	PConnID      flexInt `json:"p_conn_id"`
	PChannelName string  `json:"p_channel_name"`
	PTabID       string  `json:"p_tab_id"`
}

// oracleChannelNameMaxBytes caps a DBMS_ALERT alert name. The parameter is a
// plain VARCHAR2 with no documented character restrictions, but 30 bytes is
// the identifier length every supported Oracle release accepts, so the name is
// rejected outright rather than silently truncated into a channel that would
// never match what the signalling session uses.
const oracleChannelNameMaxBytes = 30

func handleAddNotifyChannel(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody addNotifyChannelRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		name := strings.TrimSpace(reqBody.PChannelName)
		if name == "" {
			writeEnvelope(w, "Channel name cannot be empty.", true, -1)
			return
		}

		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		// Resolving the connection is also the ownership check on p_conn_id —
		// a channel may only be stored against a connection this user can
		// actually open — and it's what the per-technology name validation
		// below needs.
		info, err := resolveConnection(upstream, r.Header.Get("Cookie"), strconv.FormatInt(int64(reqBody.PConnID), 10))
		if err != nil || !info.Found {
			writeEnvelope(w, "Connection not found.", true, -1)
			return
		}
		if !notifySupportedTechnology(info.Technology) {
			writeEnvelope(w, fmt.Sprintf("NOTIFY-style channels are not supported for %s connections.", info.Technology), true, -1)
			return
		}
		// PostgreSQL stays permissive: LISTEN takes a quoted identifier, so
		// anything the user types is usable as-is.
		if isOracle(info.Technology) && len(name) > oracleChannelNameMaxBytes {
			writeEnvelope(w, fmt.Sprintf("Oracle alert names are limited to %d bytes.", oracleChannelNameMaxBytes), true, -1)
			return
		}
		if isFirebird(info.Technology) && len(name) > firebirdEventNameMaxBytes {
			writeEnvelope(w, fmt.Sprintf("Firebird event names are limited to %d bytes.", firebirdEventNameMaxBytes), true, -1)
			return
		}

		id, err := addNotifyChannel(db, int64(who.UserID), int64(reqBody.PConnID), name)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		applyToLiveNotifySession(r, reqBody.PTabID, name, true)

		writeEnvelope(w, map[string]any{
			"v_id":           id,
			"v_channel_name": name,
			"v_active":       true,
		}, false, -1)
	}
}

type notifyChannelIDRequest struct {
	PID    flexInt `json:"p_id"`
	PTabID string  `json:"p_tab_id"`
}

func handleDeleteNotifyChannel(upstream *url.URL) http.HandlerFunc {
	return notifyChannelStateHandler(upstream, deleteNotifyChannel, false)
}

func handlePauseNotifyChannel(upstream *url.URL) http.HandlerFunc {
	return notifyChannelStateHandler(upstream, func(db *sql.DB, userID, id int64) error {
		return setNotifyChannelActive(db, userID, id, false)
	}, false)
}

func handleResumeNotifyChannel(upstream *url.URL) http.HandlerFunc {
	return notifyChannelStateHandler(upstream, func(db *sql.DB, userID, id int64) error {
		return setNotifyChannelActive(db, userID, id, true)
	}, true)
}

// notifyChannelStateHandler factors out what delete/pause/resume share: they
// all take {p_id, p_tab_id}, need the channel's *name* (which the body doesn't
// carry) to update a live session, and differ only in the app-db write and in
// whether the live session should end up listening or not.
func notifyChannelStateHandler(upstream *url.URL, apply func(db *sql.DB, userID, id int64) error, listenAfter bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody notifyChannelIDRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		channel, err := notifyChannelByID(db, int64(who.UserID), int64(reqBody.PID))
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		if err := apply(db, int64(who.UserID), int64(reqBody.PID)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		applyToLiveNotifySession(r, reqBody.PTabID, channel.Name, listenAfter)
		writeEnvelope(w, "", false, -1)
	}
}

// applyToLiveNotifySession mirrors an app-db change onto this tab's running
// session, if it has one. Best-effort by design: the stored state is what a
// later reopen replays, so a failure here is logged rather than turned into a
// failed request the user would have to retry.
func applyToLiveNotifySession(r *http.Request, tabID, channel string, listen bool) {
	clientID := nativeSessionCookieValue(r)
	if clientID == "" || tabID == "" {
		return
	}
	sess, ok := liveNotifySession(clientID, tabID)
	if !ok {
		return
	}

	var err error
	if listen {
		err = sess.listen(sess.ctx, channel)
	} else {
		err = sess.unlisten(sess.ctx, channel)
	}
	if err != nil {
		log.Printf("notify session (%s): channel %q: %v", sess.technology, channel, err)
	}
}
