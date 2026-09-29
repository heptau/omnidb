package main

import (
	"database/sql"
	"fmt"
	"strings"
)

// This file continues postgresql_ddl.go with every object type
// postgresql_properties2.go added properties for — see that file's package
// comment and postgresqlDDLDatabase's comment in postgresql_ddl.go for why
// these need hand-synthesis rather than a single pg_get_*def() call.

// postgresqlDDLRole synthesizes a CREATE ROLE statement. The password hash
// itself is deliberately never included — pgAdmin/DBeaver do the same,
// since reproducing it as a literal PASSWORD clause would leak the hash
// into a properties/DDL panel far more casually than the role management
// screen already guards it.
//
// Like every other helper in this file that takes a name straight from
// p_object, the catalog match is quote_ident(rolname) = $1 and the name goes
// into the DDL text verbatim — see postgresqlDDLSequence's comment for the
// full reasoning. Matching the raw rolname (and re-quoting it for output)
// meant a role whose name needs quoting was never found at all, so its
// properties/DDL panel failed outright instead of showing anything.
func postgresqlDDLRole(db *sql.DB, name string) (string, error) {
	var canLogin, super, createDB, createRole, inherit, replication, bypassRLS bool
	var connLimit int64
	var validUntil sql.NullString
	err := db.QueryRow(`
		select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
			   rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text
		from pg_roles
		where quote_ident(rolname) = $1
	`, name).Scan(&canLogin, &super, &createDB, &createRole, &inherit, &replication, &bypassRLS, &connLimit, &validUntil)
	if err != nil {
		return "", err
	}

	boolClause := func(label string, on bool) string {
		if on {
			return "    " + label + "\n"
		}
		return "    NO" + label + "\n"
	}

	var b strings.Builder
	b.WriteString("CREATE ROLE " + name + " WITH\n")
	if canLogin {
		b.WriteString("    LOGIN\n")
	} else {
		b.WriteString("    NOLOGIN\n")
	}
	b.WriteString(boolClause("SUPERUSER", super))
	b.WriteString(boolClause("CREATEDB", createDB))
	b.WriteString(boolClause("CREATEROLE", createRole))
	b.WriteString(boolClause("INHERIT", inherit))
	b.WriteString(boolClause("REPLICATION", replication))
	b.WriteString(boolClause("BYPASSRLS", bypassRLS))
	b.WriteString(fmt.Sprintf("    CONNECTION LIMIT %d", connLimit))
	if validUntil.Valid {
		b.WriteString("\n    VALID UNTIL '" + validUntil.String + "'")
	}
	b.WriteString(";")
	return b.String(), nil
}

// postgresqlDDLTablespace synthesizes a CREATE TABLESPACE statement.
func postgresqlDDLTablespace(db *sql.DB, name string) (string, error) {
	var owner string
	var location sql.NullString
	err := db.QueryRow(`
		select pg_catalog.pg_get_userbyid(spcowner), pg_catalog.pg_tablespace_location(oid)
		from pg_tablespace
		where quote_ident(spcname) = $1
	`, name).Scan(&owner, &location)
	if err != nil {
		return "", err
	}
	loc := location.String
	return fmt.Sprintf(
		"CREATE TABLESPACE %s\n    OWNER %s\n    LOCATION %s;",
		name,
		quotePostgresIdentifierDoubleQuoted(owner),
		pgQuoteLiteral(loc),
	), nil
}

// postgresqlDDLExtension synthesizes a CREATE EXTENSION statement.
func postgresqlDDLExtension(db *sql.DB, name string) (string, error) {
	var version, schema string
	err := db.QueryRow(`
		select e.extversion, n.nspname
		from pg_extension e
		join pg_namespace n on n.oid = e.extnamespace
		where quote_ident(e.extname) = $1
	`, name).Scan(&version, &schema)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"CREATE EXTENSION IF NOT EXISTS %s\n    WITH SCHEMA %s\n    VERSION %s;",
		name,
		quotePostgresIdentifierDoubleQuoted(schema),
		pgQuoteLiteral(version),
	), nil
}

