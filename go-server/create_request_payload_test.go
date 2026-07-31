package main

import (
	"encoding/json"
	"testing"
)

// The payloads below are the literal objects edit_data.js builds and posts to
// /create_request/. They are here because handleCreateRequest treats a decode
// failure the same as an unrecognized v_code -- both fall through to
// noUpstreamHandler and tell the user "This feature is not available." -- so
// a type mismatch between these structs and the frontend takes out an entire
// feature with no error anywhere. That is exactly what v_count did: the
// dropdown's .value is the string "10", the struct field was an int, and Edit
// Data had never worked against the Go backend for any engine.
//
// None of this is engine-specific; the payload is built once in edit_data.js
// and used for PostgreSQL, MySQL, MariaDB, Oracle and SQLite alike.

// queryEditData()'s v_message_data, with v_count as the <select> yields it.
const editDataFetchPayloadFromSelect = `{
	"v_table": "customer",
	"v_schema": "app",
	"v_db_index": "6",
	"v_filter": "",
	"v_count": "10",
	"v_pk_list": [{"v_column": "id", "v_type": "bigint"}],
	"v_columns": [{"v_column": "id", "v_type": "bigint"}, {"v_column": "name", "v_type": "text"}],
	"v_conn_tab_id": "tab5",
	"v_tab_id": "tab7"
}`

// saveEditData()'s v_message_data: one updated row and one inserted row.
const editDataSavePayload = `{
	"v_table": "customer",
	"v_schema": "app",
	"v_db_index": "6",
	"v_data_rows": [["1", "Renamed", null], [null, "Inserted", "i@example.test"]],
	"v_rows_info": [
		{"mode": 1, "old_mode": -1, "index": 0, "changed_cols": [1], "pk": [{"v_column": "id", "v_value": "1"}]},
		{"mode": 2, "old_mode": -1, "index": 1, "changed_cols": [], "pk": null}
	],
	"v_pk_info": [{"v_column": "id", "v_type": "bigint"}],
	"v_columns": [{"v_column": "id", "v_type": "bigint"}, {"v_column": "name", "v_type": "text"}],
	"v_conn_tab_id": "tab5",
	"v_tab_id": "tab7"
}`

func TestEditDataFetchPayloadDecodes(t *testing.T) {
	var q editDataFetchRequestData
	if err := json.Unmarshal([]byte(editDataFetchPayloadFromSelect), &q); err != nil {
		t.Fatalf("edit-data fetch payload rejected: %v", err)
	}
	if q.VTable != "customer" || q.VSchema != "app" {
		t.Errorf("table/schema = %q/%q, want customer/app", q.VTable, q.VSchema)
	}
	if q.VDBIndex.String() != "6" {
		t.Errorf("v_db_index = %q, want 6", q.VDBIndex.String())
	}
	if got := q.rowLimit(); got != 10 {
		t.Errorf("rowLimit() = %d, want 10", got)
	}
	if len(q.VPKList) != 1 || q.VPKList[0].VColumn != "id" {
		t.Errorf("v_pk_list = %+v", q.VPKList)
	}
	if len(q.VColumns) != 2 {
		t.Errorf("v_columns has %d entries, want 2", len(q.VColumns))
	}
}

// The dropdown offers 10/100/1000 as strings; a bare number has to keep
// working too, since that is what the fixed frontend now sends.
func TestEditDataFetchRowLimit(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int
	}{
		{`"10"`, 10},
		{`"100"`, 100},
		{`"1000"`, 1000},
		{`10`, 10},
		{`1000`, 1000},
		// Decodes fine but is not a usable limit: fall back to the dropdown's
		// own default rather than fetching the whole table.
		{`null`, 10},
		{`"0"`, 10},
		{`"-5"`, 10},
	} {
		var q editDataFetchRequestData
		if err := json.Unmarshal([]byte(`{"v_count":`+tc.raw+`}`), &q); err != nil {
			t.Errorf("v_count %s rejected: %v", tc.raw, err)
			continue
		}
		if got := q.rowLimit(); got != tc.want {
			t.Errorf("v_count %s -> rowLimit() = %d, want %d", tc.raw, got, tc.want)
		}
	}
}

// Where json.Number's tolerance stops. Neither of these is reachable from the
// UI -- the dropdown has three fixed numeric options and the frontend now
// parses it to a number besides -- but the boundary is worth pinning down,
// because on this side of it a request is rejected wholesale and the user
// gets the same unhelpful "This feature is not available." Unlike before,
// decodeRequestData at least logs the reason.
func TestEditDataFetchRowLimitRejectsNonNumericStrings(t *testing.T) {
	for _, raw := range []string{`""`, `"abc"`, `"10 rows"`} {
		var q editDataFetchRequestData
		if err := json.Unmarshal([]byte(`{"v_count":`+raw+`}`), &q); err == nil {
			t.Errorf("v_count %s decoded, want a decode error", raw)
		}
	}
}

func TestEditDataSavePayloadDecodes(t *testing.T) {
	var q editDataSaveRequestData
	if err := json.Unmarshal([]byte(editDataSavePayload), &q); err != nil {
		t.Fatalf("edit-data save payload rejected: %v", err)
	}
	if len(q.VDataRows) != 2 {
		t.Fatalf("v_data_rows has %d rows, want 2", len(q.VDataRows))
	}
	// A NULL cell arrives as JSON null and has to stay distinguishable from
	// the empty string -- hence [][]*string rather than [][]string.
	if q.VDataRows[0][2] != nil {
		t.Errorf("v_data_rows[0][2] = %v, want nil", *q.VDataRows[0][2])
	}
	if len(q.VRowsInfo) != 2 {
		t.Fatalf("v_rows_info has %d entries, want 2", len(q.VRowsInfo))
	}
	if q.VRowsInfo[0].Mode != 1 || len(q.VRowsInfo[0].PK) != 1 {
		t.Errorf("v_rows_info[0] = %+v", q.VRowsInfo[0])
	}
	// An inserted row has no primary key yet.
	if q.VRowsInfo[1].Mode != 2 || q.VRowsInfo[1].PK != nil {
		t.Errorf("v_rows_info[1] = %+v", q.VRowsInfo[1])
	}
}
