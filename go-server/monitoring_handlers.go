package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"

	"omnidb-server/i18n"
)

// This file mirrors OmniDB_app/views/monitor_dashboard.py's routes. Custom
// user-authored monitor unit CRUD (save/edit/delete) is ported in full, and
// custom units now actually run too — as a single SQL query (see
// custom_monitor_query.go) rather than the original two Python scripts
// (RestrictedPython's sandboxed exec(), which has no Go equivalent). Built-in
// units still run natively via monitoring_units.go, unrelated to this.
//
// customMonitorScriptUnsupportedMessage is now only used as a generic label
// for the built-in-unit "template" placeholder below — built-in units have
// no stored SQL to copy from, being native Go functions.
const customMonitorScriptUnsupportedMessage = "This built-in unit runs as native Go code and has no SQL source to copy — write your own SQL query below."

type getMonitorUnitListRequest struct {
	baseRequest
	PMode int `json:"p_mode"`
}

// handleGetMonitorUnitList mirrors get_monitor_unit_list — p_check_timeout=
// False, p_open_connection=False in Python, meaning it only ever needs the
// connection's technology, never a live connection; resolveConnection alone
// (not resolveNativeRequest, which also opens one) is the right amount of
// work here.
func handleGetMonitorUnitList(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req getMonitorUnitListRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		lang := i18n.ResolveLanguage(who.Language, r.Header.Get("Accept-Language"))
		info, err := resolveConnection(upstream, cookie, req.databaseIndex())
		if err != nil || !info.Found {
			writeEnvelope(w, i18n.T(lang, "errors.connection_not_found"), true, -1)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		// PMode 1 (the unit editor's "start from this template" dropdown)
		// keeps its original flat shape — untouched by show/hide/reorder.
		if req.PMode != 0 {
			rows := make([][]any, 0)
			ids := make([]int64, 0)
			for _, unit := range builtinUnitsForDBMS(info.Technology) {
				rows = append(rows, []any{unit.PluginName, unit.Title, unit.Type})
				ids = append(ids, int64(unit.ID))
			}
			customUnits, err := fetchAllCustomMonitorUnits(appDB, int64(who.UserID), info.Technology)
			if err == nil {
				for _, unit := range customUnits {
					rows = append(rows, []any{"", unit.Title, unit.Type})
					ids = append(ids, unit.ID)
				}
			}
			writeEnvelope(w, map[string]any{"id_list": ids, "data": rows}, false, -1)
			return
		}

		// PMode 0: "Manage Units" — every row also carries whether it's
		// currently shown on this connection's dashboard and, if it has ever
		// been shown (even if hidden right now), its saved_id/position — a
		// hidden unit keeps the position it had, precisely so the frontend
		// can slot it back into the same spot on re-check instead of
		// appending it at the end (see buildMonitorUnitList's sort and
		// handleMonitorUnitCheckboxChange).
		byRef := map[monitorUnitRef]monUnitConnection{}
		if connID, err := strconv.ParseInt(req.databaseIndex(), 10, 64); err == nil {
			if connRows, err := fetchAllMonUnitConnections(appDB, int64(who.UserID), connID); err == nil {
				for _, c := range connRows {
					byRef[monitorUnitRef{c.PluginName, c.Unit}] = c
				}
			}
		}

		items := make([]map[string]any, 0)

		for _, unit := range builtinUnitsForDBMS(info.Technology) {
			items = append(items, monitorUnitListItem(monitorUnitRef{unit.PluginName, int64(unit.ID)}, unit.Title, unit.Type, unit.Interval, false, byRef))
		}

		customUnits, err := fetchAllCustomMonitorUnits(appDB, int64(who.UserID), info.Technology)
		if err == nil {
			for _, unit := range customUnits {
				items = append(items, monitorUnitListItem(monitorUnitRef{"", unit.ID}, unit.Title, unit.Type, unit.Interval, unit.UserID.Valid && unit.UserID.Int64 == int64(who.UserID), byRef))
			}
		}

		writeEnvelope(w, map[string]any{"items": items}, false, -1)
	}
}

