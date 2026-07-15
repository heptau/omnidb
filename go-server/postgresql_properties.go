package main

import (
	"database/sql"
	"fmt"
)

// pgPropertiesFromRow runs a query expected to return exactly one row and
// transposes its columns into Property/Value pairs — mirrors PostgreSQL.py's
// GetProperties* methods, which all build a single-row result set with one
// column per property (column alias) and then call .Transpose('Property',
// 'Value') on it. Doing the transpose generically here means each query
// below only has to describe *which* columns to select, not how to turn a
// row into properties.
func pgPropertiesFromRow(db *sql.DB, query string, args ...any) ([][2]string, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("object does not exist anymore. Please refresh the tree view")
	}

	values := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}

	out := make([][2]string, len(cols))
	for i, c := range cols {
		out[i] = [2]string{c, formatSQLValue(values[i])}
	}
	return out, nil
}

// postgresqlPropertiesTable mirrors PostgreSQL.py's GetPropertiesTable
// (PostgreSQL 12+ branch — older-version column sets aren't replicated,
// see AGENTS.md/memory for why).
func postgresqlPropertiesTable(db *sql.DB, schema, table string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select current_database() as "Database",
			   n.nspname as "Schema",
			   c.relname as "Table",
			   c.oid as "OID",
			   r.rolname as "Owner",
			   pg_size_pretty(pg_relation_size(c.oid)) as "Size",
			   coalesce(t1.spcname, t2.spcname) as "Tablespace",
			   c.relacl as "ACL",
			   c.reloptions as "Options",
			   pg_relation_filepath(c.oid) as "Filenode",
			   c.reltuples as "Estimate Count",
			   c.relhasindex as "Has Index",
			   (case c.relpersistence when 'p' then 'Permanent' when 'u' then 'Unlogged' when 't' then 'Temporary' end) as "Persistence",
			   c.relnatts as "Number of Attributes",
			   c.relchecks as "Number of Checks",
			   c.relhasrules as "Has Rules",
			   c.relhastriggers as "Has Triggers",
			   c.relhassubclass as "Has Subclass",
			   c.relkind = 'p' as "Is Partitioned",
			   c.relispartition as "Is Partition",
			   (case when c.relispartition then po.parent_table else '' end) as "Partition Of"
		from pg_class c
		inner join pg_namespace n
		on n.oid = c.relnamespace
		inner join pg_roles r
		on r.oid = c.relowner
		left join pg_tablespace t1
		on t1.oid = c.reltablespace
		inner join (
		select t.spcname
		from pg_database d
		inner join pg_tablespace t
		on t.oid = d.dattablespace
		where d.datname = current_database()
		) t2
		on 1 = 1
		left join (
		select quote_ident(n2.nspname) || '.' || quote_ident(c2.relname) as parent_table
		from pg_inherits i
		inner join pg_class c2
		on c2.oid = i.inhparent
		inner join pg_namespace n2
		on n2.oid = c2.relnamespace
		where i.inhrelid = $3::regclass
		) po
		on 1 = 1
		where quote_ident(n.nspname) = $1
		  and quote_ident(c.relname) = $2
	`, schema, table, schema+"."+table)
}

// postgresqlPropertiesTableField mirrors PostgreSQL.py's
// GetPropertiesTableField (PostgreSQL 13+ branch), minus the "Cache Offset"
// column (pg_attribute.attcacheoff) — removed in PostgreSQL 18, which makes
// the original Python query fail the same way against a current server.
// Not worth reproducing a bug that breaks on this decade's Postgres.
func postgresqlPropertiesTableField(db *sql.DB, schema, table, column string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		SELECT current_database() AS "Database",
			   n.nspname AS "Schema",
			   c.relname AS "Table",
			   a.attname AS "Column",
			   c.oid AS "OID",
			   r.rolname AS "Owner",
			   a.atttypid::regtype AS "Type",
			   a.attstattarget AS "Statistics Target",
			   a.attlen AS "Type Length",
			   a.attnum AS "Position",
			   a.attndims AS "Dimension",
			   a.atttypmod AS "Type Mod",
			   a.attbyval AS "By Value",
			   a.attstorage AS "Storage Type",
			   a.attalign AS "Storage Alignment",
			   a.attnotnull AS "Not Null",
			   a.atthasdef AS "Has Default",
			   a.atthasmissing AS "Has Missing",
			   a.attidentity AS "Identitiy",
			   a.attgenerated AS "Generated",
			   a.attisdropped AS "Is Dropped",
			   a.attislocal AS "Is Local",
			   a.attinhcount AS "Inherited Count",
			   a.attcollation AS "Collate",
			   a.attacl AS "ACL",
			   a.attoptions AS "Options",
			   a.attfdwoptions AS "FDW Options",
			   attmissingval AS "Missing Value"
		FROM pg_class AS c
		INNER JOIN pg_namespace AS n ON c.relnamespace = n.oid
		INNER JOIN pg_roles AS r ON c.relowner = r.oid
		INNER JOIN pg_attribute AS a ON c.oid = a.attrelid
		WHERE c.oid = $1::regclass
			AND a.attname = quote_ident($2)
	`, schema+"."+table, column)
}

