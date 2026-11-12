package main

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// --- SQL INSERT -----------------------------------------------------------

// sqlInsertExportWriter writes one `INSERT INTO <table> (cols) VALUES (...);`
// per row, quoting identifiers and literals for the connection's engine so
// the file can be replayed against a database of the same kind.
type sqlInsertExportWriter struct {
	file       *os.File // nil when writing to a caller-owned io.Writer
	buf        *bufio.Writer
	technology string
	table      string
	colList    string
}

func newSQLInsertExportWriter(outPath, table, technology string) (*sqlInsertExportWriter, error) {
	f, err := createPrivateFile(outPath)
	if err != nil {
		return nil, err
	}
	if table == "" {
		table = "table_name"
	}
	return &sqlInsertExportWriter{file: f, buf: bufio.NewWriter(f), technology: technology, table: table}, nil
}

var (
	plainLowerIdent = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)
	plainUpperIdent = regexp.MustCompile(`^[A-Z_][A-Z0-9_$]*$`)
	plainMixedIdent = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

// sqlExportIdent quotes a column name unless it is already a plain
// identifier that the engine would fold to the very same name.
func sqlExportIdent(name, technology string) string {
	switch {
	case isMySQLFamily(technology):
		if plainLowerIdent.MatchString(name) {
			return name
		}
		return "`" + strings.ReplaceAll(name, "`", "``") + "`"
	case isMSSQL(technology):
		if plainMixedIdent.MatchString(name) {
			return name
		}
		return "[" + strings.ReplaceAll(name, "]", "]]") + "]"
	case isOracle(technology) || isFirebird(technology):
		if plainUpperIdent.MatchString(name) {
			return name
		}
	default:
		if plainLowerIdent.MatchString(name) {
			return name
		}
	}
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// sqlExportLiteral renders one value as a SQL literal for the engine.
func sqlExportLiteral(v any, technology string) string {
	switch x := v.(type) {
	case nil:
		return "NULL"
	case int64:
		return fmt.Sprintf("%d", x)
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			// Not a literal anywhere; only PostgreSQL has a spelling for it.
			if technology != "postgresql" {
				return "NULL"
			}
			switch {
			case math.IsNaN(x):
				return "'NaN'::float8"
			case x > 0:
				return "'Infinity'::float8"
			default:
				return "'-Infinity'::float8"
			}
		}
		return formatFloat(x)
	case bool:
		if isMSSQL(technology) || isOracle(technology) {
			if x {
				return "1"
			}
			return "0"
		}
		if x {
			return "TRUE"
		}
		return "FALSE"
	case time.Time:
		layout := "2006-01-02 15:04:05.999999"
		if technology == "postgresql" {
			layout += "-07:00"
		}
		return "'" + x.Format(layout) + "'"
	case []byte:
		if utf8.Valid(x) {
			return sqlExportString(string(x), technology)
		}
		h := hex.EncodeToString(x)
		switch {
		case technology == "postgresql":
			return `'\x` + h + `'`
		case isMSSQL(technology):
			return "0x" + h
		case isOracle(technology):
			return "HEXTORAW('" + h + "')"
		default:
			return "X'" + h + "'"
		}
	case string:
		return sqlExportString(x, technology)
	default:
		return sqlExportString(fmt.Sprintf("%v", x), technology)
	}
}

