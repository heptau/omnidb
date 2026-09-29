package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"
)

// minCLIPasswordLength is the shortest password --set-password accepts.
const minCLIPasswordLength = 8

// setPasswordFlag returns the username given to --set-password (either
// "--set-password NAME" or "--set-password=NAME"), and whether the flag was
// present at all.
func setPasswordFlag(args []string) (string, bool) {
	for i, a := range args {
		if a == "--set-password" {
			if i+1 < len(args) {
				return args[i+1], true
			}
			return "", true
		}
		if v, ok := strings.CutPrefix(a, "--set-password="); ok {
			return v, true
		}
	}
	return "", false
}

// runSetPasswordCommand implements `omnidb-server --set-password <user>
// [-d <homedir>]`: sets an OmniDB user's password directly in the app
// database and exits, without starting the server — the recovery path for a
// server-mode install whose one-time initial admin password was lost (or
// never seen), and a quick way to set a real one before first sign-in.
//
// The password is never taken from the command line (it would be visible
// in `ps` and shell history): it's prompted for twice with echo disabled
// when stdin is a terminal, or read as the first line of stdin otherwise
// (`printf '%s\n' "$PW" | omnidb-server --set-password admin`).
//
// Refused in desktop mode (-A): the desktop app signs in as admin/admin
// automatically, so changing that password there would lock the app out.
func runSetPasswordCommand(args []string) error {
	username, _ := setPasswordFlag(args)
	if username == "" {
		return errors.New("usage: omnidb-server --set-password <username> [-d <homedir>]")
	}
	if isAppMode(args) {
		return errors.New("--set-password is for server mode; the desktop app (-A) signs in automatically")
	}

	password, err := readNewPassword(os.Stdin, os.Stderr)
	if err != nil {
		return err
	}
	if len([]rune(password)) < minCLIPasswordLength {
		return fmt.Errorf("password must be at least %d characters", minCLIPasswordLength)
	}

	db, err := openAppDB(nil)
	if err != nil {
		return err
	}
	defer db.Close()

	user, err := lookupAppUser(db, username)
	if err != nil {
		return fmt.Errorf("no such user: %s", username)
	}
	if err := setUserPassword(db, user.ID, password); err != nil {
		return err
	}
	path, _ := resolveAppDBPath(nil)
	fmt.Fprintf(os.Stderr, "omnidb-server: password for %q updated in %s\n", username, path)
	fmt.Fprintln(os.Stderr, "omnidb-server: sessions already signed in to a running server stay valid until they expire or it restarts")
	return nil
}

// readNewPassword prompts twice without echo on a terminal, or reads one
// line from a pipe/file.
func readNewPassword(in *os.File, prompt io.Writer) (string, error) {
	fd := int(in.Fd())
	if !term.IsTerminal(fd) {
		line, err := bufio.NewReader(in).ReadString('\n')
		if err != nil && !(errors.Is(err, io.EOF) && line != "") {
			return "", errors.New("no password on stdin")
		}
		return strings.TrimRight(line, "\r\n"), nil
	}
	fmt.Fprint(prompt, "New password: ")
	first, err := term.ReadPassword(fd)
	fmt.Fprintln(prompt)
	if err != nil {
		return "", err
	}
	fmt.Fprint(prompt, "Repeat new password: ")
	second, err := term.ReadPassword(fd)
	fmt.Fprintln(prompt)
	if err != nil {
		return "", err
	}
	if string(first) != string(second) {
		return "", errors.New("passwords do not match")
	}
	return string(first), nil
}
