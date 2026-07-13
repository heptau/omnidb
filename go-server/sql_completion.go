package main

import (
	"database/sql"
	"strings"
)

// completionColumn mirrors what workspace.py's GetFields() call returns per
// result column (v_truename/v_dbtype) — the *driver's* result-set metadata,
// not catalog introspection, since get_completions(_table) run a live
// "SELECT x.* FROM <ref> x WHERE 1=0" and read the row description. That's
// what lets it work against views/subqueries too, not just base tables —
// deliberately NOT reusing editDataColumns (catalog-based) here.
type completionColumn struct {
	Name     string
	DataType string
}

// columnMetadataForExpression mirrors GetFields — runs a zero-row query and
// reads column metadata off the result set. database/sql's ColumnTypes()
// works identically across every driver already in use (pgx/stdlib,
// go-sql-driver/mysql, sijms/go-ora, modernc.org/sqlite), so this needs no
// per-engine dispatch at all, unlike editDataColumns.
func columnMetadataForExpression(db *sql.DB, tableRef string) ([]completionColumn, error) {
	rows, err := db.Query("select x.* from " + tableRef + " x where 1 = 0")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	types, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}
	out := make([]completionColumn, len(types))
	for i, t := range types {
		out[i] = completionColumn{Name: t.Name(), DataType: t.DatabaseTypeName()}
	}
	return out, nil
}

// getPositions mirrors workspace.py's get_positions — every non-overlapping
// occurrence of searchStr in source, scanning forward from the end of each
// previous match (same as Python's `start = p_source.index(s, start+len)`
// loop).
func getPositions(source, searchStr string) []int {
	var out []int
	searchLen := len(searchStr)
	start := 0
	for {
		idx := strings.Index(source[start:], searchStr)
		if idx == -1 {
			break
		}
		pos := start + idx
		out = append(out, pos)
		start = pos + searchLen
	}
	return out
}

// isReference mirrors workspace.py's is_reference byte-for-byte (ASCII SQL
// text is the overwhelming common case, same assumption the rest of this
// codebase's string-position logic already makes).
func isReference(sqlText, prefix string, occurrenceIndex, cursorIndex int) bool {
	length := len(prefix)
	nextIndex := occurrenceIndex + length

	if nextIndex == cursorIndex {
		return false
	}
	if occurrenceIndex+length >= len(sqlText) {
		if occurrenceIndex == 0 {
			return false
		}
		return sqlText[occurrenceIndex-1] == ' '
	}

	nextChar := sqlText[nextIndex]
	if nextChar == '.' {
		return false
	}
	if nextChar == ',' || nextChar == '\n' || nextChar == ' ' || nextChar == ')' {
		if occurrenceIndex == 0 {
			return false
		}
		return sqlText[occurrenceIndex-1] == ' '
	}
	return false
}

// findTableReferenceForCompletion mirrors the bulk of get_completions —
// given "prefix" (an alias like "t") and where the cursor was when prefix
// was typed, walk backward through the SQL text to find the actual table
// reference (either "schema.table" or a parenthesized subquery) that alias
// refers to. Returns ok=false if no valid reference occurrence was found.
//
// Deliberately deviates from Python in one narrow spot: Python's
// `p_sql[v_last_pos - 1]`/`p_sql[index - 2]` silently wrap around to the
// *end* of the string via negative indexing when v_last_pos/index is 0 or
// 1 — clearly an accidental artifact of Python slicing, not intended
// behavior (a real occurrence this early in the SQL text is also an
// unlikely edge case in practice). Go has no such wraparound, so this
// treats "not enough characters behind the cursor" as "no match" instead of
// replicating the wraparound quirk, which would be actively worse (either
// a panic or nonsense output) than this documented, narrow difference.
func findTableReferenceForCompletion(sqlText, prefix string, prefixPos int) (string, bool) {
	positions := getPositions(sqlText, prefix)
	index := -1
	for _, pos := range positions {
		if isReference(sqlText, prefix, pos, prefixPos) {
			index = pos
			break
		}
	}
	if index == -1 {
		return "", false
	}

	for index > 0 && sqlText[index-1] == ' ' {
		index--
	}
	lastPos := index

	if lastPos > 0 && sqlText[lastPos-1] == ')' {
		level := 0
		for index > 0 {
			if sqlText[index-1] == ')' {
				level--
			} else if sqlText[index-1] == '(' {
				level++
			}
			if sqlText[index-1] == '(' && level == 0 {
				break
			}
			index--
		}
		if index == 0 {
			return "", false
		}
		return sqlText[index-1 : lastPos], true
	}

	quoted := lastPos > 0 && sqlText[lastPos-1] == '"'
	index = lastPos
	for index > 0 && (sqlText[index-1] != ' ' || quoted) && (sqlText[index-1] != ',' || quoted) {
		index--
		if index >= 2 && sqlText[index-2] == '"' {
			quoted = !quoted
		}
	}
	return sqlText[index:lastPos], true
}
