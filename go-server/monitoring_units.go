package main

import (
	"database/sql"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// This file replaces OmniDB_app/views/monitoring_units/postgresql.py and
// mysql.py's 17 built-in monitoring dashboard units. Those were originally
// Python source strings (script_chart/script_data) executed at request time
// via RestrictedPython's sandboxed exec() — see monitor_dashboard.go's
// package comment for why that mechanism has no Go equivalent and was
// deliberately dropped rather than reimplemented (user decision,
// 2026-07-13): built-in units are now native Go functions with zero
// sandboxing needed at all; user-authored custom monitoring scripts are no
// longer executable (see handleTestMonitorScript/refreshBuiltinOrCustomUnit).
//
// Every built-in unit's exact SQL and result shape was cataloged from the
// original Python source before writing anything here — see
// go-backend-migration memory for the full catalog and the handful of
// deliberate deviations (SQL injection fix via bind params instead of raw
// string splicing; UNION ALL SELECT 0.0 empty-guard added to "Long
// Transaction", matching its siblings, where the original lacked it).

// monitoringUnitDef mirrors one entry of Python's monitoring_units list —
// Chart/Data replace script_chart/script_data.
type monitoringUnitDef struct {
	ID         int
	PluginName string
	DBMS       string
	Title      string
	Type       string
	Interval   int
	Default    bool
	Chart      func(db *sql.DB) (map[string]any, error)
	Data       func(db *sql.DB, previous map[string]any) (map[string]any, error)
}

func lookupBuiltinUnit(pluginName string, id int) (*monitoringUnitDef, bool) {
	for i := range builtinMonitoringUnits {
		u := &builtinMonitoringUnits[i]
		if u.PluginName == pluginName && u.ID == id {
			return u, true
		}
	}
	return nil, false
}

func builtinUnitsForDBMS(dbms string) []monitoringUnitDef {
	out := make([]monitoringUnitDef, 0)
	for _, u := range builtinMonitoringUnits {
		if u.DBMS == dbms {
			out = append(out, u)
		}
	}
	return out
}

// --- Chart.js config helpers, factored out since all 17 units share the
// same dataset styling/tooltip/hover shape (see catalog) and differ only in
// title/axis-label/axis-max — a real, verified-identical shape across every
// unit, not a premature abstraction. ---

func mkTitle(display bool, text string) map[string]any {
	if display {
		return map[string]any{"display": true, "text": text}
	}
	return map[string]any{"display": false}
}

// lineChart mirrors every built-in unit's script_chart shape: a Chart.js
// "line" config with "data": nil (filled in by the caller with script_data's
// result, mirroring Python's `result['data'] = data`).
//
// Config keys use Chart.js v4's shape (plugins.legend/title/tooltip,
// scales.x/scales.y, axis "title" instead of v2's "scaleLabel") — see
// chartjs-global.js's comment for why v4 no longer needs moment.js at all.
func lineChart(titleDisplay bool, titleText, yLabel string, yMax any, xAxisLabelDisplay bool) map[string]any {
	yAxisTicks := map[string]any{"beginAtZero": true}
	if yMax != nil {
		yAxisTicks["max"] = yMax
	}
	return map[string]any{
		"type": "line",
		"data": nil,
		"options": map[string]any{
			"responsive": true,
			"plugins": map[string]any{
				"legend":  map[string]any{"display": false},
				"title":   mkTitle(titleDisplay, titleText),
				"tooltip": map[string]any{"mode": "index", "intersect": false},
			},
			"hover": map[string]any{"mode": "nearest", "intersect": true},
			"scales": map[string]any{
				"x": map[string]any{
					"display": true,
					"title":   map[string]any{"display": xAxisLabelDisplay, "text": "Time"},
				},
				"y": map[string]any{
					"display": true,
					"title":   map[string]any{"display": true, "text": yLabel},
					"ticks":   yAxisTicks,
				},
			},
		},
	}
}

func singleDataset(label string, value any) []any {
	return []any{map[string]any{
		"label":           label,
		"backgroundColor": "rgba(129,223,129,0.4)",
		"borderColor":     "rgba(129,223,129,1)",
		"tension":         0,
		"pointRadius":     0,
		"borderWidth":     1,
		"data":            []any{value},
	}}
}

func nowLabel() string {
	return time.Now().Format("15:04:05")
}

// dataResult mirrors every unit's script_data result dict: labels+datasets,
// plus whatever carry-forward fields (current_count, current_time, ...)
// this unit's next poll needs as previous_data.
func dataResult(datasetLabel string, value any, extra map[string]any) map[string]any {
	result := map[string]any{
		"labels":   []any{nowLabel()},
		"datasets": singleDataset(datasetLabel, value),
	}
	for k, v := range extra {
		result[k] = v
	}
	return result
}

func roundTo(v float64, places int) float64 {
	shift := math.Pow(10, float64(places))
	return math.Round(v*shift) / shift
}

// int64ish coerces a JSON-decoded previous_data field (float64 from
// encoding/json's `any` decoding, occasionally a string) into int64 —
// mirrors Python's explicit `int(previous_data[...])` casts (Units
// 9/10/11's {1} substitution).
func int64ish(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n
	default:
		return 0
	}
}

