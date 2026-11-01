from django.conf import settings
from django.db import models


class Event(models.Model):
    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        PREPARING = "preparing", "Preparing"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="events")
    choir = models.ForeignKey("choirs.Choir", on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=180)
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    venue = models.CharField(max_length=180, blank=True)
    description = models.TextField(blank=True)
    preparation_deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPCOMING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("date", "start_time", "id")
        indexes = [models.Index(fields=("user", "date"), name="event_user_date_idx")]

    def __str__(self):
        return self.title


class EventSong(models.Model):
    class Purpose(models.TextChoices):
        OPENING = "opening", "Opening"
        WORSHIP = "worship", "Worship"
        COMMUNION = "communion", "Communion"
        CLOSING = "closing", "Closing"
        SPECIAL_MUSIC = "special_music", "Special Music"
        OTHER = "other", "Other"

    class PreparationStatus(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        LEARNING = "learning", "Learning"
        PRACTICED = "practiced", "Practiced"
        READY = "ready", "Ready"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="lineup")
    song = models.ForeignKey("songs.Song", on_delete=models.PROTECT, related_name="event_entries")
    position = models.PositiveIntegerField()
    purpose = models.CharField(max_length=24, choices=Purpose.choices, default=Purpose.OTHER)
    assigned_voice_part = models.CharField(max_length=60, blank=True)
    special_instructions = models.TextField(blank=True)
    practice_notes = models.TextField(blank=True)
    preparation_status = models.CharField(max_length=16, choices=PreparationStatus.choices, default=PreparationStatus.NOT_STARTED)

    class Meta:
        ordering = ("position", "id")
        constraints = [
            models.UniqueConstraint(fields=("event", "song"), name="unique_song_per_event"),
            models.UniqueConstraint(fields=("event", "position"), name="unique_event_lineup_position"),
        ]

    def __str__(self):
        return f"{self.position}. {self.song.title} — {self.event.title}"
