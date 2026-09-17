-- DBML (Database Markup Language) schema export for PostgreSQL.
--
-- Sourced from the pg_dbml project (https://pg_dbml.80.cz,
-- https://github.com/heptau/pg_dbml), MIT licensed, same author as OmniDB.
-- Pure SQL introspection over pg_catalog/information_schema -- no external
-- tooling involved, the whole DBML document comes back as a single scalar
-- column (dbml_output). Keep this in sync with upstream's pg_dbml.sql by
-- diffing against it rather than editing the two independently.

WITH
tables AS (
	SELECT
		n.nspname AS schema_name,
		c.relname AS table_name,
		c.oid AS table_oid,
		NULLIF(btrim(obj_description(c.oid)), '') AS table_comment
	FROM pg_class AS c
	JOIN pg_namespace AS n ON n.oid = c.relnamespace
	WHERE c.relkind = 'r'
	  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
	  AND n.nspname !~ '^pg_toast'
),
pk_columns AS (
	SELECT conrelid AS table_oid, unnest(conkey) AS attnum
	FROM pg_constraint
	WHERE contype = 'p'
	  AND conrelid IN (SELECT table_oid FROM tables)
),
unique_columns AS (
	SELECT conrelid AS table_oid, conkey[1] AS attnum
	FROM pg_constraint
	WHERE contype = 'u' AND array_length(conkey, 1) = 1
	  AND conrelid IN (SELECT table_oid FROM tables)
),
columns AS (
	SELECT
		t.table_oid,
		a.attname AS column_name,
		a.attnum AS ordinal_position,
		-- Anchored patterns so a type modifier — timestamp(0) without time zone — is kept
		-- while the SQL spelling is shortened, and so type names that merely contain a
		-- mapped word (information_schema.character_data) are left alone.
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
		regexp_replace(
			format_type(a.atttypid, a.atttypmod),
			'^timestamp(\(\d+\))? without time zone', 'timestamp\1'),
			'^timestamp(\(\d+\))? with time zone',    'timestamptz\1'),
			'^time(\(\d+\))? without time zone',      'time\1'),
			'^time(\(\d+\))? with time zone',         'timetz\1'),
			'^character varying',                     'varchar'),
			'^character($|\(|\[)',                    'char\1'),
			'^bit varying',                           'varbit'),
			'^double precision',                      'float8'),
			'^boolean($|\[)',                         'bool\1'),
			'^integer($|\[)',                         'int\1')
		AS data_type,
		NOT a.attnotnull AS is_nullable,
		-- pg_get_expr() renders the stored expression with Postgres noise: quoted
		-- function names, ::type casts and wrapping parens. Strip it here so the
		-- rendering below only has to decide literal vs. expression.
		regexp_replace(
			regexp_replace(
				regexp_replace(pg_get_expr(d.adbin, d.adrelid), '"([a-z][a-z0-9_]*)"(\()', '\1\2', 'g'),
				'::"?[a-z][a-z0-9_ ]*"?(\([^)]*\))?(\s+[a-z]+)*(\[\])*', '', 'g'
			),
			'^\(([^()]+)\)$', '\1'
		) AS column_default,
		NULLIF(btrim(col_description(t.table_oid, a.attnum)), '') AS column_comment,
		pk.attnum IS NOT NULL AS is_pk,
		uq.attnum IS NOT NULL AS is_unique
	FROM tables AS t
	JOIN pg_attribute AS a ON a.attrelid = t.table_oid
	LEFT JOIN pg_attrdef AS d ON d.adrelid = t.table_oid AND d.adnum = a.attnum
	LEFT JOIN pk_columns AS pk ON pk.table_oid = t.table_oid AND pk.attnum = a.attnum
	LEFT JOIN unique_columns AS uq ON uq.table_oid = t.table_oid AND uq.attnum = a.attnum
	WHERE a.attnum > 0 AND NOT a.attisdropped
),
columns_dbml AS (
	SELECT
		table_oid,
		string_agg(
			format('  %I %s%s',
				column_name,
				CASE WHEN data_type LIKE '% %' THEN format('"%s"', data_type) ELSE data_type END,
				CASE WHEN is_pk OR NOT is_nullable OR is_unique OR column_default IS NOT NULL OR column_comment IS NOT NULL
					THEN
						' [' ||
						concat_ws(', ',
							CASE WHEN is_pk THEN 'pk' END,
							CASE WHEN is_unique THEN 'unique' END,
							CASE WHEN NOT is_nullable THEN 'not null' END,
							CASE WHEN column_default IS NOT NULL
								-- DBML accepts a bare default only for a number, true/false/null or a
								-- plain string literal. Everything else — a function call, an operator
								-- expression, CURRENT_TIMESTAMP, a string carrying Postgres' doubled
								-- quotes — has to be written as a backtick expression.
								THEN format('default: %s',
									CASE
										WHEN column_default ~ '^-?\d+(\.\d+)?$' THEN column_default
										WHEN lower(column_default) IN ('true', 'false', 'null') THEN lower(column_default)
										WHEN column_default ~ '^''[^'']*''$' THEN column_default
										ELSE format('`%s`', column_default)
									END)
							END,
							CASE WHEN column_comment IS NOT NULL
								-- A DBML string escapes with a backslash, not by doubling: an
								-- apostrophe must be written \' — the SQL-style doubled form is a
								-- parse error — and a literal backslash must be doubled or it
								-- swallows the character after it.
								THEN format('note: %s',
									CASE WHEN column_comment ~ E'[\n\r]'
										THEN format('''''''%s''''''', replace(replace(column_comment, E'\\', E'\\\\'), '''', E'\\'''))
										ELSE format('''%s''', replace(replace(column_comment, E'\\', E'\\\\'), '''', E'\\'''))
									  END)
							  END
						)
						|| ']'
					ELSE ''
				END
			),
			E'\n'
			ORDER BY is_pk DESC, ordinal_position
		) AS columns_block
	FROM columns
	GROUP BY table_oid
),
indexes AS (
	SELECT
		t.table_oid,
		i.relname AS index_name,
		ix.indisprimary,
		ix.indisunique,
		am.amname AS index_type,
		string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) AS columns_list,
		CASE WHEN ix.indnkeyatts < array_length(ix.indkey, 1)
			THEN string_agg(a.attname, ', ') FILTER (WHERE array_position(ix.indkey, a.attnum) >= ix.indnkeyatts)
			ELSE NULL
		END AS include_columns
	FROM tables AS t
	JOIN pg_index AS ix ON ix.indrelid = t.table_oid
	JOIN pg_class AS i ON i.oid = ix.indexrelid
	JOIN pg_am AS am ON am.oid = i.relam
	JOIN pg_attribute AS a ON a.attrelid = t.table_oid AND a.attnum = ANY(ix.indkey)
	WHERE NOT ix.indisprimary OR array_length(ix.indkey, 1) > 1
	GROUP BY t.table_oid, i.relname, ix.indisprimary, ix.indisunique, am.amname, ix.indnkeyatts, ix.indkey
),
indexes_dbml AS (
	SELECT
		table_oid,
		format(E'\n  Indexes {\n    %s\n  }',
			string_agg(
				format('%s [%s]',
					CASE WHEN columns_list ~ ',' THEN format('(%s)', columns_list) ELSE columns_list END,
					concat_ws(', ',
						CASE WHEN indisprimary THEN 'pk' END,
						format('type: %s', index_type),
						CASE WHEN indisunique AND NOT indisprimary THEN 'unique' END,
						format('name: "%s"', index_name),
						CASE WHEN include_columns IS NOT NULL
							 THEN format('note: ''INCLUDE (%s)''', include_columns)
						END
					)
				),
				E'\n    '
				ORDER BY indisprimary DESC, indisunique DESC, index_name
			)
		) AS indexes_block
	FROM indexes
	GROUP BY table_oid
),
fk_cols AS (
	SELECT
		con.oid AS con_oid,
		string_agg(quote_ident(src.attname), ', ' ORDER BY ordinality) AS src_cols,
		string_agg(quote_ident(tgt.attname), ', ' ORDER BY ordinality) AS tgt_cols
	FROM pg_constraint AS con
	JOIN pg_class AS cl1 ON cl1.oid = con.conrelid
	JOIN pg_namespace AS ns1 ON ns1.oid = cl1.relnamespace
	CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS u(src_attnum, tgt_attnum, ordinality)
	JOIN pg_attribute AS src ON src.attrelid = con.conrelid  AND src.attnum = u.src_attnum
	JOIN pg_attribute AS tgt ON tgt.attrelid = con.confrelid AND tgt.attnum = u.tgt_attnum
	WHERE con.contype = 'f'
	  AND ns1.nspname NOT IN ('pg_catalog', 'information_schema')
	GROUP BY con.oid, array_length(con.conkey, 1)
),
foreign_keys AS (
	SELECT
		format(
			'Ref %I: %I.%I.%s > %I.%I.%s',
			con.conname,
			ns1.nspname, cl1.relname,
			CASE WHEN array_length(con.conkey, 1) = 1 THEN fc.src_cols ELSE '(' || fc.src_cols || ')' END,
			ns2.nspname, cl2.relname,
			CASE WHEN array_length(con.confkey, 1) = 1 THEN fc.tgt_cols ELSE '(' || fc.tgt_cols || ')' END
		) AS ref_line,
		ns1.nspname AS schema_name,
		cl1.relname AS table_name,
		con.conname AS constraint_name
	FROM pg_constraint AS con
	JOIN fk_cols AS fc ON fc.con_oid = con.oid
	JOIN pg_class AS cl1 ON cl1.oid = con.conrelid
	JOIN pg_namespace AS ns1 ON ns1.oid = cl1.relnamespace
	JOIN pg_class AS cl2 ON cl2.oid = con.confrelid
	JOIN pg_namespace AS ns2 ON ns2.oid = cl2.relnamespace
	WHERE con.contype = 'f'
	  AND ns1.nspname NOT IN ('pg_catalog', 'information_schema')
	  AND ns2.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT
	string_agg(
		format(E'Table %I.%I {\n%s%s%s\n}',
			t.schema_name,
			t.table_name,
			c.columns_block,
			COALESCE(i.indexes_block, ''),
			CASE WHEN t.table_comment IS NOT NULL
				THEN format(E'\n  Note: %s',
					CASE WHEN t.table_comment ~ E'[\n\r]'
						THEN format('''''''%s''''''', replace(replace(t.table_comment, E'\\', E'\\\\'), '''', E'\\'''))
						ELSE format('''%s''', replace(replace(t.table_comment, E'\\', E'\\\\'), '''', E'\\'''))
					END)
				ELSE ''
			END
		),
		E'\n\n'
		ORDER BY t.schema_name, t.table_name
	) ||
	CASE
		WHEN EXISTS (SELECT FROM foreign_keys)
		THEN E'\n\n' || (SELECT string_agg(ref_line, E'\n' ORDER BY schema_name, table_name, constraint_name) FROM foreign_keys)
		ELSE ''
	END AS dbml_output
FROM tables AS t
JOIN columns_dbml AS c ON c.table_oid = t.table_oid
LEFT JOIN indexes_dbml AS i ON i.table_oid = t.table_oid;
