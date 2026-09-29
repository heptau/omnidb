package main

import "testing"

func TestQuoteEditDataColumnNeutralizesHostileNames(t *testing.T) {
	cases := []struct{ tech, in, want string }{
		{"mysql", "c=(select 1),d", "`c=(select 1),d`"},
		{"mysql", "a`b", "`a``b`"},
		{"mssql", "1;ALTER SERVER ROLE sysadmin ADD MEMBER evil;--", "[1;ALTER SERVER ROLE sysadmin ADD MEMBER evil;--]"},
		{"mssql", "a]b", "[a]]b]"},
		{"oracle", "ATTACKER.F()", `"ATTACKER.F()"`},
		{"oracle", `"mixedCase"`, `"mixedCase"`},
		{"firebird", `A"B`, `"A""B"`},
		{"sqlite", `x" from t; --`, `"x"" from t; --"`},
		{"postgresql", `"Already"`, `"Already"`},
	}
	for _, c := range cases {
		if got := quoteEditDataColumn(c.tech, c.in); got != c.want {
			t.Errorf("quoteEditDataColumn(%q, %q) = %q, want %q", c.tech, c.in, got, c.want)
		}
	}
}

func TestSaveEditDataRowsRejectsOutOfRangeIndexes(t *testing.T) {
	v := "1"
	rows := [][]*string{{nil, &v}}
	pk := []editDataPKValue{{VColumn: "id", VValue: "1"}}
	bad := []editDataRowInfo{
		{Mode: 1, PK: pk, ChangedCols: []int{5}},
		{Mode: 1, PK: pk, ChangedCols: []int{-1}},
		{Mode: 2},
		{Mode: -1},
	}
	for i, info := range bad {
		idx := 0
		if info.Mode == 2 {
			idx = 3 // no such data row
		}
		if err := validateEditDataRowShape(info, idx, rows, 1); err == nil {
			t.Errorf("case %d: expected an error", i)
		}
	}
	if err := validateEditDataRowShape(editDataRowInfo{Mode: 1, PK: pk, ChangedCols: []int{0}}, 0, rows, 1); err != nil {
		t.Errorf("valid row rejected: %v", err)
	}
}
