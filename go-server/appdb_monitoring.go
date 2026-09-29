package main

import (
	"database/sql"
)

// customMonUnit mirrors a row of OmniDB_app_monunits — a user-authored
// custom monitoring unit. UserID is nullable in the schema (mirrors
// MonUnits.user's null=True), though in practice every row that exists was
// created via save_monitor_unit, which always sets it — see
// deliberately-not-supported note on scriptChart/scriptData below.
type customMonUnit struct {
	ID          int64
	Title       string
	Type        string
	Interval    int
	UserID      sql.NullInt64
	ScriptChart string
	ScriptData  string
}

// fetchAllCustomMonitorUnits lists the custom monitoring units offered on a
// connection's "Manage Units" dialog. Python's get_units_data listed every
// user's units; that leaked other users' unit titles and showed edit/delete
// icons that the (ownership-checked) mutations then refused, while
// refreshing only ever runs the caller's own scripts
// (fetchOwnCustomMonitorUnit) — so the listing is scoped to what the caller
// can actually use.
func fetchAllCustomMonitorUnits(db *sql.DB, userID int64, technology string) ([]customMonUnit, error) {
	// Only the caller's own units (plus ownerless shared ones) for this
	// connection's technology — the unfiltered listing used to show every
	// user's unit titles (and their edit/delete icons) to everyone, although
	// only the owner can ever run or edit them.
	rows, err := db.Query(`
		select u.id, u.title, u.type, u.interval, u.user_id, u.script_chart, u.script_data
		from OmniDB_app_monunits u
		join OmniDB_app_technology t on t.id = u.technology_id
		where (u.user_id = ? or u.user_id is null) and t.name = ?`, userID, technology)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]customMonUnit, 0)
	for rows.Next() {
		var u customMonUnit
		if err := rows.Scan(&u.ID, &u.Title, &u.Type, &u.Interval, &u.UserID, &u.ScriptChart, &u.ScriptData); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// fetchOwnCustomMonitorUnit mirrors get_monitor_unit_details/
// get_monitor_unit_template's `MonUnits.objects.get(id=..., user=request.user)`
// — ownership-checked, unlike the listing above.
func fetchOwnCustomMonitorUnit(db *sql.DB, unitID, userID int64) (*customMonUnit, error) {
	var u customMonUnit
	err := db.QueryRow(
		`select id, title, type, interval, user_id, script_chart, script_data from OmniDB_app_monunits where id = ? and user_id = ?`,
		unitID, userID,
	).Scan(&u.ID, &u.Title, &u.Type, &u.Interval, &u.UserID, &u.ScriptChart, &u.ScriptData)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// sqlQuerier is the common subset of *sql.DB and *sql.Tx that
// fetchAnyCustomMonitorUnit/defaultMonitorUnitInterval need. Accepting either
// one, rather than always a *sql.DB, is what lets saveMonitorUnitOrder pass
// its own *sql.Tx through here for a custom unit — querying via the plain
// *sql.DB instead would open a second connection while that transaction is
// still open, which SQLite's single-writer model deadlocks against (the
// query waits for a connection the transaction is holding, and the
// transaction is waiting on this call to return).
type sqlQuerier interface {
	QueryRow(query string, args ...any) *sql.Row
}

// fetchAnyCustomMonitorUnit looks up a custom unit by id alone, no ownership
// check — only ever used to read a unit's default interval (see
// defaultMonitorUnitInterval), never its script.
func fetchAnyCustomMonitorUnit(db sqlQuerier, unitID int64) (*customMonUnit, error) {
	var u customMonUnit
	err := db.QueryRow(
		`select id, title, type, interval, user_id, script_chart, script_data from OmniDB_app_monunits where id = ?`,
		unitID,
	).Scan(&u.ID, &u.Title, &u.Type, &u.Interval, &u.UserID, &u.ScriptChart, &u.ScriptData)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// saveCustomMonitorUnit mirrors save_monitor_unit's insert/update branch.
// unitID nil means "new unit" (Python's `if not v_unit_id`). Script text is
// still stored verbatim (harmless data at rest) even though nothing will
// ever execute it — see monitor_dashboard.go's package comment for why
// custom script execution isn't ported.
func saveCustomMonitorUnit(db *sql.DB, userID int64, unitID *int64, techName, title, unitType string, interval int, scriptChart, scriptData string) (int64, error) {
	techID, err := technologyID(db, techName)
	if err != nil {
		return 0, err
	}
	if unitID == nil {
		res, err := db.Exec(
			`insert into OmniDB_app_monunits (user_id, technology_id, script_chart, script_data, type, title, is_default, interval) values (?, ?, ?, ?, ?, ?, 0, ?)`,
			userID, techID, scriptChart, scriptData, unitType, title, interval,
		)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	res, err := db.Exec(
		`update OmniDB_app_monunits set script_chart = ?, script_data = ?, type = ?, title = ?, interval = ? where id = ? and user_id = ?`,
		scriptChart, scriptData, unitType, title, interval, *unitID, userID,
	)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, sql.ErrNoRows
	}
	return *unitID, nil
}

// deleteCustomMonitorUnit mirrors delete_monitor_unit's ownership-checked
// delete. Also cleans up any OmniDB_app_monunitsconnections rows referencing
// this unit, across every connection -- otherwise a deleted custom unit
// leaves an orphaned "shown" row behind that get_monitor_units's own
// unit-not-found cleanup would only catch one connection at a time, and only
// the next time that connection's dashboard is loaded.
func deleteCustomMonitorUnit(db *sql.DB, unitID, userID int64) error {
	res, err := db.Exec(`delete from OmniDB_app_monunits where id = ? and user_id = ?`, unitID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	if _, err := db.Exec(`delete from OmniDB_app_monunitsconnections where plugin_name = '' and unit = ?`, unitID); err != nil {
		return err
	}
	return nil
}

// monUnitConnection mirrors a row of OmniDB_app_monunitsconnections — a
// unit (built-in or custom) attached to a specific (user, connection) pair.
type monUnitConnection struct {
	ID         int64
	Interval   int
	PluginName string
	Unit       int64
	Position   int
	Hidden     bool
}

// fetchMonUnitConnections mirrors get_monitor_units'
// `MonUnitsConnections.objects.filter(user=request.user,connection=v_database_index)`
// -- only the *shown* rows, in display order, which is what the dashboard
// itself is built from.
func fetchMonUnitConnections(db *sql.DB, userID, connID int64) ([]monUnitConnection, error) {
	return queryMonUnitConnections(db, `select id, interval, plugin_name, unit, position, hidden from OmniDB_app_monunitsconnections where user_id = ? and connection_id = ? and hidden = 0 order by position asc`, userID, connID)
}

// fetchAllMonUnitConnections is fetchMonUnitConnections without the
// hidden = 0 filter or ordering -- used by "Manage Units" (get_monitor_unit_list)
// to know every unit's current shown/hidden state and position for this
// connection, not just the ones currently on the dashboard.
func fetchAllMonUnitConnections(db *sql.DB, userID, connID int64) ([]monUnitConnection, error) {
	return queryMonUnitConnections(db, `select id, interval, plugin_name, unit, position, hidden from OmniDB_app_monunitsconnections where user_id = ? and connection_id = ?`, userID, connID)
}

func queryMonUnitConnections(db *sql.DB, query string, args ...any) ([]monUnitConnection, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]monUnitConnection, 0)
	for rows.Next() {
		var c monUnitConnection
		if err := rows.Scan(&c.ID, &c.Interval, &c.PluginName, &c.Unit, &c.Position, &c.Hidden); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// insertMonUnitConnection mirrors get_monitor_units' "no units yet, create
// defaults" branch and refresh_monitor_units' "save new user/connection
// unit" branch (`saved_id == -1`) — both just insert one row, always shown
// (hidden = 0 is the column default).
func insertMonUnitConnection(db *sql.DB, userID, connID, unit int64, pluginName string, interval, position int) (int64, error) {
	res, err := db.Exec(
		`insert into OmniDB_app_monunitsconnections (interval, plugin_name, connection_id, unit, user_id, position) values (?, ?, ?, ?, ?, ?)`,
		interval, pluginName, connID, unit, userID, position,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// deleteMonUnitConnection mirrors get_monitor_units' cleanup of a
// no-longer-valid saved unit (unit id vanished from the built-in/custom
// catalogs) — bare delete by id, no ownership check needed since the
// caller already filtered by user_id when it fetched the row being deleted.
func deleteMonUnitConnection(db *sql.DB, id int64) error {
	_, err := db.Exec(`delete from OmniDB_app_monunitsconnections where id = ?`, id)
	return err
}

// hideMonitorUnit mirrors what remove_saved_monitor_unit used to do, except
// it soft-hides instead of deleting: the row (custom interval override
// included) survives, so re-showing the same unit from "Manage Units" finds
// it again instead of recreating it from scratch. Ownership-checked, same as
// the delete this replaces.
func hideMonitorUnit(db *sql.DB, savedID, userID int64) error {
	res, err := db.Exec(`update OmniDB_app_monunitsconnections set hidden = 1 where id = ? and user_id = ?`, savedID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// monitorUnitRef identifies one built-in (PluginName = the DBMS plugin name)
// or custom (PluginName = "") unit, the same split used everywhere else in
// this file/monitoring_handlers.go.
type monitorUnitRef struct {
	PluginName string
	Unit       int64
}

// saveMonitorUnitOrder replaces userID's entire shown-and-ordered set of
// monitor units for connID with p_units, in one transaction — the same
// "delete this user's whole arrangement, re-insert it in the given order"
// shape as saveConnectionOrder (appdb_connections.go) uses for the
// Connections sidebar's drag-to-reorder. Every entry in p_units ends up
// shown, in that order; any row that existed for this (user, connection)
// but is not in p_units gets hidden instead of deleted, so its custom
// interval survives being re-shown later. A unit ref that doesn't resolve to
// a real built-in or custom unit any more is silently skipped (same "stale
// reference" tolerance as get_monitor_units' own cleanup).
func saveMonitorUnitOrder(db *sql.DB, userID, connID int64, technology string, units []monitorUnitRef) error {
	existing, err := fetchAllMonUnitConnections(db, userID, connID)
	if err != nil {
		return err
	}
	byRef := make(map[monitorUnitRef]monUnitConnection, len(existing))
	for _, c := range existing {
		byRef[monitorUnitRef{c.PluginName, c.Unit}] = c
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	seen := make(map[monitorUnitRef]bool, len(units))
	position := 0
	for _, ref := range units {
		if seen[ref] {
			continue
		}
		defaultInterval, ok := defaultMonitorUnitInterval(tx, technology, ref)
		if !ok {
			continue
		}
		seen[ref] = true

		if row, found := byRef[ref]; found {
			if _, err := tx.Exec(`update OmniDB_app_monunitsconnections set position = ?, hidden = 0 where id = ?`, position, row.ID); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(
				`insert into OmniDB_app_monunitsconnections (interval, plugin_name, connection_id, unit, user_id, position) values (?, ?, ?, ?, ?, ?)`,
				defaultInterval, ref.PluginName, connID, ref.Unit, userID, position,
			); err != nil {
				return err
			}
		}
		position++
	}

	for ref, row := range byRef {
		if seen[ref] || row.Hidden {
			continue
		}
		if _, err := tx.Exec(`update OmniDB_app_monunitsconnections set hidden = 1 where id = ?`, row.ID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// defaultMonitorUnitInterval looks up the refresh interval a newly-shown
// unit should start with — the built-in definition's own Interval, or a
// saved custom unit's own Interval column. false means the ref no longer
// resolves to a real unit.
func defaultMonitorUnitInterval(q sqlQuerier, technology string, ref monitorUnitRef) (int, bool) {
	if ref.PluginName != "" {
		def, found := lookupBuiltinUnit(ref.PluginName, int(ref.Unit))
		if !found || def.DBMS != technology {
			return 0, false
		}
		return def.Interval, true
	}
	unit, err := fetchAnyCustomMonitorUnit(q, ref.Unit)
	if err != nil {
		return 0, false
	}
	return unit.Interval, true
}

// updateSavedMonitorUnitInterval mirrors update_saved_monitor_unit_interval's
// ownership-checked update.
func updateSavedMonitorUnitInterval(db *sql.DB, savedID, userID int64, interval int) error {
	res, err := db.Exec(`update OmniDB_app_monunitsconnections set interval = ? where id = ? and user_id = ?`, interval, savedID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
