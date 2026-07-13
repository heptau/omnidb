import os

# OmniDB settings
OMNIDB_VERSION = 'OmniDB 3.4.0'
OMNIDB_SHORT_VERSION = '3.4.0'
DEV_MODE = True
DESKTOP_MODE = False
APP_TOKEN = None
PATH = ''
HOME_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Django settings
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# PRODUCTION: Set these for production deployment
# DEV_MODE = False
# SESSION_COOKIE_SECURE = True
# CSRF_COOKIE_SECURE = True
# ALLOWED_HOSTS = ['your-domain.com', 'www.your-domain.com']
