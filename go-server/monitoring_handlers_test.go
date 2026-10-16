package main

import (
	"encoding/json"
	"testing"
)

// A custom grid unit's echoed object_data is its row array, not an object —
// it must not fail decoding the whole refresh request.
func TestRefreshMonitorUnitsRequestAcceptsGridObjectData(t *testing.T) {
	raw := `{"p_ids":[
		{"saved_id":1,"id":1,"plugin_name":"","object_data":[["public.ev","2026-10-14"]]},
		{"saved_id":2,"id":0,"plugin_name":"postgresql","object_data":{"current_sum":1}},
		{"saved_id":3,"id":1,"plugin_name":"postgresql","object_data":null}
	]}`
	var req refreshMonitorUnitsRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if req.PIDs[0].ObjectData != nil {
		t.Errorf("expected array object_data to decode as no previous state, got %#v", req.PIDs[0].ObjectData)
	}
	if req.PIDs[1].ObjectData["current_sum"] != 1.0 {
		t.Errorf("expected object object_data to be kept, got %#v", req.PIDs[1].ObjectData)
	}
	if req.PIDs[2].ObjectData != nil {
		t.Errorf("expected null object_data to stay nil, got %#v", req.PIDs[2].ObjectData)
	}
}
