package main

import (
	"database/sql"
	"fmt"
)

// This file continues postgresql_properties.go with every PostgreSQL tree
// object type that had a working list/introspection route (from Fáze 8a's
// long-tail port) but no properties/DDL route at all — see
// pgSupportedPropertyTypes in postgresql_handlers.go and
// postgresqlPropertiesDatabase's comment in postgresql_properties.go for
// the full story of why these were missing.

// postgresqlPropertiesSequence mirrors the shape pg_sequences already
// exposes directly — no joins needed, unlike the pre-PG10 catalog-only way.
//
// Filters on quote_ident(s.schemaname)/quote_ident(s.sequencename), not the
// raw columns — postgresqlSequences (postgresql_serverlevel.go), which
// populates the tree this route's p_schema/p_sequence come from, lists
// sequences via `quote_ident(c.relname)`, so the frontend always echoes
// back the quoted form here, same as every table/view/column route. A raw
// comparison only matched by accident for names that don't need quoting.
func postgresqlPropertiesSequence(db *sql.DB, schema, sequence string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select s.schemaname as "Schema",
			   s.sequencename as "Sequence",
			   s.sequenceowner as "Owner",
			   s.data_type as "Data Type",
			   s.start_value as "Start Value",
			   s.min_value as "Min Value",
			   s.max_value as "Max Value",
			   s.increment_by as "Increment",
			   s.cycle as "Cycle",
			   s.cache_size as "Cache Size",
			   s.last_value as "Last Value"
		from pg_sequences s
		where quote_ident(s.schemaname) = $1 and quote_ident(s.sequencename) = $2
	`, schema, sequence)
}

// postgresqlPropertiesRoutine covers every "this node is really just a
// pg_proc row" tree type: function, procedure, triggerfunction,
// direct_triggerfunction, eventtriggerfunction, direct_eventtriggerfunction,
// and aggregate — the frontend always sends node.tag.id (a
// "schema.name(argtypes)" string valid as a ::regprocedure cast) as
// p_object for all seven, and every property queried here (owner, language,
// result type, volatility, cost/rows estimates) is a plain pg_proc column
// that means the same thing regardless of prokind. Only DDL reconstruction
// differs for aggregates (see postgresqlDDLAggregate) — pg_get_functiondef
// itself rejects an aggregate's oid.
func postgresqlPropertiesRoutine(db *sql.DB, routineID string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select n.nspname || '.' || p.proname ||
			   (case when array_length(p.proargtypes, 1) > 0
					 then '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'
					 else '()' end) as "Routine",
			   p.oid as "OID",
			   pg_catalog.pg_get_userbyid(p.proowner) as "Owner",
			   l.lanname as "Language",
			   pg_catalog.pg_get_function_result(p.oid) as "Return Type",
			   (case p.provolatile when 'i' then 'Immutable' when 's' then 'Stable' when 'v' then 'Volatile' end) as "Volatility",
			   p.proleakproof as "Leakproof",
			   p.prosecdef as "Security Definer",
			   p.procost as "Estimated Cost",
			   p.prorows as "Estimated Rows"
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		join pg_language l on l.oid = p.prolang
		where p.oid = $1::regprocedure
	`, routineID)
}

// postgresqlPropertiesDomain has no Django-era equivalent (see
// postgresqlPropertiesDatabase's comment).
func postgresqlPropertiesDomain(db *sql.DB, schema, domain string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select n.nspname as "Schema",
			   t.typname as "Domain",
			   t.oid as "OID",
			   pg_catalog.format_type(t.typbasetype, t.typtypmod) as "Base Type",
			   pg_catalog.pg_get_userbyid(t.typowner) as "Owner",
			   t.typnotnull as "Not Null",
			   t.typdefault as "Default"
		from pg_type t
		join pg_namespace n on n.oid = t.typnamespace
		where n.nspname = $1 and t.typname = $2
	`, schema, domain)
}

// postgresqlPropertiesType has no Django-era equivalent. Covers composite,
// enum, range, and base types alike (see postgresqlDDLType for why DDL
// reconstruction has to branch on "Category" here).
func postgresqlPropertiesType(db *sql.DB, schema, typeName string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select n.nspname as "Schema",
			   t.typname as "Type",
			   t.oid as "OID",
			   (case t.typtype
					when 'c' then 'Composite'
					when 'e' then 'Enum'
					when 'r' then 'Range'
					when 'm' then 'Multirange'
					when 'b' then 'Base'
					else t.typtype::text
				end) as "Category",
			   pg_catalog.pg_get_userbyid(t.typowner) as "Owner"
		from pg_type t
		join pg_namespace n on n.oid = t.typnamespace
		where n.nspname = $1 and t.typname = $2
	`, schema, typeName)
}