func sqlExportString(s, technology string) string {
	if isMySQLFamily(technology) {
		s = strings.ReplaceAll(s, `\`, `\\`)
	}
	prefix := ""
	if isMSSQL(technology) {
		// Without N a literal is converted through the database's code page,
		// turning anything outside it into "?".
		for _, r := range s {
			if r > 127 {
				prefix = "N"
				break
			}
		}
	}
	return prefix + "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// newSQLInsertWriter writes to a writer the caller owns (and closes itself);
// Close only flushes.
func newSQLInsertWriter(out io.Writer, table, technology string) *sqlInsertExportWriter {
	return &sqlInsertExportWriter{buf: bufio.NewWriter(out), technology: technology, table: table}
}

func (w *sqlInsertExportWriter) WriteHeader(cols []string) error {
	quoted := make([]string, len(cols))
	for i, c := range cols {
		quoted[i] = sqlExportIdent(c, w.technology)
	}
	w.colList = strings.Join(quoted, ", ")
	return nil
}

func (w *sqlInsertExportWriter) WriteRow(values []any) error {
	lits := make([]string, len(values))
	for i, v := range values {
		lits[i] = sqlExportLiteral(v, w.technology)
	}
	_, err := fmt.Fprintf(w.buf, "INSERT INTO %s (%s) VALUES (%s);\n", w.table, w.colList, strings.Join(lits, ", "))
	return err
}

func (w *sqlInsertExportWriter) Close() error {
	if err := w.buf.Flush(); err != nil {
		if w.file != nil {
			w.file.Close()
		}
		return err
	}
	if w.file == nil {
		return nil
	}
	return w.file.Close()
}

// --- Source table of a plain SELECT -----------------------------------------

var (
	stripStringsRe  = regexp.MustCompile(`'(?:[^']|'')*'`)
	stripLineCmtRe  = regexp.MustCompile(`--[^\n]*`)
	stripBlockCmtRe = regexp.MustCompile(`(?s)/\*.*?\*/`)
	complexSelectRe = regexp.MustCompile(`(?i)\b(join|union|intersect|except|with)\b`)
	fromWordRe      = regexp.MustCompile(`(?i)\bfrom\b`)
	fromParenRe     = regexp.MustCompile(`(?i)\bfrom\s*\(`)
	identPattern    = "(?:\"[^\"]+\"|`[^`]+`|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)"
	tableRefRe      = regexp.MustCompile(`(?is)\bfrom\s+(` + identPattern + `(?:\s*\.\s*` + identPattern + `){0,2})(.*)$`)
	aliasRe         = regexp.MustCompile(`(?is)^\s*(?:as\s+)?([A-Za-z_]\w*)(.*)$`)
	clauseStartRe   = regexp.MustCompile(`(?is)^\s*(where|order|group|limit|having|offset|fetch|window|for)\b`)
	startsSelectRe  = regexp.MustCompile(`(?i)^\s*select\b`)
)

// guessSourceTable returns the table a plain single-table SELECT reads from,
// exactly as written (quoting and schema prefix kept), or "" for anything more
// involved -- joins, subqueries, set operations, CTEs, several statements --
// where the source table is ambiguous. Mirrors guessSourceTable in
// frontend/src/grid_copy_as.js.
func guessSourceTable(sqlText string) string {
	flat := stripBlockCmtRe.ReplaceAllString(stripLineCmtRe.ReplaceAllString(stripStringsRe.ReplaceAllString(sqlText, "''"), " "), " ")
	flat = strings.TrimSpace(flat)
	flat = strings.TrimSpace(strings.TrimSuffix(flat, ";"))
	if strings.Contains(flat, ";") || !startsSelectRe.MatchString(flat) || complexSelectRe.MatchString(flat) {
		return ""
	}
	if len(fromWordRe.FindAllString(flat, -1)) != 1 || fromParenRe.MatchString(flat) {
		return ""
	}
	m := tableRefRe.FindStringSubmatch(flat)
	if m == nil {
		return ""
	}
	table := regexp.MustCompile(`\s*\.\s*`).ReplaceAllString(m[1], ".")
	rest := m[2]
	if strings.TrimSpace(rest) == "" || clauseStartRe.MatchString(rest) {
		return table
	}
	if a := aliasRe.FindStringSubmatch(rest); a != nil {
		if clauseStartRe.MatchString(" "+a[1]) && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(rest)), "as ") {
			return ""
		}
		if strings.TrimSpace(a[2]) == "" || clauseStartRe.MatchString(a[2]) {
			return table
		}
	}
	return ""
}
