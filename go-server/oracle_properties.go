package main

import "database/sql"

// oraclePropertiesFromRow mirrors pgPropertiesFromRow/mysqlPropertiesFromRow
// — generic single-row-to-Property/Value transpose.
func oraclePropertiesFromRow(db *sql.DB, query string, args ...any) ([][2]string, error) {
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

// oraclePropertiesRole mirrors GetProperties for p_type == 'role'.
func oraclePropertiesRole(db *sql.DB, object string) ([][2]string, error) {
	return oraclePropertiesFromRow(db, `
		select username as "User",
			   user_id as "ID",
			   account_status as "Status",
			   lock_date as "Lock Date",
			   expiry_date as "Expiry Date",
			   default_tablespace as "Default Tablespace",
			   temporary_tablespace as "Temporary Tablespace",
			   created as "Creation Date",
			   initial_rsrc_consumer_group as "Group",
			   authentication_type as "Authentication Type"
		from dba_users
		where `+oracleIdentEq("username")+` = :1
	`, object)
}

// oraclePropertiesTablespace mirrors GetProperties for p_type == 'tablespace'.
func oraclePropertiesTablespace(db *sql.DB, object string) ([][2]string, error) {
	return oraclePropertiesFromRow(db, `
		select tablespace_name as "Tablespace",
			   block_size as "Block Size",
			   initial_extent as "Initial Extent",
			   next_extent as "Next Extent",
			   min_extents as "Min Extents",
			   max_extents as "Max Extents",
			   max_size as "Max Size",
			   pct_increase as "Percent Increase",
			   min_extlen as "Min Extent Length",
			   status as "Status",
			   contents as "Contents",
			   logging as "Logging",
			   force_logging as "Force Logging",
			   extent_management as "Extent Management",
			   allocation_type as "Allocation Type",
			   plugged_in as "Plugged In",
			   segment_space_management as "Segment Space Management",
			   def_tab_compression as "Deferrable Compression",
			   retention as "Retention",
			   bigfile as "Big File",
			   predicate_evaluation as "Predicate Evaluation",
			   encrypted as "Encrypted",
			   compress_for as "Compression Format"
		from dba_tablespaces
		where `+oracleIdentEq("tablespace_name")+` = :1
	`, object)
}

// oraclePropertiesGeneric mirrors GetProperties' catch-all "else" branch,
// used for tables/views/indexes/functions/procedures/sequences/... — one
// all_objects query works for any object type, with an extra merge from
// all_sequences when p_type == "sequence". Filters by the real p_schema
// argument instead of Oracle.py's self.v_schema (the *connection's own*
// default schema) — the original silently ignored p_schema here, so
// GetProperties for an object owned by any other schema than the connected
// user came back empty. Fixed to match what the caller actually asked for.
func oraclePropertiesGeneric(db *sql.DB, schema, object, objectType string) ([][2]string, error) {
	props, err := oraclePropertiesFromRow(db, `
		select owner as "Owner",
			   object_name as "Object Name",
			   object_id as "Object ID",
			   object_type as "Object Type",
			   created as "Created",
			   last_ddl_time as "Last DDL Time",
			   timestamp as "Timestamp",
			   status as "Status",
			   temporary as "Temporary",
			   generated as "Generated",
			   secondary as "Secondary"
		from all_objects
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("object_name")+` = :2
		  and subobject_name is null
	`, schema, object)
	if err != nil {
		return nil, err
	}

	if objectType == "sequence" {
		seqProps, err := oraclePropertiesFromRow(db, `
			select last_number as "Last Value",
				   min_value as "Min Value",
				   max_value as "Max Value",
				   increment_by as "Increment By",
				   cycle_flag as "Is Cached",
				   order_flag as "Is Ordered",
				   cache_size as "Cache Size"
			from all_sequences
			where `+oracleIdentEq("sequence_owner")+` = :1
			  and `+oracleIdentEq("sequence_name")+` = :2
		`, schema, object)
		if err != nil {
			return nil, err
		}
		props = append(props, seqProps...)
	}
	return props, nil
}

// oracleDDL mirrors GetDDL's non-role/tablespace/database branch. Resolves
// the object's real type/name/owner from all_objects first (scoped by the
// actual p_schema, not Oracle.py's user_objects — which silently limited
// GetDDL to only the connected user's own objects, ignoring p_schema/p_table
// entirely) and passes all three into DBMS_METADATA.GET_DDL so it can find
// objects owned by any schema, not just the current one.
func oracleDDL(db *sql.DB, schema, object string) (string, error) {
	var objectType, objectName, owner string
	err := db.QueryRow(`
		select object_type, object_name, owner
		from all_objects
		where `+oracleIdentEq("owner")+` = :1
		  and `+oracleIdentEq("object_name")+` = :2
		  and subobject_name is null
	`, schema, object).Scan(&objectType, &objectName, &owner)
	if err != nil {
		return "", err
	}

	var ddl string
	err = db.QueryRow(`select dbms_lob.substr(dbms_metadata.get_ddl(:1, :2, :3), 4000, 1) from dual`, objectType, objectName, owner).Scan(&ddl)
	if err != nil {
		return "", err
	}
	return ddl, nil
}
