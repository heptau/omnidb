from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
import json


def ajax_request(data):
    return {'data': json.dumps(data)}


class AuthenticationTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_login_with_session(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'testpass123'
            })
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['v_error'])
        self.assertIn('omnidb_session', self.client.session)

    def test_login_wrong_password(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'wrongpassword'
            })
        )
        data = response.json()
        self.assertTrue(data['v_error'])
        self.assertEqual(data['v_data'], -1)

    def test_login_nonexistent_user(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'nonexistent',
                'p_pwd': 'anypass'
            })
        )
        data = response.json()
        self.assertTrue(data['v_error'])
        self.assertEqual(data['v_data'], -1)

    def test_logout_clears_session(self):
        self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'testpass123'
            })
        )
        self.assertIn('omnidb_session', self.client.session)

        self.client.get(reverse('logout'))
        self.assertNotIn('omnidb_session', self.client.session)


class UserCreationTest(TestCase):
    def test_create_user(self):
        user = User.objects.create_user(
            username='newuser',
            email='new@example.com',
            password='newpass123'
        )
        self.assertEqual(user.username, 'newuser')
        self.assertEqual(user.email, 'new@example.com')
        self.assertTrue(user.check_password('newpass123'))

    def test_create_superuser(self):
        superuser = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='adminpass'
        )
        self.assertTrue(superuser.is_superuser)
        self.assertTrue(superuser.is_staff)


class ProtectedViewsTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_workspace_requires_auth(self):
        response = self.client.get(reverse('workspace'))
        self.assertEqual(response.status_code, 302)

    def test_connections_requires_auth(self):
        response = self.client.post(
            reverse('get_connections'),
            data=ajax_request({'p_conn_id_list': []})
        )
        self.assertEqual(response.status_code, 302)

    def test_snippets_requires_auth(self):
        response = self.client.get(reverse('snippets'))
        self.assertEqual(response.status_code, 302)

    def test_monitor_dashboard_requires_auth(self):
        response = self.client.get(reverse('monitor_dashboard'))
        self.assertEqual(response.status_code, 302)

    def test_users_requires_auth(self):
        response = self.client.get(reverse('users'))
        self.assertEqual(response.status_code, 302)


class CSRFProtectionTest(TestCase):
    def setUp(self):
        self.client = Client()

    def test_login_view_no_csrf(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)


class SessionPersistenceTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_session_persists_across_requests(self):
        self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'testpass123'
            })
        )

        response = self.client.get(reverse('workspace'))
        self.assertEqual(response.status_code, 200)

    def test_session_data_structure(self):
        self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'testpass123'
            })
        )

        session = self.client.session
        omnidb_session = session.get('omnidb_session')
        self.assertIsNotNone(omnidb_session)
        self.assertIn('v_user_id', omnidb_session)
        self.assertIn('v_user_name', omnidb_session)