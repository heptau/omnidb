package main

import (
	"runtime"
	"strings"
)

// This file implements a lightweight, dialect-agnostic SQL reindenter for
// indent_sql (see appdb_workspace_handlers.go's handleIndentSQL) — a
// tokenizer plus a heuristic line-breaking pass, deliberately NOT a real
// SQL parser. This mirrors the spirit of Python's sqlparse.format(reindent
// =True) (also token-based, not AST-based), which is what indent_sql
// always used — its wire contract only ever carried the raw SQL text, no
// connection/technology context, so the original behavior never varied by
// engine either. See go-backend-migration memory for the planned second
// tier: dispatching to the user's own pg_procrustes (a real PostgreSQL-
// parser-driven formatter) specifically for PostgreSQL connections, once
// its formatter/config packages are made importable — that needs a wire
// contract change (passing which engine a tab is connected to) this
// generic pass doesn't need at all.

type sqlTokKind int

const (
	sqlWord sqlTokKind = iota
	sqlNumber
	sqlString      // '...'
	sqlQuotedIdent // "..." or `...`
	sqlComment     // /* ... */
	sqlLineComment // -- ... to end of line
	sqlOpenParen
	sqlCloseParen
	sqlComma
	sqlSemicolon
	sqlOp
)

type sqlTok struct {
	kind sqlTokKind
	text string
}

// IndentOptions controls the behavior of the SQL reindenter.
type IndentOptions struct {
	IndentUnit  string // e.g. "    " (4 spaces), "  " (2 spaces), "\t" (tab)
	CommaStyle  string // "leading" (comma at start of line) or "trailing" (comma at end)
	KeywordCase string // "preserve", "upper", or "lower"
}

var DefaultIndentOptions = IndentOptions{
	IndentUnit:  "    ",
	CommaStyle:  "leading",
	KeywordCase: "preserve",
}

func isSQLIdentStart(b byte) bool {
	return b == '_' || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z')
}

func isSQLIdentPart(b byte) bool {
	return isSQLIdentStart(b) || (b >= '0' && b <= '9') || b == '$'
}

func isSQLDigit(b byte) bool { return b >= '0' && b <= '9' }

// scanSQLQuoted returns the index just past the closing quote, handling
// both SQL-standard doubled-quote escaping (' inside '...', " inside
// "...") and backslash escaping (MySQL's default) — whichever a given
// dialect actually uses, treating both as "doesn't end the string" is the
// safe choice: misreading where a string ends risks reformatting its
// contents as if they were SQL syntax, which matters far more than which
// escaping convention this guesses right.
func scanSQLQuoted(s string, start int, quote byte) int {
	i := start + 1
	n := len(s)
	for i < n {
		if s[i] == '\\' && i+1 < n {
			i += 2
			continue
		}
		if s[i] == quote {
			if i+1 < n && s[i+1] == quote {
				i += 2
				continue
			}
			return i + 1
		}
		i++
	}
	return n
}

// sqlMultiCharOps must be checked longest-first so e.g. "->>" matches
// before "->".
var sqlMultiCharOps = []string{"->>", "<=", ">=", "<>", "!=", "||", "::", "->", ":="}

func matchSQLOp(s string) (string, int) {
	for _, op := range sqlMultiCharOps {
		if strings.HasPrefix(s, op) {
			return op, len(op)
		}
	}
	return s[:1], 1
}

// tokenizeSQL splits SQL text into tokens, discarding original whitespace
// entirely (reindentStatement reconstructs all spacing/line breaks itself)
// while preserving string/quoted-identifier/comment contents byte-for-byte.
func tokenizeSQL(s string) []sqlTok {
	var toks []sqlTok
	i, n := 0, len(s)
	for i < n {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v':
			i++
		case c == '-' && i+1 < n && s[i+1] == '-':
			end := strings.IndexByte(s[i:], '\n')
			if end == -1 {
				toks = append(toks, sqlTok{sqlLineComment, s[i:]})
				i = n
			} else {
				toks = append(toks, sqlTok{sqlLineComment, s[i : i+end]})
				i += end
			}
		case c == '/' && i+1 < n && s[i+1] == '*':
			rel := strings.Index(s[i+2:], "*/")
			if rel == -1 {
				toks = append(toks, sqlTok{sqlComment, s[i:]})
				i = n
			} else {
				stop := i + 2 + rel + 2
				toks = append(toks, sqlTok{sqlComment, s[i:stop]})
				i = stop
			}
		case c == '\'':
			end := scanSQLQuoted(s, i, '\'')
			toks = append(toks, sqlTok{sqlString, s[i:end]})
			i = end
		case c == '"':
			end := scanSQLQuoted(s, i, '"')
			toks = append(toks, sqlTok{sqlQuotedIdent, s[i:end]})
			i = end
		case c == '`':
			end := scanSQLQuoted(s, i, '`')
			toks = append(toks, sqlTok{sqlQuotedIdent, s[i:end]})
			i = end
		case c == '(':
			toks = append(toks, sqlTok{sqlOpenParen, "("})
			i++
		case c == ')':
			toks = append(toks, sqlTok{sqlCloseParen, ")"})
			i++
		case c == ',':
			toks = append(toks, sqlTok{sqlComma, ","})
			i++
		case c == ';':
			toks = append(toks, sqlTok{sqlSemicolon, ";"})
			i++
		case isSQLIdentStart(c):
			j := i + 1
			for j < n && isSQLIdentPart(s[j]) {
				j++
			}
			toks = append(toks, sqlTok{sqlWord, s[i:j]})
			i = j
		case isSQLDigit(c):
			j := i + 1
			for j < n && (isSQLDigit(s[j]) || s[j] == '.') {
				j++
			}
			toks = append(toks, sqlTok{sqlNumber, s[i:j]})
			i = j
		default:
			op, l := matchSQLOp(s[i:])
			toks = append(toks, sqlTok{sqlOp, op})
			i += l
		}
	}
	return toks
}

