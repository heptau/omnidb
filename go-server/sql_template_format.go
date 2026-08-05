package main

import "strings"

// formatTemplateColumnList joins per-column template fragments (a bind
// placeholder or a "col = ?" expression) for the tree context menu's
// TemplateInsert/TemplateUpdate SQL, one per line, with a trailing comma
// at the end of every line but the last (matching normal SQL style —
// comma introduces the next item, rather than a leading comma announcing
// it) and each continuation line indented by indentUnit (the user's
// configured indent_char/indent_size Settings, see
// indentUnitFromCharSize).
//
// Each fragment may carry a "-- type hint" comment (comments[i], empty
// string for none). The comma always lands before the comment: SQL's "--"
// runs to the end of the line, so a comma placed after it would be
// swallowed into the comment text instead of staying a real token
// separating the next value/assignment.
func formatTemplateColumnList(cores, comments []string, indentUnit string) string {
	lines := make([]string, len(cores))
	for i, core := range cores {
		line := core
		if i < len(cores)-1 {
			line += ","
		}
		if comments[i] != "" {
			line += " -- " + comments[i]
		}
		lines[i] = line
	}
	return strings.Join(lines, "\n"+indentUnit)
}