// postgresqlDDLSchema synthesizes a CREATE SCHEMA statement.
func postgresqlDDLSchema(db *sql.DB, name string) (string, error) {
	var owner string
	err := db.QueryRow(`select pg_catalog.pg_get_userbyid(nspowner) from pg_namespace where quote_ident(nspname) = $1`, name).Scan(&owner)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"CREATE SCHEMA %s\n    AUTHORIZATION %s;",
		name,
		quotePostgresIdentifierDoubleQuoted(owner),
	), nil
}

// postgresqlDDLSequence synthesizes a CREATE SEQUENCE statement from
// pg_sequences — Postgres has no pg_get_sequencedef().
func postgresqlDDLSequence(db *sql.DB, schema, sequence string) (string, error) {
	// Same fix as postgresqlPropertiesSequence (postgresql_properties2.go):
	// filter on quote_ident(catalog value), since p_schema/p_sequence
	// arrive already quote_ident()-quoted. The output below then uses
	// schema/sequence RAW (no quotePostgresIdentifierDoubleQuoted) for the
	// same reason postgresqlViewDefinition does — they're already valid,
	// quoted-if-needed identifier text, not raw catalog names.
	var dataType string
	var start, min, max, increment, cache int64
	var cycle bool
	err := db.QueryRow(`
		select data_type, start_value, min_value, max_value, increment_by, cache_size, cycle
		from pg_sequences
		where quote_ident(schemaname) = $1 and quote_ident(sequencename) = $2
	`, schema, sequence).Scan(&dataType, &start, &min, &max, &increment, &cache, &cycle)
	if err != nil {
		return "", err
	}
	cycleClause := "NO CYCLE"
	if cycle {
		cycleClause = "CYCLE"
	}
	return fmt.Sprintf(
		"CREATE SEQUENCE %s.%s\n"+
			"    AS %s\n"+
			"    START WITH %d\n"+
			"    INCREMENT BY %d\n"+
			"    MINVALUE %d\n"+
			"    MAXVALUE %d\n"+
			"    CACHE %d\n"+
			"    %s;",
		schema, sequence,
		dataType, start, increment, min, max, cache, cycleClause,
	), nil
}

// postgresqlDDLAggregate synthesizes a CREATE AGGREGATE statement.
// pg_get_functiondef (used for every other routine type — see
// postgresqlRoutineDefinition) rejects an aggregate's oid outright, so this
// is the one routine-shaped type that can't reuse it.
func postgresqlDDLAggregate(db *sql.DB, routineID string) (string, error) {
	var schema, name, args, sfunc, stype string
	var finalFunc, sortOp, initCond sql.NullString
	// sfunc/finalfunc come back as regproc text (quoted and schema-
	// qualified as needed) and initcond via quote_literal: all three are
	// set by whoever created the aggregate, and splicing them raw let a
	// crafted INITCOND close its string literal inside this template.
	err := db.QueryRow(`
		select n.nspname, p.proname,
			   pg_catalog.pg_get_function_identity_arguments(p.oid),
			   a.aggtransfn::regproc::text as sfunc,
			   pg_catalog.format_type(a.aggtranstype, null) as stype,
			   case when a.aggfinalfn <> 0 then a.aggfinalfn::regproc::text end as finalfunc,
			   so.oprname as sortop,
			   quote_literal(nullif(a.agginitval, '')) as initcond
		from pg_aggregate a
		join pg_proc p on p.oid = a.aggfnoid
		join pg_namespace n on n.oid = p.pronamespace
		left join pg_operator so on so.oid = a.aggsortop
		where p.oid = $1::regprocedure
	`, routineID).Scan(&schema, &name, &args, &sfunc, &stype, &finalFunc, &sortOp, &initCond)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("CREATE AGGREGATE %s.%s(%s) (\n", quotePostgresIdentifierDoubleQuoted(schema), quotePostgresIdentifierDoubleQuoted(name), args))
	b.WriteString("    SFUNC = " + sfunc + ",\n")
	b.WriteString("    STYPE = " + stype)
	if finalFunc.Valid {
		b.WriteString(",\n    FINALFUNC = " + finalFunc.String)
	}
	if sortOp.Valid {
		b.WriteString(",\n    SORTOP = " + sortOp.String)
	}
	if initCond.Valid {
		b.WriteString(",\n    INITCOND = " + initCond.String)
	}
	b.WriteString("\n);")
	return b.String(), nil
}

