package main

import (
	"fmt"
	"strings"
)

// consoleValueToString mirrors Python's str(value) as used by
// Spartacus.Database.DataTable.Pretty() — unlike formatSQLValue (used by the
// query grid, which folds NULL into ""), the console transcript shows NULL
// as the literal word "None", matching what a raw DB-API row looks like
// when printed with Python's str().
func consoleValueToString(v any) string {
	switch x := v.(type) {
	case nil:
		return "None"
	case []byte:
		return string(x)
	case string:
		return x
	case bool:
		if x {
			return "True"
		}
		return "False"
	case int64:
		return fmt.Sprintf("%d", x)
	case float64:
		return fmt.Sprintf("%g", x)
	default:
		return fmt.Sprintf("%v", x)
	}
}

// consolePretty mirrors Spartacus.Database.DataTable.Pretty() — the ASCII
// transcript rendering used by every engine's Special(). p_transpose picks
// the "\x" expanded/RECORD-N form.
func consolePretty(cols []string, rows [][]string, expanded bool) string {
	if expanded {
		return prettyTransposed(cols, rows)
	}
	return prettyTable(cols, rows)
}

// prettyTable mirrors prettytable.PrettyTable.get_string() with the exact
// options Spartacus.Database.Pretty() constructs it with: left-aligned
// columns, hrules=FRAME (top/bottom border + one rule under the header),
// vrules=ALL (a '|' between every column), padding_width=1.
func prettyTable(cols []string, rows [][]string) string {
	widths := make([]int, len(cols))
	for i, c := range cols {
		widths[i] = len([]rune(c))
	}
	for _, row := range rows {
		for i, v := range row {
			if i < len(widths) {
				if n := len([]rune(v)); n > widths[i] {
					widths[i] = n
				}
			}
		}
	}

	hrule := buildHRule(widths)

	var b strings.Builder
	b.WriteString(hrule)
	b.WriteString("\n")
	b.WriteString(buildRow(cols, widths))
	b.WriteString("\n")
	b.WriteString(hrule)
	for _, row := range rows {
		b.WriteString("\n")
		b.WriteString(buildRow(row, widths))
	}
	b.WriteString("\n")
	b.WriteString(hrule)
	return b.String()
}

func buildHRule(widths []int) string {
	var b strings.Builder
	b.WriteString("+")
	for _, w := range widths {
		b.WriteString(strings.Repeat("-", w+2))
		b.WriteString("+")
	}
	return b.String()
}

func buildRow(values []string, widths []int) string {
	var b strings.Builder
	b.WriteString("|")
	for i, w := range widths {
		v := ""
		if i < len(values) {
			v = values[i]
		}
		pad := w - len([]rune(v))
		if pad < 0 {
			pad = 0
		}
		b.WriteString(" ")
		b.WriteString(v)
		b.WriteString(strings.Repeat(" ", pad))
		b.WriteString(" |")
	}
	return b.String()
}

// prettyTransposed mirrors DataTable.Pretty(p_transpose=True) — psql's "\x"
// expanded display, one "-[ RECORD N ]---+---" block per row with each
// column on its own "name | value" line.
func prettyTransposed(cols []string, rows [][]string) string {
	maxc := 0
	for _, c := range cols {
		if n := len([]rune(c)); n > maxc {
			maxc = n
		}
	}
	minWidth := 14 + len(fmt.Sprintf("%d", len(rows)))
	if maxc < minWidth {
		maxc = minWidth
	} else {
		maxc++
	}

	var b strings.Builder
	for rowIdx, row := range rows {
		label := fmt.Sprintf("-[ RECORD %d ]", rowIdx+1)
		b.WriteString(label)
		if len(label) < maxc {
			b.WriteString(strings.Repeat("-", maxc-len(label)))
		}
		b.WriteString("+")
		b.WriteString(strings.Repeat("-", 10))
		b.WriteString("\n")

		for i, c := range cols {
			v := ""
			if i < len(row) {
				v = row[i]
			}
			name := c
			if len([]rune(name)) < maxc {
				name = name + strings.Repeat(" ", maxc-len([]rune(name)))
			}
			b.WriteString(name)
			b.WriteString("|")
			b.WriteString(" ")
			b.WriteString(v)
			b.WriteString("\n")
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}