// postgresqlPropertiesMaterializedView mirrors postgresqlPropertiesView —
// same shape, "Materialized View" label instead of "View".
func postgresqlPropertiesMaterializedView(db *sql.DB, schema, view string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select current_database() as "Database",
			   n.nspname as "Schema",
			   c.relname as "Materialized View",
			   c.oid as "OID",
			   r.rolname as "Owner",
			   pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as "Size",
			   c.relispopulated as "Populated"
		from pg_class c
		inner join pg_namespace n on n.oid = c.relnamespace
		inner join pg_roles r on r.oid = c.relowner
		where quote_ident(n.nspname) = $1
		  and quote_ident(c.relname) = $2
	`, schema, view)
}

// postgresqlPropertiesFDW has no Django-era equivalent.
func postgresqlPropertiesFDW(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select w.fdwname as "Foreign Data Wrapper",
			   w.oid as "OID",
			   pg_catalog.pg_get_userbyid(w.fdwowner) as "Owner",
			   h.proname as "Handler",
			   v.proname as "Validator",
			   array_to_string(w.fdwoptions, ',') as "Options"
		from pg_foreign_data_wrapper w
		left join pg_proc h on h.oid = w.fdwhandler
		left join pg_proc v on v.oid = w.fdwvalidator
		where w.fdwname = $1
	`, name)
}

// postgresqlPropertiesForeignServer has no Django-era equivalent.
func postgresqlPropertiesForeignServer(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select s.srvname as "Foreign Server",
			   s.oid as "OID",
			   s.srvtype as "Type",
			   s.srvversion as "Version",
			   w.fdwname as "Foreign Data Wrapper",
			   pg_catalog.pg_get_userbyid(s.srvowner) as "Owner",
			   array_to_string(s.srvoptions, ',') as "Options"
		from pg_foreign_server s
		join pg_foreign_data_wrapper w on w.oid = s.srvfdw
		where s.srvname = $1
	`, name)
}

// postgresqlPropertiesForeignTable has no Django-era equivalent.
func postgresqlPropertiesForeignTable(db *sql.DB, schema, table string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select n.nspname as "Schema",
			   c.relname as "Foreign Table",
			   c.oid as "OID",
			   pg_catalog.pg_get_userbyid(c.relowner) as "Owner",
			   s.srvname as "Server",
			   array_to_string(f.ftoptions, ',') as "Options"
		from pg_foreign_table f
		join pg_class c on c.oid = f.ftrelid
		join pg_namespace n on n.oid = c.relnamespace
		join pg_foreign_server s on s.oid = f.ftserver
		where n.nspname = $1 and c.relname = $2
	`, schema, table)
}

// postgresqlPropertiesEventTrigger has no Django-era equivalent.
func postgresqlPropertiesEventTrigger(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select t.evtname as "Event Trigger",
			   t.oid as "OID",
			   t.evtevent as "Event",
			   (n.nspname || '.' || p.proname || '()') as "Function",
			   pg_catalog.pg_get_userbyid(t.evtowner) as "Owner",
			   (case t.evtenabled when 'O' then 'Enabled' when 'D' then 'Disabled' when 'R' then 'Replica Only' when 'A' then 'Always' end) as "Status",
			   array_to_string(t.evttags, ',') as "Tags"
		from pg_event_trigger t
		join pg_proc p on p.oid = t.evtfoid
		join pg_namespace n on n.oid = p.pronamespace
		where t.evtname = $1
	`, name)
}

// postgresqlPropertiesPublication has no Django-era equivalent.
func postgresqlPropertiesPublication(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select p.pubname as "Publication",
			   p.oid as "OID",
			   pg_catalog.pg_get_userbyid(p.pubowner) as "Owner",
			   p.puballtables as "All Tables",
			   p.pubinsert as "Insert",
			   p.pubupdate as "Update",
			   p.pubdelete as "Delete",
			   p.pubtruncate as "Truncate"
		from pg_publication p
		where p.pubname = $1
	`, name)
}

