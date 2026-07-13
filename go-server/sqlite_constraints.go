package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// quoteIdent does the same naive single-quote escaping SQLite.py itself
// relies on before interpolating a table/index/view name into a PRAGMA
// statement (PRAGMAs don't accept bound parameters).
func quoteIdent(name string) string {
	return strings.ReplaceAll(name, "'", "''")
}

// sqlitePrimaryKeyColumnNames returns the column names PRAGMA table_info
// marks as part of the primary key, in the order SQLite reports them.
func sqlitePrimaryKeyColumnNames(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var cid, notNull, pk int
		var name, colType string
		var dfltValue sql.NullString
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return nil, err
		}
		if pk != 0 {
			names = append(names, name)
		}
	}
	return names, rows.Err()
}

// sqlitePrimaryKeys mirrors SQLite.py's QueryTablesPrimaryKeys: one
// "pk_<table>" constraint-name entry per PK column (SQLite has no real
// named PK constraints, OmniDB synthesizes one).
func sqlitePrimaryKeys(db *sql.DB, table string) ([]string, error) {
	cols, err := sqlitePrimaryKeyColumnNames(db, table)
	if err != nil {
		return nil, err
	}
	names := make([]string, len(cols))
	for i := range cols {
		names[i] = "pk_" + table
	}
	return names, nil
}

type sqliteForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
}

// sqliteForeignKeys mirrors SQLite.py's QueryTablesForeignKeys for a single
// table (tree_sqlite.py always calls it scoped to one table).
func sqliteForeignKeys(db *sql.DB, table string) ([]sqliteForeignKey, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA foreign_key_list('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []sqliteForeignKey
	for rows.Next() {
		var id, seq int
		var rTable, from, to, onUpdate, onDelete, match string
		if err := rows.Scan(&id, &seq, &rTable, &from, &to, &onUpdate, &onDelete, &match); err != nil {
			return nil, err
		}
		fks = append(fks, sqliteForeignKey{
			ConstraintName: fmt.Sprintf("%s_fk_%d", table, id),
			RTableName:     rTable,
			DeleteRule:     onDelete,
			UpdateRule:     onUpdate,
		})
	}
	return fks, rows.Err()
}

type sqliteForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// sqliteForeignKeyColumns mirrors SQLite.py's QueryTablesForeignKeysColumns.
func sqliteForeignKeyColumns(db *sql.DB, table, fkey string) ([]sqliteForeignKeyColumn, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA foreign_key_list('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []sqliteForeignKeyColumn
	for rows.Next() {
		var id, seq int
		var rTable, from, to, onUpdate, onDelete, match string
		if err := rows.Scan(&id, &seq, &rTable, &from, &to, &onUpdate, &onDelete, &match); err != nil {
			return nil, err
		}
		if fmt.Sprintf("%s_fk_%d", table, id) == fkey {
			cols = append(cols, sqliteForeignKeyColumn{
				RTableName:  rTable,
				DeleteRule:  onDelete,
				UpdateRule:  onUpdate,
				ColumnName:  from,
				RColumnName: to,
			})
		}
	}
	return cols, rows.Err()
}

// sqliteUniques mirrors SQLite.py's QueryTablesUniques for a single table —
// PRAGMA index_list's origin='u' marks an index created by a UNIQUE
// constraint (as opposed to 'c' for a plain CREATE INDEX, or 'pk').
func sqliteUniques(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_list('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var seq int
		var name, origin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return nil, err
		}
		if origin == "u" {
			names = append(names, name)
		}
	}
	return names, rows.Err()
}

// sqliteUniqueColumns mirrors SQLite.py's QueryTablesUniquesColumns.
func sqliteUniqueColumns(db *sql.DB, table, unique string) ([]string, error) {
	return sqliteIndexInfoColumns(db, table, unique, "u")
}

type sqliteIndex struct {
	Name       string
	Uniqueness string
}

// sqliteIndexes mirrors SQLite.py's QueryTablesIndexes for a single table —
// origin='c' marks a plain CREATE INDEX (as opposed to 'u'/'pk', which are
// synthesized by constraints and shown under Uniques/Primary Key instead).
func sqliteIndexes(db *sql.DB, table string) ([]sqliteIndex, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_list('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []sqliteIndex
	for rows.Next() {
		var seq int
		var name, origin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return nil, err
		}
		if origin == "c" {
			uniqueness := "Non Unique"
			if unique == 1 {
				uniqueness = "Unique"
			}
			indexes = append(indexes, sqliteIndex{Name: name, Uniqueness: uniqueness})
		}
	}
	return indexes, rows.Err()
}

// sqliteIndexColumns mirrors SQLite.py's QueryTablesIndexesColumns.
func sqliteIndexColumns(db *sql.DB, table, index string) ([]string, error) {
	return sqliteIndexInfoColumns(db, table, index, "c")
}

// sqliteIndexInfoColumns backs both sqliteUniqueColumns and
// sqliteIndexColumns — same PRAGMA index_list -> PRAGMA index_info chain,
// filtered by a different origin ('u' for uniques, 'c' for plain indexes).
func sqliteIndexInfoColumns(db *sql.DB, table, indexName, origin string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_list('%s')", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var matched bool
	for rows.Next() {
		var seq int
		var name, rowOrigin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &rowOrigin, &partial); err != nil {
			return nil, err
		}
		if rowOrigin == origin && name == indexName {
			matched = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if !matched {
		return nil, nil
	}

	colRows, err := db.Query(fmt.Sprintf("PRAGMA index_info('%s')", quoteIdent(indexName)))
	if err != nil {
		return nil, err
	}
	defer colRows.Close()

	var columns []string
	for colRows.Next() {
		var seqno, cid int
		var name string
		if err := colRows.Scan(&seqno, &cid, &name); err != nil {
			return nil, err
		}
		columns = append(columns, name)
	}
	return columns, colRows.Err()
}

// sqliteViews mirrors SQLite.py's QueryViews.
func sqliteViews(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'view'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// sqliteTriggers mirrors SQLite.py's QueryTablesTriggers for a single table.
func sqliteTriggers(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}
