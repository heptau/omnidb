package main

import "database/sql"

// mssqlTreeInfo mirrors oracleTreeInfo's map shape (go-server/oracle_treeinfo.go)
// for the keys tree_oracle.js actually reads off v_database_return.
//
// Two groups of Oracle keys are deliberately not carried over:
//   - "express": an Oracle Express Edition licensing-limits flag with no
//     SQL Server equivalent; nothing in this Go slice or the mssql tree
//     frontend needs it.
//   - create_role/alter_role/drop_role, create_tablespace/alter_tablespace/
//     drop_tablespace, create_sequence/alter_sequence/drop_sequence: this
//     phase's mssql tree has no role/tablespace nodes at all (see
//     mssql_handlers.go's package comment) and sequences are out of scope
//     per the migration plan, so there is no context menu that would ever
//     read these keys.
//
// Every remaining Oracle template-constant key (create_table, create_index,
// delete, ...) is kept, mapped to the T-SQL template text defined in
// mssql_templates.go — see that file for the exact "#placeholder#" tokens
// each string carries and why (tree_mssql.js does the actual .replace()
// calls against them, same pattern as tree_oracle.js).
func mssqlTreeInfo(db *sql.DB, database, username string) (map[string]any, error) {
	version, err := mssqlVersion(db)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"v_database":        database,
		"version":           version,
		"v_username":        username,
		"superuser":         mssqlUserSuper(db),
		"create_function":   mssqlTemplateCreateFunction,
		"drop_function":     mssqlTemplateDropFunction,
		"create_procedure":  mssqlTemplateCreateProcedure,
		"drop_procedure":    mssqlTemplateDropProcedure,
		"create_view":       mssqlTemplateCreateView,
		"drop_view":         mssqlTemplateDropView,
		"create_table":      mssqlTemplateCreateTable,
		"alter_table":       mssqlTemplateAlterTable,
		"drop_table":        mssqlTemplateDropTable,
		"create_column":     mssqlTemplateCreateColumn,
		"alter_column":      mssqlTemplateAlterColumn,
		"drop_column":       mssqlTemplateDropColumn,
		"create_primarykey": mssqlTemplateCreatePrimaryKey,
		"drop_primarykey":   mssqlTemplateDropPrimaryKey,
		"create_unique":     mssqlTemplateCreateUnique,
		"drop_unique":       mssqlTemplateDropUnique,
		"create_foreignkey": mssqlTemplateCreateForeignKey,
		"drop_foreignkey":   mssqlTemplateDropForeignKey,
		"create_index":      mssqlTemplateCreateIndex,
		"alter_index":       mssqlTemplateAlterIndex,
		"drop_index":        mssqlTemplateDropIndex,
		"delete":            mssqlTemplateDelete,
	}, nil
}
