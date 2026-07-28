package main

import "database/sql"

// mysqlPrimaryKeys mirrors MySQL.py's/MariaDB.py's QueryTablesPrimaryKeys —
// MySQL has no named PK constraints, so OmniDB synthesizes "pk_<table>" the
// same way SQLite.py's Go port does.
func mysqlPrimaryKeys(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select distinct concat('pk_', t.table_name) as constraint_name
		from information_schema.table_constraints t
		where t.constraint_type = 'PRIMARY KEY'
		  and t.table_schema = ?
		  and t.table_name = ?
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

// mysqlPrimaryKeyColumns mirrors QueryTablesPrimaryKeysColumns.
func mysqlPrimaryKeyColumns(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select distinct k.column_name, k.ordinal_position
		from information_schema.table_constraints t
		join information_schema.key_column_usage k
		using (constraint_name, table_schema, table_name)
		where t.constraint_type = 'PRIMARY KEY'
		  and t.table_schema = ?
		  and t.table_name = ?
		order by k.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		var ordinal int
		if err := rows.Scan(&c, &ordinal); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

type mysqlForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
}

// mysqlForeignKeys mirrors QueryTablesForeignKeys.
func mysqlForeignKeys(db *sql.DB, schema, table string) ([]mysqlForeignKey, error) {
	rows, err := db.Query(`
		select distinct i.constraint_name,
			   i.table_name,
			   k.referenced_table_name as r_table_name,
			   r.update_rule,
			   r.delete_rule
		from information_schema.table_constraints i
		left join information_schema.key_column_usage k on i.constraint_name = k.constraint_name and i.table_schema = k.table_schema
		left join information_schema.referential_constraints r on i.constraint_name = r.constraint_name and i.table_schema = r.constraint_schema
		where i.constraint_type = 'FOREIGN KEY'
		  and i.table_schema = ?
		  and i.table_name = ?
		order by i.constraint_name, i.table_name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []mysqlForeignKey
	for rows.Next() {
		var fk mysqlForeignKey
		var tableName string
		if err := rows.Scan(&fk.ConstraintName, &tableName, &fk.RTableName, &fk.UpdateRule, &fk.DeleteRule); err != nil {
			return nil, err
		}
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

type mysqlForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// mysqlForeignKeyColumns mirrors QueryTablesForeignKeysColumns.
func mysqlForeignKeyColumns(db *sql.DB, schema, table, fkey string) ([]mysqlForeignKeyColumn, error) {
	rows, err := db.Query(`
		select distinct k.referenced_table_name as r_table_name,
			   r.update_rule,
			   r.delete_rule,
			   k.column_name,
			   k.referenced_column_name as r_column_name,
			   k.ordinal_position
		from information_schema.table_constraints i
		left join information_schema.key_column_usage k on i.constraint_name = k.constraint_name and i.table_schema = k.table_schema
		left join information_schema.referential_constraints r on i.constraint_name = r.constraint_name and i.table_schema = r.constraint_schema
		where i.constraint_type = 'FOREIGN KEY'
		  and i.table_schema = ?
		  and i.table_name = ?
		  and i.constraint_name = ?
		order by k.ordinal_position
	`, schema, table, fkey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []mysqlForeignKeyColumn
	for rows.Next() {
		var c mysqlForeignKeyColumn
		var ordinal sql.NullInt64
		if err := rows.Scan(&c.RTableName, &c.UpdateRule, &c.DeleteRule, &c.ColumnName, &c.RColumnName, &ordinal); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// mysqlUniques mirrors QueryTablesUniques.
func mysqlUniques(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select distinct t.constraint_name
		from information_schema.table_constraints t
		where t.constraint_type = 'UNIQUE'
		  and t.table_schema = ?
		  and t.table_name = ?
		order by t.constraint_name
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

// mysqlUniqueColumns mirrors QueryTablesUniquesColumns.
func mysqlUniqueColumns(db *sql.DB, schema, table, unique string) ([]string, error) {
	rows, err := db.Query(`
		select distinct k.column_name, k.ordinal_position
		from information_schema.table_constraints t
		join information_schema.key_column_usage k
		using (constraint_name, table_schema, table_name)
		where t.constraint_type = 'UNIQUE'
		  and t.table_schema = ?
		  and t.table_name = ?
		  and t.constraint_name = ?
		order by k.ordinal_position
	`, schema, table, unique)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		var ordinal int
		if err := rows.Scan(&c, &ordinal); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

type mysqlIndex struct {
	Name       string
	Uniqueness string
}

// mysqlIndexes mirrors QueryTablesIndexes — MySQL's PRIMARY index is
// renamed to "pk_<table>" the same way the synthesized PK constraint name
// is, so it doesn't collide with (and duplicate) the PK entry in the tree.
func mysqlIndexes(db *sql.DB, schema, table string) ([]mysqlIndex, error) {
	rows, err := db.Query(`
		select distinct
			(case when t.index_name = 'PRIMARY' then concat('pk_', t.table_name) else t.index_name end) as index_name,
			case when t.non_unique = 1 then 'Non Unique' else 'Unique' end as uniqueness
		from information_schema.statistics t
		where t.table_schema = ?
		  and t.table_name = ?
		order by index_name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []mysqlIndex
	for rows.Next() {
		var idx mysqlIndex
		if err := rows.Scan(&idx.Name, &idx.Uniqueness); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// mysqlIndexColumns mirrors QueryTablesIndexesColumns.
func mysqlIndexColumns(db *sql.DB, schema, table, index string) ([]string, error) {
	rows, err := db.Query(`
		select distinct t.column_name, t.seq_in_index
		from information_schema.statistics t
		where t.table_schema = ?
		  and t.table_name = ?
		  and (case when t.index_name = 'PRIMARY' then concat('pk_', t.table_name) else t.index_name end) = ?
		order by t.seq_in_index
	`, schema, table, index)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var c string
		var seq int
		if err := rows.Scan(&c, &seq); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}