// pgServerVersionNum mirrors the `int(connection.ExecuteScalar('show
// server_version_num'))` version gate used by Units 3/12/13/14.
func pgServerVersionNum(db *sql.DB) (int, error) {
	var s string
	if err := db.QueryRow(`show server_version_num`).Scan(&s); err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(s))
}

// --- PostgreSQL built-in units (ids 0-15) ---

func pgTransactionRateChart(db *sql.DB) (map[string]any, error) {
	return lineChart(false, "", "TPS", nil, false), nil
}

func pgTransactionRateData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var tps, currentCount any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`select 0 as tps, sum(xact_commit+xact_rollback) as current_count, now()::time as current_time FROM pg_stat_database`).Scan(&tps, &currentCount, &currentTime)
	} else {
		err = db.QueryRow(
			`select round((sum(xact_commit+xact_rollback) - $1::numeric)/(extract(epoch from now()::time - $2::time))::numeric,2) as tps, sum(xact_commit+xact_rollback) as current_count, now()::time as current_time FROM pg_stat_database`,
			previous["current_count"], previous["current_time"],
		).Scan(&tps, &currentCount, &currentTime)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Rate", tps, map[string]any{"current_count": currentCount, "current_time": currentTime}), nil
}

func pgBackendsChart(db *sql.DB) (map[string]any, error) {
	var maxConnStr string
	if err := db.QueryRow(`SHOW max_connections`).Scan(&maxConnStr); err != nil {
		return nil, err
	}
	maxConn, err := strconv.Atoi(strings.TrimSpace(maxConnStr))
	if err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Backends (max_connections: %s)", maxConnStr), "Value", maxConn, false), nil
}

func pgBackendsData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var count any
	if err := db.QueryRow(`SELECT count(*) as count FROM pg_stat_activity`).Scan(&count); err != nil {
		return nil, err
	}
	return dataResult("Backends", count, nil), nil
}

func pgAutovacuumWorkersChart(db *sql.DB) (map[string]any, error) {
	return lineChart(false, "", "%", 100.0, false), nil
}

func pgAutovacuumWorkersData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var used, total float64
	if err := db.QueryRow(`
		SELECT (SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'autovacuum: %') AS used,
		       current_setting('autovacuum_max_workers')::bigint AS total
	`).Scan(&used, &total); err != nil {
		return nil, err
	}
	perc := roundTo(used/total*100, 1)
	return dataResult("Workers busy (%)", perc, nil), nil
}

func pgWALProductionRateChart(db *sql.DB) (map[string]any, error) {
	return lineChart(false, "", "MB/s", nil, false), nil
}

