package main

import (
	"bytes"
	"strings"
	"unicode/utf8"
)

// This file implements a dialect-agnostic SQL formatter for indent_sql (see
// appdb_workspace_handlers.go's handleIndentSQL): a tokenizer, a small
// parenthesis/CASE tree builder and a layout pass driven by IndentOptions.
// It is deliberately NOT a real SQL parser — it never rejects input and
// never changes anything but whitespace, line breaks and keyword case.
//
// Layout rules (see the option docs on IndentOptions):
//   - a statement is split into clauses (SELECT, FROM, WHERE, JOIN, ...);
//     each clause keyword starts a line, lists (select list, GROUP BY, SET,
//     VALUES, ...) put one item per line, AND/OR in WHERE/HAVING/JOIN
//     conditions go on their own indented lines;
//   - a parenthesised subquery becomes an indented block, other parentheses
//     (function calls, IN lists, column lists) stay on one line and are only
//     wrapped one item per line when they exceed WrapWidth (CREATE TABLE
//     column lists are always wrapped);
//   - CASE with more than one WHEN becomes a block;
//   - statements are separated by a blank line.

type sqlTokKind int

const (
	sqlWord sqlTokKind = iota
	sqlNumber
	sqlString      // '...', E'...', $tag$...$tag$
	sqlQuotedIdent // "..." `...` [...]
	sqlParam       // :name $1 @var #temp — opaque, never re-cased
	sqlComment     // /* ... */
	sqlLineComment // -- ... to end of line
	sqlOpenParen
	sqlCloseParen
	sqlOpenBracket
	sqlCloseBracket
	sqlComma
	sqlSemicolon
	sqlDot
	sqlOp
)

type sqlTok struct {
	kind sqlTokKind
	text string

	nl          bool // a newline separated this token from the previous one in the source
	isKw        bool // a recognised keyword (subject to the keyword-case option)
	unary       bool // prefix + - ~ (no space after)
	parenSpace  bool // for "(": a space belongs before it
	forceExpand bool // for "(": CREATE TABLE column list — always one item per line
}

// IndentOptions controls the behavior of the SQL formatter.
type IndentOptions struct {
	IndentUnit      string // e.g. "    " (4 spaces), "  " (2 spaces), "\t" (tab)
	CommaStyle      string // "trailing" (comma at end of line) or "leading" (comma at start)
	KeywordCase     string // "preserve", "upper", or "lower"
	Layout          string // "block" (list items below the clause keyword) or "compact" (first item on the keyword line)
	LogicalOperator string // "leading" (AND/OR at start of line) or "trailing" (at end)
	WrapWidth       int    // parenthesised lists longer than this are wrapped one item per line
}

var DefaultIndentOptions = IndentOptions{
	IndentUnit:      "    ",
	CommaStyle:      "trailing",
	KeywordCase:     "upper",
	Layout:          "block",
	LogicalOperator: "leading",
	WrapWidth:       100,
}

// normalizeIndentOptions fills blank/invalid fields with the defaults.
func normalizeIndentOptions(o IndentOptions) IndentOptions {
	d := DefaultIndentOptions
	if o.IndentUnit == "" {
		o.IndentUnit = d.IndentUnit
	}
	if o.CommaStyle != "leading" && o.CommaStyle != "trailing" {
		o.CommaStyle = d.CommaStyle
	}
	if o.KeywordCase != "preserve" && o.KeywordCase != "upper" && o.KeywordCase != "lower" {
		o.KeywordCase = d.KeywordCase
	}
	if o.Layout != "block" && o.Layout != "compact" {
		o.Layout = d.Layout
	}
	if o.LogicalOperator != "leading" && o.LogicalOperator != "trailing" {
		o.LogicalOperator = d.LogicalOperator
	}
	if o.WrapWidth < 40 {
		if o.WrapWidth <= 0 {
			o.WrapWidth = d.WrapWidth
		} else {
			o.WrapWidth = 40
		}
	}
	if o.WrapWidth > 400 {
		o.WrapWidth = 400
	}
	return o
}

// ---------------------------------------------------------------- tokenizer

func isSQLIdentStart(b byte) bool {
	// Bytes >= 0x80 are parts of multi-byte UTF-8 letters (e.g. Czech
	// diacritics) — treat them as identifier characters.
	return b == '_' || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || b >= 0x80
}

func isSQLIdentPart(b byte) bool {
	return isSQLIdentStart(b) || (b >= '0' && b <= '9') || b == '$'
}

func isSQLDigit(b byte) bool { return b >= '0' && b <= '9' }

func isSQLSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r' || b == '\f' || b == '\v'
}

const sqlOpChars = "+-*/<>=~!@#%^&|?"

// scanSQLQuoted returns the index just past the closing quote, handling
// both SQL-standard doubled-quote escaping and backslash escaping (MySQL /
// E” strings) — treating both as "doesn't end the string" is the safe
// choice: misreading where a string ends risks reformatting its contents as
// if they were SQL syntax.
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

