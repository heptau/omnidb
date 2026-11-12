package main

import (
	"testing"
	"time"
)

func TestFormatFloat(t *testing.T) {
	for in, want := range map[float64]string{
		0:         "0",
		1.5:       "1.5",
		1234567:   "1234567",
		2500000:   "2500000",
		-0.000123: "-0.000123",
		1e-7:      "1e-07",
		1e21:      "1e+21",
	} {
		if got := formatFloat(in); got != want {
			t.Errorf("formatFloat(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestTypedDisplayValue(t *testing.T) {
	midnight := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	withTime := time.Date(2024, 1, 15, 9, 30, 5, 250000000, time.UTC)
	for _, c := range []struct {
		v      any
		dbType string
		want   string
	}{
		{midnight, "DATE", "2024-01-15"},
		{withTime, "DATE", "2024-01-15 09:30:05"},
		{midnight, "TIMESTAMP", "2024-01-15 00:00:00"},
		{withTime, "DATETIME2", "2024-01-15 09:30:05.25"},
		{withTime, "TIMESTAMPTZ", "2024-01-15 09:30:05.25+00:00"},
		{withTime, "", "2024-01-15 09:30:05.25+00:00"},
		{float64(float32(0.1)), "FLOAT4", "0.1"},
		{float64(float32(0.1)), "FLOAT8", "0.10000000149011612"},
		{float32(1000000), "", "1000000"},
	} {
		if got := formatSQLValue(typedDisplayValue(c.v, c.dbType)); got != c.want {
			t.Errorf("%v as %q = %q, want %q", c.v, c.dbType, got, c.want)
		}
	}
}
