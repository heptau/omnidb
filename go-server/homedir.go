package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// homeDirFlag mirrors omnidb-server.py's -d/--homedir option (dest=homedir).
func homeDirFlag(args []string) string {
	for i, a := range args {
		if a == "-d" || a == "--homedir" {
			if i+1 < len(args) {
				return args[i+1]
			}
		}
		if v, ok := strings.CutPrefix(a, "--homedir="); ok {
			return v
		}
	}
	return ""
}

// resolveHomeDir mirrors omnidb-server.py's own HOME_DIR resolution: an
// explicit -d/--homedir MUST already exist (Python exits with an error
// otherwise — replicated here as a returned error rather than a fatal
// process exit, since this runs per-lookup, not once at argument-parsing
// time), while the computed default (~/.omnidb/omnidb-app in app mode,
// ~/.omnidb/omnidb-server otherwise) is created if missing, matching
// Python's own "if not os.path.exists(HOME_DIR): os.makedirs(...)".
func resolveHomeDir(args []string) (string, error) {
	dir, explicit, err := homeDirPath(args)
	if err != nil {
		return "", err
	}
	if explicit {
		if _, err := os.Stat(dir); err != nil {
			return "", fmt.Errorf("home directory does not exist: %s", dir)
		}
		return dir, nil
	}
	if _, err := os.Stat(dir); err != nil {
		// 0700: the home dir holds omnidb.db (password hashes, saved
		// connections, query history) and, without a keyring, the
		// connection-secret key file.
		if mkErr := os.MkdirAll(dir, 0o700); mkErr != nil {
			return "", mkErr
		}
	}
	return dir, nil
}

// homeDirPath computes resolveHomeDir's directory without touching the
// filesystem; explicit reports whether it came from -d/--homedir.
func homeDirPath(args []string) (dir string, explicit bool, err error) {
	if dir := homeDirFlag(args); dir != "" {
		return dir, true, nil
	}
	base, err := os.UserHomeDir()
	if err != nil {
		return "", false, err
	}
	dir = filepath.Join(base, ".omnidb", "omnidb-server")
	if isAppMode(args) {
		dir = filepath.Join(base, ".omnidb", "omnidb-app")
	}
	return dir, false, nil
}
