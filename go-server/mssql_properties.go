package main

import "database/sql"

// mssqlPropertiesFromRow mirrors oraclePropertiesFromRow/pgPropertiesFromRow/
// mysqlPropertiesFromRow — generic single-row-to-Property/Value transpose:
// one row in, one [2]string{column_name, formatted_value} pair per column
// out, in column order.
func mssqlPropertiesFromRow(db *sql.DB, query string, args ...any) ([][2]string, error) {
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

// mssqlPropertiesObject mirrors oraclePropertiesGeneric's catch-all branch,
// used for table/view/function/procedure — one sys.objects query works for
// any of those, mirroring the property depth Oracle's own generic branch
// exposes (owner/name/id/type/created/... rather than an exhaustive list of
// every engine-specific attribute).
func mssqlPropertiesObject(db *sql.DB, schema, object string) ([][2]string, error) {
	return mssqlPropertiesFromRow(db, `
		select s.name as "Schema",
		       o.name as "Object Name",
		       o.object_id as "Object ID",
		       o.type_desc as "Object Type",
		       o.create_date as "Created",
		       o.modify_date as "Last Modified",
		       o.is_ms_shipped as "System Object"
		from sys.objects o
		join sys.schemas s on s.schema_id = o.schema_id
		where s.name = @p1 and o.name = @p2
	`, schema, object)
}

// mssqlPropertiesIndex mirrors oraclePropertiesGeneric's role for the
// "index" object type — indexes aren't rows in sys.objects (they live in
// sys.indexes, scoped by their owning table), so this is a separate query
// rather than a mssqlPropertiesObject variant.
func mssqlPropertiesIndex(db *sql.DB, schema, table, index string) ([][2]string, error) {
	return mssqlPropertiesFromRow(db, `
		select s.name as "Schema",
		       t.name as "Table",
		       i.name as "Index Name",
		       i.index_id as "Index ID",
		       i.type_desc as "Index Type",
		       case when i.is_unique = 1 then 'Yes' else 'No' end as "Unique",
		       case when i.is_primary_key = 1 then 'Yes' else 'No' end as "Primary Key",
		       case when i.is_unique_constraint = 1 then 'Yes' else 'No' end as "Unique Constraint",
		       i.fill_factor as "Fill Factor"
		from sys.indexes i
		join sys.tables t on t.object_id = i.object_id
		join sys.schemas s on s.schema_id = t.schema_id
		where s.name = @p1 and t.name = @p2 and i.name = @p3
	`, schema, table, index)
}
