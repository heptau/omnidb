package main

// This file mirrors PostgreSQL.py's ~123 static DDL-wizard templates used
// by tree_postgresql.py's get_tree_info — the last item of Fáze 8a's
// PostgreSQL long-tail. These are almost entirely static hint text (with
// #placeholder# markers substituted client-side, or bare lowercase words
// left as commented-out DDL-skeleton prose for the user to edit directly in
// the SQL editor) — the only real runtime logic anywhere in the original 123
// methods is picking between 2-4 hardcoded string variants based on the
// connected server's server_version_num (never a live catalog query against
// the specific object being scripted). Generated from a direct, mechanical
// extraction of PostgreSQL.py's own triple-quoted strings (not hand-typed)
// to avoid transcription errors across this much text — see
// go-backend-migration memory for how.

const pgTplCreateRole = `CREATE ROLE name
--[ ENCRYPTED | UNENCRYPTED ] PASSWORD 'password'
--SUPERUSER | NOSUPERUSER
--CREATEDB | NOCREATEDB
--CREATEROLE | NOCREATEROLE
--INHERIT | NOINHERIT
--LOGIN | NOLOGIN
--REPLICATION | NOREPLICATION
--BYPASSRLS | NOBYPASSRLS
--CONNECTION LIMIT connlimit
--VALID UNTIL 'timestamp'
--IN ROLE role_name [, ...]
--IN GROUP role_name [, ...]
--ROLE role_name [, ...]
--ADMIN role_name [, ...]
--USER role_name [, ...]
--SYSID uid
`

const pgTplAlterRole = `ALTER ROLE #role_name#
--SUPERUSER | NOSUPERUSER
--CREATEDB | NOCREATEDB
--CREATEROLE | NOCREATEROLE
--INHERIT | NOINHERIT
--LOGIN | NOLOGIN
--REPLICATION | NOREPLICATION
--BYPASSRLS | NOBYPASSRLS
--CONNECTION LIMIT connlimit
--[ ENCRYPTED | UNENCRYPTED ] PASSWORD 'password'
--VALID UNTIL 'timestamp'
--RENAME TO new_name
--[ IN DATABASE database_name ] SET configuration_parameter TO { value | DEFAULT }
--[ IN DATABASE database_name ] SET configuration_parameter FROM CURRENT
--[ IN DATABASE database_name ] RESET configuration_parameter
--[ IN DATABASE database_name ] RESET ALL
`

const pgTplDropRole = `DROP ROLE #role_name#`

const pgTplCreateTablespace = `CREATE TABLESPACE name
LOCATION 'directory'
--OWNER new_owner | CURRENT_USER | SESSION_USER
--WITH ( tablespace_option = value [, ... ] )
`

const pgTplAlterTablespace = `ALTER TABLESPACE #tablespace_name#
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET seq_page_cost = value
--RESET seq_page_cost
--SET random_page_cost = value
--RESET random_page_cost
--SET effective_io_concurrency = value
--RESET effective_io_concurrency
`

const pgTplDropTablespace = `DROP TABLESPACE #tablespace_name#`

func pgTplCreateDatabase(verNum int) string {
	if verNum < 90500 {
		return `CREATE DATABASE name
--OWNER user_name
--TEMPLATE template
--ENCODING encoding
--LC_COLLATE lc_collate
--LC_CTYPE lc_ctype
--TABLESPACE tablespace
--CONNECTION LIMIT connlimit
`
	}
	if verNum < 130000 {
		return `CREATE DATABASE name
--OWNER user_name
--TEMPLATE template
--ENCODING encoding
--LC_COLLATE lc_collate
--LC_CTYPE lc_ctype
--TABLESPACE tablespace
--ALLOW_CONNECTIONS allowconn
--CONNECTION LIMIT connlimit
--IS_TEMPLATE istemplate
`
	}
	return `CREATE DATABASE name
--OWNER user_name
--TEMPLATE template
--ENCODING encoding
--LOCALE locale
--LC_COLLATE lc_collate
--LC_CTYPE lc_ctype
--TABLESPACE tablespace
--ALLOW_CONNECTIONS allowconn
--CONNECTION LIMIT connlimit
--IS_TEMPLATE istemplate
`
}

const pgTplAlterDatabase = `ALTER DATABASE #database_name#
--ALLOW_CONNECTIONS allowconn
--CONNECTION LIMIT connlimit
--IS_TEMPLATE istemplate
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET TABLESPACE new_tablespace
--SET configuration_parameter TO { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
`

func pgTplDropDatabase(verNum int) string {
	if verNum < 130000 {
		return `DROP DATABASE #database_name#`
	}
	return `DROP DATABASE #database_name#
--WITH ( FORCE )
`
}

func pgTplCreateExtension(verNum int) string {
	if verNum < 130000 {
		return `CREATE EXTENSION name
--SCHEMA schema_name
--VERSION VERSION
--FROM old_version
`
	}
	return `CREATE EXTENSION name
--SCHEMA schema_name
--VERSION VERSION
`
}

const pgTplAlterExtension = `ALTER EXTENSION #extension_name#
--UPDATE [ TO new_version ]
--SET SCHEMA new_schema
--ADD member_object
--DROP member_object
`

const pgTplDropExtension = `DROP EXTENSION #extension_name#
--CASCADE
`

const pgTplCreateSchema = `CREATE SCHEMA schema_name
--AUTHORIZATION [ GROUP ] user_name | CURRENT_USER | SESSION_USER
`

const pgTplAlterSchema = `ALTER SCHEMA #schema_name#
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
`

const pgTplDropSchema = `DROP SCHEMA #schema_name#
--CASCADE
`

const pgTplCreateSequence = `CREATE SEQUENCE #schema_name#.name
--INCREMENT BY increment
--MINVALUE minvalue | NO MINVALUE
--MAXVALUE maxvalue | NO MAXVALUE
--START WITH start
--CACHE cache
--CYCLE
--OWNED BY { table_name.column_name | NONE }
`

const pgTplAlterSequence = `ALTER SEQUENCE #sequence_name#
--INCREMENT BY increment
--MINVALUE minvalue | NO MINVALUE
--MAXVALUE maxvalue | NO MAXVALUE
--START WITH start
--RESTART
--RESTART WITH restart
--CACHE cache
--CYCLE
--NO CYCLE
--OWNED BY { table_name.column_name | NONE }
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
--SET SCHEMA new_schema
`

const pgTplDropSequence = `DROP SEQUENCE #sequence_name#
--CASCADE
`

const pgTplCreateFunction = `CREATE OR REPLACE FUNCTION #schema_name#.name
--(
--    [ argmode ] [ argname ] argtype [ { DEFAULT | = } default_expr ]
--)
--RETURNS rettype
--RETURNS TABLE ( column_name column_type )
LANGUAGE plpgsql
--IMMUTABLE | STABLE | VOLATILE
--STRICT
--SECURITY DEFINER
--COST execution_cost
--ROWS result_rows
AS
$function$
--DECLARE
-- variables
BEGIN
-- definition
END;
$function$
`

func pgTplAlterFunction(verNum int) string {
	if verNum < 90600 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
`
	}
	if verNum < 120000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	if verNum < 130000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
--NO DEPENDS ON EXTENSION extension_name
`
}

const pgTplDropFunction = `DROP FUNCTION #function_name#
--CASCADE
`

const pgTplCreateProcedure = `CREATE OR REPLACE PROCEDURE #schema_name#.name
--(
--    [ argmode ] [ argname ] argtype [ { DEFAULT | = } default_expr ]
--)
LANGUAGE plpgsql
--SECURITY DEFINER
AS
$procedure$
--DECLARE
-- variables
BEGIN
-- definition
END;
$procedure$
`

const pgTplAlterProcedure = `ALTER PROCEDURE #procedure_name#
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`

const pgTplDropProcedure = `DROP PROCEDURE #procedure_name#
--CASCADE
`

const pgTplCreateTriggerFunction = `CREATE OR REPLACE FUNCTION #schema_name#.name()
RETURNS trigger
LANGUAGE plpgsql
--IMMUTABLE | STABLE | VOLATILE
--COST execution_cost
AS
$function$
--DECLARE
-- variables
BEGIN
-- definition
END;
$function$
`