// scanDollarQuote returns the end index of a $tag$...$tag$ string starting
// at s[start] == '$', or -1 if it is not one.
func scanDollarQuote(s string, start int) int {
	j := start + 1
	for j < len(s) && (isSQLIdentStart(s[j]) || (j > start+1 && isSQLDigit(s[j]))) {
		j++
	}
	if j >= len(s) || s[j] != '$' {
		return -1
	}
	tag := s[start : j+1]
	rel := strings.Index(s[j+1:], tag)
	if rel == -1 {
		return len(s)
	}
	return j + 1 + rel + len(tag)
}

// scanBracketIdent recognises MS SQL's [quoted identifier]. It is told
// apart from PostgreSQL array syntax (arr[1], ARRAY[1,2], int[]) by what
// precedes it: an identifier directly followed by "[" is a subscript.
func scanBracketIdent(s string, i int) int {
	if i > 0 {
		p := s[i-1]
		if !(isSQLSpace(p) || p == '(' || p == ',' || p == '.') {
			return -1
		}
	}
	j := i + 1
	for j < len(s) && s[j] != ']' {
		c := s[j]
		if c == '[' || c == '\n' || c == '\'' || c == '"' || c == '(' || c == ')' || c == ',' || c == ';' {
			return -1
		}
		j++
	}
	if j >= len(s) || j == i+1 {
		return -1
	}
	first := s[i+1]
	if !(isSQLIdentStart(first) || first == ' ') {
		return -1
	}
	return j + 1
}

// tokenizeSQL splits SQL text into tokens, discarding original whitespace
// (the layout pass reconstructs it) while preserving string/quoted-
// identifier/comment contents byte-for-byte.
func tokenizeSQL(s string) []sqlTok {
	var toks []sqlTok
	i, n := 0, len(s)
	sawNL := false
	add := func(kind sqlTokKind, text string) {
		toks = append(toks, sqlTok{kind: kind, text: text, nl: sawNL})
		sawNL = false
	}
	for i < n {
		c := s[i]
		switch {
		case isSQLSpace(c):
			if c == '\n' {
				sawNL = true
			}
			i++
		case c == '-' && i+1 < n && s[i+1] == '-':
			end := strings.IndexByte(s[i:], '\n')
			if end == -1 {
				add(sqlLineComment, strings.TrimRight(s[i:], " \t\r"))
				i = n
			} else {
				add(sqlLineComment, strings.TrimRight(s[i:i+end], " \t\r"))
				i += end
			}
		case c == '/' && i+1 < n && s[i+1] == '*':
			rel := strings.Index(s[i+2:], "*/")
			if rel == -1 {
				add(sqlComment, s[i:])
				i = n
			} else {
				stop := i + 2 + rel + 2
				add(sqlComment, s[i:stop])
				i = stop
			}
		case c == '\'':
			end := scanSQLQuoted(s, i, '\'')
			add(sqlString, s[i:end])
			i = end
		case c == '"':
			end := scanSQLQuoted(s, i, '"')
			add(sqlQuotedIdent, s[i:end])
			i = end
		case c == '`':
			end := scanSQLQuoted(s, i, '`')
			add(sqlQuotedIdent, s[i:end])
			i = end
		case c == '[':
			if end := scanBracketIdent(s, i); end != -1 {
				add(sqlQuotedIdent, s[i:end])
				i = end
			} else {
				add(sqlOpenBracket, "[")
				i++
			}
		case c == ']':
			add(sqlCloseBracket, "]")
			i++
		case c == '(':
			add(sqlOpenParen, "(")
			i++
		case c == ')':
			add(sqlCloseParen, ")")
			i++
		case c == ',':
			add(sqlComma, ",")
			i++
		case c == ';':
			add(sqlSemicolon, ";")
			i++
		case c == '.':
			add(sqlDot, ".")
			i++
		case c == '$':
			if end := scanDollarQuote(s, i); end != -1 {
				add(sqlString, s[i:end])
				i = end
			} else if i+1 < n && isSQLDigit(s[i+1]) {
				j := i + 1
				for j < n && isSQLDigit(s[j]) {
					j++
				}
				add(sqlParam, s[i:j])
				i = j
			} else {
				add(sqlOp, "$")
				i++
			}
		case c == ':':
			switch {
			case i+1 < n && s[i+1] == ':':
				add(sqlOp, "::")
				i += 2
			case i+1 < n && s[i+1] == '=':
				add(sqlOp, ":=")
				i += 2
			case i+1 < n && isSQLIdentStart(s[i+1]) && (i == 0 || !(isSQLIdentPart(s[i-1]) || s[i-1] == ')' || s[i-1] == ']')):
				j := i + 1
				for j < n && isSQLIdentPart(s[j]) {
					j++
				}
				add(sqlParam, s[i:j])
				i = j
			default:
				add(sqlOp, ":")
				i++
			}
		case (c == '@' || c == '#') && i+1 < n && (isSQLIdentStart(s[i+1]) || s[i+1] == c):
			j := i + 1
			for j < n && (s[j] == c || isSQLIdentPart(s[j])) {
				j++
			}
			add(sqlParam, s[i:j])
			i = j
		case isSQLIdentStart(c):
			j := i + 1
			for j < n && isSQLIdentPart(s[j]) {
				j++
			}
			// E'..' B'..' X'..' N'..' prefixed string literals
			if j == i+1 && j < n && s[j] == '\'' && strings.IndexByte("eEbBxXnN", c) != -1 {
				end := scanSQLQuoted(s, j, '\'')
				add(sqlString, s[i:end])
				i = end
				continue
			}
			add(sqlWord, s[i:j])
			i = j
		case isSQLDigit(c):
			j := i + 1
			for j < n {
				switch {
				case isSQLIdentPart(s[j]) && s[j] != '$', s[j] == '.' && j+1 < n && isSQLDigit(s[j+1]):
					j++
				case (s[j] == '+' || s[j] == '-') && (s[j-1] == 'e' || s[j-1] == 'E') && j+1 < n && isSQLDigit(s[j+1]) && !strings.HasPrefix(strings.ToLower(s[i:j]), "0x"):
					j++
				default:
					goto numDone
				}
			}
		numDone:
			add(sqlNumber, s[i:j])
			i = j
		case strings.IndexByte(sqlOpChars, c) != -1:
			j := i + 1
			for j < n && strings.IndexByte(sqlOpChars, s[j]) != -1 {
				if s[j] == '-' && j+1 < n && s[j+1] == '-' {
					break
				}
				if s[j] == '/' && j+1 < n && s[j+1] == '*' {
					break
				}
				j++
			}
			// PostgreSQL rule: a multi-char operator cannot end in + or -
			// unless it contains one of ~ ! @ # % ^ & | ?  (so "a=-1" is "=" "-").
			if j-i > 1 && strings.IndexAny(s[i:j], "~!@#%^&|?") == -1 {
				for j-i > 1 && (s[j-1] == '+' || s[j-1] == '-') {
					j--
				}
			}
			add(sqlOp, s[i:j])
			i = j
		default:
			add(sqlOp, s[i:i+1])
			i++
		}
	}
	return toks
}