// sqlKeywordPhrases lists multi-word keywords that must be recognized as a
// single unit for clause-breaking purposes (see reindentStatement),
// longest-first so e.g. "left outer join" matches before "left join" would
// short-circuit on just "left".
var sqlKeywordPhrases = [][]string{
	{"left", "outer", "join"},
	{"right", "outer", "join"},
	{"full", "outer", "join"},
	{"left", "join"},
	{"right", "join"},
	{"full", "join"},
	{"inner", "join"},
	{"cross", "join"},
	{"group", "by"},
	{"order", "by"},
	{"insert", "into"},
	{"delete", "from"},
	{"union", "all"},
}

func matchesSQLPhrase(toks []sqlTok, start int, phrase []string) bool {
	if start+len(phrase) > len(toks) {
		return false
	}
	for k, word := range phrase {
		t := toks[start+k]
		if t.kind != sqlWord || !strings.EqualFold(t.text, word) {
			return false
		}
	}
	return true
}

// mergeKeywordPhrases folds each matched phrase into one sqlWord token
// (original casing preserved, words joined by a single space) so the rest
// of the pipeline can treat e.g. "left outer join" exactly like "join".
func mergeKeywordPhrases(toks []sqlTok) []sqlTok {
	out := make([]sqlTok, 0, len(toks))
	for i := 0; i < len(toks); {
		matched := false
		for _, phrase := range sqlKeywordPhrases {
			if matchesSQLPhrase(toks, i, phrase) {
				words := make([]string, len(phrase))
				for k := range phrase {
					words[k] = toks[i+k].text
				}
				out = append(out, sqlTok{sqlWord, strings.Join(words, " ")})
				i += len(phrase)
				matched = true
				break
			}
		}
		if !matched {
			out = append(out, toks[i])
			i++
		}
	}
	return out
}

// sqlMajorClauseKeywords start a fresh line at the current paren depth.
var sqlMajorClauseKeywords = map[string]bool{
	"select": true, "from": true, "where": true, "having": true,
	"limit": true, "offset": true, "union": true, "union all": true,
	"intersect": true, "except": true, "values": true, "update": true,
	"set": true, "with": true, "returning": true,
	"group by": true, "order by": true, "insert into": true, "delete from": true,
}

var sqlJoinKeywords = map[string]bool{
	"join": true, "inner join": true, "left join": true, "right join": true,
	"full join": true, "left outer join": true, "right outer join": true,
	"full outer join": true, "cross join": true,
}

// sqlSpaceBeforeParenKeywords are words after which "(" gets a preceding
// space (it's introducing a grouped/subquery expression, e.g. "IN (",
// "VALUES (") — anything else (a plain identifier, or ")") is treated as a
// function call and gets no space ("count(", ")(" doesn't occur in valid
// SQL so is moot).
var sqlSpaceBeforeParenKeywords = map[string]bool{
	"in": true, "values": true, "exists": true, "not": true, "and": true,
	"or": true, "on": true, "where": true, "having": true, "select": true,
	"from": true, "as": true, "when": true, "then": true, "case": true,
	"between": true,
}

func applyKeywordCase(text string, mode string) string {
	switch mode {
	case "upper":
		return strings.ToUpper(text)
	case "lower":
		return strings.ToLower(text)
	default:
		return text
	}
}