// postgresqlDDLDomain synthesizes a CREATE DOMAIN statement, including any
// CHECK constraints defined on the domain (pg_get_constraintdef already
// reconstructs each one correctly, same as every constraint DDL elsewhere
// in this file).
func postgresqlDDLDomain(db *sql.DB, schema, domain string) (string, error) {
	var baseType string
	var notNull bool
	var defaultVal sql.NullString
	err := db.QueryRow(`
		select pg_catalog.format_type(t.typbasetype, t.typtypmod), t.typnotnull, t.typdefault
		from pg_type t
		join pg_namespace n on n.oid = t.typnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
	`, schema, domain).Scan(&baseType, &notNull, &defaultVal)
	if err != nil {
		return "", err
	}

	rows, err := db.Query(`
		select pg_catalog.pg_get_constraintdef(c.oid, true)
		from pg_constraint c
		join pg_type t on t.oid = c.contypid
		join pg_namespace n on n.oid = t.typnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
	`, schema, domain)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	constraints, err := scanStrings(rows)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("CREATE DOMAIN %s.%s AS %s", schema, domain, baseType))
	if defaultVal.Valid {
		b.WriteString("\n    DEFAULT " + defaultVal.String)
	}
	if notNull {
		b.WriteString("\n    NOT NULL")
	}
	for _, c := range constraints {
		b.WriteString("\n    " + c)
	}
	b.WriteString(";")
	return b.String(), nil
}

// postgresqlDDLType synthesizes a CREATE TYPE statement — dispatches on the
// type's own "Category" (see postgresqlPropertiesType) since composite,
// enum, range, and base types have entirely different DDL shapes and no
// single catalog query covers all four. Composite types reuse
// postgresqlDDLClass (its relkind mapping already includes 'c' → "TYPE",
// see that function's comment), since a composite type's fields are just
// pg_attribute rows on its own backing pg_class entry, identically to a
// table's columns.
func postgresqlDDLType(db *sql.DB, schema, typeName string) (string, error) {
	var typtype string
	if err := db.QueryRow(`
		select t.typtype from pg_type t join pg_namespace n on n.oid = t.typnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
	`, schema, typeName).Scan(&typtype); err != nil {
		return "", err
	}

	switch typtype {
	case "c":
		return postgresqlDDLClass(db, schema, typeName)
	case "e":
		rows, err := db.Query(`
			select quote_literal(e.enumlabel)
			from pg_enum e
			join pg_type t on t.oid = e.enumtypid
			join pg_namespace n on n.oid = t.typnamespace
			where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
			order by e.enumsortorder
		`, schema, typeName)
		if err != nil {
			return "", err
		}
		defer rows.Close()
		labels, err := scanStrings(rows)
		if err != nil {
			return "", err
		}
		// quote_literal (not '-doubling in Go): correct even for a label
		// with a backslash under standard_conforming_strings = off.
		quoted := labels
		return fmt.Sprintf(
			"CREATE TYPE %s.%s AS ENUM (\n    %s\n);",
			schema, typeName,
			strings.Join(quoted, ",\n    "),
		), nil
	case "r", "m":
		var subtype string
		var collation, subtypeOpclass, canonical, subtypeDiff sql.NullString
		err := db.QueryRow(`
			select pg_catalog.format_type(r.rngsubtype, null),
				   quote_ident(con.nspname) || '.' || quote_ident(co.collname),
				   quote_ident(opn.nspname) || '.' || quote_ident(op.opcname),
				   case when r.rngcanonical <> 0 then r.rngcanonical::regproc::text end,
				   case when r.rngsubdiff <> 0 then r.rngsubdiff::regproc::text end
			from pg_range r
			join pg_type t on t.oid = r.rngtypid
			join pg_namespace n on n.oid = t.typnamespace
			left join pg_collation co on co.oid = r.rngcollation
			left join pg_namespace con on con.oid = co.collnamespace
			left join pg_opclass op on op.oid = r.rngsubopc
			left join pg_namespace opn on opn.oid = op.opcnamespace
			where quote_ident(n.nspname) = $1 and quote_ident(t.typname) = $2
		`, schema, typeName).Scan(&subtype, &collation, &subtypeOpclass, &canonical, &subtypeDiff)
		if err != nil {
			return "", err
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("CREATE TYPE %s.%s AS RANGE (\n    SUBTYPE = %s", schema, typeName, subtype))
		if subtypeOpclass.Valid {
			b.WriteString(",\n    SUBTYPE_OPCLASS = " + subtypeOpclass.String)
		}
		if collation.Valid {
			b.WriteString(",\n    COLLATION = " + collation.String)
		}
		if canonical.Valid {
			b.WriteString(",\n    CANONICAL = " + canonical.String)
		}
		if subtypeDiff.Valid {
			b.WriteString(",\n    SUBTYPE_DIFF = " + subtypeDiff.String)
		}
		b.WriteString("\n);")
		return b.String(), nil
	default:
		return fmt.Sprintf("-- %s.%s is a base type (typtype=%q) — its C-level input/output\n-- functions have no generic CREATE TYPE DDL to reconstruct.",
			schema, typeName, typtype), nil
	}
}

