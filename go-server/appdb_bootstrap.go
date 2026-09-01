package main

import (
	"database/sql"
	_ "embed"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

//go:embed appdb_schema.sql
var appDBSchema string

// appDBBootstrapTechnologies mirrors OmniDB_app/migrations/0001_3_0_0.py's
// populate_technologies (postgresql..terminal) plus 0003_3_1_0.py's later
// addition of sqlite — same names, same order. technologyID (appdb_
// connections.go) looks a row up by name, not a hardcoded id, so the exact
// autoincremented ids these get don't need to match the historical ones.
var appDBBootstrapTechnologies = []string{
	"postgresql", "mysql", "mariadb", "oracle", "terminal", "sqlite",
}

var (
	appDBBootstrapMu   sync.Mutex
	appDBBootstrapDone bool
)

// bootstrapAppDB creates OmniDB's own app database schema and seeds it with
// the same default data the original Django app's initial migration did
// (OmniDB_app/migrations/0001_3_0_0.py's populate_technologies/
// populate_admin_user, run automatically by `manage.py migrate` on every
// server start) — a brand-new install's omnidb.db is otherwise just an
// empty, schema-less file that `modernc.org/sqlite` happily creates on
// first open (see openAppDB) and then does nothing further with. Fáze 8c
// removed the only thing that ever ran that migration.
//
// The table list in appdb_schema.sql is exactly the set go-server itself
// reads or writes (grepped across the whole package) — it deliberately
// excludes Django's own bookkeeping tables (auth_group*, auth_permission,
// django_session/migrations/admin_log/content_type, social_auth_*,
// OmniDB_app_config), since nothing here ever queries them.
//
// Safe to call on every openAppDB, including against an existing,
// years-old database: guarded by an in-memory once-per-process flag for
// the common case, and idempotent even without it (checks for an existing
// "auth_user" table before doing anything).
func bootstrapAppDB(db *sql.DB) error {
	appDBBootstrapMu.Lock()
	defer appDBBootstrapMu.Unlock()
	if appDBBootstrapDone {
		return nil
	}

	var exists string
	err := db.QueryRow(`select name from sqlite_master where type = 'table' and name = 'auth_user'`).Scan(&exists)
	if err == nil {
		// Existing database — apply any missing schema migrations.
		if err := migrateAppDB(db); err != nil {
			return fmt.Errorf("migrate app db: %w", err)
		}
		appDBBootstrapDone = true
		return nil
	}
	if err != sql.ErrNoRows {
		return fmt.Errorf("check app db schema: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin app db bootstrap: %w", err)
	}
	defer tx.Rollback()

	for _, stmt := range strings.Split(appDBSchema, ";\n") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := tx.Exec(stmt); err != nil {
			return fmt.Errorf("create app db schema: %w", err)
		}
	}

	for _, name := range appDBBootstrapTechnologies {
		if _, err := tx.Exec(`insert into OmniDB_app_technology (name) values (?)`, name); err != nil {
			return fmt.Errorf("seed technology %q: %w", name, err)
		}
	}

	passwordHash, err := hashDjangoPassword("admin")
	if err != nil {
		return fmt.Errorf("hash default admin password: %w", err)
	}
	now := time.Now().UTC()
	_, err = tx.Exec(
		`insert into auth_user
			(password, last_login, is_superuser, username, last_name, email, is_staff, is_active, date_joined, first_name)
		 values (?, ?, 1, 'admin', '', '', 0, 1, ?, '')`,
		passwordHash, now, now,
	)
	if err != nil {
		return fmt.Errorf("create default admin user: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit app db bootstrap: %w", err)
	}

	fmt.Fprintln(os.Stderr, "omnidb-server: initialized a new app database (default login: admin/admin)")
	appDBBootstrapDone = true
	return nil
}

// migrateAppDB applies incremental schema changes to an existing app database.
// Checks for missing columns and adds them via ALTER TABLE — the only safe
// operation for SQLite schema evolution on a live database.
func migrateAppDB(db *sql.DB) error {
	// Add last_used column to OmniDB_app_tab if missing (v3.6.0+).
	var hasLastUsed string
	err := db.QueryRow(`select name from pragma_table_info('OmniDB_app_tab') where name = 'last_used'`).Scan(&hasLastUsed)
	if err == sql.ErrNoRows {
		if _, err := db.Exec(`alter table OmniDB_app_tab add column "last_used" text NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add last_used to OmniDB_app_tab: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_tab.last_used: %w", err)
	}

	// Add environment column to OmniDB_app_connection if missing (v4.3.0+) --
	// the color-coded Production/UAT/Development/Archive tag on the
	// Connections sidebar and open Database tabs.
	var hasEnvironment string
	err = db.QueryRow(`select name from pragma_table_info('OmniDB_app_connection') where name = 'environment'`).Scan(&hasEnvironment)
	if err == sql.ErrNoRows {
		if _, err := db.Exec(`alter table OmniDB_app_connection add column "environment" varchar(20) NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add environment to OmniDB_app_connection: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_connection.environment: %w", err)
	}

	// Add indent format columns to OmniDB_app_userdetails if missing.
	for _, c := range []struct {
		name string
		typ  string
		dflt string
	}{
		{"indent_unit", "varchar(20)", "'    '"},
		{"indent_char", "varchar(5)", "'space'"},
		{"indent_size", "integer", "4"},
		{"comma_style", "varchar(10)", "'leading'"},
		{"keyword_case", "varchar(10)", "'preserve'"},
		{"autocomplete_disabled_types", "varchar(255)", "''"},
	} {
		var found string
		err := db.QueryRow(`select name from pragma_table_info('OmniDB_app_userdetails') where name = ?`, c.name).Scan(&found)
		if err == sql.ErrNoRows {
			if _, err := db.Exec(fmt.Sprintf(`alter table OmniDB_app_userdetails add column "%s" %s NOT NULL DEFAULT %s`, c.name, c.typ, c.dflt)); err != nil {
				return fmt.Errorf("add %s to OmniDB_app_userdetails: %w", c.name, err)
			}
		} else if err != nil {
			return fmt.Errorf("check OmniDB_app_userdetails.%s: %w", c.name, err)
		}
	}

	return nil
}