// monitorUnitListItem builds one "Manage Units" list row — see
// handleGetMonitorUnitList's PMode 0 branch. owned gates the edit/delete
// icons the frontend renders for a custom unit; it mirrors the original
// (loose) `unit.UserID.Valid` check, not a real ownership comparison — the
// actual ownership enforcement is server-side, in saveCustomMonitorUnit/
// deleteCustomMonitorUnit's own `where user_id = ?`. saved_id > 0 is how the
// frontend tells "has a real, persisted position" (shown or merely hidden)
// apart from "never shown at all" — shown alone can't do that, since a
// hidden row still has shown = false.
func monitorUnitListItem(ref monitorUnitRef, title, unitType string, defaultInterval int, owned bool, byRef map[monitorUnitRef]monUnitConnection) map[string]any {
	item := map[string]any{
		"plugin_name": ref.PluginName,
		"unit_id":     ref.Unit,
		"title":       title,
		"type":        unitType,
		"interval":    defaultInterval,
		"owned":       owned,
		"shown":       false,
		"position":    0,
		"saved_id":    int64(0),
	}
	if c, found := byRef[ref]; found {
		item["shown"] = !c.Hidden
		item["position"] = c.Position
		item["saved_id"] = c.ID
	}
	return item
}

type getMonitorUnitDetailsRequest struct {
	PUnitID int64 `json:"p_unit_id"`
}

// handleGetMonitorUnitDetails mirrors get_monitor_unit_details — always a
// custom unit (built-ins have no per-user saved row to look up details on;
// the frontend only calls this from editMonitorUnit(p_unit_id), which is
// only ever wired to a custom unit's own edit icon).
func handleGetMonitorUnitDetails(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req getMonitorUnitDetailsRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		unit, err := fetchOwnCustomMonitorUnit(appDB, req.PUnitID, int64(who.UserID))
		if err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		writeEnvelope(w, map[string]any{
			"title":        unit.Title,
			"type":         unit.Type,
			"interval":     unit.Interval,
			"script_chart": unit.ScriptChart,
			"script_data":  unit.ScriptData,
		}, false, -1)
	}
}

type getMonitorUnitsRequest struct {
	baseRequest
}

// handleGetMonitorUnits mirrors get_monitor_units — the units already
// attached to this (user, connection) pair, creating the DBMS's default
// built-in set on first use. Same "no live connection needed" shape as
// get_monitor_unit_list.
func handleGetMonitorUnits(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req getMonitorUnitsRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		info, err := resolveConnection(upstream, cookie, req.databaseIndex())
		if err != nil || !info.Found {
			writeEnvelope(w, []any{}, false, -1)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		connID, err := strconv.ParseInt(req.databaseIndex(), 10, 64)
		if err != nil {
			writeEnvelope(w, []any{}, false, -1)
			return
		}
		userID := int64(who.UserID)

		userUnits, err := fetchMonUnitConnections(appDB, userID, connID)
		if err != nil {
			writeEnvelope(w, []any{}, false, -1)
			return
		}

		if len(userUnits) == 0 {
			position := 0
			for _, unit := range builtinUnitsForDBMS(info.Technology) {
				if !unit.Default {
					continue
				}
				if _, err := insertMonUnitConnection(appDB, userID, connID, int64(unit.ID), unit.PluginName, unit.Interval, position); err != nil {
					writeEnvelope(w, []any{}, false, -1)
					return
				}
				position++
			}
			userUnits, err = fetchMonUnitConnections(appDB, userID, connID)
			if err != nil {
				writeEnvelope(w, []any{}, false, -1)
				return
			}
		}

		out := make([]map[string]any, 0, len(userUnits))
		for _, uu := range userUnits {
			if uu.PluginName == "" {
				unit, err := fetchOwnCustomMonitorUnit(appDB, uu.Unit, userID)
				if err != nil {
					deleteMonUnitConnection(appDB, uu.ID)
					continue
				}
				out = append(out, map[string]any{
					"v_saved_id":    uu.ID,
					"v_id":          unit.ID,
					"v_title":       unit.Title,
					"v_plugin_name": "",
					"v_interval":    uu.Interval,
				})
			} else {
				def, found := lookupBuiltinUnit(uu.PluginName, int(uu.Unit))
				if !found || def.DBMS != info.Technology {
					deleteMonUnitConnection(appDB, uu.ID)
					continue
				}
				out = append(out, map[string]any{
					"v_saved_id":    uu.ID,
					"v_id":          uu.Unit,
					"v_title":       def.Title,
					"v_plugin_name": uu.PluginName,
					"v_interval":    uu.Interval,
				})
			}
		}

		writeEnvelope(w, out, false, -1)
	}
}

