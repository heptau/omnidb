package main

import (
	"regexp"
	"strings"
)

// A small SQL scanner for code completion. It is not a parser: it finds, in the
// statement being edited, which clause the cursor is in (SELECT list, FROM,
// ON, ...), which tables/subqueries/CTEs the statement reads from and under
// what alias. That is what completion needs to offer the right columns, join
// conditions and table names, on any engine, while the text is still half
// typed and would not parse.

type ctxTokKind int

const (
	ctxWord   ctxTokKind = iota // identifier, keyword or number
	ctxQuoted                   // "identifier", `identifier`
	ctxString                   // 'literal' or $tag$...$tag$
	ctxPunct                    // one punctuation byte
)

type ctxTok struct {
	kind       ctxTokKind
	text       string
	start, end int // byte offsets into the scanned text
}

var dollarTagRe = regexp.MustCompile(`^\$([A-Za-z_][A-Za-z0-9_]*)?\$`)

func isWordByte(c byte) bool {
	return c == '_' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= 0x80
}

// tokenizeContext splits text into tokens, dropping whitespace and comments and
// keeping string literals and quoted identifiers whole, so a keyword inside
// either is never mistaken for one.
func tokenizeContext(s string) []ctxTok {
	var toks []ctxTok
	i := 0
	for i < len(s) {
		c := s[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case c == '-' && i+1 < len(s) && s[i+1] == '-':
			for i < len(s) && s[i] != '\n' {
				i++
			}
		case c == '/' && i+1 < len(s) && s[i+1] == '*':
			end := strings.Index(s[i+2:], "*/")
			if end < 0 {
				i = len(s)
			} else {
				i += end + 4
			}
		case c == '\'' || c == '"' || c == '`':
			start := i
			i++
			for i < len(s) {
				if s[i] == c {
					if i+1 < len(s) && s[i+1] == c { // doubled quote
						i += 2
						continue
					}
					i++
					break
				}
				i++
			}
			kind := ctxString
			if c != '\'' {
				kind = ctxQuoted
			}
			toks = append(toks, ctxTok{kind, s[start:i], start, i})
		case c == '$' && dollarTagRe.MatchString(s[i:]):
			tag := dollarTagRe.FindString(s[i:])
			start := i
			end := strings.Index(s[i+len(tag):], tag)
			if end < 0 {
				i = len(s)
			} else {
				i += len(tag) + end + len(tag)
			}
			toks = append(toks, ctxTok{ctxString, s[start:i], start, i})
		case isWordByte(c):
			start := i
			for i < len(s) && (isWordByte(s[i]) || s[i] == '$') {
				i++
			}
			toks = append(toks, ctxTok{ctxWord, s[start:i], start, i})
		default:
			toks = append(toks, ctxTok{ctxPunct, s[i : i+1], i, i + 1})
			i++
		}
	}
	return toks
}

func (t ctxTok) isPunct(p string) bool { return t.kind == ctxPunct && t.text == p }

func (t ctxTok) isKeyword(words ...string) bool {
	if t.kind != ctxWord {
		return false
	}
	up := strings.ToUpper(t.text)
	for _, w := range words {
		if up == w {
			return true
		}
	}
	return false
}

func (t ctxTok) isNamePart() bool { return t.kind == ctxWord || t.kind == ctxQuoted }

// unquoteIdent strips the quotes of a quoted identifier.
func unquoteIdent(s string) string {
	if len(s) >= 2 {
		q := s[0]
		if (q == '"' || q == '`') && s[len(s)-1] == q {
			return strings.ReplaceAll(s[1:len(s)-1], string(q)+string(q), string(q))
		}
	}
	return s
}

// statementTokens returns the tokens of the statement that holds byte offset
// pos (statements end at a top-level ";"; a cursor right after one belongs to
// the next statement).
func statementTokens(all []ctxTok, pos int) []ctxTok {
	start, end := 0, len(all)
	for i, t := range all {
		if !t.isPunct(";") {
			continue
		}
		if t.end <= pos {
			start = i + 1
		} else if t.start >= pos {
			end = i
			break
		}
	}
	if start > end {
		start = end
	}
	return all[start:end]
}

// reservedAfterTable are words that can follow a table reference without being
// its alias.
var reservedAfterTable = map[string]bool{
	"WHERE": true, "ON": true, "JOIN": true, "LEFT": true, "RIGHT": true, "INNER": true, "OUTER": true, "FULL": true,
	"CROSS": true, "NATURAL": true, "USING": true, "GROUP": true, "ORDER": true, "HAVING": true, "LIMIT": true,
	"UNION": true, "INTERSECT": true, "EXCEPT": true, "SET": true, "VALUES": true, "SELECT": true, "RETURNING": true,
	"FETCH": true, "OFFSET": true, "WINDOW": true, "FOR": true, "WITH": true, "LATERAL": true, "AND": true, "OR": true,
	"AS": true, "FROM": true, "DEFAULT": true, "WHEN": true, "THEN": true, "ELSE": true, "END": true, "STRAIGHT_JOIN": true,
}

