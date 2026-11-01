from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.db import models


class SongCategory(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="song_categories")
    name = models.CharField(max_length=60)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name", "id")
        constraints = [models.UniqueConstraint(fields=("user", "name"), name="unique_song_category_per_user")]

    def __str__(self):
        return self.name


class Song(models.Model):
    class Voice(models.TextChoices):
        SOPRANO = "soprano", "Soprano"
        ALTO = "alto", "Alto"
        TENOR = "tenor", "Tenor"
        BASS = "bass", "Bass"
        CUSTOM = "custom", "Custom"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="songs")
    title = models.CharField(max_length=180)
    composer_artist = models.CharField(max_length=180, blank=True)
    language = models.CharField(max_length=60, blank=True)
    musical_key = models.CharField(max_length=24, blank=True)
    description = models.TextField(blank=True)
    voice_classification = models.CharField(max_length=16, choices=Voice.choices, blank=True)
    categories = models.ManyToManyField(SongCategory, blank=True, related_name="songs")
    choirs = models.ManyToManyField("choirs.Choir", through="SongChoir", blank=True, related_name="songs")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("title", "id")
        indexes = [models.Index(fields=("user", "title"), name="song_user_title_idx")]

    def __str__(self):
        return self.title


class SongChoir(models.Model):
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    choir = models.ForeignKey("choirs.Choir", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("song", "choir"), name="unique_song_choir_link")]


def attachment_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"song_materials/{instance.song.user_id}/{instance.song_id}/{uuid4().hex}{extension}"


class SongAttachment(models.Model):
    class Kind(models.TextChoices):
        PDF = "pdf", "PDF sheet music"
        IMAGE = "image", "Image page"
        YOUTUBE = "youtube", "YouTube link"
        VIDEO = "video", "Uploaded video"

    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name="attachments")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    title = models.CharField(max_length=160, blank=True)
    file = models.FileField(upload_to=attachment_path, blank=True)
    url = models.URLField(blank=True, max_length=500)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("position", "id")
        indexes = [models.Index(fields=("song", "position"), name="attachment_song_pos_idx")]

    def __str__(self):
        return self.title or self.get_kind_display()


class MaterialViewingProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="material_viewing_progress")
    attachment = models.ForeignKey(SongAttachment, on_delete=models.CASCADE, related_name="viewing_progress")
    last_page = models.PositiveIntegerField(default=1)
    video_position = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "attachment"), name="unique_user_material_progress")]
        indexes = [models.Index(fields=("user", "updated_at"), name="viewprogress_user_idx")]

    def __str__(self):
        return f"{self.user_id}: {self.attachment_id}"
