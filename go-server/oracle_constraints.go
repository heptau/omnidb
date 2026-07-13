package main

import "database/sql"

// oraclePrimaryKeys mirrors QueryTablesPrimaryKeys. The inner join adds
// "t.owner = cols.owner" on top of Oracle.py's original join condition —
// without it, a table name that exists under two different owners would
// cross-join their constraint rows together (all_tables t is only used here
// as an existence filter, joined solely on table_name). Matches the owner-
// aware join pattern every other multi-table query in this file already
// uses; a deliberate correctness fix, not a parity gap.
func oraclePrimaryKeys(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select "constraint_name"
		from (
			select `+oracleIdentEq("cons.constraint_name")+` as "constraint_name",
				   `+oracleIdentEq("cols.table_name")+` as "table_name",
				   `+oracleIdentEq("cons.owner")+` as "table_schema"
			from all_constraints cons,
				 all_cons_columns cols,
				 all_tables t
			where cons.constraint_type = 'P'
			  and t.table_name = cols.table_name
			  and t.owner = cols.owner
			  and cons.constraint_name = cols.constraint_name
			  and cons.owner = cols.owner
			order by cons.owner, cols.table_name, cons.constraint_name
		)
		where `+oracleIdentEq(`"table_schema"`)+` = :1
		  and `+oracleIdentEq(`"table_name"`)+` = :2
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

// oraclePrimaryKeyColumns mirrors QueryTablesPrimaryKeysColumns.
func oraclePrimaryKeyColumns(db *sql.DB, schema, table, pkey string) ([]string, error) {
	rows, err := db.Query(`
		select "column_name"
		from (
			select `+oracleIdentEq("cons.constraint_name")+` as "constraint_name",
				   `+oracleIdentEq("cols.table_name")+` as "table_name",
				   `+oracleIdentEq("cols.column_name")+` as "column_name",
				   `+oracleIdentEq("cons.owner")+` as "table_schema"
			from all_constraints cons,
				 all_cons_columns cols,
				 all_tables t
			where cons.constraint_type = 'P'
			  and t.table_name = cols.table_name
			  and t.owner = cols.owner
			  and cons.constraint_name = cols.constraint_name
			  and cons.owner = cols.owner
			order by cons.owner, cols.table_name, cons.constraint_name, cols.position
		)
		where `+oracleIdentEq(`"table_schema"`)+` = :1
		  and `+oracleIdentEq(`"table_name"`)+` = :2
		  and `+oracleIdentEq(`"constraint_name"`)+` = :3
	`, schema, table, pkey)
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

// oracleUniques mirrors QueryTablesUniques — same shape/fix as
// oraclePrimaryKeys, just constraint_type = 'U'.
func oracleUniques(db *sql.DB, schema, table string) ([]string, error) {
	rows, err := db.Query(`
		select "constraint_name"
		from (
			select `+oracleIdentEq("cons.constraint_name")+` as "constraint_name",
				   `+oracleIdentEq("cols.table_name")+` as "table_name",
				   `+oracleIdentEq("cons.owner")+` as "table_schema"
			from all_constraints cons,
				 all_cons_columns cols,
				 all_tables t
			where cons.constraint_type = 'U'
			  and t.table_name = cols.table_name
			  and t.owner = cols.owner
			  and cons.constraint_name = cols.constraint_name
			  and cons.owner = cols.owner
			order by cons.owner, cols.table_name, cons.constraint_name
		)
		where `+oracleIdentEq(`"table_schema"`)+` = :1
		  and `+oracleIdentEq(`"table_name"`)+` = :2
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

// oracleUniqueColumns mirrors QueryTablesUniquesColumns.
func oracleUniqueColumns(db *sql.DB, schema, table, unique string) ([]string, error) {
	rows, err := db.Query(`
		select "column_name"
		from (
			select `+oracleIdentEq("cons.constraint_name")+` as "constraint_name",
				   `+oracleIdentEq("cols.table_name")+` as "table_name",
				   `+oracleIdentEq("cols.column_name")+` as "column_name",
				   `+oracleIdentEq("cons.owner")+` as "table_schema"
			from all_constraints cons,
				 all_cons_columns cols,
				 all_tables t
			where cons.constraint_type = 'U'
			  and t.table_name = cols.table_name
			  and t.owner = cols.owner
			  and cons.constraint_name = cols.constraint_name
			  and cons.owner = cols.owner
			order by cons.owner, cols.table_name, cons.constraint_name, cols.position
		)
		where `+oracleIdentEq(`"table_schema"`)+` = :1
		  and `+oracleIdentEq(`"table_name"`)+` = :2
		  and `+oracleIdentEq(`"constraint_name"`)+` = :3
	`, schema, table, unique)
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

type oracleForeignKey struct {
	ConstraintName string
	RTableName     string
	DeleteRule     string
	UpdateRule     string
}

// oracleForeignKeys mirrors QueryTablesForeignKeys — switched from
// Oracle.py's user_constraints/user_cons_columns to all_constraints/
// all_cons_columns. USER_CONSTRAINTS only ever shows the connecting user's
// own constraints regardless of the owner filter applied on top of it, so
// the original query silently returned nothing for any p_schema other than
// the connected user — inconsistent with the PK/Unique queries in the same
// file, which already correctly use ALL_CONSTRAINTS. Fixed to match.
func oracleForeignKeys(db *sql.DB, schema, table string) ([]oracleForeignKey, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("constraint_info.constraint_name")+` as constraint_name,
			   `+oracleIdentEq("master_table.table_name")+` as r_table_name,
			   constraint_info.delete_rule as delete_rule,
			   'NO ACTION' as update_rule
		from all_constraints constraint_info,
			 all_cons_columns detail_table,
			 all_cons_columns master_table
		where constraint_info.constraint_name = detail_table.constraint_name
		  and constraint_info.owner = detail_table.owner
		  and constraint_info.r_constraint_name = master_table.constraint_name
		  and constraint_info.r_owner = master_table.owner
		  and detail_table.position = master_table.position
		  and constraint_info.constraint_type = 'R'
		  and `+oracleIdentEq("constraint_info.owner")+` = :1
		  and `+oracleIdentEq("detail_table.table_name")+` = :2
		order by constraint_info.constraint_name, detail_table.table_name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fks []oracleForeignKey
	for rows.Next() {
		var fk oracleForeignKey
		if err := rows.Scan(&fk.ConstraintName, &fk.RTableName, &fk.DeleteRule, &fk.UpdateRule); err != nil {
			return nil, err
		}
		fks = append(fks, fk)
	}
	return fks, rows.Err()
}

type oracleForeignKeyColumn struct {
	RTableName  string
	DeleteRule  string
	UpdateRule  string
	ColumnName  string
	RColumnName string
}

// oracleForeignKeyColumns mirrors QueryTablesForeignKeysColumns, same
// all_constraints/all_cons_columns fix as oracleForeignKeys.
func oracleForeignKeyColumns(db *sql.DB, schema, table, fkey string) ([]oracleForeignKeyColumn, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("master_table.table_name")+` as r_table_name,
			   constraint_info.delete_rule as delete_rule,
			   'NO ACTION' as update_rule,
			   `+oracleIdentEq("detail_table.column_name")+` as column_name,
			   `+oracleIdentEq("master_table.column_name")+` as r_column_name
		from all_constraints constraint_info,
			 all_cons_columns detail_table,
			 all_cons_columns master_table
		where constraint_info.constraint_name = detail_table.constraint_name
		  and constraint_info.owner = detail_table.owner
		  and constraint_info.r_constraint_name = master_table.constraint_name
		  and constraint_info.r_owner = master_table.owner
		  and detail_table.position = master_table.position
		  and constraint_info.constraint_type = 'R'
		  and `+oracleIdentEq("constraint_info.owner")+` = :1
		  and `+oracleIdentEq("detail_table.table_name")+` = :2
		  and `+oracleIdentEq("constraint_info.constraint_name")+` = :3
		order by constraint_info.constraint_name, detail_table.table_name, detail_table.position
	`, schema, table, fkey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []oracleForeignKeyColumn
	for rows.Next() {
		var c oracleForeignKeyColumn
		if err := rows.Scan(&c.RTableName, &c.DeleteRule, &c.UpdateRule, &c.ColumnName, &c.RColumnName); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

type oracleIndex struct {
	Name       string
	Uniqueness string
}

// oracleIndexes mirrors QueryTablesIndexes.
func oracleIndexes(db *sql.DB, schema, table string) ([]oracleIndex, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("index_name")+` as index_name,
			   case when uniqueness = 'UNIQUE' then 'Unique' else 'Non Unique' end as uniqueness
		from all_indexes
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("table_name")+` = :2
		order by owner, table_name, index_name
	`, schema, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var indexes []oracleIndex
	for rows.Next() {
		var idx oracleIndex
		if err := rows.Scan(&idx.Name, &idx.Uniqueness); err != nil {
			return nil, err
		}
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// oracleIndexColumns mirrors QueryTablesIndexesColumns.
func oracleIndexColumns(db *sql.DB, schema, table, index string) ([]string, error) {
	rows, err := db.Query(`
		select `+oracleIdentEq("c.column_name")+` as column_name
		from all_indexes t,
			 all_ind_columns c
		where t.table_name = c.table_name
		  and t.index_name = c.index_name
		  and t.owner = c.index_owner
		  and `+oracleIdentEq("t.owner")+` = :1
		  and `+oracleIdentEq("t.table_name")+` = :2
		  and `+oracleIdentEq("t.index_name")+` = :3
		order by c.column_position
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