// ------------------------------------------------------ keywords & phrases

// sqlKeywordPhrases lists multi-word keywords that must be recognized as a
// single unit, longest-first.
var sqlKeywordPhrases = [][]string{
	{"natural", "left", "outer", "join"},
	{"natural", "right", "outer", "join"},
	{"natural", "full", "outer", "join"},
	{"natural", "left", "join"},
	{"natural", "right", "join"},
	{"natural", "full", "join"},
	{"natural", "inner", "join"},
	{"left", "outer", "join"},
	{"right", "outer", "join"},
	{"full", "outer", "join"},
	{"left", "join"},
	{"right", "join"},
	{"full", "join"},
	{"inner", "join"},
	{"cross", "join"},
	{"natural", "join"},
	{"cross", "apply"},
	{"outer", "apply"},
	{"group", "by"},
	{"order", "by"},
	{"partition", "by"},
	{"insert", "into"},
	{"delete", "from"},
	{"union", "all"},
	{"on", "conflict"},
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
		// "t.left join" style qualified names are not phrases
		if k == 0 && start > 0 && toks[start-1].kind == sqlDot {
			return false
		}
	}
	return true
}

// mergeKeywordPhrases folds each matched phrase into one sqlWord token
// (original casing preserved, words joined by a single space).
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
				out = append(out, sqlTok{kind: sqlWord, text: strings.Join(words, " "), nl: toks[i].nl})
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

// sqlKeywords are re-cased by the keyword-case option. Deliberately limited
// to words that are reserved (or nearly) in the major dialects — function
// and type names are left alone, since they are indistinguishable from
// identifiers without a catalog.
var sqlKeywords = func() map[string]bool {
	m := map[string]bool{}
	for _, w := range strings.Fields(`
		select from where having limit offset union intersect except values update set with recursive
		returning insert into delete distinct all as on using join lateral and or not in is null like ilike
		similar to between exists any some case when then else end asc desc nulls by over partition
		window filter within true false for fetch create alter drop table view index unique primary key
		foreign references constraint check add column cascade restrict default if begin commit rollback
		grant revoke truncate explain analyze temporary temp schema database sequence trigger function
		procedure returns language replace materialized collate escape interval do nothing conflict
		tablespace inherits unlogged rename cast top
	`) {
		m[w] = true
	}
	return m
}()

// sqlOperandWords are keywords that end an operand (so a following "-" is
// binary): "end - 1", "null - ...".
var sqlOperandWords = map[string]bool{"null": true, "true": true, "false": true, "end": true}

func isKeywordText(text string) bool {
	if strings.Contains(text, " ") {
		return true // merged phrase
	}
	return sqlKeywords[strings.ToLower(text)]
}

