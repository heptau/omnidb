package main

import (
	"path/filepath"
	"testing"
)

// TestRunNativeQueryAllDataResumesFromOpenCursor is a regression test for the
// "Fetch all" bug: clicking it after some rows were already fetched (mode 0's
// initial block, or a prior mode 1) used to re-run the query from scratch,
// duplicating every row already delivered to the frontend grid. Fetch-all
// must instead continue the same open cursor mode 0 left behind, returning
// only the remaining rows.
func TestRunNativeQueryAllDataResumesFromOpenCursor(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "fetch_all_test.sqlite")
	db, err := openSQLiteTarget(dbPath)
	if err != nil {
		t.Fatalf("openSQLiteTarget: %v", err)
	}
	if _, err := db.Exec("create table t (n integer)"); err != nil {
		t.Fatalf("create table: %v", err)
	}
	const totalRows = 25
	for i := 0; i < totalRows; i++ {
		if _, err := db.Exec("insert into t (n) values (?)", i); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	db.Close()

	const clientID = "test-client-fetch-all"
	const tabID = "test-tab-fetch-all"
	cookie := nativeSessionCookieName + "=" + clientID

	freshDB, err := openSQLiteTarget(dbPath)
	if err != nil {
		t.Fatalf("openSQLiteTarget: %v", err)
	}
	cursor, err := startCursor(clientID, tabID, freshDB, "select n from t order by n", true)
	if err != nil {
		t.Fatalf("startCursor: %v", err)
	}
	defer closeCursor(clientID, tabID)

	// Mimic mode 0 only ever rendering the first block (10 of the 25 rows) —
	// same as the frontend's interactive 100-row block, just smaller so the
	// test doesn't need thousands of rows.
	firstBlock, lastBlock, err := cursor.fetchBlock(10)
	if err != nil {
		t.Fatalf("fetchBlock: %v", err)
	}
	if len(firstBlock) != 10 || lastBlock {
		t.Fatalf("expected first block of 10 with more remaining, got %d rows, lastBlock=%v", len(firstBlock), lastBlock)
	}

	q := queryRequestData{VMode: 2, VTabID: tabID}
	runNativeQueryAllData(nil, cookie, clientID, q, 1)

	// Drain every response runNativeQueryAllData queued for this client.
	pc := getPollingClient(clientID)
	pc.mu.Lock()
	responses := pc.returning
	pc.mu.Unlock()

	var fetchedAll [][]string
	sawLastBlock := false
	for _, resp := range responses {
		if resp["v_error"] == true {
			t.Fatalf("unexpected error response: %+v", resp)
		}
		data, _ := resp["v_data"].(map[string]any)
		rows, _ := data["v_data"].([][]string)
		fetchedAll = append(fetchedAll, rows...)
		if data["v_last_block"] == true {
			sawLastBlock = true
		}
	}
	if !sawLastBlock {
		t.Fatalf("never received a v_last_block=true response")
	}

	remaining := totalRows - len(firstBlock)
	if len(fetchedAll) != remaining {
		t.Fatalf("Fetch all returned %d rows, want exactly the %d rows not already fetched by mode 0 (got total-with-mode0 overlap: mode0=%d, fetch-all=%d, expected non-overlapping)",
			len(fetchedAll), remaining, len(firstBlock), len(fetchedAll))
	}

	seen := map[string]bool{}
	for _, row := range firstBlock {
		seen[row[0]] = true
	}
	for _, row := range fetchedAll {
		if seen[row[0]] {
			t.Fatalf("row %v was already delivered by mode 0's first block and came back again from Fetch all — this is the duplicate-rows bug", row)
		}
		seen[row[0]] = true
	}
	if len(seen) != totalRows {
		t.Fatalf("got %d distinct rows total, want %d", len(seen), totalRows)
	}
}

// TestRunNativeQueryAllDataNoOpenCursor covers clicking Fetch all when the
// tab's cursor has already been exhausted and closed (e.g. autocommit ran
// the whole result set to completion already) — it must report an empty
// last block rather than re-running the query and duplicating everything.
func TestRunNativeQueryAllDataNoOpenCursor(t *testing.T) {
	const clientID = "test-client-fetch-all-noop"
	cookie := nativeSessionCookieName + "=" + clientID
	q := queryRequestData{VMode: 2, VTabID: "nonexistent-tab"}

	runNativeQueryAllData(nil, cookie, clientID, q, 1)

	pc := getPollingClient(clientID)
	pc.mu.Lock()
	responses := pc.returning
	pc.mu.Unlock()

	if len(responses) != 1 {
		t.Fatalf("expected exactly one response, got %d", len(responses))
	}
	data, _ := responses[0]["v_data"].(map[string]any)
	rows, _ := data["v_data"].([][]string)
	if len(rows) != 0 {
		t.Fatalf("expected zero rows when no cursor is open, got %d", len(rows))
	}
	if data["v_last_block"] != true {
		t.Fatalf("expected v_last_block=true, got %+v", data["v_last_block"])
	}
}