// postgresqlDDLFDW synthesizes a CREATE FOREIGN DATA WRAPPER statement.
func postgresqlDDLFDW(db *sql.DB, name string) (string, error) {
	var handler, validator sql.NullString
	var options string
	err := db.QueryRow(`
		select case when w.fdwhandler <> 0 then w.fdwhandler::regproc::text end,
			   case when w.fdwvalidator <> 0 then w.fdwvalidator::regproc::text end,
			   `+fmt.Sprintf(pgFormatOptionsExpr, "w.fdwoptions")+`
		from pg_foreign_data_wrapper w
		where w.fdwname = $1
	`, name).Scan(&handler, &validator, &options)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("CREATE FOREIGN DATA WRAPPER " + quotePostgresIdentifierDoubleQuoted(name))
	if handler.Valid {
		b.WriteString("\n    HANDLER " + handler.String)
	}
	if validator.Valid {
		b.WriteString("\n    VALIDATOR " + validator.String)
	}
	if opts := options; opts != "" {
		b.WriteString("\n    OPTIONS (" + opts + ")")
	}
	b.WriteString(";")
	return b.String(), nil
}

// postgresqlDDLForeignServer synthesizes a CREATE SERVER statement.
func postgresqlDDLForeignServer(db *sql.DB, name string) (string, error) {
	var srvType, version sql.NullString
	var fdwName, options string
	err := db.QueryRow(`
		select quote_literal(s.srvtype), quote_literal(s.srvversion), w.fdwname, `+fmt.Sprintf(pgFormatOptionsExpr, "s.srvoptions")+`
		from pg_foreign_server s
		join pg_foreign_data_wrapper w on w.oid = s.srvfdw
		where s.srvname = $1
	`, name).Scan(&srvType, &version, &fdwName, &options)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("CREATE SERVER " + quotePostgresIdentifierDoubleQuoted(name))
	if srvType.Valid {
		b.WriteString("\n    TYPE " + srvType.String)
	}
	if version.Valid {
		b.WriteString("\n    VERSION " + version.String)
	}
	b.WriteString("\n    FOREIGN DATA WRAPPER " + quotePostgresIdentifierDoubleQuoted(fdwName))
	if opts := options; opts != "" {
		b.WriteString("\n    OPTIONS (" + opts + ")")
	}
	b.WriteString(";")
	return b.String(), nil
}

