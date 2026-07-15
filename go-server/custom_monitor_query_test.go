package main

import (
	"database/sql"
	"testing"
)

func TestIsReadOnlyQuery(t *testing.T) {
	cases := []struct {
		sql  string
		want bool
	}{
		{"SELECT 1", true},
		{"select * from foo", true},
		{"  \n\t SELECT 1", true},
		{"-- a comment\nSELECT 1", true},
		{"/* block comment */ SELECT 1", true},
		{"-- a comment\n/* another */\nWITH x AS (SELECT 1) SELECT * FROM x", true},
		{"DELETE FROM foo", false},
		{"UPDATE foo SET x = 1", false},
		{"DROP TABLE foo", false},
		{"INSERT INTO foo VALUES (1)", false},
		{"", false},
		{"-- only a comment, no query", false},
		{"/* unterminated", false},
	}
	for _, c := range cases {
		if got := isReadOnlyQuery(c.sql); got != c.want {
			t.Errorf("isReadOnlyQuery(%q) = %v, want %v", c.sql, got, c.want)
		}
	}
}

func openTestSQLite(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestRunCustomMonitorQueryRejectsWrites(t *testing.T) {
	db := openTestSQLite(t)
	if _, err := runCustomMonitorQuery(db, "grid", "", "DELETE FROM sqlite_master", nil); err == nil {
		t.Error("expected an error rejecting a non-read-only query, got nil")
	}
}

func TestRunCustomMonitorQueryGrid(t *testing.T) {
	db := openTestSQLite(t)
	if _, err := db.Exec(`CREATE TABLE t (id INTEGER, name TEXT)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO t VALUES (1, 'a'), (2, 'b')`); err != nil {
		t.Fatalf("insert: %v", err)
	}

	object, err := runCustomMonitorQuery(db, "grid", "", "SELECT id, name FROM t ORDER BY id", nil)
	if err != nil {
		t.Fatalf("runCustomMonitorQuery: %v", err)
	}
	cols, ok := object["columns"].([]string)
	if !ok || len(cols) != 2 {
		t.Fatalf("expected 2 columns, got %#v", object["columns"])
	}
	data, ok := object["data"].([][]string)
	if !ok || len(data) != 2 {
		t.Fatalf("expected 2 rows, got %#v", object["data"])
	}
	if data[0][1] != "a" || data[1][1] != "b" {
		t.Errorf("unexpected grid data: %#v", data)
	}
}

func TestRunCustomMonitorQueryTimeseries(t *testing.T) {
	db := openTestSQLite(t)

	// First call (previous == nil) must return a full Chart.js config.
	object, err := runCustomMonitorQuery(db, "timeseries", "", "SELECT 42 AS value", nil)
	if err != nil {
		t.Fatalf("runCustomMonitorQuery: %v", err)
	}
	if object["type"] != "line" {
		t.Errorf("expected first-call result to be a full chart config with type=line, got %#v", object["type"])
	}
	data, ok := object["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected first-call result to have a nested data object, got %#v", object)
	}
	datasets, ok := data["datasets"].([]any)
	if !ok || len(datasets) != 1 {
		t.Fatalf("expected 1 dataset, got %#v", data["datasets"])
	}

	// Subsequent call (previous != nil) must return the flat shape.
	object2, err := runCustomMonitorQuery(db, "timeseries", "", "SELECT 43 AS value", map[string]any{"anything": true})
	if err != nil {
		t.Fatalf("runCustomMonitorQuery (2nd call): %v", err)
	}
	if _, hasType := object2["type"]; hasType {
		t.Errorf("expected subsequent-call result to be flat (no 'type' field), got %#v", object2)
	}
	if _, hasLabels := object2["labels"]; !hasLabels {
		t.Errorf("expected subsequent-call result to have a top-level 'labels' field, got %#v", object2)
	}
}

func TestRunCustomMonitorQueryTimeseriesRejectsMultipleRows(t *testing.T) {
	db := openTestSQLite(t)
	_, err := runCustomMonitorQuery(db, "timeseries", "", "SELECT 1 AS value UNION ALL SELECT 2", nil)
	if err == nil {
		t.Error("expected an error for a timeseries query returning more than one row, got nil")
	}
}

func TestRunCustomMonitorQueryChart(t *testing.T) {
	db := openTestSQLite(t)
	if _, err := db.Exec(`CREATE TABLE dbs (name TEXT, size REAL)`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO dbs VALUES ('a', 10.5), ('b', 20.0)`); err != nil {
		t.Fatalf("insert: %v", err)
	}

	object, err := runCustomMonitorQuery(db, "chart", "pie", "SELECT name, size FROM dbs ORDER BY name", nil)
	if err != nil {
		t.Fatalf("runCustomMonitorQuery: %v", err)
	}
	if object["type"] != "pie" {
		t.Errorf("expected chart type 'pie', got %#v", object["type"])
	}
	data := object["data"].(map[string]any)
	labels := data["labels"].([]any)
	if len(labels) != 2 || labels[0] != "a" || labels[1] != "b" {
		t.Errorf("unexpected labels: %#v", labels)
	}
	datasets := data["datasets"].([]any)
	if len(datasets) != 1 {
		t.Fatalf("expected 1 dataset (1 value column), got %d", len(datasets))
	}

	// Subsequent call must be flat.
	object2, err := runCustomMonitorQuery(db, "chart", "pie", "SELECT name, size FROM dbs ORDER BY name", map[string]any{"x": true})
	if err != nil {
		t.Fatalf("runCustomMonitorQuery (2nd call): %v", err)
	}
	if _, hasType := object2["type"]; hasType {
		t.Errorf("expected subsequent-call result to be flat, got %#v", object2)
	}
}

func TestRunCustomMonitorQueryChartRequiresTwoColumns(t *testing.T) {
	db := openTestSQLite(t)
	_, err := runCustomMonitorQuery(db, "chart", "", "SELECT 1 AS only_col", nil)
	if err == nil {
		t.Error("expected an error for a chart query with only 1 column, got nil")
	}
}

func TestRunCustomMonitorQueryUnknownType(t *testing.T) {
	db := openTestSQLite(t)
	_, err := runCustomMonitorQuery(db, "graph", "", "SELECT 1", nil)
	if err == nil {
		t.Error("expected an error for an unsupported unit type (graph), got nil")
	}
}
