package main

import "strings"

// What a name under the cursor in the SQL editor stands for -- used by "go to
// definition" and "find usages". Built on the same scanner as completion
// (sql_context.go): it knows aliases, CTEs and table references of the
// statement, not the database.

type symbolRange struct {
	Start, End int // byte offsets
}

type symbolInfo struct {
	Kind       string // "alias", "cte", "table", "column" or "" when nothing is known
	Name       string // the name under the cursor, unquoted
	Definition *symbolRange
	Usages     []symbolRange // every mention within the statement (aliases and CTEs)
	Table      string        // the table as written, for kind "table"/"column"/"alias" over a table
}

// nameChain finds the dotted name (a.b.c) that contains toks[i] and returns the
// index range [first, last] of its name-part tokens.
func nameChain(toks []ctxTok, i int) (first, last int) {
	first, last = i, i
	for first >= 2 && toks[first-1].isPunct(".") && toks[first-2].isNamePart() {
		first -= 2
	}
	for last+2 < len(toks) && toks[last+1].isPunct(".") && toks[last+2].isNamePart() {
		last += 2
	}
	return first, last
}

func isCTEName(defs []cteDef, name string) bool {
	for _, d := range defs {
		if strings.EqualFold(d.Name, unquoteIdent(name)) {
			return true
		}
	}
	return false
}

// mentions lists the tokens of the statement that name `name` on their own
// (not as the part of a dotted name after a dot).
func mentions(toks []ctxTok, name string) []symbolRange {
	var out []symbolRange
	for i, t := range toks {
		if !t.isNamePart() || !strings.EqualFold(unquoteIdent(t.text), name) {
			continue
		}
		if i > 0 && toks[i-1].isPunct(".") {
			continue
		}
		out = append(out, symbolRange{t.start, t.end})
	}
	return out
}

// resolveSymbol examines the name at byte offset pos of sql.
func resolveSymbol(sql string, pos int) symbolInfo {
	all := tokenizeContext(sql)
	toks := statementTokens(all, pos)
	idx := -1
	for i, t := range toks {
		if t.isNamePart() && t.start <= pos && pos <= t.end {
			idx = i
			if pos < t.end {
				break
			}
		}
	}
	if idx < 0 {
		return symbolInfo{}
	}
	tok := toks[idx]
	info := symbolInfo{Name: unquoteIdent(tok.text)}
	first, last := nameChain(toks, idx)
	refs := tableRefs(sql, toks)
	defs, _ := cteClause(sql, toks)

	// The name of a table reference itself (customer, public.customer).
	for _, r := range refs {
		if r.Name == "" {
			continue
		}
		if tok.start >= r.Start && tok.end <= r.Start+len(r.Name) {
			if !strings.Contains(r.Name, ".") && isCTEName(defs, r.Name) {
				break // a CTE, handled below
			}
			info.Kind = "table"
			info.Table = r.Name
			return info
		}
	}

	if first == last || idx == first { // a bare name, or the qualifier of a.b
		name := info.Name
		for _, d := range defs {
			if strings.EqualFold(d.Name, name) {
				info.Kind = "cte"
				info.Definition = &symbolRange{d.Start, d.End}
				info.Usages = mentions(toks, name)
				return info
			}
		}
		for _, r := range refs {
			if r.Alias != "" && strings.EqualFold(r.Alias, name) {
				info.Kind = "alias"
				if s := aliasStart(sql, toks, r); s >= 0 {
					for _, t := range toks {
						if t.start == s {
							info.Definition = &symbolRange{t.start, t.end}
						}
					}
				}
				info.Usages = mentions(toks, name)
				info.Table = r.Name
				return info
			}
		}
		for _, r := range refs {
			if r.Alias == "" && r.Name != "" && strings.EqualFold(lastNamePart(r.Name), name) {
				info.Kind = "table"
				info.Table = r.Name
				return info
			}
		}
		return info
	}

	// The column part of qualifier.column.
	if idx == last && last-first == 2 {
		qualifier := unquoteIdent(toks[first].text)
		for _, r := range refs {
			if r.Alias != "" && strings.EqualFold(r.Alias, qualifier) ||
				r.Alias == "" && r.Name != "" && strings.EqualFold(lastNamePart(r.Name), qualifier) {
				info.Kind = "column"
				info.Table = r.Name
				return info
			}
		}
	}
	return info
}
