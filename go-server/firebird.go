package main

import (
	"database/sql"
	"fmt"
	"net/url"
	"strings"

	_ "github.com/nakagami/firebirdsql"
)

func isFirebird(technology string) bool {
	return technology == "firebird"
}

// openFirebirdTarget opens a connection to the user's saved Firebird
// database, same one-connection-per-request shape as openPostgreSQLTarget/
// openOracleTarget/openMSSQLTarget.
func openFirebirdTarget(info *ConnectionInfo) (*sql.DB, error) {
	db, err := sql.Open("firebirdsql", firebirdDSN(info))
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// firebirdDSN builds the connection string opened above, mirroring
// mssqlDSN's ConnString-vs-discrete-fields precedence (see that function's
// comment for the full rationale — same applies here verbatim).
//
// Unlike postgres/mssql (whose driver DSNs are proper "scheme://" URLs with
// the database as either a path segment or a query parameter),
// github.com/nakagami/firebirdsql takes a bare
// "user:password@host[:port]/database[?param=value]" string and prepends
// "firebird://" itself before parsing it as a URI — see that package's own
// doc comment. So the trick here is the same one mssqlDSN uses (build a
// real net/url.URL, let it do the escaping, then adjust), just with the
// "firebird://" prefix added before parsing and stripped again before
// returning, since sql.Open("firebirdsql", ...) expects the bare form.
func firebirdDSN(info *ConnectionInfo) string {
	if info.Server == "" && info.ConnString != "" {
		if info.Database == "" {
			return info.ConnString
		}
		if u, err := url.Parse("firebird://" + info.ConnString); err == nil {
			u.Path = "/" + strings.TrimPrefix(info.Database, "/")
			return strings.TrimPrefix(u.String(), "firebird://")
		}
		return info.ConnString
	}
	port := info.Port
	if port == "" {
		port = "3050"
	}
	dsn := url.URL{
		Scheme: "firebird",
		User:   url.UserPassword(info.Username, info.Password),
		Host:   info.Server + ":" + port,
		Path:   "/" + strings.TrimPrefix(info.Database, "/"),
	}
	return strings.TrimPrefix(dsn.String(), "firebird://")
}

// firebirdVersion mirrors mssqlVersion/oracleVersion — rdb$get_context's
// 'ENGINE_VERSION' key (available since Firebird 2.1) returns just the bare
// version number (e.g. "4.0"), so this prefixes it the same way sqliteVersion
// prefixes SQLite's bare version with "SQLite ".
func firebirdVersion(db *sql.DB) (string, error) {
	var version string
	if err := db.QueryRow(`select rdb$get_context('SYSTEM', 'ENGINE_VERSION') from rdb$database`).Scan(&version); err != nil {
		return "", err
	}
	return "Firebird " + version, nil
}

// firebirdUserSuper is a capability probe, same "not really is-DBA, just a
// permission probe" semantics as mssqlUserSuper/oracleUserSuper/
// postgresqlUserSuper — Firebird's built-in superuser is the SYSDBA login
// (or, on Windows/embedded, an OS user mapped to it), and CURRENT_USER
// reports it verbatim, so this is a plain string comparison rather than a
// role-membership query. Not a complete permission model (a user granted
// RDB$ADMIN on the current database is also effectively an admin, but that's
// a per-database grant this connection has no cheap single-query way to
// check going in cold), same "simplification, not a full capability audit"
// scope as the other engines' *UserSuper probes.
func firebirdUserSuper(db *sql.DB) bool {
	var dummy int
	err := db.QueryRow(`select 1 from rdb$database where upper(current_user) = 'SYSDBA'`).Scan(&dummy)
	return err == nil
}

type firebirdTable struct {
	Name string
}

// firebirdTables mirrors sqliteTables/oracleTables — Firebird has no schema
// concept (see this port's frontend tree_firebird.js file-header comment),
// so unlike mssqlTables/postgresqlTables this takes no schema argument.
// rdb$view_blr is null for a real table, not null for a view (see
// firebirdViews below) — the same distinguishing column both this port and
// isql itself use, and stable across every Firebird version since the
// catalog gained rdb$view_blr, unlike the newer (Firebird 3+)
// rdb$relation_type column this deliberately avoids depending on.
func firebirdTables(db *sql.DB) ([]firebirdTable, error) {
	rows, err := db.Query(`
		select trim(rdb$relation_name) as name
		from rdb$relations
		where rdb$system_flag = 0 and rdb$view_blr is null
		order by rdb$relation_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []firebirdTable
	for rows.Next() {
		var t firebirdTable
		if err := rows.Scan(&t.Name); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

// firebirdColumn mirrors mssqlColumn's shape, but DataType already holds the
// resolved SQL keyword (see firebirdSQLTypeName) rather than a name looked
// up from a types catalog table — Firebird's rdb$field_type is a bare
// numeric code with no catalog row naming it in SQL terms (rdb$types maps it
// to the engine's *internal* type name, e.g. "VARYING"/"TEXT"/"LONG", not
// the SQL keyword a CREATE TABLE statement would use), so that mapping has
// to happen in Go instead of via a join, unlike mssqlColumns' join to
// sys.types. Length is the character length for CHAR/VARCHAR (0 for every
// other type); Precision/Scale are only meaningful for NUMERIC/DECIMAL.
// Scale is kept exactly as Firebird's catalog stores it — zero or negative,
// e.g. -2 for two decimal places — so callers needing an actual decimal
// place count must negate it themselves (see firebirdColumnTypeDDL).
type firebirdColumn struct {
	Name         string
	DataType     string
	Length       int64
	Precision    int64
	Scale        int64
	Nullable     string
	DefaultValue sql.NullString
}

// firebirdSQLTypeName maps a raw rdb$field_type code (optionally refined by
// rdb$field_sub_type, which distinguishes NUMERIC/DECIMAL from a plain
// integer type of the same storage size) to the SQL keyword a CREATE TABLE
// statement would use for it. Covers every type code present since Firebird
// 2.0 plus the Firebird 4+ additions (BOOLEAN, DECFLOAT, INT128, the
// WITH TIME ZONE types) — an unrecognized code falls back to a literal
// "UNKNOWN(<code>)" marker rather than guessing, the same "surface it,
// don't invent it" policy as this port's other engines.
func firebirdSQLTypeName(fieldType, subType int) string {
	switch fieldType {
	case 7, 8, 16: // SMALLINT, INTEGER, BIGINT — or NUMERIC/DECIMAL of that storage size
		switch subType {
		case 1:
			return "NUMERIC"
		case 2:
			return "DECIMAL"
		}
		switch fieldType {
		case 7:
			return "SMALLINT"
		case 8:
			return "INTEGER"
		default:
			return "BIGINT"
		}
	case 9:
		return "QUAD"
	case 10:
		return "FLOAT"
	case 12:
		return "DATE"
	case 13:
		return "TIME"
	case 14:
		return "CHAR"
	case 23:
		return "BOOLEAN"
	case 24:
		return "DECFLOAT" // Firebird 4+, 16 digits
	case 25:
		return "DECFLOAT" // Firebird 4+, 34 digits
	case 26:
		return "INT128" // Firebird 4+
	case 27:
		return "DOUBLE PRECISION"
	case 28:
		return "TIME WITH TIME ZONE" // Firebird 4+
	case 29:
		return "TIMESTAMP WITH TIME ZONE" // Firebird 4+
	case 35:
		return "TIMESTAMP"
	case 37:
		return "VARCHAR"
	case 40:
		return "CSTRING"
	case 261:
		if subType == 1 {
			return "BLOB SUB_TYPE TEXT"
		}
		return "BLOB"
	default:
		return fmt.Sprintf("UNKNOWN(%d)", fieldType)
	}
}

// firebirdColumns mirrors mssqlColumns/oracleColumns for one table — joins
// rdb$relation_fields (the table-specific "this column belongs to this
// table, in this position, nullable or not, with this default") to
// rdb$fields (the shared "domain" row every field/parameter ultimately
// points at via rdb$field_source, carrying the actual type/length/
// precision/scale) — the same fan-out every Firebird catalog query in this
// port needs (see firebird_routines.go's parameter queries, which join the
// same table for the same reason). rdb$default_source already reads as a
// full "DEFAULT <expr>" string (unlike mssql's sys.default_constraints,
// whose definition column is bare expression text mssqlTableDDL prepends
// "DEFAULT " to itself), so this port passes it through unchanged wherever
// it's used verbatim (firebird_ddl.go's firebirdTableDDL).
func firebirdColumns(db *sql.DB, table string) ([]firebirdColumn, error) {
	rows, err := db.Query(`
		select trim(rf.rdb$field_name) as field_name,
		       f.rdb$field_type,
		       coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0),
		       coalesce(f.rdb$field_precision, 0),
		       coalesce(f.rdb$field_scale, 0),
		       case when rf.rdb$null_flag = 1 then 'NO' else 'YES' end as nullable,
		       rf.rdb$default_source
		from rdb$relation_fields rf
		join rdb$fields f on f.rdb$field_name = rf.rdb$field_source
		where trim(rf.rdb$relation_name) = ?
		order by rf.rdb$field_position
	`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []firebirdColumn
	for rows.Next() {
		var c firebirdColumn
		var fieldType, subType int
		if err := rows.Scan(&c.Name, &fieldType, &subType, &c.Length, &c.Precision, &c.Scale, &c.Nullable, &c.DefaultValue); err != nil {
			return nil, err
		}
		c.DataType = firebirdSQLTypeName(fieldType, subType)
		columns = append(columns, c)
	}
	return columns, rows.Err()
}
