package main

import (
	"fmt"
	"regexp"
	"strings"
)

// Read-only connections.
//
// A connection flagged read_only refuses writes in two layers:
//
//  1. Session level, where the engine has a switch for it: PostgreSQL
//     default_transaction_read_only, MySQL/MariaDB transaction_read_only /
//     tx_read_only and SQLite PRAGMA query_only (see the open*Target
//     functions). The server itself then rejects every write, whatever the
//     statement looks like.
//  2. A statement guard (checkReadOnlySQL) on the paths that run user SQL --
//     the query editor, the console and Edit Data saves. It is the only layer
//     for Oracle, SQL Server and Firebird, which have no session-wide
//     read-only mode.
//
// This is a safety net against accidental changes (the production tab left
// open at 5 pm), not a security boundary: a user can still issue `SET
// default_transaction_read_only = off` on engines where the guard lets other
// statements through, and side-effecting functions are not recognised. For a
// hard guarantee, connect with a database role that has no write privileges.

// readOnlyAllowedFirstWords are the leading keywords of statements that only
// read (or manage a transaction). Anything else is refused.
var readOnlyAllowedFirstWords = map[string]bool{
	"select": true, "with": true, "show": true, "describe": true, "desc": true, "explain": true,
	"values": true, "table": true, "pragma": true, "use": true, "set": true, "reset": true,
	"begin": true, "start": true, "commit": true, "end": true, "rollback": true, "abort": true,
	"savepoint": true, "release": true,
}

// readOnlyWriteWord matches a keyword that writes, anywhere in a statement
// that otherwise starts like a read (a data-modifying CTE, EXPLAIN ANALYZE
// of an UPDATE, SELECT ... INTO, SELECT ... FOR UPDATE).
var readOnlyWriteWord = regexp.MustCompile(`(?i)\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|into)\b`)

// readOnlyUnsafeSet matches a SET/RESET that would lift a session-level
// read-only mode.
var readOnlyUnsafeSet = regexp.MustCompile(`(?i)read[_\s]*(only|write)`)

// sqlSkeleton blanks out string literals, quoted identifiers and comments, so
// keyword searches only see real SQL. Dollar quoting is not handled: a body
// that merely mentions a keyword is refused, which errs on the safe side.
func sqlSkeleton(sqlText string) string {
	var b strings.Builder
	runes := []rune(sqlText)
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		switch {
		case c == '-' && i+1 < len(runes) && runes[i+1] == '-':
			for i < len(runes) && runes[i] != '\n' {
				i++
			}
			b.WriteByte(' ')
		case c == '/' && i+1 < len(runes) && runes[i+1] == '*':
			i += 2
			for i+1 < len(runes) && !(runes[i] == '*' && runes[i+1] == '/') {
				i++
			}
			i++
			b.WriteByte(' ')
		case c == '\'' || c == '"' || c == '`':
			for i++; i < len(runes) && runes[i] != c; i++ {
			}
			b.WriteString("''")
		default:
			b.WriteRune(c)
		}
	}
	return b.String()
}

// checkReadOnlySQL returns an error naming the first statement of sqlText
// that is not known to be read-only.
func checkReadOnlySQL(sqlText string) error {
	statements := splitSQLStatements(sqlText)
	if len(statements) == 0 {
		statements = []string{sqlText}
	}
	for _, stmt := range statements {
		skel := strings.TrimLeft(sqlSkeleton(stmt), " \t\r\n(")
		if skel == "" {
			continue
		}
		fields := strings.Fields(skel)
		first := strings.ToLower(strings.TrimRight(fields[0], ";"))
		if !readOnlyAllowedFirstWords[first] {
			return fmt.Errorf("this connection is read-only: %s statements are not allowed", strings.ToUpper(first))
		}
		switch first {
		case "set", "reset":
			if readOnlyUnsafeSet.MatchString(skel) {
				return fmt.Errorf("this connection is read-only: its read-only mode cannot be changed")
			}
		case "pragma":
			if strings.Contains(skel, "=") {
				return fmt.Errorf("this connection is read-only: PRAGMA assignments are not allowed")
			}
		case "begin", "start", "commit", "end", "rollback", "abort", "savepoint", "release", "use", "show", "describe", "desc":
		default:
			if m := readOnlyWriteWord.FindString(skel); m != "" {
				return fmt.Errorf("this connection is read-only: %s is not allowed", strings.ToUpper(m))
			}
		}
	}
	return nil
}

// readOnlyError is the message for operations that are writes by definition
// (saving Edit Data changes).
func readOnlyError() error {
	return fmt.Errorf("this connection is read-only")
}
