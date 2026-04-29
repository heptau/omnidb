from django.test import TestCase
from django.contrib.auth.models import User
from OmniDB_app.models import (
    Technology, UserDetails, Shortcut, Connection,
    SnippetFolder, SnippetFile, Tab, QueryHistory,
    ConsoleHistory, Group, GroupConnection, MonUnits,
    MonUnitsConnections, Config
)
from django.utils import timezone
from datetime import timedelta


class TechnologyModelTest(TestCase):
    def test_create_technology(self):
        tech = Technology.objects.create(name='PostgreSQL')
        self.assertEqual(tech.name, 'PostgreSQL')

    def test_technology_multiple_same_name(self):
        tech1 = Technology.objects.create(name='MySQL')
        tech2 = Technology.objects.create(name='MySQL')
        self.assertNotEqual(tech1.id, tech2.id)


class UserDetailsModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

    def test_create_user_details(self):
        details = UserDetails.objects.create(
            user=self.user,
            theme='dark',
            font_size=14,
            csv_encoding='utf-8',
            csv_delimiter=','
        )
        self.assertEqual(details.theme, 'dark')
        self.assertEqual(details.font_size, 14)
        self.assertEqual(details.csv_encoding, 'utf-8')
        self.assertEqual(details.csv_delimiter, ',')

    def test_user_details_defaults(self):
        details = UserDetails.objects.create(user=self.user)
        self.assertEqual(details.theme, 'light')
        self.assertEqual(details.font_size, 12)
        self.assertEqual(details.csv_encoding, 'utf-8')
        self.assertEqual(details.csv_delimiter, ';')
        self.assertFalse(details.welcome_closed)


class ShortcutModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_create_shortcut(self):
        shortcut = Shortcut.objects.create(
            user=self.user,
            code='execute_query',
            os='mac',
            ctrl_pressed=True,
            key='Enter'
        )
        self.assertEqual(shortcut.code, 'execute_query')
        self.assertEqual(shortcut.os, 'mac')
        self.assertTrue(shortcut.ctrl_pressed)
        self.assertEqual(shortcut.key, 'Enter')

    def test_shortcut_without_user(self):
        shortcut = Shortcut.objects.create(
            code='global_shortcut',
            os='linux',
            key='F5'
        )
        self.assertIsNone(shortcut.user)


class ConnectionModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tech = Technology.objects.create(name='PostgreSQL')

    def test_create_connection(self):
        conn = Connection.objects.create(
            user=self.user,
            technology=self.tech,
            server='localhost',
            port='5432',
            database='testdb',
            username='dbuser',
            password='dbpass',
            alias='Test DB'
        )
        self.assertEqual(conn.server, 'localhost')
        self.assertEqual(conn.port, '5432')
        self.assertEqual(conn.database, 'testdb')
        self.assertEqual(conn.username, 'dbuser')
        self.assertEqual(conn.alias, 'Test DB')

    def test_connection_defaults(self):
        conn = Connection.objects.create(
            user=self.user,
            technology=self.tech,
            alias='Test'
        )
        self.assertFalse(conn.use_tunnel)
        self.assertFalse(conn.public)
        self.assertEqual(conn.server, '')
        self.assertEqual(conn.port, '')

    def test_connection_with_ssh_tunnel(self):
        conn = Connection.objects.create(
            user=self.user,
            technology=self.tech,
            alias='SSH DB',
            use_tunnel=True,
            ssh_server='ssh.example.com',
            ssh_port='22',
            ssh_user='sshuser',
            ssh_password='sshpass'
        )
        self.assertTrue(conn.use_tunnel)
        self.assertEqual(conn.ssh_server, 'ssh.example.com')
        self.assertEqual(conn.ssh_port, '22')


class SnippetFolderModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_create_snippet_folder(self):
        now = timezone.now()
        folder = SnippetFolder.objects.create(
            user=self.user,
            name='My Snippets',
            create_date=now,
            modify_date=now
        )
        self.assertEqual(folder.name, 'My Snippets')
        self.assertEqual(folder.user, self.user)

    def test_snippet_folder_with_parent(self):
        now = timezone.now()
        parent = SnippetFolder.objects.create(
            user=self.user,
            name='Parent',
            create_date=now,
            modify_date=now
        )
        child = SnippetFolder.objects.create(
            user=self.user,
            parent=parent,
            name='Child',
            create_date=now,
            modify_date=now
        )
        self.assertEqual(child.parent, parent)


class SnippetFileModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.folder = SnippetFolder.objects.create(
            user=self.user,
            name='Test Folder',
            create_date=timezone.now(),
            modify_date=timezone.now()
        )

    def test_create_snippet_file(self):
        now = timezone.now()
        snippet = SnippetFile.objects.create(
            user=self.user,
            parent=self.folder,
            name='query.sql',
            create_date=now,
            modify_date=now,
            text='SELECT * FROM users;'
        )
        self.assertEqual(snippet.name, 'query.sql')
        self.assertEqual(snippet.text, 'SELECT * FROM users;')


class QueryHistoryModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tech = Technology.objects.create(name='PostgreSQL')
        self.conn = Connection.objects.create(
            user=self.user,
            technology=self.tech,
            alias='Test'
        )

    def test_create_query_history(self):
        now = timezone.now()
        history = QueryHistory.objects.create(
            user=self.user,
            connection=self.conn,
            start_time=now,
            end_time=now + timedelta(seconds=2),
            duration='2.0s',
            status='success',
            snippet='SELECT 1;'
        )
        self.assertEqual(history.status, 'success')
        self.assertEqual(history.snippet, 'SELECT 1;')


class GroupModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_create_group(self):
        group = Group.objects.create(
            user=self.user,
            name='My Group'
        )
        self.assertEqual(group.name, 'My Group')

    def test_group_connection_unique_constraint(self):
        group = Group.objects.create(user=self.user, name='Test')
        tech = Technology.objects.create(name='TestTech')
        conn = Connection.objects.create(
            user=self.user,
            technology=tech,
            alias='Test'
        )
        GroupConnection.objects.create(group=group, connection=conn)

        with self.assertRaises(Exception):
            GroupConnection.objects.create(group=group, connection=conn)


class MonUnitsModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tech = Technology.objects.create(name='PostgreSQL')

    def test_create_monitoring_unit(self):
        unit = MonUnits.objects.create(
            user=self.user,
            technology=self.tech,
            script_chart='chart_script',
            script_data='data_script',
            type='chart',
            title='Test Chart',
            is_default=False,
            interval=30
        )
        self.assertEqual(unit.title, 'Test Chart')
        self.assertEqual(unit.interval, 30)
        self.assertFalse(unit.is_default)

    def test_monitoring_unit_defaults(self):
        unit = MonUnits.objects.create(
            user=self.user,
            technology=self.tech,
            title='Default Unit',
            is_default=False
        )
        self.assertFalse(unit.is_default)
        self.assertEqual(unit.interval, 60)


class ConfigModelTest(TestCase):
    def test_create_config(self):
        config = Config.objects.create(mig_2_to_3_done=True)
        self.assertTrue(config.mig_2_to_3_done)

    def test_config_default_false(self):
        config = Config.objects.create()
        self.assertFalse(config.mig_2_to_3_done)