package main

import "database/sql"

// mssqlPrimaryKeys mirrors oraclePrimaryKeys — sys.key_constraints scoped to
// one schema.table (MSSQL objects live in schema.table, not just an owner
// name, so every query here joins sys.schemas on top of the object's own
// schema_id rather than filtering a single "owner" column the way Oracle's
// ALL_CONSTRAINTS does).
func mssqlPrimaryKeys(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select kc.name
		from sys.key_constraints kc
		join sys.tables t on t.object_id = kc.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where kc.type = 'PK' and s.name = @p1 and t.name = @p2
		order by kc.name
	`, schema, table)
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

// mssqlPrimaryKeyColumns mirrors oraclePrimaryKeyColumns.
func mssqlPrimaryKeyColumns(db *sql.DB, schema, table, pkName string) ([]string, error) {
	rows, err := db.Query(`
		select c.name
		from sys.key_constraints kc
		join sys.index_columns ic on ic.object_id = kc.parent_object_id and ic.index_id = kc.unique_index_id
		join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
		join sys.tables t on t.object_id = kc.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where kc.type = 'PK' and s.name = @p1 and t.name = @p2 and kc.name = @p3
		order by ic.key_ordinal
	`, schema, table, pkName)
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

// mssqlUniques mirrors oracleUniques — same shape as mssqlPrimaryKeys, just
// kc.type = 'UQ'.
func mssqlUniques(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select kc.name
		from sys.key_constraints kc
		join sys.tables t on t.object_id = kc.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where kc.type = 'UQ' and s.name = @p1 and t.name = @p2
		order by kc.name
	`, schema, table)
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

// mssqlUniqueColumns mirrors oracleUniqueColumns.
func mssqlUniqueColumns(db *sql.DB, schema, table, uniqueName string) ([]string, error) {
	rows, err := db.Query(`
		select c.name
		from sys.key_constraints kc
		join sys.index_columns ic on ic.object_id = kc.parent_object_id and ic.index_id = kc.unique_index_id
		join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
		join sys.tables t on t.object_id = kc.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where kc.type = 'UQ' and s.name = @p1 and t.name = @p2 and kc.name = @p3
		order by ic.key_ordinal
	`, schema, table, uniqueName)
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

// mssqlForeignKey mirrors oracleForeignKey's field names exactly so
// handleGetFKsMSSQL's body can build its response row the same way
// handleGetFKsOracle does.
type mssqlForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
}

