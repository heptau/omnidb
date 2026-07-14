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

// fetchAllCustomMonitorUnits mirrors get_units_data()'s
// "for mon_unit in MonUnits.objects.all()" loop — deliberately ALL users'
// custom units, not just the caller's own (matches Python's existing
// behavior/quirk exactly: monitoring_units_database is a single global
// cache with no per-user filtering at listing time; only the actual
// edit/delete mutations are ownership-checked, in get_monitor_unit_details/
// delete_monitor_unit). Not narrowing this to request.user is a deliberate
// choice to preserve existing behavior, not an oversight.
func fetchAllCustomMonitorUnits(db *sql.DB) ([]customMonUnit, error) {
	rows, err := db.Query(`select id, title, type, interval, user_id, script_chart, script_data from OmniDB_app_monunits`)
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
// delete.
func deleteCustomMonitorUnit(db *sql.DB, unitID, userID int64) error {
	res, err := db.Exec(`delete from OmniDB_app_monunits where id = ? and user_id = ?`, unitID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
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
}

// fetchMonUnitConnections mirrors get_monitor_units'
// `MonUnitsConnections.objects.filter(user=request.user,connection=v_database_index)`.
func fetchMonUnitConnections(db *sql.DB, userID, connID int64) ([]monUnitConnection, error) {
	rows, err := db.Query(`select id, interval, plugin_name, unit from OmniDB_app_monunitsconnections where user_id = ? and connection_id = ?`, userID, connID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]monUnitConnection, 0)
	for rows.Next() {
		var c monUnitConnection
		if err := rows.Scan(&c.ID, &c.Interval, &c.PluginName, &c.Unit); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// insertMonUnitConnection mirrors get_monitor_units' "no units yet, create
// defaults" branch and refresh_monitor_units' "save new user/connection
// unit" branch (`saved_id == -1`) — both just insert one row.
func insertMonUnitConnection(db *sql.DB, userID, connID, unit int64, pluginName string, interval int) (int64, error) {
	res, err := db.Exec(
		`insert into OmniDB_app_monunitsconnections (interval, plugin_name, connection_id, unit, user_id) values (?, ?, ?, ?, ?)`,
		interval, pluginName, connID, unit, userID,
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

// removeSavedMonitorUnit mirrors remove_saved_monitor_unit's ownership-checked
// delete.
func removeSavedMonitorUnit(db *sql.DB, savedID, userID int64) error {
	res, err := db.Exec(`delete from OmniDB_app_monunitsconnections where id = ? and user_id = ?`, savedID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
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