func pgTplAlterTriggerFunction(verNum int) string {
	if verNum < 90600 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
`
	}
	if verNum < 120000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	if verNum < 130000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
--NO DEPENDS ON EXTENSION extension_name
`
}

const pgTplDropTriggerFunction = `DROP FUNCTION #function_name#
--CASCADE
`

const pgTplCreateEventTriggerFunction = `CREATE OR REPLACE FUNCTION #schema_name#.name()
RETURNS event_trigger
LANGUAGE plpgsql
--IMMUTABLE | STABLE | VOLATILE
--COST execution_cost
AS
$function$
--DECLARE
-- variables
BEGIN
-- definition
END;
$function$
`

func pgTplAlterEventTriggerFunction(verNum int) string {
	if verNum < 90600 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
`
	}
	if verNum < 120000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	if verNum < 130000 {
		return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
`
	}
	return `ALTER FUNCTION #function_name#
--CALLED ON NULL INPUT
--RETURNS NULL ON NULL INPUT
--STRICT
--IMMUTABLE
--STABLE
--VOLATILE
--NOT LEAKPROOF
--LEAKPROOF
--EXTERNAL SECURITY INVOKER
--SECURITY INVOKER
--EXTERNAL SECURITY DEFINER
--SECURITY DEFINER
--PARALLEL { UNSAFE | RESTRICTED | SAFE }
--COST execution_cost
--ROWS result_rows
--SUPPORT support_function
--SET configuration_parameter { TO | = } { value | DEFAULT }
--SET configuration_parameter FROM CURRENT
--RESET configuration_parameter
--RESET ALL
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
--DEPENDS ON EXTENSION extension_name
--NO DEPENDS ON EXTENSION extension_name
`
}

const pgTplDropEventTriggerFunction = `DROP FUNCTION #function_name#
--CASCADE
`

func pgTplCreateAggregate(verNum int) string {
	if verNum < 90600 {
		return `CREATE AGGREGATE #schema_name#.name
--([ argmode ] [ argname ] arg_data_type [ , ... ])
--ORDER BY [ argmode ] [ argname ] arg_data_type [ , ... ] )
(
	SFUNC = sfunc,
	STYPE = state_data_type
--    , SSPACE = state_data_size
--    , FINALFUNC = ffunc
--    , FINALFUNC_EXTRA
--    , INITCOND = initial_condition
--    , MSFUNC = msfunc
--    , MINVFUNC = minvfunc
--    , MSTYPE = mstate_data_type
--    , MSSPACE = mstate_data_size
--    , MFINALFUNC = mffunc
--    , MFINALFUNC_EXTRA
--    , MINITCOND = minitial_condition
--    , SORTOP = sort_operator
)
`
	}
	if verNum < 110000 {
		return `CREATE AGGREGATE #schema_name#.name
--([ argmode ] [ argname ] arg_data_type [ , ... ])
--ORDER BY [ argmode ] [ argname ] arg_data_type [ , ... ] )
(
SFUNC = sfunc,
STYPE = state_data_type
--    , SSPACE = state_data_size
--    , FINALFUNC = ffunc
--    , FINALFUNC_EXTRA
--    , COMBINEFUNC = combinefunc
--    , SERIALFUNC = serialfunc
--    , DESERIALFUNC = deserialfunc
--    , INITCOND = initial_condition
--    , MSFUNC = msfunc
--    , MINVFUNC = minvfunc
--    , MSTYPE = mstate_data_type
--    , MSSPACE = mstate_data_size
--    , MFINALFUNC = mffunc
--    , MFINALFUNC_EXTRA
--    , MINITCOND = minitial_condition
--    , SORTOP = sort_operator
--    , PARALLEL = { SAFE | RESTRICTED | UNSAFE }
)
`
	}
	return `CREATE AGGREGATE #schema_name#.name
--([ argmode ] [ argname ] arg_data_type [ , ... ])
--ORDER BY [ argmode ] [ argname ] arg_data_type [ , ... ] )
(
SFUNC = sfunc,
STYPE = state_data_type
--    , SSPACE = state_data_size
--    , FINALFUNC = ffunc
--    , FINALFUNC_EXTRA
--    , FINALFUNC_MODIFY = { READ_ONLY | SHAREABLE | READ_WRITE }
--    , COMBINEFUNC = combinefunc
--    , SERIALFUNC = serialfunc
--    , DESERIALFUNC = deserialfunc
--    , INITCOND = initial_condition
--    , MSFUNC = msfunc
--    , MINVFUNC = minvfunc
--    , MSTYPE = mstate_data_type
--    , MSSPACE = mstate_data_size
--    , MFINALFUNC = mffunc
--    , MFINALFUNC_EXTRA
--    , MFINALFUNC_MODIFY = { READ_ONLY | SHAREABLE | READ_WRITE }
--    , MINITCOND = minitial_condition
--    , SORTOP = sort_operator
--    , PARALLEL = { SAFE | RESTRICTED | UNSAFE }
)
`
}

const pgTplAlterAggregate = `ALTER AGGREGATE #aggregate_name#
--RENAME TO new_name
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--SET SCHEMA new_schema
`

const pgTplDropAggregate = `DROP AGGREGATE #aggregate_name#
--RESTRICT
--CASCADE
`

const pgTplCreateView = `CREATE [ OR REPLACE ] [ TEMP | TEMPORARY ] [ RECURSIVE ] VIEW #schema_name#.name
--WITH ( check_option = local | cascaded )
--WITH ( security_barrier = true | false )
AS
SELECT ...
`

func pgTplAlterView(verNum int) string {
	if verNum < 130000 {
		return `ALTER VIEW #view_name#
--ALTER COLUMN column_name SET DEFAULT expression
--ALTER COLUMN column_name DROP DEFAULT
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
--SET SCHEMA new_schema
--SET ( check_option = value )
--SET ( security_barrier = { true | false } )
--RESET ( check_option )
--RESET ( security_barrier )

--ALTER TABLE #view_name# RENAME COLUMN column_name TO new_column_name
`
	}
	return `ALTER VIEW #view_name#
--ALTER COLUMN column_name SET DEFAULT expression
--ALTER COLUMN column_name DROP DEFAULT
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME COLUMN column_name TO new_column_name
--RENAME TO new_name
--SET SCHEMA new_schema
--SET ( check_option = value )
--SET ( security_barrier = { true | false } )
--RESET ( check_option )
--RESET ( security_barrier )
`
}

const pgTplDropView = `DROP VIEW #view_name#
--CASCADE
`

const pgTplCreateMaterializedView = `CREATE MATERIALIZED VIEW #schema_name#.name AS
SELECT ...
--WITH NO DATA
`

const pgTplRefreshMaterializedView = `REFRESH MATERIALIZED VIEW
--CONCURRENTLY
#view_name#
--WITH NO DATA
`

func pgTplAlterMaterializedView(verNum int) string {
	if verNum < 90600 {
		return `ALTER MATERIALIZED VIEW #view_name#
--ALTER COLUMN column_name SET STATISTICS integer
--ALTER COLUMN column_name SET ( attribute_option = value )
--ALTER COLUMN column_name RESET ( attribute_option )
--ALTER COLUMN column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--CLUSTER ON index_name
--SET WITHOUT CLUSTER
--SET ( storage_parameter = value )
--RESET ( storage_parameter )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME COLUMN column_name TO new_column_name
--RENAME TO new_name
--SET SCHEMA new_schema
--SET TABLESPACE new_tablespace [ NOWAIT ]
`
	}
	return `ALTER MATERIALIZED VIEW #view_name#
--ALTER COLUMN column_name SET STATISTICS integer
--ALTER COLUMN column_name SET ( attribute_option = value )
--ALTER COLUMN column_name RESET ( attribute_option )
--ALTER COLUMN column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--CLUSTER ON index_name
--SET WITHOUT CLUSTER
--SET ( storage_parameter = value )
--RESET ( storage_parameter )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--DEPENDS ON EXTENSION extension_name
--RENAME COLUMN column_name TO new_column_name
--RENAME TO new_name
--SET SCHEMA new_schema
--SET TABLESPACE new_tablespace [ NOWAIT ]
`
}