func pgWALProductionRateData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	verNum, err := pgServerVersionNum(db)
	if err != nil {
		return nil, err
	}
	lsnFunc, diffFunc := "pg_current_wal_lsn", "pg_wal_lsn_diff"
	if verNum < 100000 {
		lsnFunc, diffFunc = "pg_current_xlog_location", "pg_xlog_location_diff"
	}
	var rate any
	var currentLSN sql.NullString
	var currentTime string
	if previous == nil {
		query := fmt.Sprintf(`
			SELECT 0 as rate, current_lsn, current_time::text
			FROM (SELECT CASE WHEN pg_is_in_recovery() THEN null ELSE %s() END as current_lsn, now() as current_time) t
		`, lsnFunc)
		err = db.QueryRow(query).Scan(&rate, &currentLSN, &currentTime)
	} else {
		query := fmt.Sprintf(`
			SELECT round((%s(current_lsn,$1::pg_lsn)/1048576.0)/(extract(epoch from now()::time - $2::time))::numeric,2) as rate,
			       current_lsn, current_time::text
			FROM (SELECT CASE WHEN pg_is_in_recovery() THEN null ELSE %s() END as current_lsn, now() as current_time) t
		`, diffFunc, lsnFunc)
		err = db.QueryRow(query, previous["current_lsn"], previous["current_time"]).Scan(&rate, &currentLSN, &currentTime)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Rate (MB/s)", rate, map[string]any{"current_lsn": nullStringToAny(currentLSN), "current_time": currentTime}), nil
}

func pgTempFilesRateChart(db *sql.DB) (map[string]any, error) {
	return lineChart(false, "", "MB/s", nil, false), nil
}

func pgTempFilesRateData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var rate, currentBytes any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`SELECT 0 as rate, sum(temp_bytes) current_temp_bytes, now()::text as current_time FROM pg_stat_database`).Scan(&rate, &currentBytes, &currentTime)
	} else {
		err = db.QueryRow(
			`SELECT round(((sum(temp_bytes) - $1::numeric)/1048576.0)/(extract(epoch from now()::time - $2::time))::numeric,2) as rate, sum(temp_bytes) current_temp_bytes, now()::text as current_time FROM pg_stat_database`,
			previous["current_temp_bytes"], previous["current_time"],
		).Scan(&rate, &currentBytes, &currentTime)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Rate (MB/s)", rate, map[string]any{"current_temp_bytes": currentBytes, "current_time": currentTime}), nil
}

func pgAutovacuumFreezeChart(db *sql.DB) (map[string]any, error) {
	var maxAge string
	if err := db.QueryRow(`SHOW autovacuum_freeze_max_age`).Scan(&maxAge); err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Autovacuum Freeze (autovacuum_freeze_max_age: %s)", maxAge), "%", 100.0, true), nil
}

func pgAutovacuumFreezeData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var perc any
	err := db.QueryRow(`
		SELECT round(max(t.perc::numeric),2) as perc
		FROM (
			SELECT (greatest(age(c.relfrozenxid), age(t.relfrozenxid))::INT8 / current_setting('autovacuum_freeze_max_age')::FLOAT)*100 as perc
			FROM (pg_class c JOIN pg_namespace n ON (c.relnamespace=n.oid))
			LEFT JOIN pg_class t ON c.reltoastrelid = t.oid
			WHERE c.relkind = 'r'
		) t
	`).Scan(&perc)
	if err != nil {
		return nil, err
	}
	return dataResult("Freeze (%)", perc, nil), nil
}

func pgBlockedLocksChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Locks Blocked", "Value", nil, false), nil
}

func pgBlockedLocksData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var count any
	if err := db.QueryRow(`SELECT count(*) AS count FROM pg_catalog.pg_locks blocked_locks WHERE NOT blocked_locks.GRANTED`).Scan(&count); err != nil {
		return nil, err
	}
	return dataResult("Locks Blocked", count, nil), nil
}

func pgDatabaseSizeChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Database Size", "Size (MB)", nil, false), nil
}

