from .settings_base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Email: uses SMTP backend from .env (Gmail).
# To fall back to console output, uncomment the line below:
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