type getMonitorUnitTemplateRequest struct {
	PUnitID         int64  `json:"p_unit_id"`
	PUnitPluginName string `json:"p_unit_plugin_name"`
}

// handleGetMonitorUnitTemplate mirrors get_monitor_unit_template — used by
// the custom-unit editor's "start from this template" dropdown. A built-in
// unit has no stored SQL query to copy (it's a native Go function), so it
// returns a placeholder explaining that instead of query text to prefill.
func handleGetMonitorUnitTemplate(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req getMonitorUnitTemplateRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		if req.PUnitPluginName == "" {
			appDB, err := openAppDB(upstream)
			if err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
			defer appDB.Close()

			unit, err := fetchOwnCustomMonitorUnit(appDB, req.PUnitID, int64(who.UserID))
			if err != nil {
				writeEnvelope(w, "", false, -1)
				return
			}
			writeEnvelope(w, map[string]any{
				"interval":     unit.Interval,
				"script_chart": unit.ScriptChart,
				"script_data":  unit.ScriptData,
				"type":         unit.Type,
			}, false, -1)
			return
		}

		def, found := lookupBuiltinUnit(req.PUnitPluginName, int(req.PUnitID))
		if !found {
			writeEnvelope(w, "", false, -1)
			return
		}
		writeEnvelope(w, map[string]any{
			"interval":     def.Interval,
			"script_chart": "",
			"script_data":  "-- " + customMonitorScriptUnsupportedMessage,
			"type":         def.Type,
		}, false, -1)
	}
}

type saveMonitorUnitRequest struct {
	baseRequest
	PUnitID          *int64   `json:"p_unit_id"`
	PUnitName        string   `json:"p_unit_name"`
	PUnitType        string   `json:"p_unit_type"`
	PUnitInterval    *flexInt `json:"p_unit_interval"`
	PUnitScriptChart string   `json:"p_unit_script_chart"`
	PUnitScriptData  string   `json:"p_unit_script_data"`
}

// handleSaveMonitorUnit mirrors save_monitor_unit — still a full CRUD port
// (the script text is stored verbatim, harmless data at rest) even though
// it can never be executed; needs the connection's technology (for the
// Technology FK), not a live connection.
func handleSaveMonitorUnit(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveMonitorUnitRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		lang := i18n.ResolveLanguage(who.Language, r.Header.Get("Accept-Language"))
		info, err := resolveConnection(upstream, cookie, req.databaseIndex())
		if err != nil || !info.Found {
			writeEnvelope(w, i18n.T(lang, "errors.connection_not_found"), true, -1)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		interval := 30
		if req.PUnitInterval != nil {
			interval = int(*req.PUnitInterval)
		}

		id, err := saveCustomMonitorUnit(appDB, int64(who.UserID), req.PUnitID, info.Technology, req.PUnitName, req.PUnitType, interval, req.PUnitScriptChart, req.PUnitScriptData)
		if err != nil {
			writeEnvelope(w, map[string]any{"password_timeout": true, "message": err.Error()}, true, -1)
			return
		}

		writeEnvelope(w, id, false, -1)
	}
}