// postgresqlDDLEventTrigger synthesizes a CREATE EVENT TRIGGER statement.
func postgresqlDDLEventTrigger(db *sql.DB, name string) (string, error) {
	var event, function string
	var tags []byte
	err := db.QueryRow(`
		select t.evtevent,
			   quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '()',
			   coalesce((select string_agg(quote_literal(tag), ', ') from unnest(t.evttags) as tag), '')
		from pg_event_trigger t
		join pg_proc p on p.oid = t.evtfoid
		join pg_namespace n on n.oid = p.pronamespace
		where quote_ident(t.evtname) = $1
	`, name).Scan(&event, &function, &tags)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("CREATE EVENT TRIGGER %s\n    ON %s", name, event))
	if len(tags) > 0 {
		b.WriteString("\n    WHEN TAG IN (" + string(tags) + ")")
	}
	b.WriteString("\n    EXECUTE FUNCTION " + function + ";")
	return b.String(), nil
}

// postgresqlDDLPublication synthesizes a CREATE PUBLICATION statement,
// reusing the existing postgresqlPublicationTables list (postgresql_replication.go)
// instead of re-querying pg_publication_tables here.
func postgresqlDDLPublication(db *sql.DB, name string) (string, error) {
	var allTables, insert, update, delete, truncate bool
	err := db.QueryRow(`
		select puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
		from pg_publication
		where quote_ident(pubname) = $1
	`, name).Scan(&allTables, &insert, &update, &delete, &truncate)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString("CREATE PUBLICATION " + name)
	if allTables {
		b.WriteString("\n    FOR ALL TABLES")
	} else {
		tables, err := postgresqlPublicationTables(db, name)
		if err != nil {
			return "", err
		}
		if len(tables) > 0 {
			b.WriteString("\n    FOR TABLE " + strings.Join(tables, ", "))
		}
	}
	actions := make([]string, 0, 4)
	if insert {
		actions = append(actions, "insert")
	}
	if update {
		actions = append(actions, "update")
	}
	if delete {
		actions = append(actions, "delete")
	}
	if truncate {
		actions = append(actions, "truncate")
	}
	b.WriteString("\n    WITH (publish = '" + strings.Join(actions, ",") + "');")
	return b.String(), nil
}

// postgresqlDDLSubscription synthesizes a CREATE SUBSCRIPTION statement.
// subconninfo is masked to non-superusers by Postgres itself (returned as
// an empty string) — nothing extra to hide here.
func postgresqlDDLSubscription(db *sql.DB, name string) (string, error) {
	var connInfo, slotName, publications string
	var enabled bool
	err := db.QueryRow(`
		select quote_literal(s.subconninfo), s.subenabled, coalesce(quote_literal(s.subslotname), 'NONE'),
			   (select string_agg(quote_ident(pub), ', ') from unnest(s.subpublications) as pub)
		from pg_subscription s
		inner join pg_database d on d.oid = s.subdbid
		where d.datname = current_database() and quote_ident(s.subname) = $1
	`, name).Scan(&connInfo, &enabled, &slotName, &publications)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"CREATE SUBSCRIPTION %s\n    CONNECTION %s\n    PUBLICATION %s\n    WITH (slot_name = %s, enabled = %t);",
		name, connInfo, publications, slotName, enabled,
	), nil
}

// postgresqlDDLStatistic mirrors PostgreSQL's own pg_get_statisticsobjdef —
// unlike everything else in this file, this one built-in already produces
// a complete, correct "CREATE STATISTICS ..." statement (PG13+; this
// project's version-floor policy already assumes PG11+/13+ elsewhere, e.g.
// postgresqlPublications' pubtruncate comment).
func postgresqlDDLStatistic(db *sql.DB, schema, statistic string) (string, error) {
	var ddl string
	err := db.QueryRow(`
		select pg_catalog.pg_get_statisticsobjdef(se.oid)
		from pg_statistic_ext se
		join pg_namespace n on n.oid = se.stxnamespace
		where quote_ident(n.nspname) = $1 and quote_ident(se.stxname) = $2
	`, schema, statistic).Scan(&ddl)
	if err != nil {
		return "", err
	}
	return ddl + ";", nil
}

