package main

import (
	"database/sql"
	"sort"
	"strings"
)

// Context-aware completion built on analyzeCompletion (sql_context.go): column
// names of the tables the statement reads from, foreign-key based join
// conditions after ON, and table / CTE names after FROM and JOIN. Everything
// that touches the database is engine-agnostic (zero-row probing queries and
// the existing foreign-key introspection), so it serves every engine.

// maxCompletionRefs bounds how many references are probed per request.
const maxCompletionRefs = 8

// columnClauses are the clauses where a bare word is most likely a column.
var columnClauses = map[string]bool{
	"select": true, "where": true, "on": true, "group": true, "order": true, "having": true,
	"set": true, "insert_columns": true, "returning": true, "": true,
}

// tableClauses are the clauses where a bare word is most likely a table.
var tableClauses = map[string]bool{"from": true, "join": true, "update": true, "into": true}

// safeToProbe reports whether running the reference (and the statement's CTEs)
// in a zero-row probing query cannot change data: a data-modifying CTE would
// run in full even under "where 1 = 0", on every keystroke.
func (c completionContext) safeToProbe(ref tableRef) bool {
	if c.CTEPrefix != "" && checkReadOnlySQL(c.CTEPrefix+"select 1") != nil {
		return false
	}
	if ref.Subquery != "" && checkReadOnlySQL("select 1 from "+ref.Subquery) != nil {
		return false
	}
	return true
}

// refColumns reads the columns of one reference of the statement.
func refColumns(db *sql.DB, ctx completionContext, ref tableRef) ([]completionColumn, error) {
	if !ctx.safeToProbe(ref) {
		return nil, nil
	}
	return columnMetadataWithPrefix(db, ctx.CTEPrefix, ref.expression())
}

// qualifiedColumnGroup lists the columns of the reference a qualifier names,
// each prefixed with what the user typed ("t." + column).
func qualifiedColumnGroup(db *sql.DB, ctx completionContext, typed, qualifier string) *autocompleteGroup {
	ref, ok := ctx.findRef(qualifier)
	if !ok {
		return nil
	}
	cols, err := refColumns(db, ctx, ref)
	if err != nil || len(cols) == 0 {
		return nil
	}
	group := autocompleteGroup{Type: "column"}
	for _, c := range cols {
		val := typed + c.Name
		group.Elements = append(group.Elements, autocompleteElement{Value: val, SelectValue: val, Complement: c.DataType})
	}
	return &group
}

// unqualifiedColumnGroup lists the columns of every reference in the statement
// that start with word; a column present in several references is listed once,
// the complement naming where it comes from.
func unqualifiedColumnGroup(db *sql.DB, ctx completionContext, word string) *autocompleteGroup {
	refs := ctx.Refs
	if len(refs) > maxCompletionRefs {
		refs = refs[:maxCompletionRefs]
	}
	type entry struct {
		name, dataType string
		from           []string
	}
	var order []string
	byName := map[string]*entry{}
	for _, ref := range refs {
		cols, err := refColumns(db, ctx, ref)
		if err != nil {
			continue
		}
		for _, c := range cols {
			if !strings.HasPrefix(strings.ToLower(c.Name), strings.ToLower(word)) {
				continue
			}
			key := strings.ToLower(c.Name)
			e, ok := byName[key]
			if !ok {
				e = &entry{name: c.Name, dataType: c.DataType}
				byName[key] = e
				order = append(order, key)
			}
			e.from = append(e.from, ref.Label())
		}
	}
	if len(order) == 0 {
		return nil
	}
	group := autocompleteGroup{Type: "column"}
	for _, key := range order {
		e := byName[key]
		complement := e.dataType
		if len(refs) > 1 {
			complement += " · " + strings.Join(e.from, ", ")
		}
		group.Elements = append(group.Elements, autocompleteElement{Value: e.name, SelectValue: e.name, Complement: complement})
	}
	return &group
}

// defaultSchemaFor is the schema an unqualified table name lives in.
func defaultSchemaFor(info *ConnectionInfo, written string) string {
	if written != "" {
		return written
	}
	switch {
	case info.Technology == "postgresql":
		return "public"
	case isMSSQL(info.Technology):
		return "dbo"
	case isOracle(info.Technology):
		return strings.ToUpper(info.Username)
	case isMySQLFamily(info.Technology):
		return info.Database
	}
	return ""
}

// catalogName turns a name as written in the SQL into the form the catalog
// helpers expect (PostgreSQL keeps its quote_ident form, the others the plain name).
func catalogName(technology, written string) string {
	if technology == "postgresql" {
		return written
	}
	return unquoteIdent(written)
}

