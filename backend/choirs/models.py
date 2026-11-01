from django.conf import settings
from django.db import models


class Choir(models.Model):
    class Voice(models.TextChoices):
        SOPRANO = "soprano", "Soprano"
        ALTO = "alto", "Alto"
        TENOR = "tenor", "Tenor"
        BASS = "bass", "Bass"
        CUSTOM = "custom", "Custom"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="choirs")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#728b72")
    voice_classification = models.CharField(max_length=16, choices=Voice.choices, default=Voice.CUSTOM)
    custom_voice = models.CharField(max_length=60, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "id")
        constraints = [models.UniqueConstraint(fields=("user", "name"), name="unique_choir_name_per_user")]
        indexes = [models.Index(fields=("user", "name"), name="choir_user_name_idx")]

    def __str__(self):
        return self.name
