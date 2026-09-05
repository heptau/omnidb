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
// addition of sqlite, and this Go server's own later additions of mssql and
// firebird — same names, same order for the historical ones. technologyID
// (appdb_connections.go) looks a row up by name, not a hardcoded id, so the
// exact autoincremented ids these get don't need to match the historical
// ones. Only seeds a brand-new install; an existing install needs the
// matching "insert missing technology row" step in migrateAppDB below
// instead.
var appDBBootstrapTechnologies = []string{
	"postgresql", "mysql", "mariadb", "oracle", "terminal", "sqlite", "mssql", "firebird",
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

	// One-time data fix: until v4.4.0 added the Automatic/Light/Dark Appearance
	// setting, the frontend never sent p_theme back on save (see
	// persistConfigUserInternal), so every row's "theme" column still holds
	// nothing but the old hardcoded insert default 'light' -- never a real user
	// choice. Reset those to 'auto' (the new default, matching the
	// system-following behavior every user actually had) exactly once, gated
	// by this marker column so a real, explicit "Light" pick made after this
	// migration is never touched again.
	var hasThemeMigrated string
	err = db.QueryRow(`select name from pragma_table_info('OmniDB_app_userdetails') where name = 'theme_default_migrated'`).Scan(&hasThemeMigrated)
	if err == sql.ErrNoRows {
		if _, err := db.Exec(`alter table OmniDB_app_userdetails add column "theme_default_migrated" integer NOT NULL DEFAULT 1`); err != nil {
			return fmt.Errorf("add theme_default_migrated to OmniDB_app_userdetails: %w", err)
		}
		if _, err := db.Exec(`update OmniDB_app_userdetails set theme = 'auto' where theme = 'light'`); err != nil {
			return fmt.Errorf("migrate theme default to auto: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_userdetails.theme_default_migrated: %w", err)
	}

	// Add the mssql technology row if missing (v4.4.0+) -- unlike the
	// migrations above, which all add a missing *column*,
	// appDBBootstrapTechnologies only seeds OmniDB_app_technology on a
	// brand-new install; an existing install's table was already fully
	// populated by an earlier version's bootstrap and needs this row
	// inserted explicitly, the same "check first, act only if missing"
	// idiom applied to a data row instead of a column.
	var hasMSSQL string
	err = db.QueryRow(`select name from OmniDB_app_technology where name = 'mssql'`).Scan(&hasMSSQL)
	if err == sql.ErrNoRows {
		if _, err := db.Exec(`insert into OmniDB_app_technology (name) values ('mssql')`); err != nil {
			return fmt.Errorf("seed mssql technology: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_technology for mssql: %w", err)
	}

	// Add the firebird technology row if missing (v4.5.0+) — same "check
	// first, act only if missing" idiom as the mssql row just above.
	var hasFirebird string
	err = db.QueryRow(`select name from OmniDB_app_technology where name = 'firebird'`).Scan(&hasFirebird)
	if err == sql.ErrNoRows {
		if _, err := db.Exec(`insert into OmniDB_app_technology (name) values ('firebird')`); err != nil {
			return fmt.Errorf("seed firebird technology: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_technology for firebird: %w", err)
	}

	// Create OmniDB_app_notifychannel if missing (Notify panel) -- unlike the
	// migrations above, which add a missing *column* to an existing table,
	// this is a whole new table, so the schema file's own statements can just
	// be replayed verbatim (they're all IF NOT EXISTS) rather than expressed
	// as an ALTER.
	var hasNotifyChannel string
	err = db.QueryRow(`select name from sqlite_master where type = 'table' and name = 'OmniDB_app_notifychannel'`).Scan(&hasNotifyChannel)
	if err == sql.ErrNoRows {
		for _, stmt := range []string{
			`CREATE TABLE IF NOT EXISTS "OmniDB_app_notifychannel" (
				"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
				"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
				"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
				"channel_name" varchar(200) NOT NULL,
				"active" bool NOT NULL DEFAULT 1,
				CONSTRAINT "unique_notifychannel" UNIQUE ("user_id", "connection_id", "channel_name")
			)`,
			`CREATE INDEX IF NOT EXISTS "OmniDB_app_notifychannel_user_id" ON "OmniDB_app_notifychannel" ("user_id")`,
			`CREATE INDEX IF NOT EXISTS "OmniDB_app_notifychannel_connection_id" ON "OmniDB_app_notifychannel" ("connection_id")`,
		} {
			if _, err := db.Exec(stmt); err != nil {
				return fmt.Errorf("create OmniDB_app_notifychannel: %w", err)
			}
		}
	} else if err != nil {
		return fmt.Errorf("check OmniDB_app_notifychannel: %w", err)
	}

	return nil
}
