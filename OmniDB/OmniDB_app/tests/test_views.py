from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
import json
from OmniDB_app.models import Technology, Connection


def ajax_request(data):
    return {'data': json.dumps(data)}


class LoginViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_login_page_loads(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)

    def test_login_redirects_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('login'), follow=True)
        self.assertRedirects(response, reverse('workspace'))

    def test_sign_in_invalid_credentials(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({'p_username': 'invalid', 'p_pwd': 'invalid'})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['v_error'])
        self.assertEqual(data['v_data'], -1)

    def test_sign_in_valid_credentials(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({'p_username': 'testuser', 'p_pwd': 'testpass123'})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['v_error'])

    def test_logout(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('logout'), follow=True)
        self.assertRedirects(response, reverse('login'))


class WorkspaceViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_workspace_requires_login(self):
        response = self.client.get(reverse('workspace'))
        self.assertEqual(response.status_code, 302)

    def test_workspace_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('workspace'))
        self.assertEqual(response.status_code, 200)


class ConnectionViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tech = Technology.objects.create(name='PostgreSQL')
        self.conn = Connection.objects.create(
            user=self.user,
            technology=self.tech,
            server='localhost',
            port='5432',
            database='testdb',
            alias='Test DB'
        )

    def test_get_connections_requires_login(self):
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        self.assertEqual(response.status_code, 302)

    def test_get_connections_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['v_error'])

    def test_get_connections_own_only(self):
        other_user = User.objects.create_user(username='other', password='otherpass')
        Connection.objects.create(
            user=other_user,
            technology=self.tech,
            alias='Other DB'
        )

        self.client.login(username='testuser', password='testpass123')
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        data = response.json()
        connections = data['v_data']['v_conn_list']
        own_aliases = [c['alias'] for c in connections]
        self.assertIn('Test DB', own_aliases)
        self.assertNotIn('Other DB', own_aliases)

    def test_get_connections_includes_public(self):
        Connection.objects.create(
            user=self.user,
            technology=self.tech,
            alias='Public DB',
            public=True
        )

        self.client.login(username='testuser', password='testpass123')
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        data = response.json()
        connections = data['v_data']['v_conn_list']
        aliases = [c['alias'] for c in connections]
        self.assertIn('Public DB', aliases)


class TechnologyViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        Technology.objects.create(name='PostgreSQL')
        Technology.objects.create(name='MySQL')

    def test_get_technologies(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        data = response.json()
        techs = data['v_data']['v_technologies']
        self.assertIn('PostgreSQL', techs)
        self.assertIn('MySQL', techs)


class SnippetViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_snippets_requires_login(self):
        response = self.client.get(reverse('snippets'))
        self.assertEqual(response.status_code, 302)

    def test_snippets_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('snippets'))
        self.assertEqual(response.status_code, 200)


class MonitoringViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_monitor_dashboard_requires_login(self):
        response = self.client.get(reverse('monitor_dashboard'))
        self.assertEqual(response.status_code, 302)

    def test_monitor_dashboard_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('monitor_dashboard'))
        self.assertEqual(response.status_code, 200)


class UsersViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_users_requires_login(self):
        response = self.client.get(reverse('users'))
        self.assertEqual(response.status_code, 302)

    def test_users_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('users'))
        self.assertEqual(response.status_code, 200)


class TreeViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_tree_requires_login(self):
        response = self.client.post(
            reverse('tree'),
            data=ajax_request({})
        )
        self.assertEqual(response.status_code, 302)


class PollingViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_polling_requires_login(self):
        response = self.client.post(
            reverse('long_polling'),
            data=ajax_request({})
        )
        self.assertEqual(response.status_code, 302)

    def test_polling_authenticated_empty(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.post(
            reverse('long_polling'),
            data=ajax_request({'p_timeout': 5})
        )
        self.assertEqual(response.status_code, 200)