package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
)

// resolveAppDBRequest does the common auth + app-db-open preamble every
// handler in this file needs. On a non-ok return it has already written the
// response (unauthenticated envelope or a database error) — the caller
// should return immediately.
func resolveAppDBRequest(w http.ResponseWriter, r *http.Request, upstream *url.URL) (*sql.DB, *WhoAmI, bool) {
	cookie := r.Header.Get("Cookie")
	who, err := resolveIdentity(upstream, cookie)
	if err != nil || !who.Authenticated {
		writeUnauthenticated(w)
		return nil, nil, false
	}
	db, err := openAppDB(upstream)
	if err != nil {
		writeDatabaseError(w, err.Error())
		return nil, nil, false
	}
	return db, who, true
}

// --- connections.py's DB-agnostic CRUD (see go-backend-migration memory for
// what's deliberately NOT here: save_connection/test_connection/
// delete_connection need Session.AddDatabase/RemoveDatabase + SSH tunneling,
// both out of scope until phase 7) ---

type getConnectionsRequest struct {
	PConnIDList []int64 `json:"p_conn_id_list"`
}

func handleGetConnections(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody getConnectionsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		locked := make(map[int64]bool, len(reqBody.PConnIDList))
		for _, id := range reqBody.PConnIDList {
			locked[id] = true
		}

		technologies, err := fetchTechnologies(db)
		if err != nil {
			log.Printf("get_connections: fetchTechnologies: %v", err)
			technologies = []string{}
		}

		conns, err := fetchConnectionsForUser(db, int64(who.UserID))
		if err != nil {
			log.Printf("get_connections: fetchConnectionsForUser: %v", err)
			conns = nil
		}

		connList := make([]map[string]any, 0, len(conns))
		for _, c := range conns {
			obj := map[string]any{
				"id":          c.ID,
				"locked":      locked[c.ID],
				"public":      c.Public,
				"is_mine":     c.OwnerID == int64(who.UserID),
				"technology":  c.Technology,
				"alias":       c.Alias,
				"conn_string": "",
				"server":      "",
				"port":        "",
				"service":     "",
				"user":        "",
				"tunnel": map[string]any{
					"enabled":  c.UseTunnel,
					"server":   c.SSHServer,
					"port":     c.SSHPort,
					"user":     c.SSHUser,
					"password": c.SSHPassword != "",
					"key":      c.SSHKey != "",
				},
			}
			if c.Technology != "terminal" {
				obj["conn_string"] = c.ConnString
				obj["server"] = c.Server
				obj["port"] = c.Port
				obj["service"] = c.Database
				obj["user"] = c.Username
				obj["password"] = c.Password != ""
			}
			connList = append(connList, obj)
		}

		writeEnvelope(w, map[string]any{
			"v_conn_list":    connList,
			"v_technologies": technologies,
		}, false, -1)
	}
}