func pgDatabaseSizeData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var sumBytes float64
	if err := db.QueryRow(`SELECT sum(pg_database_size(datname)) AS sum FROM pg_stat_database WHERE datname IS NOT NULL`).Scan(&sumBytes); err != nil {
		return nil, err
	}
	return dataResult("Database Size", roundTo(sumBytes/1048576.0, 1), nil), nil
}

func pgDatabaseGrowthChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Database Growth Rate", "MB/s", nil, false), nil
}

func pgDatabaseGrowthData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var growth, currentSum any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`SELECT 0 AS database_growth, sum(pg_database_size(datname)) AS current_sum, now()::text AS current_time FROM pg_stat_database WHERE datname IS NOT NULL`).Scan(&growth, &currentSum, &currentTime)
	} else {
		err = db.QueryRow(
			`SELECT round(((sum(pg_database_size(datname)) - $1::numeric)/1048576.0) / (extract(epoch from now()::time - $2::time))::numeric,2) AS database_growth, sum(pg_database_size(datname)) AS current_sum, now()::text AS current_time FROM pg_stat_database WHERE datname IS NOT NULL`,
			previous["current_sum"], previous["current_time"],
		).Scan(&growth, &currentSum, &currentTime)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Rate", growth, map[string]any{"current_sum": currentSum, "current_time": currentTime}), nil
}

func pgHeapCacheMissChart(db *sql.DB) (map[string]any, error) {
	var dbName string
	if err := db.QueryRow(`SELECT current_database()`).Scan(&dbName); err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Heap Cache Miss Ratio (Database: %s)", dbName), "%", 100.0, false), nil
}

func pgHeapCacheMissData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var reads, hits, missRatio any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`SELECT sum(heap_blks_read) AS current_reads, sum(heap_blks_hit) AS current_hits, now()::time AS current_time, 0.0 AS miss_ratio FROM pg_statio_all_tables`).Scan(&reads, &hits, &currentTime, &missRatio)
	} else {
		prevReads := previous["current_reads"]
		prevTotal := int64ish(previous["current_hits"]) + int64ish(previous["current_reads"])
		err = db.QueryRow(`
			SELECT sum(heap_blks_read) AS current_reads, sum(heap_blks_hit) AS current_hits, now()::time AS current_time,
			CASE (sum(heap_blks_read) + sum(heap_blks_hit) - $2::bigint)
			WHEN 0 THEN 0.0
			ELSE round(((sum(heap_blks_read) - $1::numeric)*100::float / (sum(heap_blks_read) + sum(heap_blks_hit) - $2::bigint))::numeric,2)
			END AS miss_ratio
			FROM pg_statio_all_tables
		`, prevReads, prevTotal).Scan(&reads, &hits, &currentTime, &missRatio)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Miss Ratio", missRatio, map[string]any{"current_reads": reads, "current_hits": hits, "current_time": currentTime}), nil
}

func pgIndexCacheMissChart(db *sql.DB) (map[string]any, error) {
	var dbName string
	if err := db.QueryRow(`SELECT current_database()`).Scan(&dbName); err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Index Cache Miss Ratio (Database: %s)", dbName), "%", 100.0, false), nil
}

func pgIndexCacheMissData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var reads, hits, missRatio any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`SELECT sum(idx_blks_read) AS current_reads, sum(idx_blks_hit) AS current_hits, now()::time AS current_time, 0.0 AS miss_ratio FROM pg_statio_all_tables`).Scan(&reads, &hits, &currentTime, &missRatio)
	} else {
		prevReads := previous["current_reads"]
		prevTotal := int64ish(previous["current_hits"]) + int64ish(previous["current_reads"])
		err = db.QueryRow(`
			SELECT sum(idx_blks_read) AS current_reads, sum(idx_blks_hit) AS current_hits, now()::time AS current_time,
			CASE (sum(idx_blks_read) + sum(idx_blks_hit) - $2::bigint)
			WHEN 0 THEN 0.0
			ELSE round(((sum(idx_blks_read) - $1::numeric)*100::float / (sum(idx_blks_read) + sum(idx_blks_hit) - $2::bigint))::numeric,2)
			END AS miss_ratio
			FROM pg_statio_all_tables
		`, prevReads, prevTotal).Scan(&reads, &hits, &currentTime, &missRatio)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Miss Ratio", missRatio, map[string]any{"current_reads": reads, "current_hits": hits, "current_time": currentTime}), nil
}