// postgresqlDDLUserMapping synthesizes a CREATE USER MAPPING statement.
func postgresqlDDLUserMapping(db *sql.DB, foreignServer, roleName string) (string, error) {
	optionsExpr := fmt.Sprintf(pgUserMappingMaskedOptionsDDLExpr, "u")
	var options string
	var err error
	if roleName == "PUBLIC" {
		err = db.QueryRow(`
			select `+optionsExpr+`
			from pg_user_mapping u
			inner join pg_foreign_server s on s.oid = u.umserver
			where u.umuser = 0 and s.srvname = $1
		`, foreignServer).Scan(&options)
	} else {
		err = db.QueryRow(`
			select `+optionsExpr+`
			from pg_user_mapping u
			inner join pg_foreign_server s on s.oid = u.umserver
			inner join pg_roles r on r.oid = u.umuser
			where s.srvname = $1 and r.rolname = $2
		`, foreignServer, roleName).Scan(&options)
	}
	if err != nil {
		return "", err
	}
	// roleName is quoted like foreignServer below UNLESS it's the literal
	// keyword "PUBLIC" — that's real SQL syntax (every role, not a role
	// actually named "PUBLIC"), and quoting it would change its meaning
	// to look for a role literally named PUBLIC instead. Previously
	// neither case was quoted, producing invalid DDL text for any real
	// role name needing quoting (mixed case, reserved word).
	roleForDDL := roleName
	if roleName != "PUBLIC" {
		roleForDDL = quotePostgresIdentifierDoubleQuoted(roleName)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("CREATE USER MAPPING FOR %s\n    SERVER %s", roleForDDL, quotePostgresIdentifierDoubleQuoted(foreignServer)))
	if opts := options; opts != "" {
		b.WriteString("\n    OPTIONS (" + opts + ")")
	}
	b.WriteString(";")
	return b.String(), nil
}

// pgFormatOptionsExpr is a SELECT-list expression rendering an options
// text[] (%s: the column) as a ready-to-splice OPTIONS clause body —
// "key 'value', key2 'value2'" — quoted by Postgres itself. It replaces
// splitting array_to_string(options, ',') on ',' and '=' in Go, where an
// option value containing a comma (settable by any server/mapping owner)
// became a bare, unquoted "key" in the generated DDL.
const pgFormatOptionsExpr = `(
	select coalesce(string_agg(quote_ident(split_part(opt, '=', 1)) || ' ' || quote_literal(substr(opt, strpos(opt, '=') + 1)), ', '), '')
	from unnest(coalesce(%s, '{}')) as opt
)`

// pgUserMappingMaskedOptionsDDLExpr is pgFormatOptionsExpr plus
// pgUserMappingMaskedOptionsExpr's password masking (%[1]s: the
// pg_user_mapping alias).
const pgUserMappingMaskedOptionsDDLExpr = `(
	select coalesce(string_agg(quote_ident(split_part(opt, '=', 1)) || ' ' ||
		(case when lower(split_part(opt, '=', 1)) in ('password', 'passwd', 'passw', 'pass', 'pwd')
		      then quote_literal('*****')
		      else quote_literal(substr(opt, strpos(opt, '=') + 1))
		 end), ', '), '')
	from unnest(coalesce(%[1]s.umoptions, '{}')) as opt
)`

// pgQuoteLiteral mirrors Postgres's own quote_literal(): single quotes
// doubled, and an E” literal with doubled backslashes when the value has
// any — plain '-doubling alone is breakable under
// standard_conforming_strings = off.
func pgQuoteLiteral(v string) string {
	q := "'" + strings.ReplaceAll(v, "'", "''") + "'"
	if strings.Contains(v, `\`) {
		return "E" + strings.ReplaceAll(q, `\`, `\\`)
	}
	return q
}
