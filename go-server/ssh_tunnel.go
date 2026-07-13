package main

import (
	"io"
	"net"

	"golang.org/x/crypto/ssh"
)

// openSSHForward opens a local TCP listener that forwards every accepted
// connection through the given SSH client to remoteAddr — the Go
// equivalent of Python's sshtunnel.SSHTunnelForwarder (local_bind_port),
// used by test_connection's tunneled-connection path (see
// test_connection.go). Returns the local address a database/sql driver can
// dial instead of the real remote address, and a close function that stops
// accepting new forwarded connections.
func openSSHForward(client *ssh.Client, remoteAddr string) (localAddr string, closeFn func(), err error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go forwardConn(conn, client, remoteAddr)
		}
	}()
	return listener.Addr().String(), func() { listener.Close() }, nil
}

// forwardConn bridges one accepted local connection to a freshly dialed
// channel over the SSH client, copying bytes in both directions until
// either side closes — the same shape as every textbook SSH local port
// forward implementation.
func forwardConn(local net.Conn, client *ssh.Client, remoteAddr string) {
	defer local.Close()
	remote, err := client.Dial("tcp", remoteAddr)
	if err != nil {
		return
	}
	defer remote.Close()

	done := make(chan struct{}, 2)
	go func() { io.Copy(remote, local); done <- struct{}{} }()
	go func() { io.Copy(local, remote); done <- struct{}{} }()
	<-done
}
