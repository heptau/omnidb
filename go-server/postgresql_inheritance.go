package main

import (
	"database/sql"
)

// This file mirrors tree_postgresql.py's table-inheritance and
// declarative-partitioning surface — part of Fáze 8a's PostgreSQL long-tail
// port. Python version-gates these on server_version_num < 100000 (pre-PG10
// lacks pg_class.relispartition); per this project's established policy of
// not replicating long-EOL version branches (PG10 reached EOL in 2022), only
// the PG10+ branch is ported — see go-backend-migration memory.

// postgresqlInheritedChildNames mirrors PostgreSQL.py's
// QueryTablesInheriteds — child tables (excluding partitions) of a given
// parent table, returned as "schema.table" strings (matches Python's
// string concatenation in the view).
func postgresqlInheritedChildNames(db *sql.DB, schema, table string) ([]string, error) {
	return postgresqlInheritsChildNames(db, schema, table, false)
}

// postgresqlPartitionChildNames mirrors PostgreSQL.py's
// QueryTablesPartitions — same shape as inherited children, but for actual
// partitions (cc.relispartition = true).
func postgresqlPartitionChildNames(db *sql.DB, schema, table string) ([]string, error) {
	return postgresqlInheritsChildNames(db, schema, table, true)
}

func postgresqlInheritsChildNames(db *sql.DB, schema, table string, wantPartitions bool) ([]string, error) {
	rows, err := db.Query(`
		select quote_ident(nc.nspname) || '.' || quote_ident(cc.relname)
		from pg_inherits i
		inner join pg_class cp on cp.oid = i.inhparent
		inner join pg_namespace np on np.oid = cp.relnamespace
		inner join pg_class cc on cc.oid = i.inhrelid
		inner join pg_namespace nc on nc.oid = cc.relnamespace
		where cc.relispartition = $3
			and quote_ident(np.nspname) = $1 and quote_ident(cp.relname) = $2
		order by 1
	`, schema, table, wantPartitions)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

// postgresqlInheritedParents mirrors PostgreSQL.py's
// QueryTablesInheritedsParents — every table in the given schema that has
// at least one child (i.e. every "parent" table shown at the top of the
// inheritance tree), regardless of the PG10 relispartition distinction
// (this query has no version gate in the original).
func postgresqlInheritedParents(db *sql.DB, schema string) ([]string, error) {
	rows, err := db.Query(`
		select distinct quote_ident(np.nspname) || '.' || quote_ident(cp.relname)
		from pg_inherits i
		inner join pg_class cp on cp.oid = i.inhparent
		inner join pg_namespace np on np.oid = cp.relnamespace
		inner join pg_class c on c.oid = i.inhrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		where cp.relkind = 'r'
			and quote_ident(np.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}

// postgresqlPartitionParents mirrors PostgreSQL.py's
// QueryTablesPartitionsParents — same shape but cp.relkind = 'p' (a
// partitioned table, not a plain inheritance-parent table).
func postgresqlPartitionParents(db *sql.DB, schema string) ([]string, error) {
	rows, err := db.Query(`
		select distinct quote_ident(np.nspname) || '.' || quote_ident(cp.relname)
		from pg_inherits i
		inner join pg_class cp on cp.oid = i.inhparent
		inner join pg_namespace np on np.oid = cp.relnamespace
		inner join pg_class c on c.oid = i.inhrelid
		inner join pg_namespace n on n.oid = c.relnamespace
		where cp.relkind = 'p'
			and quote_ident(np.nspname) = $1
		order by 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}

func scanStrings(rows *sql.Rows) ([]string, error) {
	out := make([]string, 0)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type postgresqlInheritedOrPartitionChild struct {
	Name string
	OID  int64
}

// postgresqlInheritedChildren mirrors PostgreSQL.py's
// QueryTablesInheritedsChildren (order by table_name only — the Python
// original also selects table_schema and orders "2, 1" i.e. schema-then-
// name, but this port's SELECT list drops the already-constrained-by-WHERE
// schema column, so ordering by name alone is equivalent for a single
// fixed child schema) — child tables of a given "schema.table"
// parent identifier, excluding partitions. p_table arrives pre-combined as
// "schema.table" (matches Python's own filter shape).
func postgresqlInheritedChildren(db *sql.DB, parentSchemaTable, childSchema string) ([]postgresqlInheritedOrPartitionChild, error) {
	return postgresqlInheritsChildren(db, parentSchemaTable, childSchema, false)
}

// postgresqlPartitionChildren mirrors PostgreSQL.py's
// QueryTablesPartitionsChildren — same shape, actual partitions only.
func postgresqlPartitionChildren(db *sql.DB, parentSchemaTable, childSchema string) ([]postgresqlInheritedOrPartitionChild, error) {
	return postgresqlInheritsChildren(db, parentSchemaTable, childSchema, true)
}

func postgresqlInheritsChildren(db *sql.DB, parentSchemaTable, childSchema string, wantPartitions bool) ([]postgresqlInheritedOrPartitionChild, error) {
	rows, err := db.Query(`
		select quote_ident(cc.relname) as table_name,
		       cc.oid
		from pg_inherits i
		inner join pg_class cp on cp.oid = i.inhparent
		inner join pg_namespace np on np.oid = cp.relnamespace
		inner join pg_class cc on cc.oid = i.inhrelid
		inner join pg_namespace nc on nc.oid = cc.relnamespace
		where cc.relispartition = $3
			and quote_ident(np.nspname) || '.' || quote_ident(cp.relname) = $1
			and quote_ident(nc.nspname) = $2
		order by 1
	`, parentSchemaTable, childSchema, wantPartitions)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]postgresqlInheritedOrPartitionChild, 0)
	for rows.Next() {
		var c postgresqlInheritedOrPartitionChild
		if err := rows.Scan(&c.Name, &c.OID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
