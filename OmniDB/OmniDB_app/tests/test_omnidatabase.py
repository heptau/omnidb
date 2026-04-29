from django.test import TestCase
import OmniDB_app.include.OmniDatabase as OmniDatabase
import os
import tempfile


class InstantiateDatabaseTest(TestCase):
    def test_instantiate_postgresql(self):
        db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='postgresql',
            p_server='localhost',
            p_port='5432',
            p_service='testdb',
            p_user='user',
            p_password='pass'
        )
        self.assertIsNotNone(db)
        self.assertEqual(db.v_db_type, 'postgresql')

    def test_instantiate_mysql(self):
        db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='mysql',
            p_server='localhost',
            p_port='3306',
            p_service='testdb',
            p_user='user',
            p_password='pass'
        )
        self.assertIsNotNone(db)
        self.assertEqual(db.v_db_type, 'mysql')

    def test_instantiate_oracle(self):
        db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='oracle',
            p_server='localhost',
            p_port='1521',
            p_service='ORCL',
            p_user='user',
            p_password='pass'
        )
        self.assertIsNotNone(db)
        self.assertEqual(db.v_db_type, 'oracle')

    def test_instantiate_mariadb(self):
        db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='mariadb',
            p_server='localhost',
            p_port='3306',
            p_service='testdb',
            p_user='user',
            p_password='pass'
        )
        self.assertIsNotNone(db)
        self.assertEqual(db.v_db_type, 'mariadb')

    def test_instantiate_sqlite(self):
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
            db_path = tmp.name

        try:
            db = OmniDatabase.Generic.InstantiateDatabase(
                p_db_type='sqlite',
                p_service=db_path
            )
            self.assertIsNotNone(db)
            self.assertEqual(db.v_db_type, 'sqlite')
        finally:
            if os.path.exists(db_path):
                os.remove(db_path)


class SQLiteDatabaseTest(TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.db_path = self.temp_file.name
        self.temp_file.close()
        self.db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='sqlite',
            p_service=self.db_path,
            p_alias='TestDB'
        )

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_connection_properties(self):
        self.assertEqual(self.db.v_alias, 'TestDB')
        self.assertEqual(self.db.v_db_type, 'sqlite')
        self.assertEqual(self.db.v_service, self.db_path)

    def test_has_features(self):
        self.assertTrue(self.db.v_has_primary_keys)
        self.assertTrue(self.db.v_has_foreign_keys)
        self.assertTrue(self.db.v_has_uniques)
        self.assertTrue(self.db.v_has_indexes)
        self.assertTrue(self.db.v_has_triggers)
        self.assertFalse(self.db.v_has_checks)

    def test_ddl_commands(self):
        self.assertIn('rename to', self.db.v_rename_table_command)
        self.assertIn('primary key', self.db.v_create_pk_command)
        self.assertIn('foreign key', self.db.v_create_fk_command)
        self.assertIn('create index', self.db.v_create_index_command)

    def test_table_operations_available(self):
        self.assertTrue(self.db.v_can_rename_table)
        self.assertTrue(self.db.v_can_add_column)
        self.assertFalse(self.db.v_can_rename_column)
        self.assertFalse(self.db.v_can_drop_column)


class SQLiteQueryTest(TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.db_path = self.temp_file.name
        self.temp_file.close()
        self.db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='sqlite',
            p_service=self.db_path
        )

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_create_table(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
        tables = self.db.GetTables()
        self.assertIn('test', [t[0] for t in tables])

    def test_insert_data(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
        self.db.Execute("INSERT INTO test (name) VALUES ('test1')")
        result = self.db.Query('SELECT * FROM test')
        self.assertEqual(len(result.Rows), 1)
        self.assertEqual(result.Rows[0]['name'], 'test1')

    def test_update_data(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
        self.db.Execute("INSERT INTO test (name) VALUES ('test1')")
        self.db.Execute("UPDATE test SET name = 'updated' WHERE id = 1")
        result = self.db.Query('SELECT * FROM test')
        self.assertEqual(result.Rows[0]['name'], 'updated')

    def test_delete_data(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
        self.db.Execute("INSERT INTO test (name) VALUES ('test1')")
        self.db.Execute("DELETE FROM test WHERE id = 1")
        result = self.db.Query('SELECT * FROM test')
        self.assertEqual(len(result.Rows), 0)

    def test_drop_table(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY)')
        self.db.Execute('DROP TABLE test')
        tables = self.db.GetTables()
        self.assertNotIn('test', [t[0] for t in tables])


class SQLiteSchemaTest(TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.db_path = self.temp_file.name
        self.temp_file.close()
        self.db = OmniDatabase.Generic.InstantiateDatabase(
            p_db_type='sqlite',
            p_service=self.db_path
        )

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_get_tables_empty(self):
        tables = self.db.GetTables()
        self.assertEqual(len(tables), 0)

    def test_get_columns(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)')
        columns = self.db.GetColumns('test')
        col_names = [c[0] for c in columns]
        self.assertIn('id', col_names)
        self.assertIn('name', col_names)
        self.assertIn('age', col_names)

    def test_get_primary_keys(self):
        self.db.Execute('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
        pks = self.db.GetPrimaryKeys('test')
        self.assertEqual(pks[0][0], 'id')

    def test_get_foreign_keys(self):
        self.db.Execute('CREATE TABLE parent (id INTEGER PRIMARY KEY)')
        self.db.Execute('CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))')
        fks = self.db.GetForeignKeys('child')
        self.assertEqual(fks[0][3], 'parent')
        self.assertEqual(fks[0][2], 'parent_id')


class TemplateTest(TestCase):
    def test_template_creation(self):
        template = OmniDatabase.SQLite.Template('SELECT * FROM test', OmniDatabase.SQLite.TemplateType.EXECUTE)
        self.assertEqual(template.v_text, 'SELECT * FROM test')
        self.assertEqual(template.v_type, OmniDatabase.SQLite.TemplateType.EXECUTE)

    def test_template_script_type(self):
        template = OmniDatabase.SQLite.Template('CREATE TABLE...', OmniDatabase.SQLite.TemplateType.SCRIPT)
        self.assertEqual(template.v_type, OmniDatabase.SQLite.TemplateType.SCRIPT)