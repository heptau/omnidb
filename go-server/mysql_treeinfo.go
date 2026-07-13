package main

import "database/sql"

// DDL wizard templates shown in the tree's "create/alter/drop" context menu
// actions — static hint text copied verbatim from MySQL.py's Template*
// methods (MariaDB.py's are identical for all of these; the handful of
// MariaDB-only extras like sequences aren't wired into any Go route, same
// deferral as Postgres's sequences/functions/etc.).
const (
	mysqlTemplateCreateRole = "CREATE USER name\n-- IDENTIFIED BY password\n-- REQUIRE NONE\n-- REQUIRE SSL\n-- REQUIRE X509\n-- REQUIRE CIPHER 'cipher'\n-- REQUIRE ISSUER 'issuer'\n-- REQUIRE SUBJECT 'subject'\n-- WITH MAX_QUERIES_PER_HOUR count\n-- WITH MAX_UPDATES_PER_HOUR count\n-- WITH MAX_CONNECTIONS_PER_HOUR count\n-- WITH MAX_USER_CONNECTIONS count\n-- PASSWORD EXPIRE\n-- ACCOUNT { LOCK | UNLOCK }\n"
	mysqlTemplateAlterRole  = "ALTER USER #role_name#\n-- IDENTIFIED BY password\n-- REQUIRE NONE\n-- REQUIRE SSL\n-- REQUIRE X509\n-- REQUIRE CIPHER 'cipher'\n-- REQUIRE ISSUER 'issuer'\n-- REQUIRE SUBJECT 'subject'\n-- WITH MAX_QUERIES_PER_HOUR count\n-- WITH MAX_UPDATES_PER_HOUR count\n-- WITH MAX_CONNECTIONS_PER_HOUR count\n-- WITH MAX_USER_CONNECTIONS count\n-- PASSWORD EXPIRE\n-- ACCOUNT { LOCK | UNLOCK }\n-- RENAME USER #role_name# TO new_name\n-- SET PASSWORD FOR #role_name# = password\n"
	mysqlTemplateDropRole   = "DROP USER #role_name#"

	mysqlTemplateCreateDatabase = "CREATE DATABASE name\n-- CHARACTER SET charset\n-- COLLATE collate\n"
	mysqlTemplateAlterDatabase  = "ALTER DATABASE #database_name#\n-- CHARACTER SET charset\n-- COLLATE collate\n"
	mysqlTemplateDropDatabase   = "DROP DATABASE #database_name#"

	mysqlTemplateCreateFunction = "CREATE FUNCTION #schema_name#.name\n(\n-- argname argtype\n)\nRETURNS rettype\nBEGIN\n-- DECLARE variables\n-- definition\n-- RETURN variable | value\nEND;\n"
	mysqlTemplateDropFunction   = "DROP FUNCTION #function_name#"

	mysqlTemplateCreateProcedure = "CREATE PROCEDURE #schema_name#.name\n(\n-- [argmode] argname argtype\n)\nBEGIN\n-- DECLARE variables\n-- definition\nEND;\n"
	mysqlTemplateDropProcedure   = "DROP PROCEDURE #function_name#"

	mysqlTemplateCreateView = "CREATE OR REPLACE VIEW #schema_name#.name AS\nSELECT ...\n"
	mysqlTemplateDropView   = "DROP VIEW #view_name#\n-- RESTRICT\n-- CASCADE\n"

	mysqlTemplateCreateTable = "CREATE\n-- TEMPORARY\nTABLE #schema_name#.table_name\n-- AS query\n(\n\tcolumn_name data_type\n\t-- NOT NULL\n\t-- NULL\n\t-- DEFAULT default_value\n\t-- AUTO_INCREMENT\n\t-- UNIQUE\n\t-- PRIMARY KEY\n\t-- COMMENT 'string'\n\t-- COLUMN_FORMAT { FIXED | DYNAMIC | DEFAULT }\n\t-- STORAGE { DISK | MEMORY | DEFAULT }\n\t-- [ GENERATED ALWAYS ] AS (expression) [ VIRTUAL | STORED ]\n\t-- [ CONSTRAINT [ symbol ] ] PRIMARY KEY [ USING { BTREE | HASH } ] ( column_name, ... )\n\t-- { INDEX | KEY } [ index_name ] [ USING { BTREE | HASH } ] ( column_name, ... )\n\t-- [ CONSTRAINT [ symbol ] ] UNIQUE [ INDEX | KEY ] [ index_name ] [ USING { BTREE | HASH } ] ( column_name, ... )\n\t-- { FULLTEXT | SPATIAL } [ INDEX | KEY ] [ index_name ] [ USING { BTREE | HASH } ] ( column_name, ... )\n\t-- [ CONSTRAINT [ symbol ] ] FOREIGN KEY [ index_name ]  ( column_name, ... ) REFERENCES reftable ( refcolumn, ... ) [MATCH FULL | MATCH PARTIAL | MATCH SIMPLE] [ON DELETE { RESTRICT | CASCADE | SET NULL | NO ACTION | SET DEFAULT }] [ON UPDATE { RESTRICT | CASCADE | SET NULL | NO ACTION | SET DEFAULT }]\n\t-- CHECK ( expr )\n)\n-- AUTO_INCREMENT value\n-- AVG_ROW_LENGTH value\n-- [ DEFAULT ] CHARACTER SET charset_name\n-- CHECKSUM { 0 | 1 }\n-- [ DEFAULT ] COLLATE collation_name\n-- COMMENT 'string'\n-- COMPRESSION { 'ZLIB' | 'LZ4' | 'NONE' }\n-- CONNECTION 'connect_string'\n-- { DATA | INDEX } DIRECTORY 'absolute path to directory'\n-- DELAY_KEY_WRITE { 0 | 1 }\n-- ENCRYPTION { 'Y' | 'N' }\n-- ENGINE engine_name\n-- INSERT_METHOD { NO | FIRST | LAST }\n-- KEY_BLOCK_SIZE value\n-- MAX_ROWS value\n-- MIN_ROWS value\n-- PACK_KEYS { 0 | 1 | DEFAULT }\n-- PASSWORD 'string'\n-- ROW_FORMAT { DEFAULT | DYNAMIC | FIXED | COMPRESSED | REDUNDANT | COMPACT }\n-- STATS_AUTO_RECALC { DEFAULT | 0 | 1 }\n-- STATS_PERSISTENT { DEFAULT | 0 | 1 }\n-- STATS_SAMPLE_PAGES value\n-- TABLESPACE tablespace_name [STORAGE { DISK | MEMORY | DEFAULT } ]\n"
	mysqlTemplateAlterTable  = "ALTER TABLE #table_name#\n-- ADD [ COLUMN ] col_name column_definition  [ FIRST | AFTER col_name ]\n-- ADD [ COLUMN ] ( col_name column_definition , ... )\n-- ADD { INDEX | KEY } [ index_name ] USING { BTREE | HASH } (index_col_name , ... )\n-- ADD [ CONSTRAINT [ symbol ] ] PRIMARY KEY USING { BTREE | HASH } ( index_col_name , ... )\n-- ADD [ CONSTRAINT [ symbol ] ] UNIQUE [ INDEX | KEY ] [ index_name ] USING { BTREE | HASH } ( index_col_name , ... )\n-- ADD FULLTEXT [ INDEX | KEY ] ( index_col_name , ... )\n-- ADD SPATIAL [ INDEX | KEY ] [ index_name ] (index_col_name , ... )\n-- ADD [ CONSTRAINT [ symbol ] ] FOREIGN KEY [ index_name ] ( index_col_name , ... ) reference_definition\n-- ALGORITHM { DEFAULT | INPLACE | COPY }\n-- ALTER [ COLUMN ] col_name { SET DEFAULT literal | DROP DEFAULT }\n-- CHANGE [ COLUMN ] old_col_name new_col_name column_definition [ FIRST | AFTER col_name ]\n-- [DEFAULT] CHARACTER SET charset_name [ COLLATE collation_name ]\n-- CONVERT TO CHARACTER SET charset_name [ COLLATE collation_name ]\n-- { DISABLE | ENABLE } KEYS\n-- { DISCARD | IMPORT } TABLESPACE\n-- DROP [ COLUMN ] col_name\n-- DROP { INDEX | KEY } index_name\n-- DROP PRIMARY KEY\n-- DROP FOREIGN KEY fk_symbol\n-- FORCE\n-- LOCK { DEFAULT | NONE | SHARED | EXCLUSIVE }\n-- MODIFY [ COLUMN ] col_name column_definition [ FIRST | AFTER col_name ]\n-- ORDER BY col_name [, col_name] ...\n-- RENAME { INDEX | KEY } old_index_name TO new_index_name\n-- RENAME [ TO | AS ] new_tbl_name\n-- { WITHOUT | WITH } VALIDATION\n-- ADD PARTITION ( partition_definition )\n-- DROP PARTITION partition_names\n-- DISCARD PARTITION { partition_names | ALL } TABLESPACE\n-- IMPORT PARTITION { partition_names | ALL } TABLESPACE\n-- TRUNCATE PARTITION { partition_names | ALL }\n-- COALESCE PARTITION number\n-- REORGANIZE PARTITION partition_names INTO ( partition_definitions )\n-- EXCHANGE PARTITION partition_name WITH TABLE tbl_name [ { WITH | WITHOUT } VALIDATION ]\n-- ANALYZE PARTITION { partition_names | ALL }\n-- CHECK PARTITION { partition_names | ALL }\n-- OPTIMIZE PARTITION { partition_names | ALL }\n-- REBUILD PARTITION { partition_names | ALL }\n-- REPAIR PARTITION { partition_names | ALL }\n-- REMOVE PARTITIONING\n-- UPGRADE PARTITIONING\n-- AUTO_INCREMENT value\n-- AVG_ROW_LENGTH value\n-- [ DEFAULT ] CHARACTER SET charset_name\n-- CHECKSUM { 0 | 1 }\n-- [ DEFAULT ] COLLATE collation_name\n-- COMMENT 'string'\n-- COMPRESSION { 'ZLIB' | 'LZ4' | 'NONE' }\n-- CONNECTION 'connect_string'\n-- { DATA | INDEX } DIRECTORY 'absolute path to directory'\n-- DELAY_KEY_WRITE { 0 | 1 }\n-- ENCRYPTION { 'Y' | 'N' }\n-- ENGINE engine_name\n-- INSERT_METHOD { NO | FIRST | LAST }\n-- KEY_BLOCK_SIZE value\n-- MAX_ROWS value\n-- MIN_ROWS value\n-- PACK_KEYS { 0 | 1 | DEFAULT }\n-- PASSWORD 'string'\n-- ROW_FORMAT { DEFAULT | DYNAMIC | FIXED | COMPRESSED | REDUNDANT | COMPACT }\n-- STATS_AUTO_RECALC { DEFAULT | 0 | 1 }\n-- STATS_PERSISTENT { DEFAULT | 0 | 1 }\n-- STATS_SAMPLE_PAGES value\n-- TABLESPACE tablespace_name [STORAGE { DISK | MEMORY | DEFAULT } ]\n"
	mysqlTemplateDropTable   = "DROP TABLE #table_name#\n-- RESTRICT\n-- CASCADE\n"

	mysqlTemplateCreateColumn = "ALTER TABLE #table_name#\nADD name data_type\n--DEFAULT expr\n--NOT NULL\n"
	mysqlTemplateAlterColumn  = "ALTER TABLE #table_name#\n-- ALTER #column_name# { datatype | DEFAULT expr | [ NULL | NOT NULL ]}\n-- CHANGE COLUMN #column_name# TO new_name\n"
	mysqlTemplateDropColumn   = "ALTER TABLE #table_name#\nDROP COLUMN #column_name#\n"

	mysqlTemplateCreatePrimaryKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nPRIMARY KEY ( column_name [, ... ] )\n"
	mysqlTemplateDropPrimaryKey   = "ALTER TABLE #table_name#\nDROP PRIMARY KEY #constraint_name#\n--CASCADE\n"

	mysqlTemplateCreateUnique = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nUNIQUE ( column_name [, ... ] )\n"
	mysqlTemplateDropUnique   = "ALTER TABLE #table_name#\nDROP #constraint_name#\n"

	mysqlTemplateCreateForeignKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nFOREIGN KEY ( column_name [, ... ] )\nREFERENCES reftable [ ( refcolumn [, ... ] ) ]\n"
	mysqlTemplateDropForeignKey   = "ALTER TABLE #table_name#\nDROP FOREIGN KEY #constraint_name#\n"

	mysqlTemplateCreateIndex = "CREATE [ UNIQUE ] INDEX name\nON #table_name#\n( { column_name | ( expression ) } [ ASC | DESC ] )\n"
	mysqlTemplateDropIndex   = "DROP INDEX #index_name#"

	mysqlTemplateDelete = "DELETE FROM #table_name#\nWHERE condition\n"
)

