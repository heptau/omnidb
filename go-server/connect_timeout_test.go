package main

import (
	"net"
	"strings"
	"testing"
	"time"
)

// A server that accepts the TCP connection and then never answers must fail
// within the connect timeout instead of hanging.
func TestOpenPostgreSQLTargetTimesOut(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	prev := connectTimeout
	connectTimeout = time.Second
	defer func() { connectTimeout = prev }()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer c.Close()
		}
	}()
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	start := time.Now()
	_, err = openPostgreSQLTarget(&ConnectionInfo{Technology: "postgresql", Server: host, Port: port, Database: "x", Username: "u", Password: "p"})
	if err == nil {
		t.Fatal("expected an error")
	}
	if elapsed := time.Since(start); elapsed > connectTimeout+3*time.Second {
		t.Errorf("took %v", elapsed)
	}
	if !strings.Contains(err.Error(), "seconds") && !strings.Contains(err.Error(), "context") {
		t.Logf("error = %v", err)
	}
}
