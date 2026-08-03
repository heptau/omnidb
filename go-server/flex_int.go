package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
)

// flexInt is an integer request field that accepts both 10 and "10".
//
// The browser has no integer type at the boundary these handlers sit on. A
// <select>.value and an <input>.value are always strings, and query results
// cross the wire as [][]string, so a row's backend pid arrives quoted too. The
// frontend hands several of those straight to JSON.stringify.
//
// encoding/json never coerces a JSON string into an int field, so one quoted
// number failed the whole json.Unmarshal and the handler answered
// writeBadRequest -- "Invalid or missing request data." -- with nothing logged
// anywhere. That is how Rename group, Delete group, Manage connections > Save
// changes, both monitoring interval inputs and Terminate backend on
// PostgreSQL/MySQL/MariaDB were all silently broken by the Go migration. Same
// shape as edit data's v_count; see rowLimit in longpolling.go.
//
// The frontend sends real numbers now. This exists so the next call site that
// forgets produces a working feature rather than a dead one.
type flexInt int64

// UnmarshalJSON accepts a JSON number, a quoted number, or null. null and ""
// leave the value at its zero, which matches what an omitted field would do.
func (f *flexInt) UnmarshalJSON(b []byte) error {
	if bytes.Equal(b, []byte("null")) {
		return nil
	}

	s := string(b)
	if len(s) >= 2 && s[0] == '"' {
		var quoted string
		if err := json.Unmarshal(b, &quoted); err != nil {
			return err
		}
		if quoted == "" {
			return nil
		}
		s = quoted
	}

	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fmt.Errorf("flexInt: %s is not an integer", string(b))
	}
	*f = flexInt(n)
	return nil
}