// annotateTokens fills in the per-token layout hints (keyword, unary,
// space-before-paren, forced expansion) that need neighbouring tokens.
func annotateTokens(toks []sqlTok) []sqlTok {
	depth := 0
	stmtFirst := ""
	parenSeenInStmt := false
	for i := range toks {
		t := &toks[i]
		var prev *sqlTok
		if i > 0 {
			prev = &toks[i-1]
		}
		var next *sqlTok
		if i+1 < len(toks) {
			next = &toks[i+1]
		}

		switch t.kind {
		case sqlWord:
			if stmtFirst == "" {
				stmtFirst = strings.ToLower(t.text)
			}
			if isKeywordText(t.text) &&
				!(prev != nil && prev.kind == sqlDot) &&
				!(next != nil && next.kind == sqlDot) {
				t.isKw = true
			}
		case sqlOp:
			if t.text == "+" || t.text == "-" || t.text == "~" {
				operandEnd := false
				if prev != nil {
					switch prev.kind {
					case sqlNumber, sqlString, sqlQuotedIdent, sqlParam, sqlCloseParen, sqlCloseBracket:
						operandEnd = true
					case sqlWord:
						operandEnd = !prev.isKw || sqlOperandWords[strings.ToLower(prev.text)]
					}
				}
				t.unary = !operandEnd
			}
		case sqlOpenParen:
			t.parenSpace = parenNeedsSpace(toks, i, stmtFirst == "create")
			if depth == 0 && !parenSeenInStmt && stmtFirst == "create" {
				parenSeenInStmt = true
				if h := headBeforeName(toks, i); h == "table" || h == "exists" || h == "type" {
					t.forceExpand = true
				}
			}
			depth++
		case sqlCloseParen:
			if depth > 0 {
				depth--
			}
		case sqlSemicolon:
			if depth == 0 {
				stmtFirst = ""
				parenSeenInStmt = false
			}
		}
	}
	return toks
}

// headBeforeName: for toks[i] == "(" preceded by a (possibly qualified)
// name, the lowercase keyword in front of that name ("table" in
// "create table s.t (").
func headBeforeName(toks []sqlTok, i int) string {
	j := i - 1
	if j < 0 || !(toks[j].kind == sqlWord || toks[j].kind == sqlQuotedIdent) {
		return ""
	}
	for j >= 2 && toks[j-1].kind == sqlDot && (toks[j-2].kind == sqlWord || toks[j-2].kind == sqlQuotedIdent) {
		j -= 2
	}
	if j-1 < 0 || toks[j-1].kind != sqlWord {
		return ""
	}
	return strings.ToLower(toks[j-1].text)
}

// parenNeedsSpace decides whether "(" gets a space before it. After a
// keyword or operator it does ("IN (", "= ("); after a plain function-like
// name it does not ("count("), except where the name is a relation being
// declared/targeted ("INSERT INTO t (a, b)", "CREATE TABLE t (...)").
func parenNeedsSpace(toks []sqlTok, i int, isCreate bool) bool {
	if i == 0 {
		return false
	}
	p := toks[i-1]
	switch p.kind {
	case sqlWord:
		if p.isKw || isKeywordText(p.text) {
			return true
		}
	case sqlQuotedIdent:
	case sqlCloseParen, sqlNumber, sqlString, sqlParam:
		return true
	default:
		return true
	}
	switch headBeforeName(toks, i) {
	case "into", "insert into", "table", "view", "type", "references":
		return true
	case "exists", "on", "using":
		return isCreate
	}
	return false
}

// ------------------------------------------------------------------- tree

type nodeKind int

const (
	nTok nodeKind = iota
	nGroup
	nCase
)

type node struct {
	kind nodeKind
	tok  sqlTok // leaf token, or the opening "(" / "[" / CASE token
	kids []node
}

type parseMode int

const (
	modeTop parseMode = iota
	modeParen
	modeBracket
	modeCase
)

func buildTree(toks []sqlTok, i int, mode parseMode) ([]node, int) {
	var out []node
	for i < len(toks) {
		t := toks[i]
		switch {
		case t.kind == sqlOpenParen:
			kids, ni := buildTree(toks, i+1, modeParen)
			out = append(out, node{kind: nGroup, tok: t, kids: kids})
			i = ni
		case t.kind == sqlOpenBracket:
			kids, ni := buildTree(toks, i+1, modeBracket)
			out = append(out, node{kind: nGroup, tok: t, kids: kids})
			i = ni
		case t.kind == sqlCloseParen:
			if mode == modeParen {
				return out, i + 1
			}
			if mode == modeCase || mode == modeBracket {
				return out, i // let the enclosing group see it
			}
			out = append(out, node{kind: nTok, tok: t})
			i++
		case t.kind == sqlCloseBracket:
			if mode == modeBracket {
				return out, i + 1
			}
			if mode == modeCase || mode == modeParen {
				if mode == modeParen {
					out = append(out, node{kind: nTok, tok: t}) // stray "]" inside "(...)"
					i++
					continue
				}
				return out, i
			}
			out = append(out, node{kind: nTok, tok: t})
			i++
		case t.kind == sqlWord && strings.EqualFold(t.text, "case") && !(i > 0 && toks[i-1].kind == sqlDot):
			kids, ni := buildTree(toks, i+1, modeCase)
			out = append(out, node{kind: nCase, tok: t, kids: kids})
			i = ni
		case t.kind == sqlWord && strings.EqualFold(t.text, "end") && mode == modeCase && !(i > 0 && toks[i-1].kind == sqlDot):
			return out, i + 1
		default:
			out = append(out, node{kind: nTok, tok: t})
			i++
		}
	}
	return out, i
}