type unitIDRequest struct {
	PUnitID int64 `json:"p_unit_id"`
}

// handleDeleteMonitorUnit mirrors delete_monitor_unit.
func handleDeleteMonitorUnit(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req unitIDRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		if err := deleteCustomMonitorUnit(appDB, req.PUnitID, int64(who.UserID)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		writeEnvelope(w, "", false, -1)
	}
}

type savedIDRequest struct {
	PSavedID int64 `json:"p_saved_id"`
}

// handleHideMonitorUnit mirrors what remove_saved_monitor_unit used to do
// (a dashboard card's own "×") — renamed because it now hides rather than
// deletes, see hideMonitorUnit's own comment.
func handleHideMonitorUnit(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req savedIDRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()

		if err := hideMonitorUnit(db, req.PSavedID, int64(who.UserID)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		writeEnvelope(w, "", false, -1)
	}
}

type saveMonitorUnitOrderRequest struct {
	baseRequest
	PUnits []struct {
		PPluginName string `json:"p_plugin_name"`
		PUnit       int64  `json:"p_unit"`
	} `json:"p_units"`
}

// handleSaveMonitorUnitOrder replaces this user's entire shown-and-ordered
// set of monitor units for one connection — see saveMonitorUnitOrder's own
// comment. "Manage Units" calls this on every checkbox toggle and every
// drag-end, same "recompute the whole list, resend it" shape
// persistConnectionOrder (connections.js) already uses for the Connections
// sidebar.
func handleSaveMonitorUnitOrder(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req saveMonitorUnitOrderRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		info, err := resolveConnection(upstream, cookie, req.databaseIndex())
		if err != nil || !info.Found {
			writeBadRequest(w)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		connID, err := strconv.ParseInt(req.databaseIndex(), 10, 64)
		if err != nil {
			writeBadRequest(w)
			return
		}

		units := make([]monitorUnitRef, 0, len(req.PUnits))
		for _, u := range req.PUnits {
			units = append(units, monitorUnitRef{u.PPluginName, u.PUnit})
		}

		if err := saveMonitorUnitOrder(appDB, int64(who.UserID), connID, info.Technology, units); err != nil {
			writeDatabaseError(w, err.Error())
			return
		}

		writeEnvelope(w, "", false, -1)
	}
}

type updateSavedMonitorUnitIntervalRequest struct {
	PSavedID  int64   `json:"p_saved_id"`
	PInterval flexInt `json:"p_interval"`
}

// handleUpdateSavedMonitorUnitInterval mirrors
// update_saved_monitor_unit_interval.
func handleUpdateSavedMonitorUnitInterval(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req updateSavedMonitorUnitIntervalRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		cookie := r.Header.Get("Cookie")
		who, err := resolveIdentity(upstream, cookie)
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		if err := updateSavedMonitorUnitInterval(appDB, req.PSavedID, int64(who.UserID), int(req.PInterval)); err != nil {
			writeEnvelope(w, err.Error(), true, -1)
			return
		}

		writeEnvelope(w, "", false, -1)
	}
}

type refreshUnitRequestItem struct {
	SavedID    int64          `json:"saved_id"`
	ID         int64          `json:"id"`
	Sequence   int            `json:"sequence"`
	Interval   json.Number    `json:"interval"`
	PluginName string         `json:"plugin_name"`
	ObjectData map[string]any `json:"object_data"`
}

type refreshMonitorUnitsRequest struct {
	baseRequest
	PIDs []refreshUnitRequestItem `json:"p_ids"`
}