func handleGetGroups(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		groups, err := fetchGroupsForUser(db, int64(who.UserID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		out := make([]map[string]any, 0, len(groups))
		for _, g := range groups {
			connIDs, err := fetchGroupConnectionIDs(db, g.ID)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
			out = append(out, map[string]any{
				"id":        g.ID,
				"name":      g.Name,
				"conn_list": connIDs,
			})
		}
		writeEnvelope(w, out, false, -1)
	}
}

type newGroupRequest struct {
	PName string `json:"p_name"`
}

func handleNewGroup(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody newGroupRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := newGroup(db, int64(who.UserID), reqBody.PName); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type editGroupRequest struct {
	PID   flexInt `json:"p_id"`
	PName string  `json:"p_name"`
}

func handleEditGroup(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody editGroupRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		owner, err := groupOwner(db, int64(reqBody.PID))
		if err != nil {
			writeEnvelope(w, groupLookupErrorMessage(err), true, -1)
			return
		}
		if owner != int64(who.UserID) {
			writeEnvelope(w, "This group does not belong to you.", true, -1)
			return
		}
		if err := editGroup(db, int64(reqBody.PID), reqBody.PName); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type deleteGroupRequest struct {
	PID flexInt `json:"p_id"`
}

func handleDeleteGroup(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody deleteGroupRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		owner, err := groupOwner(db, int64(reqBody.PID))
		if err != nil {
			writeEnvelope(w, groupLookupErrorMessage(err), true, -1)
			return
		}
		if owner != int64(who.UserID) {
			writeEnvelope(w, "This group does not belong to you.", true, -1)
			return
		}
		if err := deleteGroup(db, int64(reqBody.PID)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

// groupLookupErrorMessage mirrors Django's Group.DoesNotExist message text
// for a missing group id, instead of surfacing Go's raw "sql: no rows in
// result set" to the user.
func groupLookupErrorMessage(err error) string {
	if err == sql.ErrNoRows {
		return "Group matching query does not exist."
	}
	return err.Error()
}

type saveConnectionRequest struct {
	ID         int64             `json:"id"`
	Type       string            `json:"type"`
	Server     string            `json:"server"`
	Port       string            `json:"port"`
	Database   string            `json:"database"`
	User       string            `json:"user"`
	Password   string            `json:"password"`
	Title      string            `json:"title"`
	ConnString string            `json:"connstring"`
	Public     bool              `json:"public"`
	Tunnel     tunnelRequestData `json:"tunnel"`
}

// handleSaveConnection mirrors connections.py's save_connection — the ORM
// write only. Deliberately doesn't touch Session.AddDatabase (no Go
// equivalent of Django's live Session cache) — see go-backend-migration
// memory for why that's a safe, self-healing gap.
func handleSaveConnection(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveConnectionRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		_, err = saveConnection(db, int64(who.UserID), saveConnectionInput{
			ID:          req.ID,
			Technology:  req.Type,
			Server:      req.Server,
			Port:        req.Port,
			Database:    req.Database,
			Username:    req.User,
			Password:    req.Password,
			Alias:       req.Title,
			SSHServer:   req.Tunnel.Server,
			SSHPort:     req.Tunnel.Port,
			SSHUser:     req.Tunnel.User,
			SSHPassword: req.Tunnel.Password,
			SSHKey:      req.Tunnel.Key,
			UseTunnel:   req.Tunnel.Enabled,
			ConnString:  req.ConnString,
			Public:      req.Public,
		})
		if err != nil {
			writeEnvelope(w, connectionLookupErrorMessage(err), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type deleteConnectionRequest struct {
	ID int64 `json:"id"`
}

// handleDeleteConnection mirrors connections.py's delete_connection.
func handleDeleteConnection(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req deleteConnectionRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := deleteConnectionRow(db, int64(who.UserID), req.ID); err != nil {
			writeEnvelope(w, connectionLookupErrorMessage(err), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type groupConnDataItem struct {
	ID       int64 `json:"id"`
	Selected bool  `json:"selected"`
}

type saveGroupConnectionsRequest struct {
	PGroup        flexInt             `json:"p_group"`
	PConnDataList []groupConnDataItem `json:"p_conn_data_list"`
}

func handleSaveGroupConnections(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody saveGroupConnectionsRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		owner, err := groupOwner(db, int64(reqBody.PGroup))
		if err == sql.ErrNoRows {
			writeEnvelope(w, "Group not found.", true, -1)
			return
		}
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		if owner != int64(who.UserID) {
			writeEnvelope(w, "This group does not belong to you.", true, -1)
			return
		}

		for _, item := range reqBody.PConnDataList {
			connOwner, err := connectionOwner(db, item.ID)
			if err != nil || connOwner != int64(who.UserID) {
				log.Printf("save_group_connections: connection %d not found or not owned by user", item.ID)
				continue
			}
			if err := setGroupConnection(db, int64(reqBody.PGroup), item.ID, item.Selected); err != nil {
				log.Printf("save_group_connections: %v", err)
			}
		}

		writeEnvelope(w, "", false, -1)
	}
}

// --- tree_snippets.py port ---

func handleGetAllSnippets(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		tree, err := snippetGetAllTree(db, int64(who.UserID))
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		// get_all_snippets returns the tree object directly, NOT wrapped in
		// the usual {v_data, v_error, v_error_id} envelope — matches
		// tree_snippets.py's `return JsonResponse(v_root)`.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(tree)
	}
}

type nodeChildrenRequest struct {
	PSnIDParent *int64 `json:"p_sn_id_parent"`
}

func handleGetNodeChildren(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody nodeChildrenRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		folders, files, err := snippetGetNodeChildren(db, int64(who.UserID), reqBody.PSnIDParent)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		nodes := make([]map[string]any, 0, len(folders))
		for _, f := range folders {
			nodes = append(nodes, map[string]any{"v_id": f.ID, "v_name": f.Name})
		}
		texts := make([]map[string]any, 0, len(files))
		for _, f := range files {
			texts = append(texts, map[string]any{"v_id": f.ID, "v_name": f.Name})
		}
		writeEnvelope(w, map[string]any{
			"v_list_nodes": nodes,
			"v_list_texts": texts,
		}, false, -1)
	}
}

type snippetTextRequest struct {
	PStID int64 `json:"p_st_id"`
}

func handleGetSnippetText(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody snippetTextRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		text, err := snippetGetText(db, int64(who.UserID), reqBody.PStID)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, text, false, -1)
	}
}

type newNodeSnippetRequest struct {
	PSnIDParent *int64 `json:"p_sn_id_parent"`
	PMode       string `json:"p_mode"`
	PName       string `json:"p_name"`
}

func handleNewNodeSnippet(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody newNodeSnippetRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := snippetNewNode(db, int64(who.UserID), reqBody.PSnIDParent, reqBody.PMode, reqBody.PName); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type deleteNodeSnippetRequest struct {
	PID   int64  `json:"p_id"`
	PMode string `json:"p_mode"`
}

func handleDeleteNodeSnippet(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody deleteNodeSnippetRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := snippetDeleteNode(db, int64(who.UserID), reqBody.PID, reqBody.PMode); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}

type saveSnippetTextRequest struct {
	PID     *int64 `json:"p_id"`
	PName   string `json:"p_name"`
	PParent *int64 `json:"p_parent"`
	PText   string `json:"p_text"`
}

func handleSaveSnippetText(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody saveSnippetTextRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		fileID, err := snippetSaveText(db, int64(who.UserID), reqBody.PID, reqBody.PParent, reqBody.PName, reqBody.PText)
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		// On update, Python echoes back the file's *existing* name — p_name
		// is read but never applied to an existing file (only used when
		// creating a brand-new one) — see snippetSaveText's comment.
		name := reqBody.PName
		if reqBody.PID != nil {
			if err := db.QueryRow(`select name from OmniDB_app_snippetfile where id = ?`, fileID).Scan(&name); err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
		}

		writeEnvelope(w, map[string]any{
			"type":   "snippet",
			"id":     fileID,
			"parent": nullableInt64(reqBody.PParent),
			"name":   name,
		}, false, -1)
	}
}

type renameNodeSnippetRequest struct {
	PID   int64  `json:"p_id"`
	PName string `json:"p_name"`
	PMode string `json:"p_mode"`
}

func handleRenameNodeSnippet(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var reqBody renameNodeSnippetRequest
		if err := json.Unmarshal([]byte(raw), &reqBody); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := snippetRenameNode(db, int64(who.UserID), reqBody.PID, reqBody.PMode, reqBody.PName); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}
		writeEnvelope(w, "", false, -1)
	}
}