const pgTplDropMaterializedView = `DROP MATERIALIZED VIEW #view_name#
--CASCADE
`

func pgTplCreateTable(verNum int) string {
	if verNum < 120000 {
		return `CREATE
--TEMPORARY
--UNLOGGED
TABLE #schema_name#.table_name
--OF type_name
--AS query [ WITH [ NO ] DATA ]
--PARTITION OF parent_table
(
	column_name data_type
	--COLLATE collation
	--CONSTRAINT constraint_name
	--NOT NULL
	--NULL
	--CHECK ( expression ) [ NO INHERIT ]
	--DEFAULT default_expr
	--GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY [ ( sequence_options ) ]
	--GENERATED ALWAYS AS ( generation_expr ) STORED
	--UNIQUE [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--PRIMARY KEY [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--REFERENCES reftable [ ( refcolumn ) ] [ MATCH FULL | MATCH PARTIAL | MATCH SIMPLE ] [ ON DELETE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ] [ ON UPDATE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ]
	--CHECK ( expression ) [ NO INHERIT ]
	--UNIQUE ( column_name [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--PRIMARY KEY ( column_name [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--EXCLUDE [ USING index_method ] ( { column_name | ( expression ) } [ opclass ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] WITH operator [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ] [ WHERE ( predicate ) ]
	--FOREIGN KEY ( column_name [, ... ] ) REFERENCES reftable [ ( refcolumn [, ... ] ) ] [ MATCH FULL | MATCH PARTIAL | MATCH SIMPLE ] [ ON DELETE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ] [ ON UPDATE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ]
	--DEFERRABLE
	--NOT DEFERRABLE
	--INITIALLY DEFERRED
	--INITIALLY IMMEDIATE
	--LIKE source_table [ { INCLUDING | EXCLUDING } { COMMENTS | CONSTRAINTS | DEFAULTS | IDENTITY | INDEXES | STATISTICS | STORAGE | ALL } ... ]
)
--FOR VALUES IN ( { numeric_literal | string_literal | TRUE | FALSE | NULL } [, ...] )
--FOR VALUES FROM ( { numeric_literal | string_literal | TRUE | FALSE | MINVALUE | MAXVALUE } [, ...] ) TO ( { numeric_literal | string_literal | TRUE | FALSE | MINVALUE | MAXVALUE } [, ...] )
--FOR VALUES WITH ( MODULUS numeric_literal, REMAINDER numeric_literal )
--DEFAULT
--INHERITS ( parent_table [, ... ] )
--PARTITION BY { RANGE | LIST | HASH } ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass ] [, ... ] )
--WITH ( storage_parameter [= value] [, ... ] )
--WITH OIDS
--WITHOUT OIDS
--ON COMMIT { PRESERVE ROWS | DELETE ROWS | DROP }
--TABLESPACE tablespace_name
`
	}
	return `CREATE
--TEMPORARY
--UNLOGGED
TABLE #schema_name#.table_name
--OF type_name
--AS query [ WITH [ NO ] DATA ]
--PARTITION OF parent_table
(
	column_name data_type
	--COLLATE collation
	--CONSTRAINT constraint_name
	--NOT NULL
	--NULL
	--CHECK ( expression ) [ NO INHERIT ]
	--DEFAULT default_expr
	--GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY [ ( sequence_options ) ]
	--GENERATED ALWAYS AS ( generation_expr ) STORED
	--UNIQUE [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--PRIMARY KEY [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--REFERENCES reftable [ ( refcolumn ) ] [ MATCH FULL | MATCH PARTIAL | MATCH SIMPLE ] [ ON DELETE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ] [ ON UPDATE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ]
	--CHECK ( expression ) [ NO INHERIT ]
	--UNIQUE ( column_name [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--PRIMARY KEY ( column_name [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ]
	--EXCLUDE [ USING index_method ] ( { column_name | ( expression ) } [ opclass ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] WITH operator [, ... ] ) [ WITH ( storage_parameter [= value] [, ... ] ) ] [ USING INDEX TABLESPACE tablespace_name ] [ WHERE ( predicate ) ]
	--FOREIGN KEY ( column_name [, ... ] ) REFERENCES reftable [ ( refcolumn [, ... ] ) ] [ MATCH FULL | MATCH PARTIAL | MATCH SIMPLE ] [ ON DELETE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ] [ ON UPDATE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT } ]
	--DEFERRABLE
	--NOT DEFERRABLE
	--INITIALLY DEFERRED
	--INITIALLY IMMEDIATE
	--LIKE source_table [ { INCLUDING | EXCLUDING } { COMMENTS | CONSTRAINTS | DEFAULTS | IDENTITY | INDEXES | STATISTICS | STORAGE | ALL } ... ]
)
--FOR VALUES IN ( { numeric_literal | string_literal | TRUE | FALSE | NULL } [, ...] )
--FOR VALUES FROM ( { numeric_literal | string_literal | TRUE | FALSE | MINVALUE | MAXVALUE } [, ...] ) TO ( { numeric_literal | string_literal | TRUE | FALSE | MINVALUE | MAXVALUE } [, ...] )
--FOR VALUES WITH ( MODULUS numeric_literal, REMAINDER numeric_literal )
--DEFAULT
--INHERITS ( parent_table [, ... ] )
--PARTITION BY { RANGE | LIST | HASH } ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass ] [, ... ] )
--WITH ( storage_parameter [= value] [, ... ] )
--WITHOUT OIDS
--ON COMMIT { PRESERVE ROWS | DELETE ROWS | DROP }
--TABLESPACE tablespace_name
`
}

