package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
)

// requireSuperuser does the common auth + superuser-check preamble every
// users.py route needs. On a non-ok return it has already written the
// response — the caller should return immediately. Mirrors every route in
// users.py checking `if not v_session.v_super_user` right after the
// `@user_authenticated` decorator's own check.
func requireSuperuser(w http.ResponseWriter, r *http.Request, upstream *url.URL) (*WhoAmI, bool) {
	who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, false
	}
	if !who.SuperUser {
		writeEnvelope(w, errNotSuperuser.Error(), true, -1)
		return nil, false
	}
	return who, true
}

// handleGetUsers mirrors users.py's get_users.
//
// Three columns, not Python's four. The fourth was a ready-made
// `<i ... onclick='removeUser("3")'>` string — markup as data, reproduced
// byte-for-byte from the original on the assumption the frontend needed it
// verbatim. It did not: users.js rendered it through escapeHtml, so the tag
// source showed up as literal text and there was no clickable icon. The button
// is built and bound in the frontend now, from v_user_ids, which this response
// already carries. save_users only ever read columns 0-2.
func handleGetUsers(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSuperuser(w, r, upstream); !ok {
			return
		}
		db, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer db.Close()

		users, err := fetchAllUsers(db)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		rows := make([][]any, 0, len(users))
		ids := make([]int64, 0, len(users))
		for _, u := range users {
			superuserFlag := 0
			if u.IsSuperuser {
				superuserFlag = 1
			}
			rows = append(rows, []any{
				u.Username,
				"",
				superuserFlag,
			})
			ids = append(ids, u.ID)
		}

		writeEnvelope(w, map[string]any{
			"v_data":     rows,
			"v_user_ids": ids,
		}, false, -1)
	}
}

type newUserRequest struct {
	PData [][]string `json:"p_data"`
}

// handleNewUser mirrors users.py's new_user.
func handleNewUser(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSuperuser(w, r, upstream); !ok {
			return
		}
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req newUserRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		db, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer db.Close()

		for _, u := range req.PData {
			if len(u) < 2 {
				continue
			}
			if err := createDjangoUser(db, u[0], u[1]); err != nil {
				writeEnvelope(w, err.Error(), true, -1)
				return
			}
		}

		writeEnvelope(w, "", false, -1)
	}
}

// removeUserRequest's p_id arrives as a JSON string, not a number — the
// frontend's onclick HTML (`removeUser("3")`, see get_users' generated
// button) always calls it with a quoted string literal, same as Python's own
// `onclick='removeUser("{0}")'.format(user.id)`.
type removeUserRequest struct {
	PID string `json:"p_id"`
}

// handleRemoveUser mirrors users.py's remove_user.
func handleRemoveUser(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSuperuser(w, r, upstream); !ok {
			return
		}
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req removeUserRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		userID, err := strconv.ParseInt(req.PID, 10, 64)
		if err != nil {
			writeBadRequest(w)
			return
		}

		db, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer db.Close()

		if err := deleteUserCascade(db, userID); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		writeEnvelope(w, "", false, -1)
	}
}

// saveUsersData's "edited" rows arrive as a mixed-type array
// [username(string), password(string), is_superuser(number 1/0), htmlSnippet
// (string, unused)] — same shape get_users emits and users.js's changeUser()
// round-trips back verbatim (see `v_user_is_superuser = ...checked ? 1 : 0`
// in users.js), so it can't be unmarshaled as [][]string directly.
type saveUsersData struct {
	New    [][]string `json:"new"`
	Edited [][]any    `json:"edited"`
}

type saveUsersRequest struct {
	PData       saveUsersData `json:"p_data"`
	PUserIDList []int64       `json:"p_user_id_list"`
}

// handleSaveUsers mirrors users.py's save_users. Deliberately doesn't call
// anything like Django's update_session_auth_hash after a self password
// change — that mechanism exists purely to stop Django's own session-cookie-
// based auth from invalidating on password change, but TrustedUserMiddleware
// (see OmniDB_app/middleware.py) already unconditionally overwrites
// request.user from the trusted header on every request that has one,
// completely independent of whatever Django's own session auth hash check
// would have decided — so there's nothing here for an equivalent call to
// protect against.
func handleSaveUsers(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireSuperuser(w, r, upstream); !ok {
			return
		}
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveUsersRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		db, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer db.Close()

		for _, u := range req.PData.New {
			if len(u) < 2 {
				continue
			}
			if err := createDjangoUser(db, u[0], u[1]); err != nil {
				writeEnvelope(w, err.Error(), true, -1)
				return
			}
		}

		for i, u := range req.PData.Edited {
			if i >= len(req.PUserIDList) || len(u) < 3 {
				continue
			}
			username, _ := u[0].(string)
			password, _ := u[1].(string)
			superuserNum, _ := u[2].(float64)
			if err := updateDjangoUser(db, req.PUserIDList[i], username, superuserNum == 1, password); err != nil {
				writeEnvelope(w, err.Error(), true, -1)
				return
			}
		}

		writeEnvelope(w, "", false, -1)
	}
}