// mysqlTreeInfo mirrors tree_mysql.py's get_tree_info: database name,
// version, username/superuser flag, and the static DDL wizard templates.
func mysqlTreeInfo(db *sql.DB, databaseName, technology string) (map[string]any, error) {
	version, err := mysqlVersion(db, technology)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"v_database":        databaseName,
		"version":           version,
		"create_role":       mysqlTemplateCreateRole,
		"alter_role":        mysqlTemplateAlterRole,
		"drop_role":         mysqlTemplateDropRole,
		"create_database":   mysqlTemplateCreateDatabase,
		"alter_database":    mysqlTemplateAlterDatabase,
		"drop_database":     mysqlTemplateDropDatabase,
		"create_function":   mysqlTemplateCreateFunction,
		"drop_function":     mysqlTemplateDropFunction,
		"create_procedure":  mysqlTemplateCreateProcedure,
		"drop_procedure":    mysqlTemplateDropProcedure,
		"create_view":       mysqlTemplateCreateView,
		"drop_view":         mysqlTemplateDropView,
		"create_table":      mysqlTemplateCreateTable,
		"alter_table":       mysqlTemplateAlterTable,
		"drop_table":        mysqlTemplateDropTable,
		"create_column":     mysqlTemplateCreateColumn,
		"alter_column":      mysqlTemplateAlterColumn,
		"drop_column":       mysqlTemplateDropColumn,
		"create_primarykey": mysqlTemplateCreatePrimaryKey,
		"drop_primarykey":   mysqlTemplateDropPrimaryKey,
		"create_unique":     mysqlTemplateCreateUnique,
		"drop_unique":       mysqlTemplateDropUnique,
		"create_foreignkey": mysqlTemplateCreateForeignKey,
		"drop_foreignkey":   mysqlTemplateDropForeignKey,
		"create_index":      mysqlTemplateCreateIndex,
		"drop_index":        mysqlTemplateDropIndex,
		"delete":            mysqlTemplateDelete,
	}, nil
}