func pgTplAlterTable(verNum int) string {
	if verNum < 120000 {
		return `ALTER TABLE
--ONLY
#table_name#
--ADD [ COLUMN ] [ IF NOT EXISTS ] column_name data_type [ COLLATE collation ] [ column_constraint [ ... ] ]
--DROP [ COLUMN ] [ IF EXISTS ] column_name [ RESTRICT | CASCADE ]
--ALTER [ COLUMN ] column_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ USING expression ]
--ALTER [ COLUMN ] column_name SET DEFAULT expression
--ALTER [ COLUMN ] column_name DROP DEFAULT
--ALTER [ COLUMN ] column_name { SET | DROP } NOT NULL
--ALTER [ COLUMN ] column_name ADD GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY [ ( sequence_options ) ]
--ALTER [ COLUMN ] column_name { SET GENERATED { ALWAYS | BY DEFAULT } | SET sequence_option | RESTART [ [ WITH ] restart ] } [...]
--ALTER [ COLUMN ] column_name DROP IDENTITY [ IF EXISTS ]
--ALTER [ COLUMN ] column_name SET STATISTICS integer
--ALTER [ COLUMN ] column_name SET ( attribute_option = value [, ... ] )
--ALTER [ COLUMN ] column_name RESET ( attribute_option [, ... ] )
--ALTER [ COLUMN ] column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--ADD table_constraint [ NOT VALID ]
--ADD CONSTRAINT constraint_name { UNIQUE | PRIMARY KEY } USING INDEX index_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--ALTER CONSTRAINT constraint_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--VALIDATE CONSTRAINT constraint_name
--DROP CONSTRAINT [ IF EXISTS ]  constraint_name [ RESTRICT | CASCADE ]
--DISABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE REPLICA TRIGGER trigger_name
--ENABLE ALWAYS TRIGGER trigger_name
--DISABLE RULE rewrite_rule_name
--ENABLE RULE rewrite_rule_name
--ENABLE REPLICA RULE rewrite_rule_name
--ENABLE ALWAYS RULE rewrite_rule_name
--DISABLE ROW LEVEL SECURITY
--ENABLE ROW LEVEL SECURITY
--FORCE ROW LEVEL SECURITY
--NO FORCE ROW LEVEL SECURITY
--CLUSTER ON index_name
--SET WITHOUT CLUSTER
--SET WITH OIDS
--SET WITHOUT OIDS
--SET TABLESPACE new_tablespace
--SET { LOGGED | UNLOGGED }
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
--INHERIT parent_table
--NO INHERIT parent_table
--OF type_name
--NOT OF
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--REPLICA IDENTITY { DEFAULT | USING INDEX index_name | FULL | NOTHING }
--RENAME [ COLUMN ] column_name TO new_column_name
--RENAME CONSTRAINT constraint_name TO new_constraint_name
--RENAME TO new_name
--SET SCHEMA new_schema
--ALL IN TABLESPACE name [ OWNED BY role_name [, ... ] ] SET TABLESPACE new_tablespace [ NOWAIT ]
--ATTACH PARTITION partition_name FOR VALUES partition_bound_spec
--DETACH PARTITION partition_name
`
	}
	if verNum < 130000 {
		return `ALTER TABLE
--ONLY
#table_name#
--ADD [ COLUMN ] [ IF NOT EXISTS ] column_name data_type [ COLLATE collation ] [ column_constraint [ ... ] ]
--DROP [ COLUMN ] [ IF EXISTS ] column_name [ RESTRICT | CASCADE ]
--ALTER [ COLUMN ] column_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ USING expression ]
--ALTER [ COLUMN ] column_name SET DEFAULT expression
--ALTER [ COLUMN ] column_name DROP DEFAULT
--ALTER [ COLUMN ] column_name { SET | DROP } NOT NULL
--ALTER [ COLUMN ] column_name ADD GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY [ ( sequence_options ) ]
--ALTER [ COLUMN ] column_name { SET GENERATED { ALWAYS | BY DEFAULT } | SET sequence_option | RESTART [ [ WITH ] restart ] } [...]
--ALTER [ COLUMN ] column_name DROP IDENTITY [ IF EXISTS ]
--ALTER [ COLUMN ] column_name SET STATISTICS integer
--ALTER [ COLUMN ] column_name SET ( attribute_option = value [, ... ] )
--ALTER [ COLUMN ] column_name RESET ( attribute_option [, ... ] )
--ALTER [ COLUMN ] column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--ADD table_constraint [ NOT VALID ]
--ADD CONSTRAINT constraint_name { UNIQUE | PRIMARY KEY } USING INDEX index_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--ALTER CONSTRAINT constraint_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--VALIDATE CONSTRAINT constraint_name
--DROP CONSTRAINT [ IF EXISTS ]  constraint_name [ RESTRICT | CASCADE ]
--DISABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE REPLICA TRIGGER trigger_name
--ENABLE ALWAYS TRIGGER trigger_name
--DISABLE RULE rewrite_rule_name
--ENABLE RULE rewrite_rule_name
--ENABLE REPLICA RULE rewrite_rule_name
--ENABLE ALWAYS RULE rewrite_rule_name
--DISABLE ROW LEVEL SECURITY
--ENABLE ROW LEVEL SECURITY
--FORCE ROW LEVEL SECURITY
--NO FORCE ROW LEVEL SECURITY
--CLUSTER ON index_name
--SET WITHOUT CLUSTER
--SET WITHOUT OIDS
--SET TABLESPACE new_tablespace
--SET { LOGGED | UNLOGGED }
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
--INHERIT parent_table
--NO INHERIT parent_table
--OF type_name
--NOT OF
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--REPLICA IDENTITY { DEFAULT | USING INDEX index_name | FULL | NOTHING }
--RENAME [ COLUMN ] column_name TO new_column_name
--RENAME CONSTRAINT constraint_name TO new_constraint_name
--RENAME TO new_name
--SET SCHEMA new_schema
--ALL IN TABLESPACE name [ OWNED BY role_name [, ... ] ] SET TABLESPACE new_tablespace [ NOWAIT ]
--ATTACH PARTITION partition_name FOR VALUES partition_bound_spec
--DETACH PARTITION partition_name
`
	}
	return `ALTER TABLE
--ONLY
#table_name#
--ADD [ COLUMN ] [ IF NOT EXISTS ] column_name data_type [ COLLATE collation ] [ column_constraint [ ... ] ]
--DROP [ COLUMN ] [ IF EXISTS ] column_name [ RESTRICT | CASCADE ]
--ALTER [ COLUMN ] column_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ USING expression ]
--ALTER [ COLUMN ] column_name SET DEFAULT expression
--ALTER [ COLUMN ] column_name DROP DEFAULT
--ALTER [ COLUMN ] column_name { SET | DROP } NOT NULL
--ALTER [ COLUMN ] column_name DROP EXPRESSION
--ALTER [ COLUMN ] column_name ADD GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY [ ( sequence_options ) ]
--ALTER [ COLUMN ] column_name { SET GENERATED { ALWAYS | BY DEFAULT } | SET sequence_option | RESTART [ [ WITH ] restart ] } [...]
--ALTER [ COLUMN ] column_name DROP IDENTITY [ IF EXISTS ]
--ALTER [ COLUMN ] column_name SET STATISTICS integer
--ALTER [ COLUMN ] column_name SET ( attribute_option = value [, ... ] )
--ALTER [ COLUMN ] column_name RESET ( attribute_option [, ... ] )
--ALTER [ COLUMN ] column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--ADD table_constraint [ NOT VALID ]
--ADD CONSTRAINT constraint_name { UNIQUE | PRIMARY KEY } USING INDEX index_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--ALTER CONSTRAINT constraint_name [ DEFERRABLE | NOT DEFERRABLE ] [ INITIALLY DEFERRED | INITIALLY IMMEDIATE ]
--VALIDATE CONSTRAINT constraint_name
--DROP CONSTRAINT [ IF EXISTS ]  constraint_name [ RESTRICT | CASCADE ]
--DISABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE REPLICA TRIGGER trigger_name
--ENABLE ALWAYS TRIGGER trigger_name
--DISABLE RULE rewrite_rule_name
--ENABLE RULE rewrite_rule_name
--ENABLE REPLICA RULE rewrite_rule_name
--ENABLE ALWAYS RULE rewrite_rule_name
--DISABLE ROW LEVEL SECURITY
--ENABLE ROW LEVEL SECURITY
--FORCE ROW LEVEL SECURITY
--NO FORCE ROW LEVEL SECURITY
--CLUSTER ON index_name
--SET WITHOUT CLUSTER
--SET WITHOUT OIDS
--SET TABLESPACE new_tablespace
--SET { LOGGED | UNLOGGED }
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
--INHERIT parent_table
--NO INHERIT parent_table
--OF type_name
--NOT OF
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--REPLICA IDENTITY { DEFAULT | USING INDEX index_name | FULL | NOTHING }
--RENAME [ COLUMN ] column_name TO new_column_name
--RENAME CONSTRAINT constraint_name TO new_constraint_name
--RENAME TO new_name
--SET SCHEMA new_schema
--ALL IN TABLESPACE name [ OWNED BY role_name [, ... ] ] SET TABLESPACE new_tablespace [ NOWAIT ]
--ATTACH PARTITION partition_name FOR VALUES partition_bound_spec
--DETACH PARTITION partition_name
`
}

const pgTplDropTable = `DROP TABLE #table_name#
--CASCADE
`

const pgTplCreateColumn = `ALTER TABLE #table_name#
ADD COLUMN name data_type
--COLLATE collation
--column_constraint [ ... ] ]
`

const pgTplAlterColumn = `ALTER TABLE #table_name#
--ALTER COLUMN #column_name#
--RENAME COLUMN #column_name# TO new_column
--TYPE data_type [ COLLATE collation ] [ USING expression ]
--SET DEFAULT expression
--DROP DEFAULT
--SET NOT NULL
--DROP NOT NULL
--SET STATISTICS integer
--SET ( attribute_option = value [, ... ] )
--RESET ( attribute_option [, ... ] )
--SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
`

const pgTplDropColumn = `ALTER TABLE #table_name#
DROP COLUMN #column_name#
--CASCADE
`

const pgTplCreatePrimaryKey = `ALTER TABLE #table_name#
ADD CONSTRAINT name
PRIMARY KEY ( column_name [, ... ] )
--WITH ( storage_parameter [= value] [, ... ] )
--WITH OIDS
--WITHOUT OIDS
--USING INDEX TABLESPACE tablespace_name
`

const pgTplDropPrimaryKey = `ALTER TABLE #table_name#
DROP CONSTRAINT #constraint_name#
--CASCADE
`