// handleRefreshMonitorUnits mirrors refresh_monitor_units — the only route
// that actually needs a LIVE connection (to run a built-in unit's queries),
// alongside the app db (for the "first attach" MonUnitsConnections insert
// and custom-unit metadata lookups).
func handleRefreshMonitorUnits(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req refreshMonitorUnitsRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		if len(req.PIDs) == 0 {
			writeEnvelope(w, []any{}, false, -1)
			return
		}

		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		lang := i18n.ResolveLanguage(who.Language, r.Header.Get("Accept-Language"))

		db, _, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		appDB, err := openAppDB(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		defer appDB.Close()

		userID := int64(who.UserID)

		results := make([]map[string]any, 0, len(req.PIDs))
		for _, item := range req.PIDs {
			// A unit only ever reaches the dashboard (and so, this refresh
			// loop) after get_monitor_units has already returned it with a
			// real saved_id — showing a unit is save_monitor_unit_order's job
			// now, not something this endpoint creates on the fly.
			savedID := item.SavedID

			result := map[string]any{
				"v_saved_id": savedID,
				"v_id":       item.ID,
				"v_sequence": item.Sequence,
				"v_object":   nil,
				"v_error":    false,
			}

			if item.PluginName == "" {
				unit, lookupErr := fetchOwnCustomMonitorUnit(appDB, item.ID, userID)
				if lookupErr != nil {
					result["v_error"] = true
					result["v_message"] = i18n.T(lang, "errors.unknown_monitoring_unit")
					results = append(results, result)
					continue
				}
				result["v_type"] = unit.Type
				result["v_title"] = unit.Title
				result["v_interval"] = unit.Interval

				object, queryErr := runCustomMonitorQuery(db, unit.Type, unit.ScriptChart, unit.ScriptData, item.ObjectData)
				if queryErr != nil {
					result["v_error"] = true
					result["v_message"] = queryErr.Error()
					results = append(results, result)
					continue
				}
				result["v_object"] = object
				results = append(results, result)
				continue
			}

			def, found := lookupBuiltinUnit(item.PluginName, int(item.ID))
			if !found {
				result["v_error"] = true
				result["v_message"] = i18n.T(lang, "errors.unknown_monitoring_unit")
				results = append(results, result)
				continue
			}
			result["v_type"] = def.Type
			result["v_title"] = def.Title
			result["v_interval"] = def.Interval

			data, dataErr := def.Data(db, item.ObjectData)
			if dataErr != nil {
				result["v_error"] = true
				result["v_message"] = dataErr.Error()
				results = append(results, result)
				continue
			}
			if item.ObjectData == nil {
				// First call for this unit: the frontend has no Chart.js instance yet
				// and needs the full constructor config, not just the data — every
				// later call only ever wants the flat {labels, datasets} shape (see
				// monitoring.js's refreshMonitorDashboard, "Update existing chart").
				chart, chartErr := def.Chart(db)
				if chartErr != nil {
					result["v_error"] = true
					result["v_message"] = chartErr.Error()
					results = append(results, result)
					continue
				}
				chart["data"] = data
				result["v_object"] = chart
			} else {
				result["v_object"] = data
			}
			results = append(results, result)
		}

		writeEnvelope(w, results, false, -1)
	}
}

type testMonitorScriptRequest struct {
	baseRequest
	PScriptChart string `json:"p_script_chart"`
	PScriptData  string `json:"p_script_data"`
	PType        string `json:"p_type"`
}

// handleTestMonitorScript mirrors test_monitor_script — tests ad hoc,
// not-yet-saved unit text typed into the editor (p_script_data is now a SQL
// query, p_script_chart a Chart.js chart-type string for "chart" units, see
// custom_monitor_query.go). previous is always nil here since a test run
// never has prior state to carry forward.
func handleTestMonitorScript(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req testMonitorScriptRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}

		db, _, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()

		object, err := runCustomMonitorQuery(db, req.PType, req.PScriptChart, req.PScriptData, nil)
		if err != nil {
			writeEnvelope(w, map[string]any{
				"v_object":  nil,
				"v_error":   true,
				"v_message": err.Error(),
			}, false, -1)
			return
		}
		writeEnvelope(w, map[string]any{
			"v_object":  object,
			"v_error":   false,
			"v_message": "",
		}, false, -1)
	}
}