// mssqlForeignKeys mirrors oracleForeignKeys. delete_referential_action_desc/
// update_referential_action_desc come back as NO_ACTION/CASCADE/SET_NULL/
// SET_DEFAULT — kept verbatim rather than remapped to Oracle's own
// CASCADE/SET NULL/NO ACTION vocabulary, since these are just displayed as-is
// in the tree, not compared against anything.
func mssqlForeignKeys(db *sql.DB, schema, table string) ([]mssqlForeignKey, error) {
	rows, err := db.Query(`
		select fk.name, rt.name as r_table_name, fk.delete_referential_action_desc, fk.update_referential_action_desc
		from sys.foreign_keys fk
		join sys.tables t on t.object_id = fk.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		join sys.tables rt on rt.object_id = fk.referenced_object_id
		where s.name = @p1 and t.name = @p2
		order by fk.name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []mssqlForeignKey
	for rows.Next() {
		var fk mssqlForeignKey
		if err := rows.Scan(&fk.ConstraintName, &fk.RTableName, &fk.DeleteRule, &fk.UpdateRule); err != nil {
			return nil, err
		}
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

// mssqlForeignKeyColumn mirrors oracleForeignKeyColumn's field names/order
// exactly — handleGetFKsColumnsMSSQL builds
// []string{c.RTableName, c.DeleteRule, c.UpdateRule, c.ColumnName, c.RColumnName}
// the same way handleGetFKsColumnsOracle does for oracleForeignKeyColumn.
type mssqlForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// mssqlForeignKeyColumns mirrors oracleForeignKeyColumns.
func mssqlForeignKeyColumns(db *sql.DB, schema, table, fkName string) ([]mssqlForeignKeyColumn, error) {
	rows, err := db.Query(`
		select rt.name as r_table_name, fk.delete_referential_action_desc, fk.update_referential_action_desc,
		       pc.name as column_name, rc.name as r_column_name
		from sys.foreign_keys fk
		join sys.foreign_key_columns fkc on fkc.constraint_object_id = fk.object_id
		join sys.tables t on t.object_id = fk.parent_object_id
		join sys.schemas s on s.schema_id = t.schema_id
		join sys.tables rt on rt.object_id = fk.referenced_object_id
		join sys.columns pc on pc.object_id = fkc.parent_object_id and pc.column_id = fkc.parent_column_id
		join sys.columns rc on rc.object_id = fkc.referenced_object_id and rc.column_id = fkc.referenced_column_id
		where s.name = @p1 and t.name = @p2 and fk.name = @p3
		order by fkc.constraint_column_id
	`, schema, table, fkName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []mssqlForeignKeyColumn
	for rows.Next() {
		var c mssqlForeignKeyColumn
		if err := rows.Scan(&c.RTableName, &c.DeleteRule, &c.UpdateRule, &c.ColumnName, &c.RColumnName); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// mssqlIndex mirrors oracleIndex's field names.
type mssqlIndex struct {
	Name       string
	Uniqueness string
}

// mssqlIndexes mirrors oracleIndexes. Unlike oracleIndexes (which lists every
// row in ALL_INDEXES, including the index automatically backing a PK/UQ
// constraint — those are already shown under the table's own Primary Keys/
// Uniques tree nodes), this excludes i.is_primary_key/i.is_unique_constraint
// rows: every MSSQL PK/UQ constraint is backed by an implicit unique index of
// the same name, so without this filter each PK/UQ would additionally appear
// a second time, unlabeled, under Indexes.
func mssqlIndexes(db *sql.DB, schema, table string) ([]mssqlIndex, error) {
	rows, err := db.Query(`
		select i.name, case when i.is_unique = 1 then 'UNIQUE' else 'NONUNIQUE' end
		from sys.indexes i
		join sys.tables t on t.object_id = i.object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where s.name = @p1 and t.name = @p2 and i.type > 0 and i.is_primary_key = 0 and i.is_unique_constraint = 0
		order by i.name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []mssqlIndex
	for rows.Next() {
		var idx mssqlIndex
		if err := rows.Scan(&idx.Name, &idx.Uniqueness); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// mssqlIndexColumns mirrors oracleIndexColumns.
func mssqlIndexColumns(db *sql.DB, schema, table, indexName string) ([]string, error) {
	rows, err := db.Query(`
		select c.name
		from sys.indexes i
		join sys.index_columns ic on ic.object_id = i.object_id and ic.index_id = i.index_id
		join sys.columns c on c.object_id = ic.object_id and c.column_id = ic.column_id
		join sys.tables t on t.object_id = i.object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where s.name = @p1 and t.name = @p2 and i.name = @p3
		order by ic.key_ordinal
	`, schema, table, indexName)
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

// mssqlViewColumn mirrors oracleViewColumn's shape as used by
// handleGetViewsColumnsMSSQL — a small enough struct that it lives next to
// the other sys.* introspection helpers rather than in mssql_routines.go.
type mssqlViewColumn struct {
	Name      string
	DataType  string
	MaxLength int64
	Nullable  string
}

// mssqlViewColumns mirrors mssqlColumns (mssql.go) but joins sys.views
// instead of sys.tables, since a view's columns live in the same sys.columns
// catalog keyed by the view's object_id.
func mssqlViewColumns(db *sql.DB, schema, view string) ([]mssqlViewColumn, error) {
	rows, err := db.Query(`
		select c.name,
		       ty.name as data_type,
		       c.max_length,
		       case when c.is_nullable = 1 then 'YES' else 'NO' end as nullable
		from sys.columns c
		join sys.views v on v.object_id = c.object_id
		join sys.schemas s on s.schema_id = v.schema_id
		join sys.types ty on ty.user_type_id = c.user_type_id
		where s.name = @p1 and v.name = @p2
		order by c.column_id
	`, schema, view)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []mssqlViewColumn
	for rows.Next() {
		var c mssqlViewColumn
		if err := rows.Scan(&c.Name, &c.DataType, &c.MaxLength, &c.Nullable); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}
