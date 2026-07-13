package main

import (
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

// openSQLiteTarget opens the actual user database file a saved SQLite
// connection points at — not to be confused with OmniDB's own app database
// (users/connections/snippets), which is opened via openAppDB instead (see
// appdb.go).
func openSQLiteTarget(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// sqliteProperties mirrors SQLite.py's GetProperties: a table of Property/
// Value pairs, one row per sqlite_master column for real objects (table,
// index, view, trigger), or a synthetic Type/Name pair for object kinds
// SQLite has no catalog entry for (columns, PKs, FKs, uniques — SQLite
// expresses these as part of the table's own DDL, not as separate objects).
func sqliteProperties(db *sql.DB, table, object, kind string) ([][2]string, error) {
	switch kind {
	case "table":
		return sqliteMasterProperties(db, "table", object, "")
	case "index":
		return sqliteMasterProperties(db, "index", object, "")
	case "view":
		return sqliteMasterProperties(db, "view", object, "")
	case "trigger":
		return sqliteMasterProperties(db, "trigger", object, table)
	case "table_field":
		return [][2]string{{"Type", "Column"}, {"Name", object}}, nil
	case "pk":
		return [][2]string{{"Type", "PK"}, {"Name", object}}, nil
	case "foreign_key":
		return [][2]string{{"Type", "FK"}, {"Name", object}}, nil
	case "unique":
		return [][2]string{{"Type", "Unique"}, {"Name", object}}, nil
	default:
		return nil, nil
	}
}

func sqliteMasterProperties(db *sql.DB, objType, name, tblName string) ([][2]string, error) {
	var row *sql.Row
	if tblName != "" {
		row = db.QueryRow(`SELECT type, name, rootpage FROM sqlite_master WHERE type = ? AND name = ? AND tbl_name = ?`, objType, name, tblName)
	} else {
		row = db.QueryRow(`SELECT type, name, rootpage FROM sqlite_master WHERE type = ? AND name = ?`, objType, name)
	}

	var gotType, gotName string
	var rootpage int
	if err := row.Scan(&gotType, &gotName, &rootpage); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("object %s does not exist anymore. Please refresh the tree view", name)
		}
		return nil, err
	}

	return [][2]string{
		{"Type", gotType},
		{"Name", gotName},
		{"Root Page", fmt.Sprintf("%d", rootpage)},
	}, nil
}

// sqliteTable mirrors one row of tree_sqlite.py's get_tables response — the
// v_has_* flags are static per-driver constants in SQLite.py's __init__
// (SQLite genuinely has no schema/functions/sequences/checks/etc., and its
// primary keys/foreign keys/uniques/indexes/triggers are all first-class),
// not something queried per table.
type sqliteTable struct {
	Name string
}

// sqliteTables mirrors SQLite.py's QueryTables.
func sqliteTables(db *sql.DB) ([]sqliteTable, error) {
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []sqliteTable
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, sqliteTable{Name: name})
	}
	return tables, rows.Err()
}

// sqliteColumn mirrors the subset of SQLite.py's QueryTablesFields columns
// that tree_sqlite.py's get_columns view actually sends to the frontend.
type sqliteColumn struct {
	Name       string
	DataType   string
	DataLength string
	Nullable   string
}

// sqliteColumns mirrors SQLite.py's QueryTablesFields for a single table —
// parses `PRAGMA table_info`'s free-form type string the same way the
// Python code does (e.g. "varchar(50)" -> type "varchar", length "50").
// PRAGMA statements don't accept bound parameters, so the table name is
// quoted the same (naive) way SQLite.py itself does.
func sqliteColumns(db *sql.DB, table string) ([]sqliteColumn, error) {
	quoted := strings.ReplaceAll(table, "'", "''")
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info('%s')", quoted))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []sqliteColumn
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return nil, err
		}

		dataType, dataLength := colType, ""
		if idx := strings.Index(colType, "("); idx >= 0 {
			dataType = strings.ToLower(colType[:idx])
			if end := strings.Index(colType, ")"); end > idx {
				inner := colType[idx+1 : end]
				if comma := strings.Index(inner, ","); comma >= 0 {
					dataLength = "" // precision/scale, not a plain length — unused by get_columns
				} else {
					dataLength = inner
				}
			}
		} else {
			dataType = strings.ToLower(colType)
		}

		nullable := "YES"
		if notNull == 1 {
			nullable = "NO"
		}

		columns = append(columns, sqliteColumn{
			Name:       name,
			DataType:   dataType,
			DataLength: dataLength,
			Nullable:   nullable,
		})
	}
	return columns, rows.Err()
}

