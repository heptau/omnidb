package main

import "testing"

func TestHostFlagParsing(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"-H", "0.0.0.0"}, "0.0.0.0"},
		{[]string{"--host", "0.0.0.0"}, "0.0.0.0"},
		{[]string{"--host=0.0.0.0"}, "0.0.0.0"},
		{[]string{"-A"}, ""},
		{nil, ""},
	}
	for _, c := range cases {
		if got := hostFlag(c.args); got != c.want {
			t.Errorf("hostFlag(%v) = %q, want %q", c.args, got, c.want)
		}
	}
}

func TestPortFlagParsing(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"-p", "8080"}, "8080"},
		{[]string{"--port", "8080"}, "8080"},
		{[]string{"--port=8080"}, "8080"},
		{nil, ""},
	}
	for _, c := range cases {
		if got := portFlag(c.args); got != c.want {
			t.Errorf("portFlag(%v) = %q, want %q", c.args, got, c.want)
		}
	}
}

func TestListenAddrHonorsHostOutsideAppMode(t *testing.T) {
	got := listenAddr([]string{"-H", "0.0.0.0", "-p", "8080"})
	want := "0.0.0.0:8080"
	if got != want {
		t.Errorf("listenAddr = %q, want %q", got, want)
	}
}

func TestListenAddrForcesLoopbackInAppMode(t *testing.T) {
	got := listenAddr([]string{"-A", "-H", "0.0.0.0", "-p", "8080"})
	want := "127.0.0.1:8080"
	if got != want {
		t.Errorf("listenAddr in app mode = %q, want %q (custom -H must be ignored)", got, want)
	}
}

func TestListenAddrDefaultsToLoopbackAndRandomPort(t *testing.T) {
	got := listenAddr(nil)
	want := "127.0.0.1:0"
	if got != want {
		t.Errorf("listenAddr(nil) = %q, want %q", got, want)
	}
}

func TestIsLoopbackHost(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"127.0.0.1", true},
		{"localhost", true},
		{"::1", true},
		{"0.0.0.0", false},
		{"192.168.1.5", false},
		{"", false},
	}
	for _, c := range cases {
		if got := isLoopbackHost(c.host); got != c.want {
			t.Errorf("isLoopbackHost(%q) = %v, want %v", c.host, got, c.want)
		}
	}
}
