package main

import (
	"encoding/json"
	"testing"
)

func TestFlexIntAcceptsBothForms(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want flexInt
	}{
		{`10`, 10},
		{`"10"`, 10},
		{`0`, 0},
		{`"0"`, 0},
		{`-5`, -5},
		{`"-5"`, -5},
		{`null`, 0},
		{`""`, 0},
	} {
		var got flexInt
		if err := json.Unmarshal([]byte(tc.raw), &got); err != nil {
			t.Fatalf("Unmarshal(%s): unexpected error %v", tc.raw, err)
		}
		if got != tc.want {
			t.Errorf("Unmarshal(%s) = %d, want %d", tc.raw, got, tc.want)
		}
	}
}

func TestFlexIntRejectsNonIntegers(t *testing.T) {
	for _, raw := range []string{`"abc"`, `"1;drop"`, `{}`, `[]`, `true`, `1.5`, `"1.5"`} {
		var got flexInt
		if err := json.Unmarshal([]byte(raw), &got); err == nil {
			t.Errorf("Unmarshal(%s) = %d, want an error", raw, got)
		}
	}
}

// The payloads below are the literal JSON the frontend sends. Every one of them
// used to fail json.Unmarshal and answer "Invalid or missing request data."
// because a <select>.value, an <input>.value and a [][]string result cell are
// all strings in the browser. The frontend sends numbers now; these pin both
// forms so neither side can regress the other into a silent outage.
func TestGroupRequestsDecodeQuotedAndBareIDs(t *testing.T) {
	for _, form := range []string{`"1"`, `1`} {
		var edit editGroupRequest
		if err := json.Unmarshal([]byte(`{"p_id":`+form+`,"p_name":"g1"}`), &edit); err != nil {
			t.Fatalf("edit_group p_id=%s: %v", form, err)
		}
		if edit.PID != 1 || edit.PName != "g1" {
			t.Errorf("edit_group p_id=%s: got %d/%q", form, edit.PID, edit.PName)
		}

		var del deleteGroupRequest
		if err := json.Unmarshal([]byte(`{"p_id":`+form+`}`), &del); err != nil {
			t.Fatalf("delete_group p_id=%s: %v", form, err)
		}
		if del.PID != 1 {
			t.Errorf("delete_group p_id=%s: got %d", form, del.PID)
		}

		var save saveGroupConnectionsRequest
		raw := `{"p_group":` + form + `,"p_conn_data_list":[{"id":7,"selected":true}]}`
		if err := json.Unmarshal([]byte(raw), &save); err != nil {
			t.Fatalf("save_group_connections p_group=%s: %v", form, err)
		}
		if save.PGroup != 1 || len(save.PConnDataList) != 1 || save.PConnDataList[0].ID != 7 {
			t.Errorf("save_group_connections p_group=%s: got %+v", form, save)
		}
	}
}

func TestKillBackendRequestsDecodeQuotedAndBarePIDs(t *testing.T) {
	for _, form := range []string{`"4711"`, `4711`} {
		var pg pgKillBackendRequest
		if err := json.Unmarshal([]byte(`{"p_pid":`+form+`}`), &pg); err != nil {
			t.Fatalf("kill_backend_postgresql p_pid=%s: %v", form, err)
		}
		if pg.PPid != 4711 {
			t.Errorf("kill_backend_postgresql p_pid=%s: got %d", form, pg.PPid)
		}

		var my killBackendRequest
		if err := json.Unmarshal([]byte(`{"p_pid":`+form+`}`), &my); err != nil {
			t.Fatalf("kill_backend_mysql p_pid=%s: %v", form, err)
		}
		if my.PPid != 4711 {
			t.Errorf("kill_backend_mysql p_pid=%s: got %d", form, my.PPid)
		}
	}

	// Oracle is the exception and must stay a string: tree_oracle.js sends
	// "sid,serial#", not a pid. verifiedOracleSessionID parses the two halves.
	var ora killBackendOracleRequest
	if err := json.Unmarshal([]byte(`{"p_pid":"123,456"}`), &ora); err != nil {
		t.Fatalf("kill_backend_oracle: %v", err)
	}
	if ora.PPid != "123,456" {
		t.Errorf("kill_backend_oracle: got %q", ora.PPid)
	}
}

func TestMonitorIntervalRequestsDecodeQuotedAndBareValues(t *testing.T) {
	for _, form := range []string{`"30"`, `30`} {
		var upd updateSavedMonitorUnitIntervalRequest
		if err := json.Unmarshal([]byte(`{"p_saved_id":2,"p_interval":`+form+`}`), &upd); err != nil {
			t.Fatalf("update_saved_monitor_unit_interval p_interval=%s: %v", form, err)
		}
		if upd.PSavedID != 2 || upd.PInterval != 30 {
			t.Errorf("update_saved_monitor_unit_interval p_interval=%s: got %+v", form, upd)
		}

		var save saveMonitorUnitRequest
		raw := `{"p_unit_name":"u","p_unit_type":"grid","p_unit_interval":` + form + `}`
		if err := json.Unmarshal([]byte(raw), &save); err != nil {
			t.Fatalf("save_monitor_unit p_unit_interval=%s: %v", form, err)
		}
		if save.PUnitInterval == nil || *save.PUnitInterval != 30 {
			t.Errorf("save_monitor_unit p_unit_interval=%s: got %v", form, save.PUnitInterval)
		}
	}

	// A blank interval input sends null, and the handler substitutes its own 30
	// second default rather than storing a 0 that would poll in a tight loop.
	var save saveMonitorUnitRequest
	if err := json.Unmarshal([]byte(`{"p_unit_name":"u","p_unit_interval":null}`), &save); err != nil {
		t.Fatalf("save_monitor_unit p_unit_interval=null: %v", err)
	}
	if save.PUnitInterval != nil {
		t.Errorf("save_monitor_unit p_unit_interval=null: got %v, want nil", save.PUnitInterval)
	}
}