const pgTplCreateUnique = `ALTER TABLE #table_name#
ADD CONSTRAINT name
UNIQUE ( column_name [, ... ] )
--WITH ( storage_parameter [= value] [, ... ] )
--WITH OIDS
--WITHOUT OIDS
--USING INDEX TABLESPACE tablespace_name
`

const pgTplDropUnique = `ALTER TABLE #table_name#
DROP CONSTRAINT #constraint_name#
--CASCADE
`

const pgTplCreateForeignKey = `ALTER TABLE #table_name#
ADD CONSTRAINT name
FOREIGN KEY ( column_name [, ... ] )
REFERENCES reftable [ ( refcolumn [, ... ] ) ]
--MATCH { FULL | PARTIAL | SIMPLE }
--ON DELETE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT }
--ON UPDATE { NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT }
--NOT VALID
`

const pgTplDropForeignKey = `ALTER TABLE #table_name#
DROP CONSTRAINT #constraint_name#
--CASCADE
`

func pgTplCreateIndex(verNum int) string {
	if verNum < 110000 {
		return `CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] name
ON #table_name#
--USING method
( { column_name | ( expression ) } [ COLLATE collation ] [ opclass ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
--WITH ( storage_parameter = value [, ... ] )
--WHERE predicate
`
	}
	if verNum < 130000 {
		return `CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] name
ON [ ONLY ] #table_name#
--USING method
( { column_name | ( expression ) } [ COLLATE collation ] [ opclass ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
--INCLUDE ( column_name [, ...] )
--WITH ( storage_parameter = value [, ... ] )
--WHERE predicate
`
	}
	return `CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] name
ON [ ONLY ] #table_name#
--USING method
( { column_name | ( expression ) } [ COLLATE collation ] [ opclass [ ( opclass_parameter = value [, ... ] ) ] ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
--INCLUDE ( column_name [, ...] )
--WITH ( storage_parameter = value [, ... ] )
--WHERE predicate
`
}

func pgTplAlterIndex(verNum int) string {
	if verNum < 90600 {
		return `ALTER INDEX #index_name#
--RENAME to new_name
--SET TABLESPACE tablespace_name
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
`
	}
	if verNum < 110000 {
		return `ALTER INDEX #index_name#
--RENAME to new_name
--SET TABLESPACE tablespace_name
--DEPENDS ON EXTENSION extension_name
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
`
	}
	if verNum < 130000 {
		return `ALTER INDEX #index_name#
--RENAME to new_name
--SET TABLESPACE tablespace_name
--ATTACH PARTITION index_name
--DEPENDS ON EXTENSION extension_name
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
`
	}
	return `ALTER INDEX #index_name#
--RENAME to new_name
--SET TABLESPACE tablespace_name
--ATTACH PARTITION index_name
--DEPENDS ON EXTENSION extension_name
--NO DEPENDS ON EXTENSION extension_name
--SET ( storage_parameter = value [, ... ] )
--RESET ( storage_parameter [, ... ] )
`
}

const pgTplClusterIndex = `CLUSTER
--VERBOSE
#table_name#
USING #index_name#
`

func pgTplReindex(verNum int) string {
	if verNum < 90500 {
		return `REINDEX INDEX #index_name#`
	}
	if verNum < 120000 {
		return `REINDEX
--( VERBOSE )
INDEX #index_name#
`
	}
	return `REINDEX
--( VERBOSE )
INDEX
--CONCURRENTLY
#index_name#
`
}

const pgTplDropIndex = `DROP INDEX [ CONCURRENTLY ] #index_name#
--CASCADE
`

const pgTplCreateCheck = `ALTER TABLE #table_name#
ADD CONSTRAINT name
CHECK ( expression )
`

const pgTplDropCheck = `ALTER TABLE #table_name#
DROP CONSTRAINT #constraint_name#
--CASCADE
`

const pgTplCreateExclude = `ALTER TABLE #table_name#
ADD CONSTRAINT name
--USING index_method
EXCLUDE ( exclude_element WITH operator [, ... ] )
--index_parameters
--WHERE ( predicate )
`

const pgTplDropExclude = `ALTER TABLE #table_name#
DROP CONSTRAINT #constraint_name#
--CASCADE
`

const pgTplCreateRule = `CREATE RULE name
AS ON { SELECT | INSERT | UPDATE | DELETE }
TO #table_name#
--WHERE condition
--DO ALSO { NOTHING | command | ( command ; command ... ) }
--DO INSTEAD { NOTHING | command | ( command ; command ... ) }
`

const pgTplAlterRule = `ALTER RULE #rule_name# ON #table_name# RENAME TO new_name`

const pgTplDropRule = `DROP RULE #rule_name# ON #table_name#
--CASCADE
`

const pgTplCreateTrigger = `CREATE TRIGGER name
--BEFORE { INSERT [ OR ] | UPDATE [ OF column_name [, ... ] ] [ OR ] | DELETE [ OR ] | TRUNCATE }
--AFTER { INSERT [ OR ] | UPDATE [ OF column_name [, ... ] ] [ OR ] | DELETE [ OR ] | TRUNCATE }
ON #table_name#
--FROM referenced_table_name
--NOT DEFERRABLE | [ DEFERRABLE ] { INITIALLY IMMEDIATE | INITIALLY DEFERRED }
--FOR EACH ROW
--FOR EACH STATEMENT
--WHEN ( condition )
--EXECUTE PROCEDURE function_name ( arguments )
`

const pgTplCreateViewTrigger = `CREATE TRIGGER name
--BEFORE { INSERT [ OR ] | UPDATE [ OF column_name [, ... ] ] [ OR ] | DELETE }
--AFTER { INSERT [ OR ] | UPDATE [ OF column_name [, ... ] ] [ OR ] | DELETE }
--INSTEAD OF { INSERT [ OR ] | UPDATE [ OF column_name [, ... ] ] [ OR ] | DELETE }
ON #table_name#
--FROM referenced_table_name
--NOT DEFERRABLE | [ DEFERRABLE ] { INITIALLY IMMEDIATE | INITIALLY DEFERRED }
--FOR EACH ROW
--FOR EACH STATEMENT
--WHEN ( condition )
--EXECUTE PROCEDURE function_name ( arguments )
`

func pgTplAlterTrigger(verNum int) string {
	if verNum < 90600 {
		return `ALTER TRIGGER #trigger_name# ON #table_name#
--RENAME TO new_name
`
	}
	if verNum < 130000 {
		return `ALTER TRIGGER #trigger_name# ON #table_name#
--RENAME TO new_name
--DEPENDS ON EXTENSION extension_name
`
	}
	return `ALTER TRIGGER #trigger_name# ON #table_name#
--RENAME TO new_name
--DEPENDS ON EXTENSION extension_name
--NO DEPENDS ON EXTENSION extension_name
`
}

const pgTplEnableTrigger = `ALTER TABLE #table_name# ENABLE
--REPLICA
--ALWAYS
TRIGGER #trigger_name#
`

const pgTplDisableTrigger = `ALTER TABLE #table_name# DISABLE TRIGGER #trigger_name#`

const pgTplDropTrigger = `DROP TRIGGER #trigger_name# ON #table_name#
--CASCADE
`

const pgTplCreateEventTrigger = `CREATE EVENT TRIGGER name
--ON ddl_command_start
--ON ddl_command_end
--ON table_rewrite
--ON sql_drop
--WHEN TAG IN ( filter_value [, ...] )
EXECUTE PROCEDURE function_name()
`

const pgTplAlterEventTrigger = `ALTER EVENT TRIGGER #trigger_name#
--OWNER TO new_owner
--OWNER TO CURRENT_USER
--OWNER TO SESSION_USER
--RENAME TO new_name
`

const pgTplEnableEventTrigger = `ALTER EVENT TRIGGER #trigger_name# ENABLE
--REPLICA
--ALWAYS
`

const pgTplDisableEventTrigger = `ALTER EVENT TRIGGER #trigger_name# DISABLE`

const pgTplDropEventTrigger = `DROP EVENT TRIGGER #trigger_name#
--CASCADE
`

const pgTplCreateInherited = `CREATE TABLE name (
	CHECK ( condition )
) INHERITS (#table_name#)
`