func (n node) isWord(w string) bool {
	return n.kind == nTok && n.tok.kind == sqlWord && strings.EqualFold(n.tok.text, w)
}

func (n node) isComment() bool {
	return n.kind == nTok && (n.tok.kind == sqlComment || n.tok.kind == sqlLineComment)
}

func (n node) isComma() bool { return n.kind == nTok && n.tok.kind == sqlComma }

func hasTopCommas(kids []node) bool {
	for _, k := range kids {
		if k.isComma() {
			return true
		}
	}
	return false
}

// isSubquery: a parenthesised group that starts with SELECT / WITH / VALUES
// (or with a subquery of its own, as in "((select 1) union (select 2))").
func isSubquery(n node) bool {
	if n.kind != nGroup || n.tok.kind != sqlOpenParen {
		return false
	}
	for _, k := range n.kids {
		if k.isComment() {
			continue
		}
		if k.isWord("select") || k.isWord("with") || k.isWord("values") {
			return true
		}
		return isSubquery(k) && !hasTopCommas(n.kids)
	}
	return false
}

// ----------------------------------------------------------------- layout

type qctx struct {
	kind       string // lowercase first word of the statement
	active     bool   // clause-aware layout (SELECT/FROM/... line breaks)
	commaBreak bool   // top-level commas start a new line (ALTER TABLE ...)
}

var sqlPlainKinds = map[string]bool{
	"grant": true, "revoke": true, "alter": true, "drop": true, "truncate": true, "comment": true,
	"set": true, "reset": true, "show": true, "lock": true, "vacuum": true, "cluster": true,
	"reindex": true, "refresh": true, "copy": true, "security": true, "declare": true,
}

func ctxForStatement(nodes []node) qctx {
	kind := ""
	for _, n := range nodes {
		if n.kind == nTok && n.tok.kind == sqlWord {
			kind = strings.ToLower(n.tok.text)
			break
		}
	}
	return qctx{kind: kind, active: !sqlPlainKinds[kind], commaBreak: kind == "alter"}
}

var subqueryCtx = qctx{kind: "select", active: true}

func isJoinClause(w string) bool {
	return strings.HasSuffix(w, "join") || w == "cross apply" || w == "outer apply"
}

func isListClause(c string) bool {
	switch c {
	case "select", "from", "group by", "order by", "set", "returning", "values":
		return true
	}
	return false
}

func isCondClause(c string) bool {
	return c == "where" || c == "having" || isJoinClause(c)
}

// detectClauses marks, per node, which clause keyword (lowercase, "" for
// none) starts a new clause at this nesting level.
func detectClauses(nodes []node, ctx qctx) []string {
	out := make([]string, len(nodes))
	if !ctx.active {
		return out
	}
	firstSig := -1
	for i, n := range nodes {
		if !n.isComment() {
			firstSig = i
			break
		}
	}
	cur := ""
	prevWord := ""
	for i, n := range nodes {
		if n.isComment() {
			continue
		}
		if n.kind != nTok || n.tok.kind != sqlWord {
			prevWord = ""
			continue
		}
		w := strings.ToLower(n.tok.text)
		cl := ""
		switch {
		case w == "select", w == "where", w == "having", w == "limit", w == "offset", w == "values",
			w == "returning", w == "union", w == "union all", w == "intersect", w == "except",
			w == "group by", w == "order by", w == "insert into", w == "delete from", w == "on conflict":
			cl = w
			if w == "select" && prevWord == "for" {
				cl = ""
			}
		case w == "from":
			if prevWord != "distinct" {
				cl = w
			}
		case isJoinClause(w):
			cl = w
		case w == "with":
			if i == firstSig {
				cl = w
			}
		case w == "update":
			if i == firstSig || cur == "with" {
				cl = w
			}
		case w == "set":
			if ctx.kind == "update" || prevWord == "update" {
				cl = w
			}
		}
		if cl != "" {
			out[i] = cl
			cur = cl
		}
		prevWord = w
	}
	return out
}

type emitter struct {
	o    IndentOptions
	buf  bytes.Buffer
	flat bool

	level          int // indent level of the current line
	lineStart      int
	lineLen        int
	lineHasContent bool

	prev     sqlTok
	havePrev bool
	blocky   bool // (flat mode) the content needs block layout: subquery, multi-WHEN CASE, line comment
}

func newEmitter(o IndentOptions) *emitter { return &emitter{o: o} }