// postgresqlPropertiesIndex mirrors PostgreSQL.py's GetPropertiesIndex.
func postgresqlPropertiesIndex(db *sql.DB, schema, index string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select current_database() as "Database",
			   n.nspname as "Schema",
			   c.relname as "Index",
			   c.oid as "OID",
			   r.rolname as "Owner",
			   pg_size_pretty(pg_relation_size(c.oid)) as "Size",
			   i.indisunique as "Unique",
			   i.indisprimary as "Primary",
			   i.indisexclusion as "Exclusion",
			   i.indimmediate as "Immediate",
			   i.indisclustered as "Clustered",
			   i.indisvalid as "Valid",
			   i.indisready as "Ready",
			   i.indislive as "Live",
			   a.amname as "Access Method",
			   coalesce(t1.spcname, t2.spcname) as "Tablespace",
			   pg_relation_filepath(c.oid) as "Filenode"
		from pg_class c
		inner join pg_namespace n
		on n.oid = c.relnamespace
		inner join pg_roles r
		on r.oid = c.relowner
		left join pg_tablespace t1
		on t1.oid = c.reltablespace
		inner join (
		select t.spcname
		from pg_database d
		inner join pg_tablespace t
		on t.oid = d.dattablespace
		where d.datname = current_database()
		) t2
		on 1 = 1
		inner join pg_am a
		on a.oid = c.relam
		inner join pg_index i
		on i.indexrelid = c.oid
		where quote_ident(n.nspname) = $1
		  and quote_ident(c.relname) = $2
	`, schema, index)
}

// postgresqlPropertiesView mirrors PostgreSQL.py's GetPropertiesView.
func postgresqlPropertiesView(db *sql.DB, schema, view string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select current_database() as "Database",
			   n.nspname as "Schema",
			   c.relname as "View",
			   c.oid as "OID",
			   r.rolname as "Owner"
		from pg_class c
		inner join pg_namespace n
		on n.oid = c.relnamespace
		inner join pg_roles r
		on r.oid = c.relowner
		where quote_ident(n.nspname) = $1
		  and quote_ident(c.relname) = $2
	`, schema, view)
}