// tableRef is one table, CTE or subquery a statement reads from.
type tableRef struct {
	Name     string // as written: schema.table, a CTE name, or "" for a subquery
	Subquery string // "(select ...)" including the parentheses
	Alias    string // unquoted; "" when none
	Start    int    // byte offset of the reference in the text
	Kind     string // the keyword that introduced it, lower case: from, join, update, into
}

// Label is how the reference is named in the statement: its alias, else the
// last part of its name.
func (r tableRef) Label() string {
	if r.Alias != "" {
		return r.Alias
	}
	return lastNamePart(r.Name)
}

// lastNamePart returns the unquoted final part of a dotted name as written.
func lastNamePart(name string) string {
	toks := tokenizeContext(name)
	for i := len(toks) - 1; i >= 0; i-- {
		if toks[i].isNamePart() {
			return unquoteIdent(toks[i].text)
		}
	}
	return name
}

// splitSchemaTable splits a name as written into its schema (may be empty) and
// table parts, both still as written.
func splitSchemaTable(name string) (schema, table string) {
	toks := tokenizeContext(name)
	var parts []string
	for _, t := range toks {
		if t.isNamePart() {
			parts = append(parts, t.text)
		}
	}
	switch len(parts) {
	case 0:
		return "", name
	case 1:
		return "", parts[0]
	default:
		return parts[len(parts)-2], parts[len(parts)-1]
	}
}

