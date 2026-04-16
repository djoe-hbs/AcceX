from .settings_base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Used for local development to avoid 500 error when sending invoice emails
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