func (e *emitter) indentWidth(level int) int {
	unit := utf8.RuneCountInString(e.o.IndentUnit)
	if strings.Contains(e.o.IndentUnit, "\t") {
		unit = 4 * strings.Count(e.o.IndentUnit, "\t")
	}
	return level * unit
}

func (e *emitter) nl(level int) {
	e.level = level
	if e.flat {
		return
	}
	if e.lineHasContent {
		b := bytes.TrimRight(e.buf.Bytes(), " \t")
		e.buf.Truncate(len(b))
		e.buf.WriteByte('\n')
		e.lineStart = e.buf.Len()
	} else {
		e.buf.Truncate(e.lineStart)
	}
	e.buf.WriteString(strings.Repeat(e.o.IndentUnit, level))
	e.lineLen = e.indentWidth(level)
	e.lineHasContent = false
	e.havePrev = false
}

func needSpace(prev, next sqlTok) bool {
	switch next.kind {
	case sqlComma, sqlSemicolon, sqlCloseParen, sqlCloseBracket, sqlDot:
		return false
	}
	switch prev.kind {
	case sqlOpenParen, sqlOpenBracket, sqlDot:
		return false
	}
	if next.kind == sqlOp && next.text == "::" || prev.kind == sqlOp && prev.text == "::" {
		return false
	}
	if prev.kind == sqlOp && prev.unary {
		return false
	}
	if next.kind == sqlOpenParen {
		return next.parenSpace
	}
	if next.kind == sqlOpenBracket {
		switch prev.kind {
		case sqlWord, sqlQuotedIdent, sqlParam, sqlCloseParen, sqlCloseBracket:
			return false
		}
	}
	return true
}

func (e *emitter) text(t sqlTok) string {
	if t.kind == sqlWord && t.isKw {
		switch e.o.KeywordCase {
		case "upper":
			return strings.ToUpper(t.text)
		case "lower":
			return strings.ToLower(t.text)
		}
	}
	return t.text
}

func (e *emitter) writeText(t sqlTok, s string) {
	if e.havePrev && needSpace(e.prev, t) {
		e.buf.WriteByte(' ')
		e.lineLen++
	}
	e.buf.WriteString(s)
	if k := strings.LastIndexByte(s, '\n'); k != -1 {
		e.lineLen = utf8.RuneCountInString(s[k+1:])
	} else {
		e.lineLen += utf8.RuneCountInString(s)
	}
	e.lineHasContent = true
	e.prev = t
	e.havePrev = true
}

func (e *emitter) put(t sqlTok) { e.writeText(t, e.text(t)) }

func (e *emitter) raw(s string, last sqlTok) {
	e.buf.WriteString(s)
	e.lineLen += utf8.RuneCountInString(s)
	e.lineHasContent = true
	e.prev = last
	e.havePrev = true
}

var (
	closeParenTok   = sqlTok{kind: sqlCloseParen, text: ")"}
	closeBracketTok = sqlTok{kind: sqlCloseBracket, text: "]"}
	endTok          = sqlTok{kind: sqlWord, text: "end", isKw: true}
)

// measureFlat renders n on a single line as it would appear at the current
// position, reporting whether that rendering is "pure" (no block constructs).
func (e *emitter) measureFlat(render func(fe *emitter)) (string, bool) {
	fe := &emitter{o: e.o, flat: true, level: e.level, prev: e.prev, havePrev: e.havePrev}
	render(fe)
	return fe.buf.String(), !fe.blocky
}

func (e *emitter) comment(t sqlTok) {
	if t.kind == sqlLineComment {
		if e.flat {
			e.blocky = true
		}
		e.put(t)
		e.nl(e.level)
		return
	}
	if e.flat && strings.Contains(t.text, "\n") {
		e.blocky = true
	}
	e.put(t)
}

// inline renders a node list on the current line(s) with plain spacing.
func (e *emitter) inline(nodes []node) {
	for _, n := range nodes {
		e.nodeInline(n)
	}
}

func (e *emitter) nodeInline(n node) {
	switch n.kind {
	case nGroup:
		e.group(n)
	case nCase:
		e.caseNode(n)
	default:
		if n.isComment() {
			e.comment(n.tok)
		} else {
			e.put(n.tok)
		}
	}
}

func (e *emitter) inlineGroup(n node) {
	e.put(n.tok)
	e.inline(n.kids)
	if n.tok.kind == sqlOpenBracket {
		e.put(closeBracketTok)
	} else {
		e.put(closeParenTok)
	}
}

func (e *emitter) group(n node) {
	if n.tok.kind == sqlOpenBracket {
		e.inlineGroup(n)
		return
	}
	if isSubquery(n) {
		e.subquery(n)
		return
	}
	if e.flat {
		e.inlineGroup(n)
		return
	}
	str, pure := e.measureFlat(func(fe *emitter) { fe.group(n) })
	commas := hasTopCommas(n.kids)
	fits := e.lineLen+utf8.RuneCountInString(str) <= e.o.WrapWidth
	switch {
	case n.tok.forceExpand && commas:
		e.expanded(n)
	case !pure:
		e.inlineGroup(n)
	case fits || !commas:
		e.raw(str, closeParenTok)
	default:
		e.expanded(n)
	}
}

