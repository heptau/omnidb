package main

import (
	"encoding/json"
	"testing"
)

// The payload below is literally what users.js's saveUsers() sends. The "new"
// half used to be declared [][]string, so the JSON number in the is_superuser
// position failed json.Unmarshal and the handler answered "Invalid or missing
// request data." — discarding the edits in the same request too.
func TestSaveUsersDecodesMixedTypeRows(t *testing.T) {
	raw := `{
		"p_data": {
			"edited": [["admin", "newpass", 1]],
			"new": [["tester", "testpass", 1], ["", "", 0]]
		},
		"p_user_id_list": [1]
	}`

	var req saveUsersRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	if len(req.PData.Edited) != 1 {
		t.Fatalf("edited: got %d rows, want 1", len(req.PData.Edited))
	}
	if name, _ := req.PData.Edited[0][0].(string); name != "admin" {
		t.Errorf("edited username: got %v", req.PData.Edited[0][0])
	}
	if flag, _ := req.PData.Edited[0][2].(float64); flag != 1 {
		t.Errorf("edited is_superuser: got %v (%T)", req.PData.Edited[0][2], req.PData.Edited[0][2])
	}

	if len(req.PData.New) != 2 {
		t.Fatalf("new: got %d rows, want 2", len(req.PData.New))
	}
	if name, _ := req.PData.New[0][0].(string); name != "tester" {
		t.Errorf("new username: got %v", req.PData.New[0][0])
	}
	if pwd, _ := req.PData.New[0][1].(string); pwd != "testpass" {
		t.Errorf("new password: got %v", req.PData.New[0][1])
	}
	// The second row is what "Add new user" leaves behind before the form is
	// filled in. It has to decode, and the handler skips it on the blank name.
	if name, _ := req.PData.New[1][0].(string); name != "" {
		t.Errorf("unfilled new row: got %v, want an empty username", req.PData.New[1][0])
	}

	if len(req.PUserIDList) != 1 || req.PUserIDList[0] != 1 {
		t.Errorf("p_user_id_list: got %v", req.PUserIDList)
	}
}

// remove_user's p_id used to be declared `string`, because the id arrived as a
// quoted literal inside the server-generated onclick HTML. users.js binds the
// button itself now and passes a real number.
func TestRemoveUserAcceptsBothIDForms(t *testing.T) {
	for _, raw := range []string{`{"p_id":2}`, `{"p_id":"2"}`} {
		var req removeUserRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			t.Fatalf("Unmarshal(%s): %v", raw, err)
		}
		if req.PID != 2 {
			t.Errorf("Unmarshal(%s): got %d, want 2", raw, req.PID)
		}
	}
}

// get_users no longer sends the remove button as a ready-made HTML string in a
// fourth column; users.js builds and binds that icon itself, from v_user_ids.
// The row is three columns, and save_users' "edited" branch reads exactly those.
func TestSaveUsersEditedAcceptsThreeColumnRows(t *testing.T) {
	var req saveUsersRequest
	raw := `{"p_data":{"edited":[["admin","",1]],"new":[]},"p_user_id_list":[1]}`
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if len(req.PData.Edited[0]) != 3 {
		t.Fatalf("edited row width: got %d, want 3", len(req.PData.Edited[0]))
	}
}
