package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Table dump and script restore, built from the app's own pieces rather than
// pg_dump/mysqldump: no external program has to be installed and the same
// code serves every engine. A dump is the table's DDL (what the DDL panel
// shows) followed by one INSERT per row; restoring is running such a script.

// maxRestoreStatements bounds one restore.
const maxRestoreStatements = 1000000

// tableDDL returns the CREATE statement the DDL panel shows for a table.
func tableDDL(technology string, db *sql.DB, schema, table string) (string, error) {
	switch {
	case technology == "sqlite":
		return sqliteDDL(db, table, table, "table")
	case technology == "postgresql":
		return postgresqlDDLClass(db, schema, table)
	case isMySQLFamily(technology):
		return mysqlDDL(db, schema, table, "table")
	case isOracle(technology):
		return oracleDDL(db, schema, table)
	case isMSSQL(technology):
		return mssqlTableDDL(db, schema, table)
	case isFirebird(technology):
		return firebirdTableDDL(db, table)
	}
	return "", fmt.Errorf("unsupported technology %q", technology)
}

// dumpTable writes a SQL script recreating a table (and, with withData, its
// rows) to w.
func dumpTable(w io.Writer, db *sql.DB, technology, schema, table string, withData bool) error {
	tableRef, err := editDataTableRef(db, technology, schema, table)
	if err != nil {
		return err
	}
	ddl, err := tableDDL(technology, db, schema, table)
	if err != nil {
		return err
	}
	ddl = strings.TrimSpace(ddl)
	if ddl == "" {
		return fmt.Errorf("no DDL available for %s", table)
	}
	if !strings.HasSuffix(ddl, ";") {
		ddl += ";"
	}
	if _, err := fmt.Fprintf(w, "-- OmniDB dump of %s (%s), %s\n\n%s\n", tableRef, technology, time.Now().UTC().Format("2006-01-02 15:04:05 UTC"), ddl); err != nil {
		return err
	}
	if !withData {
		return nil
	}
	if _, err := io.WriteString(w, "\n"); err != nil {
		return err
	}

	rows, err := db.Query("select * from " + tableRef)
	if err != nil {
		return err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return err
	}
	writer := newSQLInsertWriter(w, tableRef, technology)
	if err := writer.WriteHeader(cols); err != nil {
		return err
	}
	for rows.Next() {
		values, err := scanRowNative(rows, len(cols))
		if err != nil {
			return err
		}
		if err := writer.WriteRow(values); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return writer.Close()
}

// scriptStatements splits a script into the statements worth sending: blank
// ones and ones holding nothing but comments are dropped.
func scriptStatements(script string) []string {
	var out []string
	for _, stmt := range splitSQLStatements(script) {
		if strings.TrimSpace(sqlSkeleton(stmt)) != "" {
			out = append(out, stmt)
		}
	}
	return out
}

// restoreScript runs every statement of script in one transaction, so a failing
// statement leaves nothing half applied (on engines whose DDL is transactional;
// elsewhere the DDL already ran when a later statement fails). It returns the
// number of statements run; an error names the failing one.
func restoreScript(db *sql.DB, script string) (int, error) {
	statements := scriptStatements(script)
	if len(statements) == 0 {
		return 0, fmt.Errorf("the script holds no statements")
	}
	if len(statements) > maxRestoreStatements {
		return 0, fmt.Errorf("too many statements: at most %d can be run at once", maxRestoreStatements)
	}
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	for n, stmt := range statements {
		// codeql[go/sql-injection]: running the user's own script is the feature.
		if _, err := tx.Exec(stmt); err != nil {
			tx.Rollback()
			return 0, fmt.Errorf("statement %d (%s): %w", n+1, editorPreview(stmt), err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(statements), nil
}

type dumpTableRequest struct {
	baseRequest
	PSchema   string `json:"p_schema"`
	PTable    string `json:"p_table"`
	PWithData bool   `json:"p_with_data"`
}

// handleDumpTable writes a dump into the export temp folder and answers the
// way an export does (v_filename / v_downloadname / v_filepath), so the
// frontend delivers it with the same save logic.
func handleDumpTable(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req dumpTableRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()
		who, err := resolveIdentity(upstream, r.Header.Get("Cookie"))
		if err != nil || !who.Authenticated {
			writeUnauthenticated(w)
			return
		}
		schema := ""
		if technologyHasSchema(info.Technology) {
			schema = req.PSchema
		}
		tempDir, err := resolveTempDir(upstream)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		cleanTempFolder(tempDir.TempDir)
		fileName, outPath, err := newExportTempFile(tempDir.TempDir, who.UserID, "sql")
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		f, err := createPrivateFile(outPath)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		dumpErr := dumpTable(f, db, info.Technology, schema, req.PTable, req.PWithData)
		closeErr := f.Close()
		if dumpErr == nil {
			dumpErr = closeErr
		}
		if dumpErr != nil {
			writeDatabaseError(w, dumpErr.Error())
			return
		}
		writeEnvelope(w, map[string]any{
			"v_filename":     tempDir.Path + "/static/temp/" + fileName,
			"v_downloadname": rawIdent(info.Technology, req.PTable) + ".sql",
			"v_filepath":     outPath,
		}, false, -1)
	}
}

type restoreScriptRequest struct {
	baseRequest
	PScript string `json:"p_script"`
}

func handleRestoreScript(upstream *url.URL, fallback http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req restoreScriptRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, info, ok := resolveNativeRequest(w, r, upstream, fallback, req.databaseIndex())
		if !ok {
			return
		}
		defer db.Close()
		if info.ReadOnly {
			if err := checkReadOnlySQL(req.PScript); err != nil {
				writeDatabaseError(w, err.Error())
				return
			}
		}
		n, err := restoreScript(db, req.PScript)
		if err != nil {
			writeDatabaseError(w, err.Error())
			return
		}
		writeEnvelope(w, map[string]any{"v_statements": n}, false, -1)
	}
}