// splitItems splits a group's children at top-level commas. A line comment
// that directly follows a comma on the same source line is handed to the
// preceding item so it stays on that item's line.
type listItem struct {
	nodes []node
	trail []sqlTok
}

func splitItems(kids []node) []listItem {
	items := []listItem{{}}
	for _, k := range kids {
		if k.isComma() {
			items = append(items, listItem{})
			continue
		}
		cur := &items[len(items)-1]
		if len(items) > 1 && len(cur.nodes) == 0 && k.kind == nTok && k.tok.kind == sqlLineComment && !k.tok.nl {
			prev := &items[len(items)-2]
			prev.trail = append(prev.trail, k.tok)
			continue
		}
		cur.nodes = append(cur.nodes, k)
	}
	return items
}

func (e *emitter) expanded(n node) {
	L := e.level
	leading := e.o.CommaStyle == "leading"
	e.put(n.tok)
	items := splitItems(n.kids)
	for k, it := range items {
		e.nl(L + 1)
		if leading && k > 0 {
			e.put(sqlTok{kind: sqlComma, text: ","})
		}
		e.inline(it.nodes)
		if !leading && k < len(items)-1 {
			e.put(sqlTok{kind: sqlComma, text: ","})
		}
		for _, c := range it.trail {
			e.put(c)
		}
	}
	e.nl(L)
	e.put(closeParenTok)
	e.level = L
}

func (e *emitter) subquery(n node) {
	L := e.level
	e.put(n.tok)
	if e.flat {
		e.blocky = true
		e.query(n.kids, L+1, subqueryCtx)
		e.put(closeParenTok)
		return
	}
	e.nl(L + 1)
	e.query(n.kids, L+1, subqueryCtx)
	e.nl(L)
	e.put(closeParenTok)
	e.level = L
}

func (e *emitter) caseNode(n node) {
	whens := 0
	for _, k := range n.kids {
		if k.isWord("when") {
			whens++
		}
	}
	if e.flat {
		if whens >= 2 {
			e.blocky = true
		}
		e.put(n.tok)
		e.inline(n.kids)
		e.put(endTok)
		return
	}
	expanded := whens >= 2
	if !expanded {
		str, pure := e.measureFlat(func(fe *emitter) { fe.caseNode(n) })
		if pure && e.lineLen+utf8.RuneCountInString(str) <= e.o.WrapWidth {
			e.raw(str, endTok)
			return
		}
		expanded = true
	}
	L := e.level
	e.put(n.tok)
	start := 0
	for start < len(n.kids) && !n.kids[start].isWord("when") && !n.kids[start].isWord("else") {
		start++
	}
	e.inline(n.kids[:start])
	for i := start; i < len(n.kids); {
		j := i + 1
		for j < len(n.kids) && !n.kids[j].isWord("when") && !n.kids[j].isWord("else") {
			j++
		}
		e.nl(L + 1)
		e.inline(n.kids[i:j])
		i = j
	}
	e.nl(L)
	e.put(endTok)
	e.level = L
}

// countItems counts the comma-separated items of the clause whose body
// starts at nodes[from].
func countItems(nodes []node, clauses []string, from int) int {
	commas, content := 0, false
	for j := from; j < len(nodes) && clauses[j] == ""; j++ {
		if nodes[j].isComma() {
			commas++
		} else if !nodes[j].isComment() {
			content = true
		}
	}
	if !content {
		return 0
	}
	return commas + 1
}

// absorbable: words that belong to the clause keyword line itself
// ("SELECT DISTINCT ON (x)", "SELECT TOP 10") rather than to the first item.
func absorbable(n node, last string) (bool, string) {
	if n.kind == nTok && n.tok.kind == sqlWord {
		w := strings.ToLower(n.tok.text)
		switch {
		case w == "distinct" || w == "all" || w == "top":
			return true, w
		case w == "on" && last == "distinct":
			return true, "on"
		}
	}
	if last == "on" && n.kind == nGroup {
		return true, "group"
	}
	if last == "top" && (n.kind == nGroup || (n.kind == nTok && (n.tok.kind == sqlNumber || n.tok.kind == sqlParam))) {
		return true, "topn"
	}
	return false, ""
}

