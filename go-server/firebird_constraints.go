package main

import "database/sql"

// firebirdPrimaryKeys mirrors mssqlPrimaryKeys/oraclePrimaryKeys —
// rdb$relation_constraints scoped to one table. Firebird has no schema
// concept (see firebird.go's package comment), so unlike mssqlPrimaryKeys
// there is no schema argument or schema join here.
func firebirdPrimaryKeys(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(`
		select trim(rc.rdb$constraint_name) as name
		from rdb$relation_constraints rc
		where rc.rdb$constraint_type = 'PRIMARY KEY' and trim(rc.rdb$relation_name) = ?
		order by rc.rdb$constraint_name
	`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// firebirdPrimaryKeyColumns mirrors mssqlPrimaryKeyColumns — a constraint's
// backing index (rc.rdb$index_name) is what actually carries the column
// list, in rdb$index_segments.
func firebirdPrimaryKeyColumns(db *sql.DB, table, pkName string) ([]string, error) {
	rows, err := db.Query(`
		select trim(s.rdb$field_name) as name
		from rdb$relation_constraints rc
		join rdb$index_segments s on s.rdb$index_name = rc.rdb$index_name
		where rc.rdb$constraint_type = 'PRIMARY KEY'
		  and trim(rc.rdb$relation_name) = ? and trim(rc.rdb$constraint_name) = ?
		order by s.rdb$field_position
	`, table, pkName)
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

// firebirdUniques mirrors mssqlUniques — same shape as firebirdPrimaryKeys,
// just rc.rdb$constraint_type = 'UNIQUE'.
func firebirdUniques(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(`
		select trim(rc.rdb$constraint_name) as name
		from rdb$relation_constraints rc
		where rc.rdb$constraint_type = 'UNIQUE' and trim(rc.rdb$relation_name) = ?
		order by rc.rdb$constraint_name
	`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// firebirdUniqueColumns mirrors mssqlUniqueColumns.
func firebirdUniqueColumns(db *sql.DB, table, uniqueName string) ([]string, error) {
	rows, err := db.Query(`
		select trim(s.rdb$field_name) as name
		from rdb$relation_constraints rc
		join rdb$index_segments s on s.rdb$index_name = rc.rdb$index_name
		where rc.rdb$constraint_type = 'UNIQUE'
		  and trim(rc.rdb$relation_name) = ? and trim(rc.rdb$constraint_name) = ?
		order by s.rdb$field_position
	`, table, uniqueName)
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

// firebirdForeignKey mirrors mssqlForeignKey's field names exactly so
// handleGetFKsFirebird's body can build its response row the same way
// handleGetFKsMSSQL does for mssqlForeignKey.
type firebirdForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
}

// firebirdForeignKeys mirrors mssqlForeignKeys. A foreign key constraint's
// own row in rdb$relation_constraints only carries its *own* backing index
// (rdb$index_name); the referenced table comes from rdb$ref_constraints'
// rdb$const_name_uq, which names the unique/primary-key constraint on the
// *other* table that this FK targets — joined back into
// rdb$relation_constraints a second time (rc2) purely to read that
// constraint's own rdb$relation_name.
func firebirdForeignKeys(db *sql.DB, table string) ([]firebirdForeignKey, error) {
	rows, err := db.Query(`
		select trim(rc.rdb$constraint_name) as constraint_name,
		       trim(rc2.rdb$relation_name) as r_table_name,
		       coalesce(refc.rdb$delete_rule, 'RESTRICT') as delete_rule,
		       coalesce(refc.rdb$update_rule, 'RESTRICT') as update_rule
		from rdb$relation_constraints rc
		join rdb$ref_constraints refc on refc.rdb$constraint_name = rc.rdb$constraint_name
		join rdb$relation_constraints rc2 on rc2.rdb$constraint_name = refc.rdb$const_name_uq
		where rc.rdb$constraint_type = 'FOREIGN KEY' and trim(rc.rdb$relation_name) = ?
		order by rc.rdb$constraint_name
	`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []firebirdForeignKey
	for rows.Next() {
		var fk firebirdForeignKey
		if err := rows.Scan(&fk.ConstraintName, &fk.RTableName, &fk.DeleteRule, &fk.UpdateRule); err != nil {
			return nil, err
		}
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

// firebirdForeignKeyColumn mirrors mssqlForeignKeyColumn's field names/order
// exactly — handleGetFKsColumnsFirebird builds
// []string{c.RTableName, c.DeleteRule, c.UpdateRule, c.ColumnName, c.RColumnName}
// the same way handleGetFKsColumnsMSSQL does for mssqlForeignKeyColumn.
type firebirdForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// firebirdForeignKeyColumns mirrors mssqlForeignKeyColumns — the two
// index-segment joins pair each local column (s1, from the FK's own backing
// index) with the referenced column at the same ordinal position (s2, from
// the referenced unique/PK constraint's backing index), matching how
// Firebird itself pairs them (a composite FK's Nth local column always
// corresponds to the referenced key's Nth column).
func firebirdForeignKeyColumns(db *sql.DB, table, fkName string) ([]firebirdForeignKeyColumn, error) {
	rows, err := db.Query(`
		select trim(rc2.rdb$relation_name) as r_table_name,
		       coalesce(refc.rdb$delete_rule, 'RESTRICT') as delete_rule,
		       coalesce(refc.rdb$update_rule, 'RESTRICT') as update_rule,
		       trim(s1.rdb$field_name) as column_name,
		       trim(s2.rdb$field_name) as r_column_name
		from rdb$relation_constraints rc
		join rdb$ref_constraints refc on refc.rdb$constraint_name = rc.rdb$constraint_name
		join rdb$relation_constraints rc2 on rc2.rdb$constraint_name = refc.rdb$const_name_uq
		join rdb$index_segments s1 on s1.rdb$index_name = rc.rdb$index_name
		join rdb$index_segments s2 on s2.rdb$index_name = rc2.rdb$index_name and s2.rdb$field_position = s1.rdb$field_position
		where rc.rdb$constraint_type = 'FOREIGN KEY'
		  and trim(rc.rdb$relation_name) = ? and trim(rc.rdb$constraint_name) = ?
		order by s1.rdb$field_position
	`, table, fkName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []firebirdForeignKeyColumn
	for rows.Next() {
		var c firebirdForeignKeyColumn
		if err := rows.Scan(&c.RTableName, &c.DeleteRule, &c.UpdateRule, &c.ColumnName, &c.RColumnName); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// firebirdIndex mirrors mssqlIndex's field names.
type firebirdIndex struct {
	Name       string
	Uniqueness string
}

// firebirdIndexes mirrors mssqlIndexes' own exclusion: every PRIMARY KEY/
// UNIQUE constraint is backed by an implicit index of the same name (like
// MSSQL, unlike e.g. Postgres, where the backing index just happens to
// share the constraint's name) — the not-exists check excludes exactly
// those two constraint types, the same "already shown under the table's own
// Primary Keys/Uniques tree nodes" reasoning as mssqlIndexes' own comment. A
// foreign key's own backing index is deliberately *not* excluded here,
// matching mssqlIndexes' behavior (it only excludes is_primary_key/
// is_unique_constraint, not FK-backed indexes).
func firebirdIndexes(db *sql.DB, table string) ([]firebirdIndex, error) {
	rows, err := db.Query(`
		select trim(i.rdb$index_name) as name,
		       case when i.rdb$unique_flag = 1 then 'UNIQUE' else 'NONUNIQUE' end as uniqueness
		from rdb$indices i
		where trim(i.rdb$relation_name) = ?
		  and not exists (
		      select 1 from rdb$relation_constraints rc
		      where rc.rdb$index_name = i.rdb$index_name
		        and rc.rdb$constraint_type in ('PRIMARY KEY', 'UNIQUE')
		  )
		order by i.rdb$index_name
	`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []firebirdIndex
	for rows.Next() {
		var idx firebirdIndex
		if err := rows.Scan(&idx.Name, &idx.Uniqueness); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// firebirdIndexColumns mirrors mssqlIndexColumns. Index names are unique
// database-wide in Firebird (not per-table), so the join back to
// rdb$indices on both index name and relation name is defense-in-depth
// consistency with this port's other engines rather than a real
// disambiguation need.
func firebirdIndexColumns(db *sql.DB, table, indexName string) ([]string, error) {
	rows, err := db.Query(`
		select trim(s.rdb$field_name) as name
		from rdb$index_segments s
		join rdb$indices i on i.rdb$index_name = s.rdb$index_name
		where trim(i.rdb$relation_name) = ? and trim(i.rdb$index_name) = ?
		order by s.rdb$field_position
	`, table, indexName)
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

// firebirdViewColumn mirrors mssqlViewColumn's shape as used by
// handleGetViewsColumnsFirebird.
type firebirdViewColumn struct {
	Name     string
	DataType string
	Length   int64
	Nullable string
}

// firebirdViewColumns mirrors firebirdColumns (firebird.go) — unlike
// mssqlViewColumns (which has to join sys.views instead of sys.tables, since
// MSSQL keeps separate table/view catalogs), Firebird's
// rdb$relation_fields/rdb$fields cover both tables and views under the same
// rdb$relation_name, so this is the exact same query as firebirdColumns,
// just returning the narrower field set the view-columns tree node uses.
func firebirdViewColumns(db *sql.DB, view string) ([]firebirdViewColumn, error) {
	rows, err := db.Query(`
		select trim(rf.rdb$field_name) as field_name,
		       f.rdb$field_type,
		       coalesce(f.rdb$field_sub_type, 0),
		       coalesce(f.rdb$character_length, f.rdb$field_length, 0),
		       case when rf.rdb$null_flag = 1 then 'NO' else 'YES' end as nullable
		from rdb$relation_fields rf
		join rdb$fields f on f.rdb$field_name = rf.rdb$field_source
		where trim(rf.rdb$relation_name) = ?
		order by rf.rdb$field_position
	`, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []firebirdViewColumn
	for rows.Next() {
		var c firebirdViewColumn
		var fieldType, subType int
		if err := rows.Scan(&c.Name, &fieldType, &subType, &c.Length, &c.Nullable); err != nil {
			return nil, err
		}
		c.DataType = firebirdSQLTypeName(fieldType, subType)
		cols = append(cols, c)
	}
	return cols, rows.Err()
}
