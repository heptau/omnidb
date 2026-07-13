package main

import "database/sql"

// postgresqlPrimaryKeys mirrors PostgreSQL.py's QueryTablesPrimaryKeys for a
// single table.
func postgresqlPrimaryKeys(db *sql.DB, schema, table string) ([][2]any, error) {
	rows, err := db.Query(`
		SELECT quote_ident(c.conname) AS constraint_name,
			   c.oid
		FROM (
			SELECT oid, conrelid, conname
			FROM pg_constraint
			WHERE contype = 'p'
		) c
		INNER JOIN pg_class t ON c.conrelid = t.oid
		WHERE quote_ident(t.relnamespace::regnamespace::text) = $1
		  AND quote_ident(t.relname) = $2
		ORDER BY quote_ident(c.conname)
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out [][2]any
	for rows.Next() {
		var name string
		var oid int64
		if err := rows.Scan(&name, &oid); err != nil {
			return nil, err
		}
		out = append(out, [2]any{name, oid})
	}
	return out, rows.Err()
}

// postgresqlPrimaryKeyColumns mirrors PostgreSQL.py's
// QueryTablesPrimaryKeysColumns.
func postgresqlPrimaryKeyColumns(db *sql.DB, schema, table, constraint string) ([]string, error) {
	return postgresqlConstraintColumns(db, schema, table, constraint, "PRIMARY KEY")
}

// postgresqlUniqueColumns mirrors PostgreSQL.py's QueryTablesUniquesColumns.
func postgresqlUniqueColumns(db *sql.DB, schema, table, constraint string) ([]string, error) {
	return postgresqlConstraintColumns(db, schema, table, constraint, "UNIQUE")
}

// postgresqlConstraintColumns backs both PK and unique column lookups —
// same information_schema join PostgreSQL.py uses for both, filtered by a
// different constraint_type.
func postgresqlConstraintColumns(db *sql.DB, schema, table, constraint, constraintType string) ([]string, error) {
	rows, err := db.Query(`
		SELECT quote_ident(kc.column_name) AS column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kc
			ON kc.table_name = tc.table_name
			AND kc.table_schema = tc.table_schema
			AND kc.constraint_name = tc.constraint_name
		WHERE tc.constraint_type = $4
			AND quote_ident(tc.table_schema) = $1
			AND quote_ident(tc.table_name) = $2
			AND quote_ident(tc.constraint_name) = $3
		ORDER BY kc.ordinal_position
	`, schema, table, constraint, constraintType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

type postgresqlForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
	OID            int64
}

// postgresqlForeignKeys mirrors PostgreSQL.py's QueryTablesForeignKeys for a
// single table.
func postgresqlForeignKeys(db *sql.DB, schema, table string) ([]postgresqlForeignKey, error) {
	rows, err := db.Query(`
		SELECT DISTINCT quote_ident(c.conname) AS constraint_name,
						quote_ident(rt.relname) AS r_table_name,
						c.update_rule,
						c.delete_rule,
						c.oid
		FROM (
			SELECT
				oid,
				connamespace,
				conname,
				conrelid,
				confrelid,
				CASE confupdtype
					WHEN 'c' THEN 'CASCADE'
					WHEN 'n' THEN 'SET NULL'
					WHEN 'd' THEN 'SET DEFAULT'
					WHEN 'r' THEN 'RESTRICT'
					WHEN 'a' THEN 'NO ACTION'
				END AS update_rule,
				CASE confdeltype
					WHEN 'c' THEN 'CASCADE'
					WHEN 'n' THEN 'SET NULL'
					WHEN 'd' THEN 'SET DEFAULT'
					WHEN 'r' THEN 'RESTRICT'
					WHEN 'a' THEN 'NO ACTION'
				END AS delete_rule
			FROM pg_constraint
			WHERE contype = 'f'
		) AS c
		INNER JOIN pg_class AS t ON c.conrelid = t.oid
		INNER JOIN pg_namespace AS tn ON t.relnamespace = tn.oid
		INNER JOIN (
			SELECT objid, refobjid
			FROM pg_depend
			WHERE classid = 'pg_constraint'::regclass::oid
				AND refclassid = 'pg_class'::regclass::oid
				AND refobjsubid = 0
		) AS d1 ON c.oid = d1.objid
		INNER JOIN (
			SELECT objid, refobjid
			FROM pg_depend
			WHERE refclassid = 'pg_constraint'::regclass::oid
				AND classid = 'pg_class'::regclass::oid
				AND deptype = 'i'
				AND objsubid = 0
		) AS d2 ON d1.refobjid = d2.objid
		INNER JOIN (
			SELECT oid, conrelid, connamespace, conname
			FROM pg_constraint
			WHERE contype IN ('p', 'u')
		) AS rc ON d2.refobjid = rc.oid
			   AND c.confrelid = rc.conrelid
		INNER JOIN pg_class AS rt ON rc.conrelid = rt.oid
		INNER JOIN pg_namespace AS rtn ON rt.relnamespace = rtn.oid
		WHERE quote_ident(tn.nspname) = $1
			AND quote_ident(t.relname) = $2
		ORDER BY quote_ident(c.conname), quote_ident(rt.relname)
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []postgresqlForeignKey
	for rows.Next() {
		var fk postgresqlForeignKey
		if err := rows.Scan(&fk.ConstraintName, &fk.RTableName, &fk.UpdateRule, &fk.DeleteRule, &fk.OID); err != nil {
			return nil, err
		}
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

type postgresqlForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// postgresqlForeignKeyColumns mirrors PostgreSQL.py's
// QueryTablesForeignKeysColumns.
func postgresqlForeignKeyColumns(db *sql.DB, schema, table, fkey string) ([]postgresqlForeignKeyColumn, error) {
	rows, err := db.Query(`
		SELECT DISTINCT
			quote_ident(kcu1.column_name) AS column_name,
			quote_ident(kcu2.table_name) AS r_table_name,
			quote_ident(kcu2.column_name) AS r_column_name,
			rc.update_rule AS update_rule,
			rc.delete_rule AS delete_rule,
			kcu1.ordinal_position
		FROM information_schema.referential_constraints rc
		JOIN information_schema.key_column_usage kcu1
			ON kcu1.constraint_catalog = rc.constraint_catalog
			AND kcu1.constraint_schema = rc.constraint_schema
			AND kcu1.constraint_name = rc.constraint_name
		JOIN information_schema.key_column_usage kcu2
			ON kcu2.constraint_catalog = rc.unique_constraint_catalog
			AND kcu2.constraint_schema = rc.unique_constraint_schema
			AND kcu2.constraint_name = rc.unique_constraint_name
			AND kcu2.ordinal_position = kcu1.ordinal_position
		WHERE quote_ident(rc.constraint_schema) = $1
			AND quote_ident(kcu1.table_name) = $2
			AND quote_ident(kcu1.constraint_name) = $3
		ORDER BY kcu1.ordinal_position
	`, schema, table, fkey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []postgresqlForeignKeyColumn
	for rows.Next() {
		var c postgresqlForeignKeyColumn
		var ordinal int
		if err := rows.Scan(&c.ColumnName, &c.RTableName, &c.RColumnName, &c.UpdateRule, &c.DeleteRule, &ordinal); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// postgresqlUniques mirrors PostgreSQL.py's QueryTablesUniques for a single
// table.
func postgresqlUniques(db *sql.DB, schema, table string) ([][2]any, error) {
	rows, err := db.Query(`
		SELECT quote_ident(c.conname) AS constraint_name,
			   c.oid
		FROM (
			SELECT oid, conrelid, conname
			FROM pg_constraint
			WHERE contype = 'u'
		) c
		INNER JOIN pg_class t ON c.conrelid = t.oid
		WHERE quote_ident(t.relnamespace::regnamespace::text) = $1
		  AND quote_ident(t.relname) = $2
		ORDER BY quote_ident(c.conname)
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out [][2]any
	for rows.Next() {
		var name string
		var oid int64
		if err := rows.Scan(&name, &oid); err != nil {
			return nil, err
		}
		out = append(out, [2]any{name, oid})
	}
	return out, rows.Err()
}

type postgresqlIndex struct {
	Name       string
	Uniqueness string
	OID        int64
}

// postgresqlIndexes mirrors PostgreSQL.py's QueryTablesIndexes for a single
// table.
func postgresqlIndexes(db *sql.DB, schema, table string) ([]postgresqlIndex, error) {
	rows, err := db.Query(`
		SELECT quote_ident(ci.relname) AS index_name,
			   (CASE WHEN i.indisunique THEN 'Unique' ELSE 'Non Unique' END) AS uniqueness,
			   ci.oid
		FROM pg_index i
		INNER JOIN pg_class ci ON ci.oid = i.indexrelid
		INNER JOIN pg_namespace ni ON ni.oid = ci.relnamespace
		INNER JOIN pg_class c ON c.oid = i.indrelid
		INNER JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE i.indisvalid
		  AND i.indislive
		  AND quote_ident(n.nspname) = $1
		  AND quote_ident(c.relname) = $2
		ORDER BY 1, 2
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []postgresqlIndex
	for rows.Next() {
		var idx postgresqlIndex
		if err := rows.Scan(&idx.Name, &idx.Uniqueness, &idx.OID); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// postgresqlIndexColumns mirrors PostgreSQL.py's QueryTablesIndexesColumns —
// parses the textual index definition the same (fragile) way the Python
// query does, since pg_index exposes column order only via that string.
func postgresqlIndexColumns(db *sql.DB, schema, table, index string) ([]string, error) {
	rows, err := db.Query(`
		SELECT unnest(string_to_array(
			replace(
				substr(t.indexdef, strpos(t.indexdef, '(') + 1,
					strpos(t.indexdef, ')') - strpos(t.indexdef, '(') - 1),
				' ', ''),
			',')) AS column_name
		FROM (
			SELECT pg_get_indexdef(i.indexrelid) AS indexdef
			FROM pg_index i
			INNER JOIN pg_class ci ON ci.oid = i.indexrelid
			INNER JOIN pg_namespace ni ON ni.oid = ci.relnamespace
			INNER JOIN pg_class c ON c.oid = i.indrelid
			INNER JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE i.indisvalid
			  AND i.indislive
			  AND quote_ident(n.nspname) = $1
			  AND quote_ident(c.relname) = $2
			  AND quote_ident(ci.relname) = $3
		) t
	`, schema, table, index)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

type postgresqlView struct {
	Name string
	OID  int64
}

// postgresqlViews mirrors PostgreSQL.py's QueryViews scoped to one schema.
func postgresqlViews(db *sql.DB, schema string) ([]postgresqlView, error) {
	rows, err := db.Query(`
		SELECT quote_ident(t.relname) AS table_name,
			   t.oid
		FROM pg_class t
		INNER JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE t.relkind = 'v'
		  AND quote_ident(n.nspname) = $1
		ORDER BY 1
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var views []postgresqlView
	for rows.Next() {
		var v postgresqlView
		if err := rows.Scan(&v.Name, &v.OID); err != nil {
			return nil, err
		}
		views = append(views, v)
	}
	return views, rows.Err()
}

type postgresqlViewColumn struct {
	Name       string
	DataType   string
	DataLength sql.NullString
}

// postgresqlViewColumns mirrors PostgreSQL.py's QueryViewFields.
func postgresqlViewColumns(db *sql.DB, schema, view string) ([]postgresqlViewColumn, error) {
	rows, err := db.Query(`
		SELECT quote_ident(a.attname) AS column_name,
			   t.typname AS data_type,
			   (SELECT CASE WHEN x.truetypmod = -1 THEN NULL
							WHEN x.truetypid IN (1042, 1043) THEN x.truetypmod - 4
							WHEN x.truetypid IN (1560, 1562) THEN x.truetypmod
							ELSE NULL
					   END
				FROM (
					SELECT (CASE WHEN t.typtype = 'd' THEN t.typbasetype ELSE a.atttypid END) AS truetypid,
						   (CASE WHEN t.typtype = 'd' THEN t.typtypmod ELSE a.atttypmod END) AS truetypmod
				) x
			   ) AS data_length
		FROM pg_attribute a
		INNER JOIN pg_class c ON c.oid = a.attrelid
		INNER JOIN pg_namespace n ON n.oid = c.relnamespace
		INNER JOIN pg_type t ON t.oid = a.atttypid
		WHERE a.attnum > 0
		  AND NOT a.attisdropped
		  AND c.relkind = 'v'
		  AND quote_ident(n.nspname) = $1
		  AND quote_ident(c.relname) = $2
		ORDER BY a.attnum
	`, schema, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []postgresqlViewColumn
	for rows.Next() {
		var c postgresqlViewColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.DataLength); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// postgresqlViewDefinition mirrors PostgreSQL.py's GetViewDefinition.
func postgresqlViewDefinition(db *sql.DB, schema, view string) (string, error) {
	var definition sql.NullString
	err := db.QueryRow(`
		SELECT view_definition
		FROM information_schema.views
		WHERE quote_ident(table_schema) = $1
		  AND quote_ident(table_name) = $2
	`, schema, view).Scan(&definition)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return "CREATE OR REPLACE VIEW " + schema + "." + view + " AS\n" + definition.String + "\n", nil
}

type postgresqlTrigger struct {
	Name        string
	Enabled     string
	Function    string
	ID          string
	FunctionOID int64
	OID         int64
}

// postgresqlTriggers mirrors PostgreSQL.py's QueryTablesTriggers for a
// single table.
func postgresqlTriggers(db *sql.DB, schema, table string) ([]postgresqlTrigger, error) {
	rows, err := db.Query(`
		SELECT quote_ident(t.tgname) AS trigger_name,
			   t.tgenabled AS trigger_enabled,
			   quote_ident(np.nspname) || '.' || quote_ident(p.proname) AS trigger_function,
			   quote_ident(np.nspname) || '.' || quote_ident(p.proname) || '(' || oidvectortypes(p.proargtypes) || ')' AS id,
			   p.oid AS function_oid,
			   t.oid
		FROM pg_trigger t
		INNER JOIN pg_class c ON c.oid = t.tgrelid
		INNER JOIN pg_namespace n ON n.oid = c.relnamespace
		INNER JOIN pg_proc p ON p.oid = t.tgfoid
		INNER JOIN pg_namespace np ON np.oid = p.pronamespace
		WHERE NOT t.tgisinternal
		  AND quote_ident(n.nspname) = $1
		  AND quote_ident(c.relname) = $2
		ORDER BY 1
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var triggers []postgresqlTrigger
	for rows.Next() {
		var t postgresqlTrigger
		if err := rows.Scan(&t.Name, &t.Enabled, &t.Function, &t.ID, &t.FunctionOID, &t.OID); err != nil {
			return nil, err
		}
		triggers = append(triggers, t)
	}
	return triggers, rows.Err()
}
