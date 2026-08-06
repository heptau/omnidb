package main

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// This file implements the psql-style catalog-browsing backslash commands
// consoleHelpTable's doc comment used to say were "deliberately deferred" —
// \dt, \d/\d+, \du, \l, \df — across all 4 supported engines. Each maps to
// whatever that engine's actual catalog calls the same concept (Postgres has
// real schemas/roles/databases; MySQL/MariaDB's "database" doubles as its
// schema; Oracle's "user" doubles as its schema, and it has no separate
// multi-database concept; SQLite has none of schemas/roles/databases at
// all) — where an engine genuinely has nothing to show, the command returns
// a plain explanatory line instead of either a fake result or a raw SQL
// error, the same honesty policy as everywhere else in this port.
//
// Deliberately NOT implemented here: \h (per-SQL-command syntax help) —
// unlike the others, that's not a catalog query but a large static text
// blob (psql embeds Postgres's own sql_help.h at compile time), a separate
// and more mechanical chunk of work left for later.

// consoleRelationArgPattern matches a bare identifier or a
// schema-qualified/database-qualified one (one dot) — deliberately strict
// (no quoting, no wildcards) since it's spliced directly into SQL text
// rather than bound as a placeholder (driver placeholder syntax differs
// across all 4 engines here: $1 / ? / :1 / ?, not worth threading through
// for an internal, already-validated identifier).
var consoleRelationArgPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$`)

// consoleArg returns the text after a backslash command's first word,
// trimmed — e.g. "\d public.customers" -> "public.customers".
func consoleArg(stmt string) string {
	trimmed := strings.TrimSpace(stmt)
	fields := strings.Fields(trimmed)
	if len(fields) < 2 {
		return ""
	}
	return strings.TrimSpace(trimmed[len(fields[0]):])
}

// consoleQueryRows runs a read-only catalog query on the session's own
// connection (so it sees whatever database/schema/user context that
// connection is already in — e.g. MySQL's USE, a search_path change) and
// returns it in the same cols/rows-of-strings shape consolePretty wants.
func (s *consoleSession) consoleQueryRows(ctx context.Context, sqlText string, args ...any) (cols []string, rows [][]string, err error) {
	r, err := s.conn.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, nil, err
	}
	defer r.Close()

	cols, err = r.Columns()
	if err != nil {
		return nil, nil, err
	}
	for r.Next() {
		row, err := scanRowConsole(r, len(cols))
		if err != nil {
			return nil, nil, err
		}
		rows = append(rows, row)
	}
	return cols, rows, r.Err()
}

// consoleMetaTables implements \dt — list tables in the connection's
// current schema/database.
func (s *consoleSession) consoleMetaTables(ctx context.Context) (string, error) {
	var sqlText string
	switch s.technology {
	case "postgresql":
		sqlText = `select schemaname as "Schema", tablename as "Name", tableowner as "Owner" from pg_catalog.pg_tables where schemaname = current_schema() order by tablename`
	case "mysql", "mariadb":
		sqlText = `select table_name as ` + "`Name`" + ` from information_schema.tables where table_schema = database() and table_type = 'BASE TABLE' order by table_name`
	case "oracle":
		sqlText = `select table_name as "Name" from user_tables order by table_name`
	case "sqlite":
		sqlText = `select name as "Name" from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`
	default:
		return "", fmt.Errorf("\\dt is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "No tables found.", nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}

// consoleMetaRelations implements bare \d/\d+ — list tables, views,
// sequences (whichever of those concepts the engine has).
func (s *consoleSession) consoleMetaRelations(ctx context.Context) (string, error) {
	var sqlText string
	switch s.technology {
	case "postgresql":
		sqlText = `select n.nspname as "Schema", c.relname as "Name",
			case c.relkind
				when 'r' then 'table' when 'v' then 'view' when 'm' then 'materialized view'
				when 'S' then 'sequence' when 'f' then 'foreign table' else c.relkind::text
			end as "Type"
			from pg_catalog.pg_class c
			join pg_catalog.pg_namespace n on n.oid = c.relnamespace
			where n.nspname = current_schema() and c.relkind in ('r','v','m','S','f')
			order by c.relname`
	case "mysql", "mariadb":
		sqlText = `select table_name as ` + "`Name`" + `, table_type as ` + "`Type`" + ` from information_schema.tables where table_schema = database() order by table_name`
	case "oracle":
		sqlText = `select object_name as "Name", object_type as "Type" from user_objects where object_type in ('TABLE','VIEW','SEQUENCE','MATERIALIZED VIEW') order by object_name`
	case "sqlite":
		sqlText = `select name as "Name", type as "Type" from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name`
	default:
		return "", fmt.Errorf("\\d is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "No relations found.", nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}

// consoleMetaDescribe implements \d NAME/\d+ NAME — list a table or view's
// columns. Accepts an optional "schema."/"database." qualifier.
//
// schema/name are bound as query parameters rather than spliced into sqlText
// (even though consoleRelationArgPattern already restricts arg to bare
// identifier characters) — a static analyzer has no way to know that check
// closes off every metacharacter the sink could act on, and a real bound
// parameter removes the question entirely rather than resting on the regex.
func (s *consoleSession) consoleMetaDescribe(ctx context.Context, arg string) (string, error) {
	if !consoleRelationArgPattern.MatchString(arg) {
		return "", fmt.Errorf("invalid relation name %q", arg)
	}
	schema, name := "", arg
	if i := strings.IndexByte(arg, '.'); i >= 0 {
		schema, name = arg[:i], arg[i+1:]
	}
	var schemaArg any
	if schema != "" {
		schemaArg = schema
	}

	var sqlText string
	var args []any
	switch s.technology {
	case "postgresql":
		sqlText = `select column_name as "Column", data_type as "Type",
			is_nullable as "Nullable", column_default as "Default"
			from information_schema.columns
			where table_schema = coalesce($1, current_schema()) and table_name = $2
			order by ordinal_position`
		args = []any{schemaArg, name}
	case "mysql", "mariadb":
		sqlText = "select column_name as `Column`, column_type as `Type`, is_nullable as `Nullable`, column_default as `Default` " +
			"from information_schema.columns where table_schema = coalesce(?, database()) and table_name = ? order by ordinal_position"
		args = []any{schemaArg, name}
	case "oracle":
		sqlText = `select column_name as "Column", data_type as "Type", nullable as "Nullable", data_default as "Default"
			from user_tab_columns where table_name = upper(:1) order by column_id`
		args = []any{name}
	case "sqlite":
		sqlText = `select name as "Column", type as "Type", case "notnull" when 0 then 'YES' else 'NO' end as "Nullable", dflt_value as "Default" from pragma_table_info(?)`
		args = []any{name}
	default:
		return "", fmt.Errorf("\\d is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText, args...)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return fmt.Sprintf("Did not find any relation named %q.", arg), nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}

// consoleMetaRoles implements \du — list roles/users.
func (s *consoleSession) consoleMetaRoles(ctx context.Context) (string, error) {
	var sqlText string
	switch s.technology {
	case "postgresql":
		sqlText = `select rolname as "Role name", rolsuper as "Superuser", rolcreaterole as "Create role", rolcreatedb as "Create DB", rolcanlogin as "Can login" from pg_catalog.pg_roles order by rolname`
	case "mysql", "mariadb":
		sqlText = "select user as `User`, host as `Host` from mysql.user order by user"
	case "oracle":
		sqlText = `select username as "Username", account_status as "Status" from all_users order by username`
	case "sqlite":
		return "SQLite has no user/role concept — a connection is just a file on disk.", nil
	default:
		return "", fmt.Errorf("\\du is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "No roles found.", nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}

// consoleMetaDatabases implements \l — list databases.
func (s *consoleSession) consoleMetaDatabases(ctx context.Context) (string, error) {
	var sqlText string
	switch s.technology {
	case "postgresql":
		sqlText = `select datname as "Name", pg_catalog.pg_get_userbyid(datdba) as "Owner", pg_catalog.pg_encoding_to_char(encoding) as "Encoding" from pg_catalog.pg_database order by datname`
	case "mysql", "mariadb":
		sqlText = "select schema_name as `Database` from information_schema.schemata order by schema_name"
	case "oracle":
		return "Oracle has one database per instance; use \\d to list objects, or \\du to list schemas/users.", nil
	case "sqlite":
		return "SQLite connections are single-database — there's nothing else to list.", nil
	default:
		return "", fmt.Errorf("\\l is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "No databases found.", nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}

// consoleMetaFunctions implements \df — list functions/procedures.
func (s *consoleSession) consoleMetaFunctions(ctx context.Context) (string, error) {
	var sqlText string
	switch s.technology {
	case "postgresql":
		sqlText = `select n.nspname as "Schema", p.proname as "Name", pg_catalog.pg_get_function_result(p.oid) as "Result type"
			from pg_catalog.pg_proc p
			join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			where n.nspname = current_schema()
			order by p.proname`
	case "mysql", "mariadb":
		sqlText = "select routine_name as `Name`, routine_type as `Type` from information_schema.routines where routine_schema = database() order by routine_name"
	case "oracle":
		sqlText = `select object_name as "Name", object_type as "Type" from user_objects where object_type in ('FUNCTION','PROCEDURE') order by object_name`
	case "sqlite":
		return "SQLite has no catalog of user-defined functions to list.", nil
	default:
		return "", fmt.Errorf("\\df is not implemented for %s", s.technology)
	}
	cols, rows, err := s.consoleQueryRows(ctx, sqlText)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "No functions found.", nil
	}
	return consolePretty(cols, rows, s.expanded), nil
}