// reindentStatement walks a merged token stream and reconstructs spacing
// and line breaks:
//   - major clause keywords / JOIN-family keywords start a new line at the
//     current paren depth's indent;
//   - AND/OR start a new line one level deeper than the current depth;
//   - a comma at paren depth 0 (i.e. never inside a function call or
//     subquery — those are always inside parens by definition, so this
//     needs no function-call-vs-list disambiguation) starts a new line
//     with a leading comma, one level deeper;
//   - everything else is joined with a single space, with a few spacing
//     refinements (no space before ",", ";", ")"; no space after "(";
//     conditional space before "(" — see sqlSpaceBeforeParenKeywords).
func reindentStatement(toks []sqlTok, opts IndentOptions) string {
	var b strings.Builder
	depth := 0
	first := true
	var lastTok *sqlTok

	nl := func(d int) {
		b.WriteByte('\n')
		b.WriteString(strings.Repeat(opts.IndentUnit, d))
	}

	needSpace := func(next sqlTok) bool {
		if lastTok == nil {
			return false
		}
		if next.kind == sqlComma || next.kind == sqlSemicolon || next.kind == sqlCloseParen {
			return false
		}
		// "." binds tight on both sides (t.col, schema.table.col) — neither
		// a preceding nor a following dot gets a space.
		if next.kind == sqlOp && next.text == "." {
			return false
		}
		if lastTok.kind == sqlOp && lastTok.text == "." {
			return false
		}
		if lastTok.kind == sqlOpenParen {
			return false
		}
		if next.kind == sqlOpenParen && lastTok.kind == sqlWord {
			if !sqlSpaceBeforeParenKeywords[strings.ToLower(lastTok.text)] {
				return false
			}
		}
		return true
	}

	isKeyword := func(lw string) bool {
		return sqlMajorClauseKeywords[lw] || sqlJoinKeywords[lw] || lw == "and" || lw == "or" || lw == "on"
	}

	wordCase := func(text string, force bool) string {
		if force || isKeyword(strings.ToLower(text)) {
			return applyKeywordCase(text, opts.KeywordCase)
		}
		return text
	}

	for i := range toks {
		t := toks[i]
		lw := ""
		if t.kind == sqlWord {
			lw = strings.ToLower(t.text)
		}
		isMajor := t.kind == sqlWord && (sqlMajorClauseKeywords[lw] || sqlJoinKeywords[lw])
		isCondJoin := t.kind == sqlWord && (lw == "and" || lw == "or")
		isOn := t.kind == sqlWord && lw == "on"
		suppressNext := false

		switch {
		case t.kind == sqlComma && depth == 0:
			if opts.CommaStyle == "trailing" {
				// Remove trailing space from previous output, append comma, newline
				prev := b.String()
				if len(prev) > 0 && prev[len(prev)-1] == ' ' {
					b.Reset()
					b.WriteString(prev[:len(prev)-1])
				}
				b.WriteString(",")
				nl(1)
			} else {
				nl(1)
				b.WriteString(", ")
			}
			suppressNext = true
		case isMajor:
			if !first {
				nl(depth)
			}
			b.WriteString(wordCase(t.text, true))
		case isCondJoin, isOn:
			nl(depth + 1)
			b.WriteString(wordCase(t.text, true))
		case t.kind == sqlLineComment:
			if needSpace(t) {
				b.WriteByte(' ')
			}
			b.WriteString(t.text)
			nl(depth)
			suppressNext = true
		default:
			if needSpace(t) {
				b.WriteByte(' ')
			}
			if t.kind == sqlWord {
				b.WriteString(wordCase(t.text, false))
			} else {
				b.WriteString(t.text)
			}
		}

		if t.kind == sqlOpenParen {
			depth++
		} else if t.kind == sqlCloseParen && depth > 0 {
			depth--
		}

		if suppressNext {
			lastTok = nil
		} else {
			tc := t
			lastTok = &tc
		}
		first = false
	}

	return strings.TrimSpace(b.String())
}

// reindentSQL is the exported entry point — see the package comment.
func reindentSQL(sql string, opts IndentOptions) string {
	toks := mergeKeywordPhrases(tokenizeSQL(sql))
	if len(toks) == 0 {
		return sql
	}
	return reindentStatement(toks, opts)
}

// reindentSQLSafe never fails or panics outward — a text-formatting nicety
// should degrade to "leave it unformatted" on any unexpected input, not
// break the request (this is a hand-written heuristic pass over arbitrary
// user-typed SQL, not a validated grammar — an unanticipated edge case
// should be survivable).
func reindentSQLSafe(sql string, opts IndentOptions) (out string) {
	defer func() {
		if r := recover(); r != nil {
			if _, ok := r.(runtime.Error); ok {
				panic(r)
			}
			out = sql
		}
	}()
	return reindentSQL(sql, opts)
}