// sqliteVersion mirrors SQLite.py's GetVersion.
func sqliteVersion(db *sql.DB) (string, error) {
	var version string
	if err := db.QueryRow(`SELECT sqlite_version()`).Scan(&version); err != nil {
		return "", err
	}
	return "SQLite " + version, nil
}

// DDL wizard templates shown in the tree's "create/alter/drop" context menu
// actions. These are static hint text (with #placeholder# markers the user
// fills in), copied verbatim from SQLite.py's Template* methods — there's
// no query involved, so no reason for these to ever differ from the Python
// originals.
const (
	sqliteTemplateCreateView    = "CREATE\n--TEMPORARY\nVIEW view_name\n--( column_definition, ... )\nAS\n--SELECT...\n"
	sqliteTemplateDropView      = "DROP VIEW #view_name#"
	sqliteTemplateCreateTable   = "CREATE\n--TEMPORARY\nTABLE table_name\n(\n\tcolumn_name data_type\n\t--CONSTRAINT constraint_name\n\t--NOT NULL\n\t--CHECK\n\t--UNIQUE\n\t--PRIMARY KEY\n\t--FOREIGN KEY\n)\n--WITHOUT ROWID\n"
	sqliteTemplateAlterTable    = "ALTER TABLE #table_name#\n--RENAME TO new_table_name\n--RENAME COLUMN column_name TO new_column_name\n--ADD COLUMN columnd_definition\n"
	sqliteTemplateDropTable     = "DROP TABLE #table_name#"
	sqliteTemplateCreateColumn  = "ALTER TABLE #table_name#\nADD COLUMN columnd_definition\n"
	sqliteTemplateCreateIndex   = "CREATE\n--UNIQUE\nINDEX index_name ON #table_name# ( column_name, ... )\n--WHERE expression\n"
	sqliteTemplateReindex       = "REINDEX #index_name#"
	sqliteTemplateDropIndex     = "DROP INDEX #index_name#"
	sqliteTemplateDelete        = "DELETE FROM\n#table_name#\nWHERE condition\n"
	sqliteTemplateCreateTrigger = "CREATE\n--TEMPORARY\nTRIGGER trigger_name\n--BEFORE\n--AFTER\n--INSTEAD OF\n--DELETE\n--INSERT\n--UPDATE\n--OF column_name\nON #table_name#\n--FOR EACH ROW\nWHEN expression\nBEGIN\n\tstatement\n;\nEND\n"
	sqliteTemplateDropTrigger   = "DROP TRIGGER #trigger_name#"
)

// sqliteTreeInfo mirrors tree_sqlite.py's get_tree_info: database name,
// version, and the static DDL wizard templates shown for this engine.
func sqliteTreeInfo(db *sql.DB, databaseName string) (map[string]any, error) {
	version, err := sqliteVersion(db)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"v_database":     databaseName,
		"version":        version,
		"create_view":    sqliteTemplateCreateView,
		"drop_view":      sqliteTemplateDropView,
		"create_table":   sqliteTemplateCreateTable,
		"alter_table":    sqliteTemplateAlterTable,
		"drop_table":     sqliteTemplateDropTable,
		"create_column":  sqliteTemplateCreateColumn,
		"create_index":   sqliteTemplateCreateIndex,
		"reindex":        sqliteTemplateReindex,
		"drop_index":     sqliteTemplateDropIndex,
		"delete":         sqliteTemplateDelete,
		"create_trigger": sqliteTemplateCreateTrigger,
		"drop_trigger":   sqliteTemplateDropTrigger,
	}, nil
}

// sqliteDDL mirrors SQLite.py's GetDDL.
func sqliteDDL(db *sql.DB, table, object, kind string) (string, error) {
	var query string
	var args []any
	switch kind {
	case "table":
		query, args = `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, []any{object}
	case "index":
		query, args = `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`, []any{object}
	case "view":
		query, args = `SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ?`, []any{object}
	case "trigger":
		query, args = `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ? AND tbl_name = ?`, []any{object, table}
	default:
		return "", nil
	}

	var ddl sql.NullString
	if err := db.QueryRow(query, args...).Scan(&ddl); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return ddl.String, nil
}
