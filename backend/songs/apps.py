from django.apps import AppConfig


class SongsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "songs"

    def ready(self):
        from . import signals  # noqa: F401
