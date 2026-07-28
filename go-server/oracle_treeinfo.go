package main

import "database/sql"

// DDL wizard templates shown in the tree's "create/alter/drop" context menu
// actions — static hint text copied verbatim from Oracle.py's Template*
// methods.
const (
	oracleTemplateCreateRole = "CREATE { ROLE | USER } name\n--NOT IDENTIFIED\n--IDENTIFIED BY password\n--DEFAULT TABLESPACE tablespace\n--TEMPORARY TABLESPACE tablespace\n--QUOTA { size | UNLIMITED } ON tablespace\n--PASSWORD EXPIRE\n--ACCOUNT { LOCK | UNLOCK }\n"
	oracleTemplateAlterRole  = "ALTER { ROLE | USER } #role_name#\n--NOT IDENTIFIED\n--IDENTIFIED BY password\n--DEFAULT TABLESPACE tablespace\n--TEMPORARY TABLESPACE tablespace\n--QUOTA { size | UNLIMITED } ON tablespace\n--DEFAULT ROLE { role [, role ] ... | ALL [ EXCEPT role [, role ] ... ] | NONE }\n--PASSWORD EXPIRE\n--ACCOUNT { LOCK | UNLOCK }\n"
	oracleTemplateDropRole   = "DROP { ROLE | USER } #role_name#\n--CASCADE\n"

	oracleTemplateCreateTablespace = "CREATE { SMALLFILE | BIGFILE }\n[ TEMPORARY | UNDO ] TABLESPACE name\n[ DATAFILE | TEMPFILE ] 'filename' [ SIZE size ] [ REUSE ]\n--AUTOEXTEND OFF | AUTOEXTEND ON [ NEXT size ]\n--MAXSIZE [ size | UNLIMITED ]\n--MINIMUM EXTENT size\n--BLOCKSIZE size\n--LOGGING | NOLOGGING | FORCE LOGGING\n--ENCRYPTION [ USING 'algorithm' ]\n--ONLINE | OFFLINE\n--EXTENT MANAGEMENT LOCAL { AUTOALLOCATE | UNIFORM [ SIZE size ] }\n--SEGMENT SPACE MANAGEMENT { AUTO | MANUAL }\n--FLASHBACK { ON | OFF }\n--RETENTION { GUARANTEE | NOGUARANTEE }\n"
	oracleTemplateAlterTablespace  = "ALTER TABLESPACE #tablespace_name#\n--MINIMUM EXTENT size\n--RESIZE size\n--COALESCE\n--SHRINK SPACE [ KEEP size ]\n--RENAME TO new_name\n--[ BEGIN | END ] BACKUP\n--ADD [ DATAFILE | TEMPFILE ] 'filename' [ SIZE size ] [ REUSE AUTOEXTEND OFF | AUTOEXTEND ON [ NEXT size ] ] [ MAXSIZE [ size | UNLIMITED ] ]\n--DROP [ DATAFILE | TEMPFILE ] 'filename'\n--SHRINK TEMPFILE 'filename' [ KEEP size ]\n--RENAME DATAFILE 'filename' TO 'new_filename'\n--[ DATAFILE | TEMPFILE ] [ ONLINE | OFFLINE ]\n--[ NO ] FORCE LOGGING\n--ONLINE\n--OFFLINE [ NORMAL | TEMPORARY | IMMEDIATE ]\n--READ [ ONLY | WRITE ]\n--PERMANENT | TEMPORARY\n--AUTOEXTEND OFF | AUTOEXTEND ON [ NEXT size ]\n--MAXSIZE [ size | UNLIMITED ]\n--FLASHBACK { ON | OFF }\n--RETENTION { GUARANTEE | NOGUARANTEE }\n"
	oracleTemplateDropTablespace   = "DROP TABLESPACE #tablespace_name#\n--INCLUDING CONTENTS\n--[ AND | KEEP ] DATAFILES\n--CASCADE CONSTRAINTS\n"

	oracleTemplateCreateSequence = "CREATE SEQUENCE #schema_name#.name\n--INCREMENT BY increment\n--MINVALUE minvalue | NOMINVALUE\n--MAXVALUE maxvalue | NOMAXVALUE\n--START WITH start\n--CACHE cache | NOCACHE\n--CYCLE | NOCYCLE\n--ORDER | NOORDER\n"
	oracleTemplateAlterSequence  = "ALTER SEQUENCE #sequence_name#\n--INCREMENT BY increment\n--MINVALUE minvalue | NOMINVALUE\n--MAXVALUE maxvalue | NOMAXVALUE\n--CACHE cache | NOCACHE\n--CYCLE | NOCYCLE\n--ORDER | NOORDER\n"
	oracleTemplateDropSequence   = "DROP SEQUENCE #sequence_name#"

	oracleTemplateCreateFunction = "CREATE OR REPLACE FUNCTION #schema_name#.name\n--(\n--    [ argmode ] [ argname ] argtype [ { DEFAULT | = } default_expr ]\n--)\n--RETURN rettype\n--PIPELINED\nAS\n-- variables\n-- pragmas\nBEGIN\n-- definition\nEND;\n"
	oracleTemplateDropFunction   = "DROP FUNCTION #function_name#"

	oracleTemplateCreateProcedure = "CREATE OR REPLACE PROCEDURE #schema_name#.name\n--(\n--    [ argmode ] [ argname ] argtype [ { DEFAULT | = } default_expr ]\n--)\nAS\n-- variables\n-- pragmas\nBEGIN\n-- definition\nEND;\n"
	oracleTemplateDropProcedure   = "DROP PROCEDURE #function_name#"

	oracleTemplateCreateView = "CREATE OR REPLACE VIEW #schema_name#.name AS\nSELECT ...\n"
	oracleTemplateDropView   = "DROP VIEW #view_name#\n--CASCADE CONSTRAINTS\n"

	oracleTemplateCreateTable = "CREATE\n--GLOBAL TEMPORARY\nTABLE #schema_name#.table_name\n--AS query\n(\n\tcolumn_name data_type\n\t--SORT\n\t--DEFAULT expr\n\t--ENCRYPT [ USING 'encrypt_algorithm' ] [ IDENTIFIED BY password ] [ [NO] SALT ]\n\t--CONSTRAINT constraint_name\n\t--NOT NULL\n\t--NULL\n\t--UNIQUE\n\t--PRIMARY KEY\n\t--REFERENCES reftable [ ( refcolumn ) ] [ ON DELETE { CASCADE | SET NULL } ]\n\t--CHECK ( condition )\n\t--DEFERRABLE\n\t--NOT DEFERRABLE\n\t--INITIALLY IMMEDIATE\n\t--INITIALLY DEFERRED\n\t--ENABLE\n\t--DISABLE\n\t--VALIDATE\n\t--NOVALIDATE\n\t--RELY\n\t--NORELY\n\t--USING INDEX index_name\n)\n--ON COMMIT DELETE ROWS\n--ON COMMIT PRESERVE ROWS\n--PCTFREE integer\n--PCTUSED integer\n--INITRANS integer\n--STORAGE ( { [ INITIAL size_clause ] | [ NEXT size_clause ] | [ MINEXTENTS integer ] | [ MAXEXTENTS { integer | UNLIMITED } ] } )\n--TABLESPACE tablespace\n--LOGGING\n--NOLOGGING\n--COMPRESS\n--NOCOMPRESS\n--SCOPE IS scope_table\n--WITH ROWID\n--SCOPE FOR ( { refcol | refattr } ) IS scope_table\n--REF ( { refcol | refattr } ) WITH ROWID\n--GROUP log_group ( column [ NO LOG ] ) [ ALWAYS ]\n--DATA ( { ALL | PRIMARY KEY | UNIQUE | FOREIGN KEY } ) COLUMNS\n"
	oracleTemplateAlterTable  = "ALTER TABLE #table_name#\n--ADD column_name data_type\n--MODIFY (column_name [ data_type ] )\n--SORT\n--DEFAULT expr\n--ENCRYPT [ USING 'encrypt_algorithm' ] [ IDENTIFIED BY password ] [ [NO] SALT ]\n--CONSTRAINT constraint_name\n--NOT NULL\n--NULL\n--UNIQUE\n--PRIMARY KEY\n--REFERENCES reftable [ ( refcolumn ) ] [ ON DELETE { CASCADE | SET NULL } ]\n--CHECK ( condition )\n--DEFERRABLE\n--NOT DEFERRABLE\n--INITIALLY IMMEDIATE\n--INITIALLY DEFERRED\n--ENABLE\n--DISABLE\n--VALIDATE\n--NOVALIDATE\n--RELY\n--NORELY\n--USING INDEX index_name\n--SET UNUSED COLUMN column [ { CASCADE CONSTRAINTS | INVALIDADE } ]\n--DROP COLUMN column [ { CASCADE CONSTRAINTS | INVALIDADE } ] [ CHECKPOINT integer ]\n--DROP { UNUSED COLUMNS | COLUMNS CONTINUE } [ CHECKPOINT integer ]\n--RENAME COLUMN old_name TO new_name\n--ADD CONSTRAINT constraint_name\n--NOT NULL\n--NULL\n--UNIQUE\n--PRIMARY KEY\n--REFERENCES reftable [ ( refcolumn ) ] [ ON DELETE { CASCADE | SET NULL } ]\n--CHECK ( condition )\n--MODIFY [ CONSTRAINT constraint_name ] [ PRIMARY KEY ] [ UNIQUE ( column ) ]\n--DEFERRABLE\n--NOT DEFERRABLE\n--INITIALLY IMMEDIATE\n--INITIALLY DEFERRED\n--ENABLE\n--DISABLE\n--VALIDATE\n--NOVALIDATE\n--RELY\n--NORELY\n--USING INDEX index_name\n--RENAME CONSTRAINT old_name TO new_name\n--DROP PRIMARY KEY [ CASCADE ] [ { KEEP | DROP } INDEX ]\n--DROP UNIQUE ( column ) [ CASCADE ] [ { KEEP | DROP } INDEX ]\n--DROP CONSTRAINT constraint_name [ CASCADE ]\n--PCTFREE integer\n--PCTUSED integer\n--INITRANS integer\n--STORAGE ( { [ INITIAL size_clause ] | [ NEXT size_clause ] | [ MINEXTENTS integer ] | [ MAXEXTENTS { integer | UNLIMITED } ] } )\n--TABLESPACE tablespace\n--LOGGING\n--NOLOGGING\n--COMPRESS\n--NOCOMPRESS\n--CACHE\n--NOCACHE\n--READ ONLY\n--READ WRITE\n--SCOPE IS scope_table\n--WITH ROWID\n--SCOPE FOR ( { refcol | refattr } ) IS scope_table\n--REF ( { refcol | refattr } ) WITH ROWID\n--GROUP log_group ( column [ NO LOG ] ) [ ALWAYS ]\n--DATA ( { ALL | PRIMARY KEY | UNIQUE | FOREIGN KEY } ) COLUMNS\n--NOPARALLEL\n--PARALLEL integer\n"
	oracleTemplateDropTable   = "DROP TABLE #table_name#\n--CASCADE CONSTRAINTS\n--PURGE\n"

	oracleTemplateCreateColumn = "ALTER TABLE #table_name#\nADD name data_type\n--SORT\n--DEFAULT expr\n--NOT NULL\n"
	oracleTemplateAlterColumn  = "ALTER TABLE #table_name#\n--MODIFY #column_name# { datatype | DEFAULT expr | [ NULL | NOT NULL ]}\n--RENAME COLUMN #column_name# TO new_name\n"
	oracleTemplateDropColumn   = "ALTER TABLE #table_name#\nDROP COLUMN #column_name#\n--CASCADE CONSTRAINTS\n--INVALIDATE\n"

	oracleTemplateCreatePrimaryKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nPRIMARY KEY ( column_name [, ... ] )\n--[ NOT ] DEFERRABLE\n--INITIALLY { IMMEDIATE | DEFERRED }\n--RELY | NORELY\n--USING INDEX index_name\n--ENABLE\n--DISABLE\n--VALIDATE\n--NOVALIDATE\n--EXCEPTIONS INTO table_name\n"
	oracleTemplateDropPrimaryKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#\n--CASCADE\n"

	oracleTemplateCreateUnique = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nUNIQUE ( column_name [, ... ] )\n--[ NOT ] DEFERRABLE\n--INITIALLY { IMMEDIATE | DEFERRED }\n--RELY | NORELY\n--USING INDEX index_name\n--ENABLE\n--DISABLE\n--VALIDATE\n--NOVALIDATE\n--EXCEPTIONS INTO table_name\n"
	oracleTemplateDropUnique   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#\n--CASCADE\n"

	oracleTemplateCreateForeignKey = "ALTER TABLE #table_name#\nADD CONSTRAINT name\nFOREIGN KEY ( column_name [, ... ] )\nREFERENCES reftable [ ( refcolumn [, ... ] ) ]\n--[ NOT ] DEFERRABLE\n--INITIALLY { IMMEDIATE | DEFERRED }\n--RELY | NORELY\n--USING INDEX index_name\n--ENABLE\n--DISABLE\n--VALIDATE\n--NOVALIDATE\n--EXCEPTIONS INTO table_name\n"
	oracleTemplateDropForeignKey   = "ALTER TABLE #table_name#\nDROP CONSTRAINT #constraint_name#\n--CASCADE\n"

	oracleTemplateCreateIndex = "CREATE [ UNIQUE ] INDEX name\nON #table_name#\n( { column_name | ( expression ) } [ ASC | DESC ] )\n--ONLINE\n--TABLESPACE tablespace\n--[ SORT | NOSORT ]\n--REVERSE\n--[ VISIBLE | INVISIBLE ]\n--[ NOPARALLEL | PARALLEL integer ]\n"
	oracleTemplateAlterIndex  = "ALTER INDEX #index_name#\n--COMPILE\n--[ ENABLE | DISABLE ]\n--UNUSABLE\n--[ VISIBLE | INVISIBLE ]\n--RENAME TO new_name\n--COALESCE\n--[ MONITORING | NOMONITORING ] USAGE\n--UPDATE BLOCK REFERENCES\n"
	oracleTemplateDropIndex   = "DROP INDEX #index_name#\n--FORCE\n"

	oracleTemplateDelete = "DELETE FROM #table_name#\nWHERE condition\n"
)