func pgSeqScanRatioChart(db *sql.DB) (map[string]any, error) {
	var dbName string
	if err := db.QueryRow(`SELECT current_database()`).Scan(&dbName); err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Seq Scan Ratio (Database: %s)", dbName), "%", 100.0, false), nil
}

func pgSeqScanRatioData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var seq, idx, ratio any
	var currentTime string
	var err error
	if previous == nil {
		err = db.QueryRow(`SELECT sum(seq_scan) as current_seq, sum(idx_scan) as current_idx, now()::time AS current_time, 0.0 AS ratio FROM pg_stat_all_tables`).Scan(&seq, &idx, &currentTime, &ratio)
	} else {
		prevSeq := previous["current_seq"]
		prevTotal := int64ish(previous["current_seq"]) + int64ish(previous["current_idx"])
		err = db.QueryRow(`
			SELECT sum(seq_scan) as current_seq, sum(idx_scan) as current_idx, now()::time AS current_time,
			CASE (sum(seq_scan) + sum(idx_scan) - $2::bigint)
			WHEN 0 THEN 0.0
			ELSE round(((sum(seq_scan) - $1::numeric)*100::float / (sum(seq_scan) + sum(idx_scan) - $2::bigint))::numeric,2)
			END AS ratio
			FROM pg_stat_all_tables
		`, prevSeq, prevTotal).Scan(&seq, &idx, &currentTime, &ratio)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Seq Scan Ratio", ratio, map[string]any{"current_seq": seq, "current_idx": idx, "current_time": currentTime}), nil
}

func pgLongTransactionChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Long Transaction", "Seconds", nil, false), nil
}

// pgLongTransactionData mirrors Unit 12 with one deliberate fix: the
// original Python has no `UNION ALL SELECT 0.0` guard here (unlike the
// otherwise-identical Units 13/14), so it index-errors on the common case
// of "no long transaction running right now". Adding the same guard its
// siblings already use isn't a parity deviation worth preserving as a bug —
// see go-backend-migration memory.
func pgLongTransactionData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	verNum, err := pgServerVersionNum(db)
	if err != nil {
		return nil, err
	}
	filter := "backend_type NOT IN ('walreceiver','walsender','walwriter','autovacuum worker')"
	if verNum < 100000 {
		filter = "query NOT LIKE 'autovacuum: %'"
	}
	query := fmt.Sprintf(`
		SELECT seconds FROM (
			SELECT ROUND(EXTRACT(EPOCH FROM (clock_timestamp()-xact_start))::numeric,2) as seconds
			FROM pg_stat_activity
			WHERE xact_start is not null AND datid is not null AND %s
			UNION ALL SELECT 0.0
		) x ORDER BY seconds DESC LIMIT 1
	`, filter)
	var seconds any
	if err := db.QueryRow(query).Scan(&seconds); err != nil {
		return nil, err
	}
	return dataResult("Seconds", seconds, nil), nil
}

func pgLongQueryChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Long Query", "Seconds", nil, false), nil
}

func pgLongQueryData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	verNum, err := pgServerVersionNum(db)
	if err != nil {
		return nil, err
	}
	filter := "backend_type NOT IN ('walreceiver','walsender','walwriter','autovacuum worker')"
	if verNum < 100000 {
		filter = "query NOT LIKE 'autovacuum: %'"
	}
	query := fmt.Sprintf(`
		SELECT seconds FROM (
			SELECT ROUND(EXTRACT(EPOCH FROM (clock_timestamp()-query_start))::numeric,2) as seconds
			FROM pg_stat_activity
			WHERE state='active' AND query_start is not null AND datid is not null AND %s
			UNION ALL SELECT 0.0
		) x ORDER BY seconds DESC LIMIT 1
	`, filter)
	var seconds any
	if err := db.QueryRow(query).Scan(&seconds); err != nil {
		return nil, err
	}
	return dataResult("Seconds", seconds, nil), nil
}

func pgLongAutovacuumChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Long Autovacuum", "Seconds", nil, false), nil
}

func pgLongAutovacuumData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	verNum, err := pgServerVersionNum(db)
	if err != nil {
		return nil, err
	}
	filter := "backend_type = 'autovacuum worker'"
	if verNum < 100000 {
		filter = "query LIKE 'autovacuum: %'"
	}
	query := fmt.Sprintf(`
		SELECT seconds FROM (
			SELECT ROUND(EXTRACT(EPOCH FROM (clock_timestamp()-query_start))::numeric,2) as seconds
			FROM pg_stat_activity
			WHERE state='active' AND query_start is not null AND datid is not null AND %s
			UNION ALL SELECT 0.0
		) x ORDER BY seconds DESC LIMIT 1
	`, filter)
	var seconds any
	if err := db.QueryRow(query).Scan(&seconds); err != nil {
		return nil, err
	}
	return dataResult("Seconds", seconds, nil), nil
}

func pgCheckpointsChart(db *sql.DB) (map[string]any, error) {
	return lineChart(true, "Checkpoints", "Checkpoints", nil, false), nil
}

func pgCheckpointsData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	isPG17Plus := false
	var probe int
	if err := db.QueryRow(`SELECT 1 FROM pg_class WHERE relname = 'pg_stat_checkpointer'`).Scan(&probe); err == nil {
		isPG17Plus = true
	}
	statTable, colTimed, colReq := "pg_stat_bgwriter", "checkpoints_timed", "checkpoints_req"
	if isPG17Plus {
		statTable, colTimed, colReq = "pg_stat_checkpointer", "num_timed", "num_requested"
	}
	sumExpr := fmt.Sprintf("(%s+%s)", colTimed, colReq)
	var diff, current any
	var err error
	if previous == nil {
		err = db.QueryRow(fmt.Sprintf(`select 0 as checkpoints_diff, %s as current_checkpoints FROM %s`, sumExpr, statTable)).Scan(&diff, &current)
	} else {
		err = db.QueryRow(
			fmt.Sprintf(`select %s - $1::bigint as checkpoints_diff, %s as current_checkpoints FROM %s`, sumExpr, sumExpr, statTable),
			previous["current_checkpoints"],
		).Scan(&diff, &current)
	}
	if err != nil {
		return nil, err
	}
	return dataResult("Checkpoints", diff, map[string]any{"current_checkpoints": current}), nil
}

// --- MySQL built-in unit (id 0) ---

func mysqlThreadCountChart(db *sql.DB) (map[string]any, error) {
	var varName, maxConnStr string
	if err := db.QueryRow(`show variables like "max_connections"`).Scan(&varName, &maxConnStr); err != nil {
		return nil, err
	}
	maxConn, err := strconv.Atoi(strings.TrimSpace(maxConnStr))
	if err != nil {
		return nil, err
	}
	return lineChart(true, fmt.Sprintf("Threads (max_connections: %s)", maxConnStr), "Value", maxConn, false), nil
}

func mysqlThreadCountData(db *sql.DB, previous map[string]any) (map[string]any, error) {
	var varName, value string
	if err := db.QueryRow("show status where `variable_name` = 'Threads_connected'").Scan(&varName, &value); err != nil {
		return nil, err
	}
	// Dataset label kept as "Backends" (not "Thread Count") — verbatim
	// copy-paste artifact in the original Python, preserved rather than
	// "corrected" since it's cosmetic and this port aims for parity.
	return dataResult("Backends", value, nil), nil
}

func nullStringToAny(s sql.NullString) any {
	if !s.Valid {
		return nil
	}
	return s.String
}

