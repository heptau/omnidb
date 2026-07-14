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

	fmt.Fprintln(os.Stderr, "omnidb-go-server: initialized a new app database (default login: admin/admin)")
	appDBBootstrapDone = true
	return nil
}