// postgresqlPropertiesSubscription has no Django-era equivalent. Same
// superuser-visibility note as postgresqlSubscriptions: a non-owner,
// non-superuser connection simply sees no row here (pgPropertiesFromRow's
// "object does not exist anymore" error), not a crash.
func postgresqlPropertiesSubscription(db *sql.DB, name string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select s.subname as "Subscription",
			   s.oid as "OID",
			   pg_catalog.pg_get_userbyid(s.subowner) as "Owner",
			   s.subenabled as "Enabled",
			   s.subconninfo as "Connection Info",
			   s.subslotname as "Slot Name",
			   array_to_string(s.subpublications, ',') as "Publications"
		from pg_subscription s
		inner join pg_database d on d.oid = s.subdbid
		where d.datname = current_database()
		  and s.subname = $1
	`, name)
}

// postgresqlPropertiesStatistic has no Django-era equivalent.
func postgresqlPropertiesStatistic(db *sql.DB, schema, statistic string) ([][2]string, error) {
	return pgPropertiesFromRow(db, `
		select n2.nspname as "Schema",
			   se.stxname as "Statistic",
			   se.oid as "OID",
			   n.nspname || '.' || c.relname as "Table",
			   pg_catalog.pg_get_userbyid(se.stxowner) as "Owner",
			   se.stxstattarget as "Statistics Target"
		from pg_statistic_ext se
		inner join pg_class c on se.stxrelid = c.oid
		inner join pg_namespace n on c.relnamespace = n.oid
		inner join pg_namespace n2 on se.stxnamespace = n2.oid
		where n2.nspname = $1 and se.stxname = $2
	`, schema, statistic)
}

// pgUserMappingMaskedOptionsExpr is a SELECT-list expression producing a
// mapping's options as "key=value,key2=value2" with any password-shaped
// option value (matching postgresqlUserMappings' own case-insensitive
// password/passwd/passw/pass/pwd key check in postgresql_foreigndata.go)
// replaced with '*****'. Shared by postgresqlPropertiesUserMapping and
// postgresqlDDLUserMapping — a user mapping's whole reason for existing is
// usually a remote password, and showing it back in plain text in a
// properties/DDL panel would be a real credential leak the existing
// user-mappings LIST route already deliberately avoids. %[1]s is the
// pg_user_mapping alias.
const pgUserMappingMaskedOptionsExpr = `(
	select coalesce(string_agg(
		(case when lower(kv[1]) in ('password', 'passwd', 'passw', 'pass', 'pwd')
		      then kv[1] || '=*****'
		      else kv[1] || '=' || kv[2]
		 end), ','), '')
	from unnest(coalesce(%[1]s.umoptions, '{}')) as opt
	cross join lateral string_to_array(opt, '=') as kv
)`

// postgresqlPropertiesUserMapping has no Django-era equivalent. p_schema is
// actually the foreign server name here (see tree_postgresql.js's
// getPropertiesPostgresqlConfirm — user_mapping is the one type whose
// p_schema isn't a real schema), and p_object is the mapped role's display
// name, which is literally the string "PUBLIC" for the public mapping.
func postgresqlPropertiesUserMapping(db *sql.DB, foreignServer, roleName string) ([][2]string, error) {
	optionsExpr := fmt.Sprintf(pgUserMappingMaskedOptionsExpr, "u")
	if roleName == "PUBLIC" {
		return pgPropertiesFromRow(db, `
			select 'PUBLIC' as "User",
				   s.srvname as "Server",
				   `+optionsExpr+` as "Options"
			from pg_user_mapping u
			inner join pg_foreign_server s on s.oid = u.umserver
			where u.umuser = 0 and s.srvname = $1
		`, foreignServer)
	}
	return pgPropertiesFromRow(db, `
		select r.rolname as "User",
			   s.srvname as "Server",
			   `+optionsExpr+` as "Options"
		from pg_user_mapping u
		inner join pg_foreign_server s on s.oid = u.umserver
		inner join pg_roles r on r.oid = u.umuser
		where s.srvname = $1 and r.rolname = $2
	`, foreignServer, roleName)
}