// joinConditionGroup suggests "child.fk = parent.pk" conditions after ON, from
// the foreign keys between the table being joined (the last reference before the
// cursor) and the references before it.
func joinConditionGroup(db *sql.DB, info *ConnectionInfo, ctx completionContext, word string) *autocompleteGroup {
	var named []tableRef
	for _, r := range ctx.Refs {
		if r.Name != "" && r.Start < ctx.WordStart {
			named = append(named, r)
		}
	}
	if len(named) < 2 {
		return nil
	}
	right := named[len(named)-1]
	tech := info.Technology

	fksOf := func(ref tableRef) []editDataFK {
		schema, table := splitSchemaTable(ref.Name)
		fks, err := editDataForeignKeys(tech, db, catalogName(tech, defaultSchemaFor(info, schema)), catalogName(tech, table))
		if err != nil {
			return nil
		}
		return fks
	}
	col := func(name string) string { return sqlExportIdent(rawIdent(tech, name), tech) }
	conditions := func(child, parent tableRef, fk editDataFK) string {
		parts := make([]string, len(fk.Columns))
		for i := range fk.Columns {
			parts[i] = child.Label() + "." + col(fk.Columns[i]) + " = " + parent.Label() + "." + col(fk.RColumns[i])
		}
		return strings.Join(parts, " AND ")
	}
	sameTable := func(fkTable string, ref tableRef) bool {
		return strings.EqualFold(rawIdent(tech, fkTable), unquoteIdent(lastNamePart(ref.Name)))
	}

	rightFKs := fksOf(right)
	group := autocompleteGroup{Type: "column"}
	seen := map[string]bool{}
	add := func(cond string) {
		if cond == "" || seen[cond] || !strings.HasPrefix(strings.ToLower(cond), strings.ToLower(word)) {
			return
		}
		seen[cond] = true
		group.Elements = append(group.Elements, autocompleteElement{Value: cond, SelectValue: cond, Complement: "foreign key"})
	}
	for _, left := range named[:len(named)-1] {
		for _, fk := range rightFKs { // the joined table points at an earlier one
			if sameTable(fk.RTable, left) {
				add(conditions(right, left, fk))
			}
		}
		for _, fk := range fksOf(left) { // an earlier table points at the joined one
			if sameTable(fk.RTable, right) {
				add(conditions(left, right, fk))
			}
		}
	}
	if len(group.Elements) == 0 {
		return nil
	}
	return &group
}

// tableNameGroup lists CTE names and, on engines without a server-side catalog
// search of their own, the tables of the connection's schemas.
func tableNameGroup(db *sql.DB, info *ConnectionInfo, ctx completionContext, word string) *autocompleteGroup {
	group := autocompleteGroup{Type: "table"}
	match := func(v string) bool {
		return strings.HasPrefix(strings.ToLower(strings.ReplaceAll(v, `"`, "")), strings.ToLower(word))
	}
	for _, d := range ctx.CTEs {
		if match(d.Name) {
			group.Elements = append(group.Elements, autocompleteElement{Value: d.Name, SelectValue: d.Name, Complement: "CTE"})
		}
	}
	if info.Technology != "postgresql" { // PostgreSQL has its own catalog search
		if schemas, err := searchSchemas(info, db); err == nil {
			multiple := len(schemas) > 1
			var hits []autocompleteElement
			for _, schema := range schemas {
				names, err := graphTableNames(info.Technology, db, schema)
				if err != nil {
					continue
				}
				for _, n := range names {
					value := n
					if multiple && schema != "" {
						value = schema + "." + n
					}
					if match(value) {
						hits = append(hits, autocompleteElement{Value: value, SelectValue: value, Complement: "table"})
					}
				}
			}
			sort.SliceStable(hits, func(i, j int) bool { return strings.ToLower(hits[i].Value) < strings.ToLower(hits[j].Value) })
			if len(hits) > searchTablesLimit {
				hits = hits[:searchTablesLimit]
			}
			group.Elements = append(group.Elements, hits...)
		}
	}
	if len(group.Elements) == 0 {
		return nil
	}
	return &group
}

// contextualGroups builds the completion groups for a bare word (no dot) from
// the clause the cursor is in.
func contextualGroups(db *sql.DB, info *ConnectionInfo, ctx completionContext, word string) []autocompleteGroup {
	var groups []autocompleteGroup
	add := func(g *autocompleteGroup) {
		if g != nil {
			groups = append(groups, *g)
		}
	}
	switch {
	case ctx.Clause == "on":
		add(joinConditionGroup(db, info, ctx, word))
		add(unqualifiedColumnGroup(db, ctx, word))
	case columnClauses[ctx.Clause]:
		add(unqualifiedColumnGroup(db, ctx, word))
	case tableClauses[ctx.Clause]:
		add(tableNameGroup(db, info, ctx, word))
	}
	return groups
}