// postgresqlPropertiesTrigger mirrors PostgreSQL.py's GetPropertiesTrigger.
func postgresqlPropertiesTrigger(db *sql.DB, schema, table, trigger string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select current_database() as "Database",
			   y.schema_name as "Schema",
			   y.table_name as "Table",
			   y.trigger_name as "Trigger",
			   y.oid as "OID",
			   y.trigger_enabled as "Enabled",
			   y.trigger_function_name as "Trigger Function",
			   x.action_timing as "Action Timing",
			   x.event_manipulation as "Action Manipulation",
			   x.action_orientation as "Action Orientation",
			   x.action_condition as "Action Condition",
			   x.action_statement as "Action Statement"
		from (
		select distinct quote_ident(t.event_object_schema) as schema_name,
			   quote_ident(t.event_object_table) as table_name,
			   quote_ident(t.trigger_name) as trigger_name,
			   t.action_timing,
			   array_to_string(array(
			   select t2.event_manipulation::text
			   from information_schema.triggers t2
			   where t2.event_object_schema = t.event_object_schema
				 and t2.event_object_table = t.event_object_table
				 and t2.trigger_name = t.trigger_name
			   ), ' OR ') as event_manipulation,
			   t.action_orientation,
			   t.action_condition,
			   t.action_statement
		from information_schema.triggers t
		where quote_ident(t.event_object_schema) = $1
		  and quote_ident(t.event_object_table) = $2
		  and quote_ident(t.trigger_name) = $3
		) x
		inner join (
		select t.oid,
			   quote_ident(n.nspname) as schema_name,
			   quote_ident(c.relname) as table_name,
			   quote_ident(t.tgname) as trigger_name,
			   t.tgenabled as trigger_enabled,
			   quote_ident(np.nspname) || '.' || quote_ident(p.proname) as trigger_function_name,
			   quote_ident(np.nspname) || '.' || quote_ident(p.proname) || '()' as trigger_function_id
		from pg_trigger t
		inner join pg_class c
		on c.oid = t.tgrelid
		inner join pg_namespace n
		on n.oid = c.relnamespace
		inner join pg_proc p
		on p.oid = t.tgfoid
		inner join pg_namespace np
		on np.oid = p.pronamespace
		where not t.tgisinternal
		  and quote_ident(n.nspname) = $1
		  and quote_ident(c.relname) = $2
		  and quote_ident(t.tgname) = $3
		) y
		on y.schema_name = x.schema_name
		and y.table_name = x.table_name
		and y.trigger_name = x.trigger_name
	`, schema, table, trigger)
}

// pgConstraintColumnsExpr builds the "array_to_string(array(...), ',')"
// scalar subquery PostgreSQL.py generates via a pg_temp helper function
// (fnc_omnidb_constraint_attrs / fnc_omnidb_rconstraint_attrs) for
// GetPropertiesPK/FK/Unique. Inlined as a plain correlated subquery instead
// of a session-scoped temp function — same result, one fewer round trip,
// and no need to CREATE FUNCTION on a connection this process only holds
// open for the lifetime of one request.
const pgConstraintColumnsExpr = `(
	select array_to_string(array(
		select a.attname
		from (
			select unnest(%s) as attnum
			from pg_constraint c2
			join pg_class t2 on t2.oid = c2.conrelid
			join pg_namespace n2 on t2.relnamespace = n2.oid
			where c2.contype = '%s'
			  and quote_ident(n2.nspname) = $1
			  and quote_ident(t2.relname) = $2
			  and quote_ident(c2.conname) = $3
		) x
		inner join pg_attribute a on a.attnum = x.attnum
		inner join pg_class r on r.oid = a.attrelid
		inner join pg_namespace nr on nr.oid = r.relnamespace
		where quote_ident(nr.nspname) = $1
		  and quote_ident(r.relname) = $2
	), ',')
)`

// pgReferencedColumnsExpr resolves a foreign key's *referenced* columns by
// joining pg_attribute straight onto the constraint's own confrelid, rather
// than by re-matching schema/table name like pgConstraintColumnsExpr does.
// PostgreSQL.py's own fnc_omnidb_rconstraint_attrs looks up confkey's
// attnums against the FK-owning table's name (the same $1/$2 as the
// constrained side) instead of the referenced table's — harmless only when
// both tables happen to share the same attribute numbering, wrong (and
// silently so) otherwise. Not worth reproducing a bug that gives incorrect
// results for any real foreign key between two differently-shaped tables.
const pgReferencedColumnsExpr = `(
	select array_to_string(array(
		select a.attname
		from (
			select unnest(c2.confkey) as attnum, c2.confrelid as relid
			from pg_constraint c2
			join pg_class t2 on t2.oid = c2.conrelid
			join pg_namespace n2 on t2.relnamespace = n2.oid
			where c2.contype = 'f'
			  and quote_ident(n2.nspname) = $1
			  and quote_ident(t2.relname) = $2
			  and quote_ident(c2.conname) = $3
		) x
		inner join pg_attribute a on a.attnum = x.attnum and a.attrelid = x.relid
	), ',')
)`

// postgresqlPropertiesPK mirrors PostgreSQL.py's GetPropertiesPK.
func postgresqlPropertiesPK(db *sql.DB, schema, table, pk string) ([][2]string, error) {
	query := fmt.Sprintf(`
		select current_database() as "Database",
			   quote_ident(n.nspname) as "Schema",
			   quote_ident(t.relname) as "Table",
			   quote_ident(c.conname) as "Constraint Name",
			   c.oid as "OID",
			   (case c.contype when 'c' then 'Check' when 'f' then 'Foreign Key' when 'p' then 'Primary Key' when 'u' then 'Unique' when 'x' then 'Exclusion' end) as "Constraint Type",
			   %s as "Constrained Columns",
			   quote_ident(i.relname) as "Index",
			   c.condeferrable as "Deferrable",
			   c.condeferred as "Deferred by Default",
			   c.convalidated as "Validated",
			   c.conislocal as "Is Local",
			   c.coninhcount as "Number of Ancestors",
			   c.connoinherit as "Non-Inheritable"
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on t.relnamespace = n.oid
		join pg_class i on i.oid = c.conindid
		where c.contype = 'p'
		  and quote_ident(n.nspname) = $1
		  and quote_ident(t.relname) = $2
		  and quote_ident(c.conname) = $3
	`, fmt.Sprintf(pgConstraintColumnsExpr, "c2.conkey", "p"))
	return pgPropertiesFromRow(db, query, schema, table, pk)
}

// postgresqlPropertiesUnique mirrors PostgreSQL.py's GetPropertiesUnique.
func postgresqlPropertiesUnique(db *sql.DB, schema, table, unique string) ([][2]string, error) {
	query := fmt.Sprintf(`
		select current_database() as "Database",
			   quote_ident(n.nspname) as "Schema",
			   quote_ident(t.relname) as "Table",
			   quote_ident(c.conname) as "Constraint Name",
			   c.oid as "OID",
			   (case c.contype when 'c' then 'Check' when 'f' then 'Foreign Key' when 'p' then 'Primary Key' when 'u' then 'Unique' when 'x' then 'Exclusion' end) as "Constraint Type",
			   %s as "Constrained Columns",
			   quote_ident(i.relname) as "Index",
			   c.condeferrable as "Deferrable",
			   c.condeferred as "Deferred by Default",
			   c.convalidated as "Validated",
			   c.conislocal as "Is Local",
			   c.coninhcount as "Number of Ancestors",
			   c.connoinherit as "Non-Inheritable"
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on t.relnamespace = n.oid
		join pg_class i on i.oid = c.conindid
		where c.contype = 'u'
		  and quote_ident(n.nspname) = $1
		  and quote_ident(t.relname) = $2
		  and quote_ident(c.conname) = $3
	`, fmt.Sprintf(pgConstraintColumnsExpr, "c2.conkey", "u"))
	return pgPropertiesFromRow(db, query, schema, table, unique)
}

// postgresqlPropertiesFK mirrors PostgreSQL.py's GetPropertiesFK. The three
// "*_ops" columns (PK=FK/PK=PK/FK=FK Equality Operators) are always empty
// here to match PostgreSQL.py's own observable behavior: its helper
// functions for those columns filter on contype = 'x' (exclusion
// constraints), which can never match the contype = 'f' row this query
// looks up, so they're dead code in the original that we don't need to
// reproduce beyond returning the same empty result.
func postgresqlPropertiesFK(db *sql.DB, schema, table, fk string) ([][2]string, error) {
	query := fmt.Sprintf(`
		select current_database() as "Database",
			   quote_ident(n.nspname) as "Schema",
			   quote_ident(t.relname) as "Table",
			   quote_ident(c.conname) as "Constraint Name",
			   c.oid as "OID",
			   (case c.contype when 'c' then 'Check' when 'f' then 'Foreign Key' when 'p' then 'Primary Key' when 'u' then 'Unique' when 'x' then 'Exclusion' end) as "Constraint Type",
			   %s as "Constrained Columns",
			   quote_ident(i.relname) as "Index",
			   quote_ident(nr2.nspname) as "Referenced Schema",
			   quote_ident(tr.relname) as "Referenced Table",
			   %s as "Referenced Columns",
			   (case c.confupdtype when 'a' then 'No Action' when 'r' then 'Restrict' when 'c' then 'Cascade' when 'n' then 'Set Null' when 'd' then 'Set Default' end) as "Update Action",
			   (case c.confdeltype when 'a' then 'No Action' when 'r' then 'Restrict' when 'c' then 'Cascade' when 'n' then 'Set Null' when 'd' then 'Set Default' end) as "Delete Action",
			   (case c.confmatchtype when 'f' then 'Full' when 'p' then 'Partial' when 's' then 'Simple' end) as "Match Type",
			   c.condeferrable as "Deferrable",
			   c.condeferred as "Deferred by Default",
			   c.convalidated as "Validated",
			   c.conislocal as "Is Local",
			   c.coninhcount as "Number of Ancestors",
			   c.connoinherit as "Non-Inheritable",
			   '' as "PK=FK Equality Operators",
			   '' as "PK=PK Equality Operators",
			   '' as "FK=FK Equality Operators"
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		join pg_namespace n on t.relnamespace = n.oid
		join pg_class i on i.oid = c.conindid
		join pg_class tr on tr.oid = c.confrelid
		join pg_namespace nr2 on tr.relnamespace = nr2.oid
		where c.contype = 'f'
		  and quote_ident(n.nspname) = $1
		  and quote_ident(t.relname) = $2
		  and quote_ident(c.conname) = $3
	`,
		fmt.Sprintf(pgConstraintColumnsExpr, "c2.conkey", "f"),
		pgReferencedColumnsExpr,
	)
	return pgPropertiesFromRow(db, query, schema, table, fk)
}

// postgresqlPropertiesDatabase has no Django-era equivalent to mirror — the
// tree's "database" node type was never wired up to real properties/DDL
// during the migration (see pgSupportedPropertyTypes), so this is new,
// modeled on the same columns pgAdmin/DBeaver show for a database.
func postgresqlPropertiesDatabase(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select d.datname as "Database",
			   d.oid as "OID",
			   pg_catalog.pg_get_userbyid(d.datdba) as "Owner",
			   pg_catalog.pg_encoding_to_char(d.encoding) as "Encoding",
			   d.datcollate as "Collation",
			   d.datctype as "Character Type",
			   coalesce(t.spcname, 'pg_default') as "Tablespace",
			   d.datconnlimit as "Connection Limit",
			   d.datistemplate as "Is Template",
			   d.datallowconn as "Allow Connections",
			   pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as "Size"
		from pg_catalog.pg_database d
		left join pg_catalog.pg_tablespace t on t.oid = d.dattablespace
		where d.datname = $1
	`, name)
}
