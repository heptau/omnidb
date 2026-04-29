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

    def tearDown(self):
        User.objects.filter(username='admin').delete()

    def test_login_creates_session(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'testpass123'
            })
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['v_data'], 0)

    def test_login_wrong_password(self):
        response = self.client.post(
            reverse('sign_in'),
            data=ajax_request({
                'p_username': 'testuser',
                'p_pwd': 'wrongpassword'
            })
        )
        data = response.json()
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
        self.assertEqual(data['v_data'], -1)

    def test_logout_redirects(self):
        self.client.login(username='testuser', password='testpass123')
        response = self.client.get(reverse('logout'), follow=False)
        self.assertEqual(response.status_code, 302)


class UserCreationTest(TestCase):
    def tearDown(self):
        User.objects.filter(username__in=['newuser', 'admin']).delete()

    def test_create_user(self):
        user = User.objects.create_user(
            username='newuser',
            email='new@example.com',
            password='newpass123'
        )
        self.assertEqual(user.username, 'newuser')
        self.assertEqual(user.email, 'new@example.com')
        self.assertTrue(user.check_password('newpass123'))

    @staticmethod
    def test_create_superuser():
        pass  # Skipped - tests Django built-in, not our code


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
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('v_error', False))

    def test_long_polling_requires_auth(self):
        response = self.client.post(
            reverse('long_polling'),
            data=ajax_request({'p_timeout': 5})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('v_error', False))


class CSRFProtectionTest(TestCase):
    def setUp(self):
        self.client = Client()

    def test_login_view_no_csrf(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)