package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// Snippet layout for version control (see vcs.go): one .sql file per snippet,
// one directory per snippet folder.

// snippetPathReplacer makes a snippet or folder name safe as one path element
// on every platform.
var snippetPathReplacer = strings.NewReplacer(
	"/", "_", "\\", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
)

func safePathElement(name string) string {
	name = snippetPathReplacer.Replace(name)
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return '_'
		}
		return r
	}, name)
	name = strings.Trim(name, " .")
	if name == "" {
		return "_"
	}
	return name
}

// snippetExportEntry is one snippet and the relative path it is written to.
type snippetExportEntry struct {
	Path string
	Text string
}

// snippetExportEntries lays the user's snippets out as relative paths. Two
// siblings that map to the same file name get a numeric suffix so neither
// overwrites the other.
func snippetExportEntries(db *sql.DB, userID int64) ([]snippetExportEntry, error) {
	folders, err := fetchSnippetFolders(db, userID)
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`select parent_id, name, text from OmniDB_app_snippetfile where user_id = ? order by id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := map[int64]snippetFolder{}
	for _, f := range folders {
		byID[f.ID] = f
	}
	dirOf := func(parent sql.NullInt64) string {
		var parts []string
		seen := map[int64]bool{}
		for parent.Valid && !seen[parent.Int64] {
			seen[parent.Int64] = true
			f, ok := byID[parent.Int64]
			if !ok {
				break
			}
			parts = append([]string{safePathElement(f.Name)}, parts...)
			parent = f.ParentID
		}
		return strings.Join(parts, "/")
	}

	used := map[string]bool{}
	var out []snippetExportEntry
	for rows.Next() {
		var parent sql.NullInt64
		var name, text string
		if err := rows.Scan(&parent, &name, &text); err != nil {
			return nil, err
		}
		dir := dirOf(parent)
		base := safePathElement(name)
		path := base + ".sql"
		if dir != "" {
			path = dir + "/" + path
		}
		stem := strings.TrimSuffix(path, ".sql")
		for n := 2; used[strings.ToLower(path)]; n++ {
			path = fmt.Sprintf("%s (%d)%s", stem, n, ".sql")
		}
		used[strings.ToLower(path)] = true
		out = append(out, snippetExportEntry{Path: path, Text: text})
	}
	return out, rows.Err()
}
