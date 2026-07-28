package main

import (
	"database/sql"
	"time"
)

// snippetFolder/snippetFile mirror the columns tree_snippets.py's views
// actually read from OmniDB_app_snippetfolder/OmniDB_app_snippetfile.
type snippetFolder struct {
	ID       int64
	ParentID sql.NullInt64
	Name     string
}

type snippetFile struct {
	ID       int64
	ParentID sql.NullInt64
	Name     string
}

func fetchSnippetFolders(db *sql.DB, userID int64) ([]snippetFolder, error) {
	rows, err := db.Query(`select id, parent_id, name from OmniDB_app_snippetfolder where user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []snippetFolder
	for rows.Next() {
		var f snippetFolder
		if err := rows.Scan(&f.ID, &f.ParentID, &f.Name); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func fetchSnippetFiles(db *sql.DB, userID int64) ([]snippetFile, error) {
	rows, err := db.Query(`select id, parent_id, name from OmniDB_app_snippetfile where user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []snippetFile
	for rows.Next() {
		var f snippetFile
		if err := rows.Scan(&f.ID, &f.ParentID, &f.Name); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// buildSnippetsTree mirrors tree_snippets.py's build_snippets_object_recursive
// — folders/files are fetched flat (one query each) and nested in Go instead
// of once per recursion level like the Django ORM version does.
func buildSnippetsTree(folders []snippetFolder, files []snippetFile, parentID sql.NullInt64) map[string]any {
	node := map[string]any{
		"id":      nullInt64OrNil(parentID),
		"files":   []map[string]any{},
		"folders": []map[string]any{},
	}

	fileList := node["files"].([]map[string]any)
	for _, f := range files {
		if sameNullInt64(f.ParentID, parentID) {
			fileList = append(fileList, map[string]any{"id": f.ID, "name": f.Name})
		}
	}
	node["files"] = fileList

	folderList := node["folders"].([]map[string]any)
	for _, f := range folders {
		if sameNullInt64(f.ParentID, parentID) {
			child := buildSnippetsTree(folders, files, sql.NullInt64{Int64: f.ID, Valid: true})
			child["id"] = f.ID
			child["name"] = f.Name
			folderList = append(folderList, child)
		}
	}
	node["folders"] = folderList

	return node
}

func sameNullInt64(a, b sql.NullInt64) bool {
	if a.Valid != b.Valid {
		return false
	}
	return !a.Valid || a.Int64 == b.Int64
}

func nullInt64OrNil(n sql.NullInt64) any {
	if !n.Valid {
		return nil
	}
	return n.Int64
}

// snippetGetAllTree mirrors get_all_snippets.
func snippetGetAllTree(db *sql.DB, userID int64) (map[string]any, error) {
	folders, err := fetchSnippetFolders(db, userID)
	if err != nil {
		return nil, err
	}
	files, err := fetchSnippetFiles(db, userID)
	if err != nil {
		return nil, err
	}
	return buildSnippetsTree(folders, files, sql.NullInt64{}), nil
}

type snippetNodeRef struct {
	ID   int64
	Name string
}

// snippetGetNodeChildren mirrors get_node_children — parentID nil means the
// tree root (Django's `parent=None` filter).
func snippetGetNodeChildren(db *sql.DB, userID int64, parentID *int64) (folders []snippetNodeRef, files []snippetNodeRef, err error) {
	var rows *sql.Rows
	if parentID == nil {
		rows, err = db.Query(`select id, name from OmniDB_app_snippetfolder where user_id = ? and parent_id is null`, userID)
	} else {
		rows, err = db.Query(`select id, name from OmniDB_app_snippetfolder where user_id = ? and parent_id = ?`, userID, *parentID)
	}
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var n snippetNodeRef
		if err := rows.Scan(&n.ID, &n.Name); err != nil {
			rows.Close()
			return nil, nil, err
		}
		folders = append(folders, n)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, nil, err
	}
	rows.Close()

	if parentID == nil {
		rows, err = db.Query(`select id, name from OmniDB_app_snippetfile where user_id = ? and parent_id is null`, userID)
	} else {
		rows, err = db.Query(`select id, name from OmniDB_app_snippetfile where user_id = ? and parent_id = ?`, userID, *parentID)
	}
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var n snippetNodeRef
		if err := rows.Scan(&n.ID, &n.Name); err != nil {
			return nil, nil, err
		}
		files = append(files, n)
	}
	return folders, files, rows.Err()
}

// snippetGetText mirrors get_snippet_text.
func snippetGetText(db *sql.DB, userID, fileID int64) (string, error) {
	var text string
	err := db.QueryRow(`select text from OmniDB_app_snippetfile where id = ? and user_id = ?`, fileID, userID).Scan(&text)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return text, err
}

// snippetNewNode mirrors new_node_snippet — p_sn_id_parent must reference a
// folder owned by the same user, same ownership check Django's
// SnippetFolder.objects.get(id=..., user=request.user) performs.
func snippetNewNode(db *sql.DB, userID int64, parentID *int64, mode, name string) error {
	if parentID != nil {
		var owner int64
		if err := db.QueryRow(`select user_id from OmniDB_app_snippetfolder where id = ?`, *parentID).Scan(&owner); err != nil {
			return err
		}
		if owner != userID {
			return sql.ErrNoRows
		}
	}

	now := time.Now().UTC()
	if mode == "node" {
		_, err := db.Exec(`insert into OmniDB_app_snippetfolder (user_id, parent_id, name, create_date, modify_date) values (?, ?, ?, ?, ?)`,
			userID, nullableInt64(parentID), name, now, now)
		return err
	}
	_, err := db.Exec(`insert into OmniDB_app_snippetfile (user_id, parent_id, name, create_date, modify_date, text) values (?, ?, ?, ?, ?, '')`,
		userID, nullableInt64(parentID), name, now, now)
	return err
}

func nullableInt64(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

// snippetDeleteNode mirrors delete_node_snippet. Django's ORM cascades
// on_delete=CASCADE by walking the FK graph in Python and issuing explicit
// DELETEs for every dependent row — it is NOT enforced at the SQLite schema
// level (no "ON DELETE CASCADE" in the actual column definitions, verified
// against the live schema), so deleting a folder here must recursively
// delete its descendant folders/files itself, or they'd be left behind as
// orphans referencing a parent_id that no longer exists.
func snippetDeleteNode(db *sql.DB, userID, id int64, mode string) error {
	if mode == "node" {
		var owner int64
		if err := db.QueryRow(`select user_id from OmniDB_app_snippetfolder where id = ?`, id).Scan(&owner); err != nil {
			return err
		}
		if owner != userID {
			return sql.ErrNoRows
		}
		return deleteSnippetFolderRecursive(db, id)
	}

	var owner int64
	if err := db.QueryRow(`select user_id from OmniDB_app_snippetfile where id = ?`, id).Scan(&owner); err != nil {
		return err
	}
	if owner != userID {
		return sql.ErrNoRows
	}
	_, err := db.Exec(`delete from OmniDB_app_snippetfile where id = ?`, id)
	return err
}

func deleteSnippetFolderRecursive(db *sql.DB, folderID int64) error {
	childRows, err := db.Query(`select id from OmniDB_app_snippetfolder where parent_id = ?`, folderID)
	if err != nil {
		return err
	}
	var childIDs []int64
	for childRows.Next() {
		var id int64
		if err := childRows.Scan(&id); err != nil {
			childRows.Close()
			return err
		}
		childIDs = append(childIDs, id)
	}
	if err := childRows.Err(); err != nil {
		childRows.Close()
		return err
	}
	childRows.Close()

	for _, childID := range childIDs {
		if err := deleteSnippetFolderRecursive(db, childID); err != nil {
			return err
		}
	}

	if _, err := db.Exec(`delete from OmniDB_app_snippetfile where parent_id = ?`, folderID); err != nil {
		return err
	}
	_, err = db.Exec(`delete from OmniDB_app_snippetfolder where id = ?`, folderID)
	return err
}

// snippetSaveText mirrors save_snippet_text. Deliberately does NOT reproduce
// Python's `v_text.replace("'", "”")` before saving an existing file's text
// — that's a leftover from some earlier raw-SQL version of this code. Django's
// ORM (like Go's database/sql here) already parameterizes the UPDATE, so
// that replace call only corrupts the stored text by literally doubling every
// single quote on each edit; it's not needed for escaping and was never
// applied on initial creation either (only on update), which is itself a
// sign it's a bug rather than an intentional behavior.
func snippetSaveText(db *sql.DB, userID int64, id *int64, parentID *int64, name, text string) (int64, error) {
	now := time.Now().UTC()
	if id == nil {
		res, err := db.Exec(`insert into OmniDB_app_snippetfile (user_id, parent_id, name, create_date, modify_date, text) values (?, ?, ?, ?, ?, ?)`,
			userID, nullableInt64(parentID), name, now, now, text)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}

	res, err := db.Exec(`update OmniDB_app_snippetfile set text = ?, modify_date = ? where id = ? and user_id = ?`, text, now, *id, userID)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, sql.ErrNoRows
	}
	return *id, nil
}

// snippetRenameNode mirrors rename_node_snippet — same quote-doubling bug
// skipped as snippetSaveText.
func snippetRenameNode(db *sql.DB, userID, id int64, mode, name string) error {
	now := time.Now().UTC()
	table := "OmniDB_app_snippetfile"
	if mode == "node" {
		table = "OmniDB_app_snippetfolder"
	}
	res, err := db.Exec(`update `+table+` set name = ?, modify_date = ? where id = ? and user_id = ?`, name, now, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