// oracleTreeInfo mirrors tree_oracle.py's get_tree_info: database name,
// version, username/superuser/express flags, and the static DDL wizard
// templates.
func oracleTreeInfo(db *sql.DB, service, username string) (map[string]any, error) {
	version, err := oracleVersion(db)
	if err != nil {
		return nil, err
	}
	express, err := oracleExpress(db)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"v_database":        oracleServiceUpper(service),
		"version":           version,
		"v_username":        username,
		"superuser":         oracleUserSuper(db),
		"express":           express,
		"create_role":       oracleTemplateCreateRole,
		"alter_role":        oracleTemplateAlterRole,
		"drop_role":         oracleTemplateDropRole,
		"create_tablespace": oracleTemplateCreateTablespace,
		"alter_tablespace":  oracleTemplateAlterTablespace,
		"drop_tablespace":   oracleTemplateDropTablespace,
		"create_sequence":   oracleTemplateCreateSequence,
		"alter_sequence":    oracleTemplateAlterSequence,
		"drop_sequence":     oracleTemplateDropSequence,
		"create_function":   oracleTemplateCreateFunction,
		"drop_function":     oracleTemplateDropFunction,
		"create_procedure":  oracleTemplateCreateProcedure,
		"drop_procedure":    oracleTemplateDropProcedure,
		"create_view":       oracleTemplateCreateView,
		"drop_view":         oracleTemplateDropView,
		"create_table":      oracleTemplateCreateTable,
		"alter_table":       oracleTemplateAlterTable,
		"drop_table":        oracleTemplateDropTable,
		"create_column":     oracleTemplateCreateColumn,
		"alter_column":      oracleTemplateAlterColumn,
		"drop_column":       oracleTemplateDropColumn,
		"create_primarykey": oracleTemplateCreatePrimaryKey,
		"drop_primarykey":   oracleTemplateDropPrimaryKey,
		"create_unique":     oracleTemplateCreateUnique,
		"drop_unique":       oracleTemplateDropUnique,
		"create_foreignkey": oracleTemplateCreateForeignKey,
		"drop_foreignkey":   oracleTemplateDropForeignKey,
		"create_index":      oracleTemplateCreateIndex,
		"alter_index":       oracleTemplateAlterIndex,
		"drop_index":        oracleTemplateDropIndex,
		"delete":            oracleTemplateDelete,
	}, nil
}