// matchingParen returns the index of the ")" closing the "(" at toks[open], or -1.
func matchingParen(toks []ctxTok, open int) int {
	depth := 0
	for i := open; i < len(toks); i++ {
		if toks[i].isPunct("(") {
			depth++
		} else if toks[i].isPunct(")") {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

// parseNameAt reads schema.table style dotted names at toks[i].
func parseNameAt(toks []ctxTok, i int) (end int, ok bool) {
	if i >= len(toks) || !toks[i].isNamePart() {
		return i, false
	}
	end = i + 1
	for end+1 < len(toks) && toks[end].isPunct(".") && toks[end+1].isNamePart() {
		end += 2
	}
	return end, true
}

// tableRefs lists what the statement reads from or writes to: the references
// after FROM, JOIN, UPDATE and INTO.
func tableRefs(text string, toks []ctxTok) []tableRef {
	var refs []tableRef
	for i := 0; i < len(toks); i++ {
		if !toks[i].isKeyword("FROM", "JOIN", "UPDATE", "INTO") {
			continue
		}
		isFrom := toks[i].isKeyword("FROM")
		// FROM that is not a table source: EXTRACT(year FROM d), TRIM(x FROM y),
		// a IS DISTINCT FROM b -- no clause of its own is open there.
		if isFrom && (clauseAt(toks, toks[i].start) == "" || i > 0 && toks[i-1].isKeyword("DISTINCT")) {
			continue
		}
		kind := strings.ToLower(toks[i].text)
		j := i + 1
		for j < len(toks) {
			ref := tableRef{Kind: kind}
			if toks[j].isPunct("(") {
				k := matchingParen(toks, j)
				if k < 0 {
					break
				}
				ref.Subquery = text[toks[j].start:toks[k].end]
				ref.Start = toks[j].start
				j = k + 1
			} else if end, ok := parseNameAt(toks, j); ok {
				ref.Name = text[toks[j].start:toks[end-1].end]
				ref.Start = toks[j].start
				j = end
			} else {
				break
			}
			if j < len(toks) && toks[j].isKeyword("AS") {
				j++
			}
			if j < len(toks) && toks[j].isNamePart() && !(toks[j].kind == ctxWord && reservedAfterTable[strings.ToUpper(toks[j].text)]) {
				ref.Alias = unquoteIdent(toks[j].text)
				j++
			}
			refs = append(refs, ref)
			if isFrom && j < len(toks) && toks[j].isPunct(",") {
				j++
				continue
			}
			break
		}
	}
	return refs
}

// cteDef is one "name AS (body)" of a WITH clause.
type cteDef struct {
	Name string
}

// cteClause reads a leading WITH clause. It returns the CTEs and the text of
// the whole clause ("WITH a AS (...), b AS (...)"), usable as a prefix in front
// of a probing query; both are empty when the statement has no WITH.
func cteClause(text string, toks []ctxTok) (defs []cteDef, clause string) {
	if len(toks) == 0 || !toks[0].isKeyword("WITH") {
		return nil, ""
	}
	i := 1
	if i < len(toks) && toks[i].isKeyword("RECURSIVE") {
		i++
	}
	lastEnd := -1
	for i < len(toks) {
		if !toks[i].isNamePart() {
			break
		}
		name := unquoteIdent(toks[i].text)
		i++
		if i < len(toks) && toks[i].isPunct("(") { // column list
			k := matchingParen(toks, i)
			if k < 0 {
				break
			}
			i = k + 1
		}
		if i >= len(toks) || !toks[i].isKeyword("AS") {
			break
		}
		i++
		for i < len(toks) && toks[i].isKeyword("NOT", "MATERIALIZED") {
			i++
		}
		if i >= len(toks) || !toks[i].isPunct("(") {
			break
		}
		k := matchingParen(toks, i)
		if k < 0 {
			break
		}
		defs = append(defs, cteDef{Name: name})
		lastEnd = toks[k].end
		i = k + 1
		if i < len(toks) && toks[i].isPunct(",") {
			i++
			continue
		}
		break
	}
	if lastEnd < 0 {
		return nil, ""
	}
	return defs, text[toks[0].start:lastEnd]
}

// clauseAt names the clause the cursor is in: select, from, join, on, where,
// group, order, having, set, values, update, into, insert_columns, values_list,
// returning, limit, or "" outside any (for instance right after an opening
// parenthesis). Only tokens that end at or before wordStart count, so the word
// being typed does not influence it. Clauses of enclosing queries are restored
// when a subquery closes.
func clauseAt(toks []ctxTok, wordStart int) string {
	stack := []string{""}
	for i, t := range toks {
		if t.end > wordStart {
			break
		}
		top := len(stack) - 1
		switch {
		case t.isPunct("("):
			next := ""
			switch {
			case stack[top] == "into" && i > 0 && toks[i-1].isNamePart():
				next = "insert_columns"
			case stack[top] == "values":
				next = "values_list"
			}
			stack = append(stack, next)
		case t.isPunct(")"):
			if len(stack) > 1 {
				stack = stack[:top]
			}
		case t.kind == ctxWord:
			switch strings.ToUpper(t.text) {
			case "SELECT":
				stack[top] = "select"
			case "FROM":
				stack[top] = "from"
			case "JOIN":
				stack[top] = "join"
			case "ON":
				stack[top] = "on"
			case "WHERE":
				stack[top] = "where"
			case "GROUP":
				stack[top] = "group"
			case "ORDER":
				stack[top] = "order"
			case "HAVING":
				stack[top] = "having"
			case "SET":
				stack[top] = "set"
			case "VALUES":
				stack[top] = "values"
			case "DELETE":
				stack[top] = "delete"
			case "UPDATE":
				stack[top] = "update"
			case "INTO":
				stack[top] = "into"
			case "RETURNING":
				stack[top] = "returning"
			case "LIMIT", "OFFSET", "FETCH":
				stack[top] = "limit"
			}
		}
	}
	return stack[len(stack)-1]
}

// runeIndexToByte converts a character index (what the editor sends) into a
// byte offset, clamped to the text.
func runeIndexToByte(s string, runeIdx int) int {
	if runeIdx <= 0 {
		return 0
	}
	n := 0
	for i := range s {
		if n == runeIdx {
			return i
		}
		n++
	}
	return len(s)
}

// completionContext is what completion knows about the place being edited.
type completionContext struct {
	Clause    string
	Refs      []tableRef
	CTEs      []cteDef
	CTEPrefix string // "WITH ... " to put in front of probing queries, or ""
	WordStart int
}

// analyzeCompletion examines the statement around cursor (a character index
// into sql) where the word typed so far is word.
func analyzeCompletion(sql string, cursor int, word string) completionContext {
	pos := runeIndexToByte(sql, cursor)
	wordStart := pos - len(word)
	if wordStart < 0 || wordStart > len(sql) || !strings.HasSuffix(sql[:pos], word) {
		wordStart = pos
	}
	toks := statementTokens(tokenizeContext(sql), wordStart)
	ctx := completionContext{WordStart: wordStart}
	ctx.Clause = clauseAt(toks, wordStart)
	ctx.Refs = tableRefs(sql, toks)
	var clause string
	ctx.CTEs, clause = cteClause(sql, toks)
	if clause != "" {
		ctx.CTEPrefix = clause + " "
	}
	return ctx
}

// findRef returns the reference a qualifier (an alias or a table name) stands for.
func (c completionContext) findRef(qualifier string) (tableRef, bool) {
	q := strings.ToLower(unquoteIdent(qualifier))
	for _, r := range c.Refs {
		if r.Alias != "" && strings.ToLower(r.Alias) == q {
			return r, true
		}
	}
	for _, r := range c.Refs {
		if r.Alias == "" && r.Name != "" && strings.ToLower(lastNamePart(r.Name)) == q {
			return r, true
		}
	}
	for _, d := range c.CTEs { // a CTE named but not (yet) selected from
		if strings.ToLower(d.Name) == q {
			return tableRef{Name: d.Name}, true
		}
	}
	return tableRef{}, false
}

// expression is the text to put after FROM to read the reference's columns.
func (r tableRef) expression() string {
	if r.Subquery != "" {
		return r.Subquery
	}
	return r.Name
}
