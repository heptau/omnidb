package main

import "sort"

// The DDL panel shows an object's privileges as GRANT statements under its
// CREATE statement, for every backend that has them (see
// postgresql_ddl_extras.go, mysql_ddl_extras.go, oracle_ddl_extras.go). The
// catalogs all hand those over one privilege at a time, while GRANT itself
// takes a privilege list — so the sorting and grouping that turns
// "SELECT to bob / INSERT to bob" into "GRANT SELECT, INSERT ... TO bob"
// is identical work per backend, and lives here once. Only the statement
// text around a group differs (identifier quoting, the object-kind keyword,
// how a grantee is spelled), and that stays with each backend.

// grantEntry is one privilege granted to one grantee. column is empty for
// object-level privileges and set for column-level ones, whose GRANT syntax
// puts a column list after the privilege in both PostgreSQL and MySQL.
type grantEntry struct {
	grantee   string
	privilege string
	grantable bool
	column    string
}

// grantGroup is everything that can share a single GRANT statement.
type grantGroup struct {
	grantee    string
	privileges []string
	grantable  bool
	column     string
}

// privilegeOrder ranks privilege keywords roughly the way the GRANT syntax
// summaries list them, so a multi-privilege statement reads "SELECT, INSERT"
// rather than alphabetically shuffled. It spans every backend's vocabulary;
// anything unlisted (a privilege from a newer server than this table knows
// about) sorts last, by name.
var privilegeOrder = map[string]int{
	"SELECT":        0,
	"INSERT":        1,
	"UPDATE":        2,
	"DELETE":        3,
	"TRUNCATE":      4,
	"REFERENCES":    5,
	"TRIGGER":       6,
	"MAINTAIN":      7,
	"CREATE":        8,
	"ALTER":         9,
	"INDEX":         10,
	"DROP":          11,
	"CONNECT":       12,
	"TEMPORARY":     13,
	"EXECUTE":       14,
	"ALTER ROUTINE": 15,
	"USAGE":         16,
	"SET":           17,
	"ALTER SYSTEM":  18,
}

func privilegeRank(privilege string) int {
	if rank, ok := privilegeOrder[privilege]; ok {
		return rank
	}
	return len(privilegeOrder)
}

// groupGrantEntries collapses exploded privilege rows into one group per
// (column, grantee, grant-option) — object-level groups first, then the
// column-level ones, PUBLIC before named grantees.
func groupGrantEntries(entries []grantEntry) []grantGroup {
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.column != b.column {
			return a.column < b.column
		}
		if a.grantee != b.grantee {
			if (a.grantee == "PUBLIC") != (b.grantee == "PUBLIC") {
				return a.grantee == "PUBLIC"
			}
			return a.grantee < b.grantee
		}
		if a.grantable != b.grantable {
			return !a.grantable
		}
		if ra, rb := privilegeRank(a.privilege), privilegeRank(b.privilege); ra != rb {
			return ra < rb
		}
		return a.privilege < b.privilege
	})

	groups := make([]grantGroup, 0)
	for start := 0; start < len(entries); {
		end := start + 1
		for end < len(entries) &&
			entries[end].column == entries[start].column &&
			entries[end].grantee == entries[start].grantee &&
			entries[end].grantable == entries[start].grantable {
			end++
		}
		group := grantGroup{
			grantee:    entries[start].grantee,
			grantable:  entries[start].grantable,
			column:     entries[start].column,
			privileges: make([]string, 0, end-start),
		}
		for _, e := range entries[start:end] {
			group.privileges = append(group.privileges, e.privilege)
		}
		groups = append(groups, group)
		start = end
	}
	return groups
}