const pgTplNoInheritPartition = `ALTER TABLE #partition_name# NO INHERIT #table_name#`

const pgTplCreatePartition = `CREATE TABLE name PARTITION OF #table_name#
--FOR VALUES
--IN ( { numeric_literal | string_literal | NULL } [, ...] )
--FROM ( { numeric_literal | string_literal | MINVALUE | MAXVALUE } [, ...] ) TO ( { numeric_literal | string_literal | MINVALUE | MAXVALUE } [, ...] )
--WITH ( MODULUS numeric_literal, REMAINDER numeric_literal )
--DEFAULT
--PARTITION BY { RANGE | LIST | HASH } ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass ] [, ... ] ) ]
`

const pgTplDetachPartition = `ALTER TABLE #table_name# DETACH PARTITION #partition_name#`

const pgTplDropPartition = `DROP TABLE #partition_name#`

const pgTplCreateType = `CREATE TYPE #schema_name#.name

-- AS (
--    attribute_name data_type [ COLLATE collation ] [, ... ]

-- AS ENUM (
--    'label' [, ... ]

-- AS RANGE (
--    SUBTYPE = subtype
--    , SUBTYPE_OPCLASS = subtype_operator_class
--    , COLLATION = collation
--    , CANONICAL = canonical_function
--    , SUBTYPE_DIFF = subtype_diff_function

-- (
--    INPUT = input_function,
--    OUTPUT = output_function
--    , RECEIVE = receive_function
--    , SEND = send_function
--    , TYPMOD_IN = type_modifier_input_function
--    , TYPMOD_OUT = type_modifier_output_function
--    , ANALYZE = analyze_function
--    , INTERNALLENGTH = { internallength | VARIABLE }
--    , PASSEDBYVALUE
--    , ALIGNMENT = alignment
--    , STORAGE = storage
--    , LIKE = like_type
--    , CATEGORY = category
--    , PREFERRED = preferred
--    , DEFAULT = default
--    , ELEMENT = element
--    , DELIMITER = delimiter
--    , COLLATABLE = collatable

-- )
`

func pgTplAlterType(verNum int) string {
	if verNum < 100000 {
		return `ALTER TYPE #type_name#
--ADD ATTRIBUTE attribute_name data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--DROP ATTRIBUTE [ IF EXISTS ] attribute_name [ CASCADE | RESTRICT ]
--ALTER ATTRIBUTE attribute_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--RENAME ATTRIBUTE attribute_name TO new_attribute_name [ CASCADE | RESTRICT ]
--OWNER TO new_owner
--RENAME TO new_name
--SET SCHEMA new_schema
--ADD VALUE [ IF NOT EXISTS ] new_enum_value [ { BEFORE | AFTER } existing_enum_value ]
`
	}
	if verNum < 130000 {
		return `ALTER TYPE #type_name#
--ADD ATTRIBUTE attribute_name data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--DROP ATTRIBUTE [ IF EXISTS ] attribute_name [ CASCADE | RESTRICT ]
--ALTER ATTRIBUTE attribute_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--RENAME ATTRIBUTE attribute_name TO new_attribute_name [ CASCADE | RESTRICT ]
--OWNER TO new_owner
--RENAME TO new_name
--SET SCHEMA new_schema
--ADD VALUE [ IF NOT EXISTS ] new_enum_value [ { BEFORE | AFTER } existing_enum_value ]
--RENAME VALUE existing_enum_value TO new_enum_value
`
	}
	return `ALTER TYPE #type_name#
--ADD ATTRIBUTE attribute_name data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--DROP ATTRIBUTE [ IF EXISTS ] attribute_name [ CASCADE | RESTRICT ]
--ALTER ATTRIBUTE attribute_name [ SET DATA ] TYPE data_type [ COLLATE collation ] [ CASCADE | RESTRICT ]
--RENAME ATTRIBUTE attribute_name TO new_attribute_name [ CASCADE | RESTRICT ]
--OWNER TO new_owner
--RENAME TO new_name
--SET SCHEMA new_schema
--ADD VALUE [ IF NOT EXISTS ] new_enum_value [ { BEFORE | AFTER } existing_enum_value ]
--RENAME VALUE existing_enum_value TO new_enum_value
--SET ( RECEIVE = value )
--SET ( SEND = value )
--SET ( TYPMOD_IN = value )
--SET ( TYPMOD_OUT = value )
--SET ( ANALYZE = value )
--SET ( STORAGE = plain | extended | external | main )
`
}

const pgTplDropType = `DROP TYPE #type_name#
--CASCADE
`

const pgTplCreateDomain = `CREATE DOMAIN #schema_name#.name AS data_type
--COLLATE collation
--DEFAULT expression
-- [ CONSTRAINT constraint_name ] NOT NULL
-- [ CONSTRAINT constraint_name ] NULL
-- [ CONSTRAINT constraint_name ] CHECK (expression)
`

const pgTplAlterDomain = `ALTER DOMAIN #domain_name#
--SET DEFAULT expression
--DROP DEFAULT
--SET NOT NULL
--DROP NOT NULL
--ADD domain_constraint [ NOT VALID ]
--DROP CONSTRAINT constraint_name [ CASCADE ]
--RENAME CONSTRAINT constraint_name TO new_constraint_name
--VALIDATE CONSTRAINT constraint_name
--OWNER TO new_owner
--RENAME TO new_name
--SET SCHEMA new_schema
`

const pgTplDropDomain = `DROP DOMAIN #domain_name#
--CASCADE
`

func pgTplVacuum(verNum int) string {
	if verNum < 90600 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
`
	}
	if verNum < 120000 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
`
	}
	if verNum < 130000 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
--SKIP_LOCKED
--INDEX_CLEANUP
--TRUNCATE
`
	}
	return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
--SKIP_LOCKED
--INDEX_CLEANUP
--TRUNCATE
--PARALLEL number_of_parallel_workers
`
}