// query lays out a statement (or a subquery body) whose clause keywords sit
// at indent level base.
func (e *emitter) query(nodes []node, base int, ctx qctx) {
	clauses := detectClauses(nodes, ctx)
	leadingComma := e.o.CommaStyle == "leading"
	leadingLogic := e.o.LogicalOperator == "leading"
	itemLevel := base + 1

	cur := ""
	listBreak, cte := false, false
	first := true
	between := false
	pending := false
	lastAbs := ""
	e.level = base

	commaBreak := func(level int, i *int) {
		var cmt *sqlTok
		if *i+1 < len(nodes) && nodes[*i+1].kind == nTok && nodes[*i+1].tok.kind == sqlLineComment && !nodes[*i+1].tok.nl {
			c := nodes[*i+1].tok
			cmt = &c
			*i++
		}
		comma := sqlTok{kind: sqlComma, text: ","}
		if leadingComma {
			if cmt != nil {
				e.put(*cmt)
			}
			e.nl(level)
			e.put(comma)
		} else {
			e.put(comma)
			if cmt != nil {
				e.put(*cmt)
			}
			e.nl(level)
		}
	}

	for i := 0; i < len(nodes); i++ {
		n := nodes[i]
		if pending && clauses[i] == "" {
			if ok, w := absorbable(n, lastAbs); ok {
				lastAbs = w
			} else {
				e.nl(itemLevel)
				pending = false
			}
		}

		switch {
		case n.kind == nTok && clauses[i] != "":
			cl := clauses[i]
			if !first {
				e.nl(base)
			}
			e.put(n.tok)
			cur, between, pending, lastAbs = cl, false, false, ""
			listBreak, cte = false, false
			if cl == "with" {
				cte = true
			} else if isListClause(cl) && countItems(nodes, clauses, i+1) >= 2 {
				listBreak = true
				pending = e.o.Layout == "block"
			}

		case n.isComma():
			switch {
			case cte:
				commaBreak(base, &i)
			case listBreak:
				commaBreak(itemLevel, &i)
			case ctx.commaBreak:
				commaBreak(itemLevel, &i)
			default:
				e.put(n.tok)
			}

		case n.isWord("and") || n.isWord("or"):
			isAnd := n.isWord("and")
			if isCondClause(cur) && !(isAnd && between) {
				if leadingLogic {
					e.nl(base + 1)
					e.put(n.tok)
				} else {
					e.put(n.tok)
					e.nl(base + 1)
				}
			} else {
				e.put(n.tok)
			}
			if isAnd {
				between = false
			}

		case n.isWord("between"):
			between = true
			e.put(n.tok)

		case n.isComment():
			t := n.tok
			if t.nl && e.lineHasContent {
				e.nl(e.level)
			}
			e.comment(t)
			if t.kind == sqlComment && t.nl && !e.flat {
				e.nl(e.level)
			}
			continue // comments don't count as content for "first"

		default:
			e.nodeInline(n)
		}
		first = false
	}
}

// -------------------------------------------------------------- entry points

type sqlStmt struct {
	nodes []node
	semi  bool
}

func splitStatements(nodes []node) []sqlStmt {
	var out []sqlStmt
	var cur []node
	for _, n := range nodes {
		if n.kind == nTok && n.tok.kind == sqlSemicolon {
			out = append(out, sqlStmt{nodes: cur, semi: true})
			cur = nil
			continue
		}
		cur = append(cur, n)
	}
	if len(cur) > 0 {
		out = append(out, sqlStmt{nodes: cur})
	}
	return out
}

func onlyComments(nodes []node) bool {
	for _, n := range nodes {
		if !n.isComment() {
			return false
		}
	}
	return true
}

// reindentSQL is the entry point — see the package comment.
func reindentSQL(sql string, opts IndentOptions) string {
	opts = normalizeIndentOptions(opts)
	toks := annotateTokens(mergeKeywordPhrases(tokenizeSQL(sql)))
	if len(toks) == 0 {
		return sql
	}
	nodes, _ := buildTree(toks, 0, modeTop)
	stmts := splitStatements(nodes)

	var outs []string
	for _, st := range stmts {
		if len(st.nodes) == 0 {
			if st.semi && len(outs) > 0 {
				outs[len(outs)-1] += ";"
			}
			continue
		}
		nodesForStmt := st.nodes
		// a same-line comment right after ";" belongs to the previous statement
		if len(outs) > 0 && nodesForStmt[0].isComment() && !nodesForStmt[0].tok.nl {
			outs[len(outs)-1] += " " + nodesForStmt[0].tok.text
			nodesForStmt = nodesForStmt[1:]
			if len(nodesForStmt) == 0 {
				continue
			}
		}
		e := newEmitter(opts)
		if onlyComments(nodesForStmt) {
			for _, c := range nodesForStmt {
				if e.lineHasContent {
					e.nl(0)
				}
				e.put(c.tok)
			}
		} else {
			e.query(nodesForStmt, 0, ctxForStatement(nodesForStmt))
		}
		s := strings.TrimSpace(e.buf.String())
		if st.semi {
			s += ";"
		}
		outs = append(outs, s)
	}
	return strings.Join(outs, "\n\n")
}

// reindentSQLSafe never fails or panics outward — a text-formatting nicety
// should degrade to "leave it unformatted" on any unexpected input.
func reindentSQLSafe(sql string, opts IndentOptions) (out string) {
	defer func() {
		if r := recover(); r != nil {
			out = sql
		}
	}()
	return reindentSQL(sql, opts)
}