var builtinMonitoringUnits = []monitoringUnitDef{
	{ID: 0, PluginName: "postgresql", DBMS: "postgresql", Title: "Transaction Rate", Type: "timeseries", Interval: 10, Default: true, Chart: pgTransactionRateChart, Data: pgTransactionRateData},
	{ID: 1, PluginName: "postgresql", DBMS: "postgresql", Title: "Backends", Type: "timeseries", Interval: 10, Default: true, Chart: pgBackendsChart, Data: pgBackendsData},
	{ID: 2, PluginName: "postgresql", DBMS: "postgresql", Title: "Autovacuum Workers Usage", Type: "timeseries", Interval: 10, Default: true, Chart: pgAutovacuumWorkersChart, Data: pgAutovacuumWorkersData},
	{ID: 3, PluginName: "postgresql", DBMS: "postgresql", Title: "WAL Production Rate", Type: "timeseries", Interval: 10, Default: true, Chart: pgWALProductionRateChart, Data: pgWALProductionRateData},
	{ID: 4, PluginName: "postgresql", DBMS: "postgresql", Title: "Temp Files Creation Rate", Type: "timeseries", Interval: 10, Default: true, Chart: pgTempFilesRateChart, Data: pgTempFilesRateData},
	{ID: 5, PluginName: "postgresql", DBMS: "postgresql", Title: "Autovacuum Freeze", Type: "timeseries", Interval: 10, Default: true, Chart: pgAutovacuumFreezeChart, Data: pgAutovacuumFreezeData},
	{ID: 6, PluginName: "postgresql", DBMS: "postgresql", Title: "Blocked Locks", Type: "timeseries", Interval: 10, Default: true, Chart: pgBlockedLocksChart, Data: pgBlockedLocksData},
	{ID: 7, PluginName: "postgresql", DBMS: "postgresql", Title: "Database Size", Type: "timeseries", Interval: 10, Default: true, Chart: pgDatabaseSizeChart, Data: pgDatabaseSizeData},
	{ID: 8, PluginName: "postgresql", DBMS: "postgresql", Title: "Database Growth Rate", Type: "timeseries", Interval: 10, Default: true, Chart: pgDatabaseGrowthChart, Data: pgDatabaseGrowthData},
	{ID: 9, PluginName: "postgresql", DBMS: "postgresql", Title: "Heap Cache Miss Ratio", Type: "timeseries", Interval: 10, Default: true, Chart: pgHeapCacheMissChart, Data: pgHeapCacheMissData},
	{ID: 10, PluginName: "postgresql", DBMS: "postgresql", Title: "Index Cache Miss Ratio", Type: "timeseries", Interval: 10, Default: true, Chart: pgIndexCacheMissChart, Data: pgIndexCacheMissData},
	{ID: 11, PluginName: "postgresql", DBMS: "postgresql", Title: "Seq Scan Ratio", Type: "timeseries", Interval: 10, Default: true, Chart: pgSeqScanRatioChart, Data: pgSeqScanRatioData},
	{ID: 12, PluginName: "postgresql", DBMS: "postgresql", Title: "Long Transaction", Type: "timeseries", Interval: 10, Default: true, Chart: pgLongTransactionChart, Data: pgLongTransactionData},
	{ID: 13, PluginName: "postgresql", DBMS: "postgresql", Title: "Long Query", Type: "timeseries", Interval: 10, Default: true, Chart: pgLongQueryChart, Data: pgLongQueryData},
	{ID: 14, PluginName: "postgresql", DBMS: "postgresql", Title: "Long Autovacuum", Type: "timeseries", Interval: 10, Default: true, Chart: pgLongAutovacuumChart, Data: pgLongAutovacuumData},
	{ID: 15, PluginName: "postgresql", DBMS: "postgresql", Title: "Checkpoints", Type: "timeseries", Interval: 10, Default: true, Chart: pgCheckpointsChart, Data: pgCheckpointsData},
	{ID: 0, PluginName: "mysql", DBMS: "mysql", Title: "Thread Count", Type: "timeseries", Interval: 10, Default: true, Chart: mysqlThreadCountChart, Data: mysqlThreadCountData},
}