func pgTplVacuumTable(verNum int) string {
	if verNum < 90600 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
#table_name#
--(column_name, [, ...])
`
	}
	if verNum < 120000 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
#table_name#
--(column_name, [, ...])
`
	}
	if verNum < 130000 {
		return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
--SKIP_LOCKED
--INDEX_CLEANUP
--TRUNCATE
#table_name#
--(column_name, [, ...])
`
	}
	return `VACUUM
--FULL
--FREEZE
--ANALYZE
--DISABLE_PAGE_SKIPPING
--SKIP_LOCKED
--INDEX_CLEANUP
--TRUNCATE
--PARALLEL number_of_parallel_workers
#table_name#
--(column_name, [, ...])
`
}

const pgTplAnalyze = `ANALYZE`

const pgTplAnalyzeTable = `ANALYZE #table_name#
--(column_name, [, ...])
`

const pgTplDelete = `DELETE FROM
--ONLY
#table_name#
WHERE condition
--WHERE CURRENT OF cursor_name
--RETURNING *
`

const pgTplTruncate = `TRUNCATE
--ONLY
#table_name#
--RESTART IDENTITY
--CASCADE
`

const pgTplCreatePhysicalReplicationSlot = `SELECT * FROM pg_create_physical_replication_slot('slot_name')`

const pgTplDropPhysicalReplicationSlot = `SELECT pg_drop_replication_slot('#slot_name#')`

func pgTplCreateLogicalReplicationSlot(verNum int) string {
	if verNum >= 100000 {
		return `SELECT * FROM pg_create_logical_replication_slot('slot_name', 'pgoutput')`
	}
	return `SELECT * FROM pg_create_logical_replication_slot('slot_name', 'test_decoding')`
}

const pgTplDropLogicalReplicationSlot = `SELECT pg_drop_replication_slot('#slot_name#')`

func pgTplCreatePublication(verNum int) string {
	if verNum < 130000 {
		return `CREATE PUBLICATION name
--FOR TABLE [ ONLY ] table_name [ * ] [, ...]
--FOR ALL TABLES
--WITH ( publish = 'insert, update, delete, truncate' )
`
	}
	return `CREATE PUBLICATION name
--FOR TABLE [ ONLY ] table_name [ * ] [, ...]
--FOR ALL TABLES
--WITH ( publish = 'insert, update, delete, truncate' )
--WITH ( publish_via_partition_root = true | false )
`
}

func pgTplAlterPublication(verNum int) string {
	if verNum < 130000 {
		return `ALTER PUBLICATION #pub_name#
--ADD TABLE [ ONLY ] table_name [ * ] [, ...]
--SET TABLE [ ONLY ] table_name [ * ] [, ...]
--DROP TABLE [ ONLY ] table_name [ * ] [, ...]
--SET ( publish = 'insert, update, delete, truncate' )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
`
	}
	return `ALTER PUBLICATION #pub_name#
--ADD TABLE [ ONLY ] table_name [ * ] [, ...]
--SET TABLE [ ONLY ] table_name [ * ] [, ...]
--DROP TABLE [ ONLY ] table_name [ * ] [, ...]
--SET ( publish = 'insert, update, delete, truncate' )
--SET ( publish_via_partition_root = true | false )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
`
}

const pgTplDropPublication = `DROP PUBLICATION #pub_name#
--CASCADE
`

const pgTplAddPublicationTable = `ALTER PUBLICATION #pub_name# ADD TABLE table_name`

const pgTplDropPublicationTable = `ALTER PUBLICATION #pub_name# DROP TABLE #table_name#`

const pgTplCreateSubscription = `CREATE SUBSCRIPTION name
CONNECTION 'conninfo'
PUBLICATION pub_name [, ...]
--WITH (
--copy_data = { true | false }
--, create_slot = { true | false }
--, enabled = { true | false }
--, slot_name = 'name'
--, synchronous_commit = { on | remote_apply | remote_write | local | off }
--, connect = { true | false }
--)
`

const pgTplAlterSubscription = `ALTER SUBSCRIPTION #sub_name#
--CONNECTION 'conninfo'
--SET PUBLICATION pub_name [, ...] [ WITH ( refresh = { true | false } ) ]
--REFRESH PUBLICATION [ WITH ( copy_data = { true | false } ) ]
--ENABLE
--DISABLE
--SET (
--slot_name = 'name'
--, synchronous_commit = { on | remote_apply | remote_write | local | off }
--)
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
`

const pgTplDropSubscription = `DROP SUBSCRIPTION #sub_name#
--CASCADE
`

const pgTplCreateForeignDataWrapper = `CREATE FOREIGN DATA WRAPPER name
--HANDLER handler_function
--NO HANDLER
--VALIDATOR validator_function
--NO VALIDATOR
--OPTIONS ( option 'value' [, ... ] )
`

const pgTplAlterForeignDataWrapper = `ALTER FOREIGN DATA WRAPPER #fdwname#
--HANDLER handler_function
--NO HANDLER
--VALIDATOR validator_function
--NO VALIDATOR
--OPTIONS ( [ ADD ] option ['value'] [, ... ] )
--OPTIONS ( SET option ['value'] )
--OPTIONS ( DROP option )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
`

const pgTplDropForeignDataWrapper = `DROP FOREIGN DATA WRAPPER #fdwname#
--CASCADE
`

const pgTplCreateForeignServer = `CREATE SERVER server_name
--TYPE 'server_type'
--VERSION 'server_version'
FOREIGN DATA WRAPPER #fdwname#
--OPTIONS ( option 'value' [, ... ] )
`

const pgTplAlterForeignServer = `ALTER SERVER #srvname#
--VERSION 'new_version'
--OPTIONS ( [ ADD ] option ['value'] [, ... ] )
--OPTIONS ( SET option ['value'] )
--OPTIONS ( DROP option )
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
`

const pgTplDropForeignServer = `DROP SERVER #srvname#
--CASCADE
`

const pgTplCreateUserMapping = `CREATE USER MAPPING
--FOR user_name
--FOR CURRENT_USER
--FOR PUBLIC
SERVER #srvname#
--OPTIONS ( option 'value' [ , ... ] )
`

const pgTplAlterUserMapping = `ALTER USER MAPPING FOR #user_name#
SERVER #srvname#
--OPTIONS ( [ ADD ] option ['value'] [, ... ] )
--OPTIONS ( SET option ['value'] )
--OPTIONS ( DROP option )
`

const pgTplImportForeignSchema = `IMPORT FOREIGN SCHEMA remote_schema
--LIMIT TO ( table_name [, ...] )
--EXCEPT ( table_name [, ...] )
FROM SERVER #srvname#
INTO local_schema
--OPTIONS ( option 'value' [, ... ] )
`

const pgTplDropUserMapping = `DROP USER MAPPING FOR #user_name# SERVER #srvname#`

const pgTplCreateForeignTable = `CREATE FOREIGN TABLE #schema_name#.table_name
--PARTITION OF parent_table
(
	column_name data_type
	--OPTIONS ( option 'value' [, ... ] )
	--COLLATE collation
	--CONSTRAINT constraint_name
	--NOT NULL
	--CHECK ( expression )
	--NO INHERIT
	--DEFAULT default_expr
	--GENERATED ALWAYS AS ( generation_expr ) STORED
)
--INHERITS ( parent_table [, ... ] )
SERVER server_name
--partition_bound_spec
--OPTIONS ( option 'value' [, ... ] )
`

const pgTplAlterForeignTable = `ALTER FOREIGN TABLE #table_name#
--ADD COLUMN column_name data_type [ COLLATE collation ] [ column_constraint [ ... ] ]
--DROP COLUMN column_name [ CASCADE ]
--ALTER [ COLUMN column_name [ SET DATA ] TYPE data_type [ COLLATE collation ]
--ALTER COLUMN column_name SET DEFAULT expression
--ALTER COLUMN column_name DROP DEFAULT
--ALTER COLUMN column_name { SET | DROP } NOT NULL
--ALTER COLUMN column_name SET STATISTICS integer
--ALTER COLUMN column_name SET ( attribute_option = value [, ... ] )
--ALTER COLUMN column_name RESET ( attribute_option [, ... ] )
--ALTER COLUMN column_name SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--ALTER COLUMN column_name OPTIONS ( [ ADD | SET | DROP ] option ['value'] [, ... ] )
--ADD table_constraint [ NOT VALID ]
--VALIDATE CONSTRAINT constraint_name
--DROP CONSTRAINT constraint_name [ CASCADE ]
--DISABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE TRIGGER [ trigger_name | ALL | USER ]
--ENABLE REPLICA TRIGGER trigger_name
--ENABLE ALWAYS TRIGGER trigger_name
--SET WITH OIDS
--SET WITHOUT OIDS
--INHERIT parent_table
--NO INHERIT parent_table
--OWNER TO { new_owner | CURRENT_USER | SESSION_USER }
--OPTIONS ( [ ADD | SET | DROP ] option ['value'] [, ... ] )
--RENAME COLUMN column_name TO new_column_name
--RENAME TO new_name
--SET SCHEMA new_schema
`

const pgTplDropForeignTable = `DROP FOREIGN TABLE #table_name#
--CASCADE
`

const pgTplCreateForeignColumn = `ALTER FOREIGN TABLE #table_name#
ADD COLUMN name data_type
--COLLATE collation
--column_constraint [ ... ] ]
`

const pgTplAlterForeignColumn = `ALTER FOREIGN TABLE #table_name#
--ALTER COLUMN #column_name#
--RENAME COLUMN #column_name# TO new_column
--TYPE data_type [ COLLATE collation ] [ USING expression ]
--SET DEFAULT expression
--DROP DEFAULT
--SET NOT NULL
--DROP NOT NULL
--SET STATISTICS integer
--SET ( attribute_option = value [, ... ] )
--RESET ( attribute_option [, ... ] )
--SET STORAGE { PLAIN | EXTERNAL | EXTENDED | MAIN }
--OPTIONS ( [ ADD | SET | DROP ] option ['value'] [, ... ] )
`

const pgTplDropForeignColumn = `ALTER FOREIGN TABLE #table_name#
DROP COLUMN #column_name#
--CASCADE
`

const pgTplCreateStatistics = `CREATE STATISTICS #schema_name#.statistics_name
--( ndistinct )
--( dependencies )
--( mcv )
ON column_name, column_name [, ...]
FROM #table_name#
`

func pgTplAlterStatistics(verNum int) string {
	if verNum < 130000 {
		return `ALTER STATISTICS #statistics_name#
--OWNER to { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
--SET SCHEMA new_schema
`
	}
	return `ALTER STATISTICS #statistics_name#
--OWNER to { new_owner | CURRENT_USER | SESSION_USER }
--RENAME TO new_name
--SET SCHEMA new_schema
--SET STATISTICS new_target
`
}

const pgTplDropStatistics = `DROP STATISTICS #statistics_name#`

// postgresqlTreeInfoTemplates returns the same {action}_{objecttype} -> DDL
// template string map get_tree_info's v_database_return builds, keyed
// identically (create_role, alter_role, drop_role, ...).
func postgresqlTreeInfoTemplates(verNum int) map[string]string {
	return map[string]string{
		"create_role":                    pgTplCreateRole,
		"alter_role":                     pgTplAlterRole,
		"drop_role":                      pgTplDropRole,
		"create_tablespace":              pgTplCreateTablespace,
		"alter_tablespace":               pgTplAlterTablespace,
		"drop_tablespace":                pgTplDropTablespace,
		"create_database":                pgTplCreateDatabase(verNum),
		"alter_database":                 pgTplAlterDatabase,
		"drop_database":                  pgTplDropDatabase(verNum),
		"create_extension":               pgTplCreateExtension(verNum),
		"alter_extension":                pgTplAlterExtension,
		"drop_extension":                 pgTplDropExtension,
		"create_schema":                  pgTplCreateSchema,
		"alter_schema":                   pgTplAlterSchema,
		"drop_schema":                    pgTplDropSchema,
		"create_sequence":                pgTplCreateSequence,
		"alter_sequence":                 pgTplAlterSequence,
		"drop_sequence":                  pgTplDropSequence,
		"create_function":                pgTplCreateFunction,
		"alter_function":                 pgTplAlterFunction(verNum),
		"drop_function":                  pgTplDropFunction,
		"create_procedure":               pgTplCreateProcedure,
		"alter_procedure":                pgTplAlterProcedure,
		"drop_procedure":                 pgTplDropProcedure,
		"create_triggerfunction":         pgTplCreateTriggerFunction,
		"alter_triggerfunction":          pgTplAlterTriggerFunction(verNum),
		"drop_triggerfunction":           pgTplDropTriggerFunction,
		"create_eventtriggerfunction":    pgTplCreateEventTriggerFunction,
		"alter_eventtriggerfunction":     pgTplAlterEventTriggerFunction(verNum),
		"drop_eventtriggerfunction":      pgTplDropEventTriggerFunction,
		"create_aggregate":               pgTplCreateAggregate(verNum),
		"alter_aggregate":                pgTplAlterAggregate,
		"drop_aggregate":                 pgTplDropAggregate,
		"create_view":                    pgTplCreateView,
		"alter_view":                     pgTplAlterView(verNum),
		"drop_view":                      pgTplDropView,
		"create_mview":                   pgTplCreateMaterializedView,
		"refresh_mview":                  pgTplRefreshMaterializedView,
		"alter_mview":                    pgTplAlterMaterializedView(verNum),
		"drop_mview":                     pgTplDropMaterializedView,
		"create_table":                   pgTplCreateTable(verNum),
		"alter_table":                    pgTplAlterTable(verNum),
		"drop_table":                     pgTplDropTable,
		"create_column":                  pgTplCreateColumn,
		"alter_column":                   pgTplAlterColumn,
		"drop_column":                    pgTplDropColumn,
		"create_primarykey":              pgTplCreatePrimaryKey,
		"drop_primarykey":                pgTplDropPrimaryKey,
		"create_unique":                  pgTplCreateUnique,
		"drop_unique":                    pgTplDropUnique,
		"create_foreignkey":              pgTplCreateForeignKey,
		"drop_foreignkey":                pgTplDropForeignKey,
		"create_index":                   pgTplCreateIndex(verNum),
		"alter_index":                    pgTplAlterIndex(verNum),
		"cluster_index":                  pgTplClusterIndex,
		"reindex":                        pgTplReindex(verNum),
		"drop_index":                     pgTplDropIndex,
		"create_check":                   pgTplCreateCheck,
		"drop_check":                     pgTplDropCheck,
		"create_exclude":                 pgTplCreateExclude,
		"drop_exclude":                   pgTplDropExclude,
		"create_rule":                    pgTplCreateRule,
		"alter_rule":                     pgTplAlterRule,
		"drop_rule":                      pgTplDropRule,
		"create_trigger":                 pgTplCreateTrigger,
		"create_view_trigger":            pgTplCreateViewTrigger,
		"alter_trigger":                  pgTplAlterTrigger(verNum),
		"enable_trigger":                 pgTplEnableTrigger,
		"disable_trigger":                pgTplDisableTrigger,
		"drop_trigger":                   pgTplDropTrigger,
		"create_eventtrigger":            pgTplCreateEventTrigger,
		"alter_eventtrigger":             pgTplAlterEventTrigger,
		"enable_eventtrigger":            pgTplEnableEventTrigger,
		"disable_eventtrigger":           pgTplDisableEventTrigger,
		"drop_eventtrigger":              pgTplDropEventTrigger,
		"create_inherited":               pgTplCreateInherited,
		"noinherit_partition":            pgTplNoInheritPartition,
		"create_partition":               pgTplCreatePartition,
		"detach_partition":               pgTplDetachPartition,
		"drop_partition":                 pgTplDropPartition,
		"vacuum":                         pgTplVacuum(verNum),
		"vacuum_table":                   pgTplVacuumTable(verNum),
		"analyze":                        pgTplAnalyze,
		"analyze_table":                  pgTplAnalyzeTable,
		"delete":                         pgTplDelete,
		"truncate":                       pgTplTruncate,
		"create_physicalreplicationslot": pgTplCreatePhysicalReplicationSlot,
		"drop_physicalreplicationslot":   pgTplDropPhysicalReplicationSlot,
		"create_logicalreplicationslot":  pgTplCreateLogicalReplicationSlot(verNum),
		"drop_logicalreplicationslot":    pgTplDropLogicalReplicationSlot,
		"create_publication":             pgTplCreatePublication(verNum),
		"alter_publication":              pgTplAlterPublication(verNum),
		"drop_publication":               pgTplDropPublication,
		"add_pubtable":                   pgTplAddPublicationTable,
		"drop_pubtable":                  pgTplDropPublicationTable,
		"create_subscription":            pgTplCreateSubscription,
		"alter_subscription":             pgTplAlterSubscription,
		"drop_subscription":              pgTplDropSubscription,
		"create_fdw":                     pgTplCreateForeignDataWrapper,
		"alter_fdw":                      pgTplAlterForeignDataWrapper,
		"drop_fdw":                       pgTplDropForeignDataWrapper,
		"create_foreign_server":          pgTplCreateForeignServer,
		"alter_foreign_server":           pgTplAlterForeignServer,
		"import_foreign_schema":          pgTplImportForeignSchema,
		"drop_foreign_server":            pgTplDropForeignServer,
		"create_foreign_table":           pgTplCreateForeignTable,
		"alter_foreign_table":            pgTplAlterForeignTable,
		"drop_foreign_table":             pgTplDropForeignTable,
		"create_foreign_column":          pgTplCreateForeignColumn,
		"alter_foreign_column":           pgTplAlterForeignColumn,
		"drop_foreign_column":            pgTplDropForeignColumn,
		"create_user_mapping":            pgTplCreateUserMapping,
		"alter_user_mapping":             pgTplAlterUserMapping,
		"drop_user_mapping":              pgTplDropUserMapping,
		"create_type":                    pgTplCreateType,
		"alter_type":                     pgTplAlterType(verNum),
		"drop_type":                      pgTplDropType,
		"create_domain":                  pgTplCreateDomain,
		"alter_domain":                   pgTplAlterDomain,
		"drop_domain":                    pgTplDropDomain,
		"create_statistics":              pgTplCreateStatistics,
		"alter_statistics":               pgTplAlterStatistics(verNum),
		"drop_statistics":                pgTplDropStatistics,
	}
}
