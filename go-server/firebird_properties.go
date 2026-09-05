package main

import "database/sql"

// firebirdPropertiesFromRow mirrors mssqlPropertiesFromRow/
// oraclePropertiesFromRow/pgPropertiesFromRow — generic single-row-to-
// Property/Value transpose: one row in, one [2]string{column_name,
// formatted_value} pair per column out, in column order.
func firebirdPropertiesFromRow(db *sql.DB, query string, args ...any) ([][2]string, error) {
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var out [][2]string
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		for i, c := range cols {
			out = append(out, [2]string{c, formatSQLValue(values[i])})
		}
	}
	return out, rows.Err()
}

// firebirdPropertiesRelation mirrors mssqlPropertiesObject's role for
// table/view — both live in rdb$relations, distinguished the same way
// firebirdTables/firebirdViews already tell them apart (rdb$view_blr null
// vs not null).
func firebirdPropertiesRelation(db *sql.DB, object string) ([][2]string, error) {
	return firebirdPropertiesFromRow(db, `
		select trim(rdb$relation_name) as "Name",
		       rdb$relation_id as "Relation ID",
		       case when rdb$view_blr is not null then 'VIEW' else 'TABLE' end as "Object Type",
		       rdb$system_flag as "System Object"
		from rdb$relations
		where trim(rdb$relation_name) = ?
	`, object)
}

// firebirdPropertiesFunction mirrors mssqlPropertiesObject's role for
// functions.
func firebirdPropertiesFunction(db *sql.DB, object string) ([][2]string, error) {
	return firebirdPropertiesFromRow(db, `
		select trim(rdb$function_name) as "Name",
		       rdb$function_id as "Function ID",
		       rdb$deterministic_flag as "Deterministic",
		       rdb$system_flag as "System Object"
		from rdb$functions
		where trim(rdb$function_name) = ?
	`, object)
}

// firebirdPropertiesProcedure mirrors mssqlPropertiesObject's role for
// procedures.
func firebirdPropertiesProcedure(db *sql.DB, object string) ([][2]string, error) {
	return firebirdPropertiesFromRow(db, `
		select trim(rdb$procedure_name) as "Name",
		       rdb$procedure_id as "Procedure ID",
		       rdb$procedure_type as "Procedure Type",
		       rdb$system_flag as "System Object"
		from rdb$procedures
		where trim(rdb$procedure_name) = ?
	`, object)
}

// firebirdPropertiesIndex mirrors mssqlPropertiesIndex — indexes aren't rows
// in rdb$relations (they live in rdb$indices, scoped by their owning
// table), so this is a separate query rather than a
// firebirdPropertiesRelation variant.
func firebirdPropertiesIndex(db *sql.DB, table, index string) ([][2]string, error) {
	return firebirdPropertiesFromRow(db, `
		select trim(i.rdb$relation_name) as "Table",
		       trim(i.rdb$index_name) as "Index Name",
		       i.rdb$index_id as "Index ID",
		       case when i.rdb$unique_flag = 1 then 'Yes' else 'No' end as "Unique",
		       case when i.rdb$index_type = 1 then 'DESC' else 'ASC' end as "Sort Order",
		       case when i.rdb$index_inactive = 1 then 'No' else 'Yes' end as "Active"
		from rdb$indices i
		where trim(i.rdb$relation_name) = ? and trim(i.rdb$index_name) = ?
	`, table, index)
}
