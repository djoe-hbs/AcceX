from django.apps import AppConfig


class WorkConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core.work'
    label = 'core_work'

    def ready(self):
        import core.work.signals  # noqa: F401
