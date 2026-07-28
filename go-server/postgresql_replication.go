package main

import (
	"database/sql"
)

// This file mirrors tree_postgresql.py's logical-replication surface
// (publications/subscriptions, PG10+) and physical/logical replication
// slots — part of Fáze 8a's PostgreSQL long-tail port. None of these are
// version-gated below PG10 in the original Python (pg_publication/
// pg_subscription simply don't exist pre-PG10, so the query errors
// naturally on an older server rather than degrading gracefully — matches
// Python's own behavior, not a gap introduced here).

func postgresqlReplicationSlotNames(db *sql.DB, slotType string) ([]string, error) {
	rows, err := db.Query(`select quote_ident(slot_name) from pg_replication_slots where slot_type = $1 order by 1`, slotType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}

func postgresqlPhysicalReplicationSlots(db *sql.DB) ([]string, error) {
	return postgresqlReplicationSlotNames(db, "physical")
}

func postgresqlLogicalReplicationSlots(db *sql.DB) ([]string, error) {
	return postgresqlReplicationSlotNames(db, "logical")
}

type postgresqlPublication struct {
	Name      string
	AllTables bool
	Insert    bool
	Update    bool
	Delete    bool
	Truncate  bool
	OID       int64
}

// postgresqlPublications mirrors PostgreSQL.py's QueryPublications — PG11+
// added the pubtruncate column; per this project's policy of not
// replicating long-EOL version branches (PG10 reached EOL Nov 2022), the
// PG10-only fallback (hardcoding pubtruncate=false) isn't ported — this
// requires PG11+, same as the rest of this migration's version floor.
func postgresqlPublications(db *sql.DB) ([]postgresqlPublication, error) {
	rows, err := db.Query(`
		select quote_ident(pubname) as pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate, oid
		from pg_publication
		order by 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlPublication, 0)
	for rows.Next() {
		var p postgresqlPublication
		if err := rows.Scan(&p.Name, &p.AllTables, &p.Insert, &p.Update, &p.Delete, &p.Truncate, &p.OID); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// postgresqlPublicationTables mirrors PostgreSQL.py's
// QueryPublicationTables — tables belonging to a named publication, as
// "schema.table" strings.
func postgresqlPublicationTables(db *sql.DB, publication string) ([]string, error) {
	rows, err := db.Query(`
		select quote_ident(schemaname) || '.' || quote_ident(tablename)
		from pg_publication_tables
		where quote_ident(pubname) = $1
		order by 1
	`, publication)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}

type postgresqlSubscription struct {
	Name         string
	Enabled      bool
	ConnInfo     string
	Publications string
	OID          int64
}

// postgresqlSubscriptions mirrors PostgreSQL.py's QuerySubscriptions —
// filtered by the connection's own current database name. Note:
// pg_subscription rows are only visible to superusers/owners at the
// Postgres level; a non-superuser connection legitimately sees zero rows
// here, not an error — nothing to special-case in Go, the SQL already
// behaves this way server-side.
func postgresqlSubscriptions(db *sql.DB) ([]postgresqlSubscription, error) {
	rows, err := db.Query(`
		select quote_ident(s.subname) as subname,
		       s.subenabled,
		       s.subconninfo,
		       array_to_string(s.subpublications, ',') as subpublications,
		       s.oid
		from pg_subscription s
		inner join pg_database d on d.oid = s.subdbid
		where d.datname = current_database()
		order by 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlSubscription, 0)
	for rows.Next() {
		var s postgresqlSubscription
		if err := rows.Scan(&s.Name, &s.Enabled, &s.ConnInfo, &s.Publications, &s.OID); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// postgresqlSubscriptionTables mirrors PostgreSQL.py's
// QuerySubscriptionTables — tables replicated by a named subscription, as
// "schema.table" strings. Same superuser-visibility note as subscriptions.
func postgresqlSubscriptionTables(db *sql.DB, subscription string) ([]string, error) {
	rows, err := db.Query(`
		select quote_ident(n.nspname) || '.' || quote_ident(c.relname)
		from pg_subscription s
		inner join pg_database d on d.oid = s.subdbid
		inner join pg_subscription_rel r on r.srsubid = s.oid
		inner join pg_class c on c.oid = r.srrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		where d.datname = current_database()
			and quote_ident(s.subname) = $1
		order by 1
	`, subscription)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}
