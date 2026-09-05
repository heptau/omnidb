package main

import "database/sql"

// firebirdTreeInfo mirrors mssqlTreeInfo's map shape (go-server/mssql_treeinfo.go)
// for the keys tree_firebird.js actually reads off v_database_return.
//
// No role/tablespace/sequence keys here either, same reasoning as
// mssqlTreeInfo's own comment — this port's firebird tree has no nodes for
// any of those (Firebird does have sequences/generators, but they're out of
// scope here for the same "mirror MSSQL's depth, not invent new nodes MSSQL
// doesn't have" reason the task scope calls out).
func firebirdTreeInfo(db *sql.DB, database, username string) (map[string]any, error) {
	version, err := firebirdVersion(db)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"v_database":        database,
		"version":           version,
		"v_username":        username,
		"superuser":         firebirdUserSuper(db),
		"create_function":   firebirdTemplateCreateFunction,
		"drop_function":     firebirdTemplateDropFunction,
		"create_procedure":  firebirdTemplateCreateProcedure,
		"drop_procedure":    firebirdTemplateDropProcedure,
		"create_view":       firebirdTemplateCreateView,
		"drop_view":         firebirdTemplateDropView,
		"create_table":      firebirdTemplateCreateTable,
		"alter_table":       firebirdTemplateAlterTable,
		"drop_table":        firebirdTemplateDropTable,
		"create_column":     firebirdTemplateCreateColumn,
		"alter_column":      firebirdTemplateAlterColumn,
		"drop_column":       firebirdTemplateDropColumn,
		"create_primarykey": firebirdTemplateCreatePrimaryKey,
		"drop_primarykey":   firebirdTemplateDropPrimaryKey,
		"create_unique":     firebirdTemplateCreateUnique,
		"drop_unique":       firebirdTemplateDropUnique,
		"create_foreignkey": firebirdTemplateCreateForeignKey,
		"drop_foreignkey":   firebirdTemplateDropForeignKey,
		"create_index":      firebirdTemplateCreateIndex,
		"alter_index":       firebirdTemplateAlterIndex,
		"drop_index":        firebirdTemplateDropIndex,
		"delete":            firebirdTemplateDelete,
	}, nil
}
