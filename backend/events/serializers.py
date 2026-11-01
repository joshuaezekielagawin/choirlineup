from django.db.models import Max
from rest_framework import serializers

from choirs.models import Choir
from songs.models import Song

from .models import Event, EventSong


class EventSongViewSerializer(serializers.ModelSerializer):
    song = serializers.SerializerMethodField()

    class Meta:
        model = EventSong
        fields = (
            "id", "song", "position", "purpose", "assigned_voice_part", "special_instructions",
            "practice_notes", "preparation_status",
        )
        read_only_fields = fields

    def get_song(self, entry):
        return {"id": entry.song_id, "title": entry.song.title, "composer_artist": entry.song.composer_artist}


class EventSongSerializer(serializers.ModelSerializer):
    song = serializers.SerializerMethodField()
    song_id = serializers.PrimaryKeyRelatedField(source="song", queryset=Song.objects.none(), write_only=True)

    class Meta:
        model = EventSong
        fields = (
            "id", "song", "song_id", "position", "purpose", "assigned_voice_part", "special_instructions",
            "practice_notes", "preparation_status",
        )
        read_only_fields = ("id", "position")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["song_id"].queryset = Song.objects.filter(user=request.user)
        if self.instance:
            self.fields["song_id"].read_only = True

    def get_song(self, entry):
        return {"id": entry.song_id, "title": entry.song.title, "composer_artist": entry.song.composer_artist}

    def validate(self, attrs):
        event = self.context["event"]
        song = attrs.get("song", getattr(self.instance, "song", None))
        if song and EventSong.objects.filter(event=event, song=song).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError({"song_id": "This song is already in the event lineup."})
        return attrs

    def create(self, validated_data):
        event = self.context["event"]
        last_position = event.lineup.aggregate(position=Max("position"))["position"]
        entry = EventSong.objects.create(event=event, position=1 if last_position is None else last_position + 1, **validated_data)
        return entry


class ChoirSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Choir
        fields = ("id", "name", "color")


class EventSerializer(serializers.ModelSerializer):
    choir = ChoirSummarySerializer(read_only=True)
    choir_id = serializers.PrimaryKeyRelatedField(source="choir", queryset=Choir.objects.none(), write_only=True)
    lineup = EventSongViewSerializer(many=True, read_only=True)
    lineup_count = serializers.SerializerMethodField()
    ready_count = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id", "title", "choir", "choir_id", "date", "start_time", "end_time", "venue", "description",
            "preparation_deadline", "status", "lineup", "lineup_count", "ready_count", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["choir_id"].queryset = Choir.objects.filter(user=request.user)

    def get_lineup_count(self, event):
        return len(event.lineup.all())

    def get_ready_count(self, event):
        return sum(entry.preparation_status == EventSong.PreparationStatus.READY for entry in event.lineup.all())

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter an event title.")
        return value

    def validate(self, attrs):
        event_date = attrs.get("date", getattr(self.instance, "date", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        deadline = attrs.get("preparation_deadline", getattr(self.instance, "preparation_deadline", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be later than start time."})
        if deadline and event_date and deadline > event_date:
            raise serializers.ValidationError({"preparation_deadline": "The preparation deadline must be on or before the event date."})
        return attrs

    def create(self, validated_data):
        return Event.objects.create(user=self.context["request"].user, **validated_data)


class ReorderLineupSerializer(serializers.Serializer):
    event_song_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=True)

    def validate_event_song_ids(self, values):
        if len(values) != len(set(values)):
            raise serializers.ValidationError("Each lineup entry must appear exactly once.")
        return values
