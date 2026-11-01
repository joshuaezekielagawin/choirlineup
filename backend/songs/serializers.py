import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Max
from rest_framework import serializers

from choirs.models import Choir
from .models import MaterialViewingProgress, Song, SongAttachment, SongCategory
from .validators import validate_song_file


class SongCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SongCategory
        fields = ("id", "name", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a category name.")
        matches = SongCategory.objects.filter(user=self.context["request"].user, name__iexact=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("You already have a category with this name.")
        return value


class ChoirSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Choir
        fields = ("id", "name", "color")


class SongSerializer(serializers.ModelSerializer):
    categories = SongCategorySerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        source="categories", many=True, queryset=SongCategory.objects.none(), required=False, write_only=True,
    )
    choirs = ChoirSummarySerializer(many=True, read_only=True)
    choir_ids = serializers.PrimaryKeyRelatedField(
        source="choirs", many=True, queryset=Choir.objects.none(), required=False, write_only=True,
    )
    attachment_count = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = (
            "id", "title", "composer_artist", "language", "musical_key", "description",
            "voice_classification", "categories", "category_ids", "choirs", "choir_ids",
            "attachment_count", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["category_ids"].child_relation.queryset = SongCategory.objects.filter(user=request.user)
            self.fields["choir_ids"].child_relation.queryset = Choir.objects.filter(user=request.user)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a song title.")
        return value

    def get_attachment_count(self, song):
        return len(song.attachments.all())

    def create(self, validated_data):
        categories = validated_data.pop("categories", [])
        choirs = validated_data.pop("choirs", [])
        song = Song.objects.create(**validated_data)
        song.categories.set(categories)
        song.choirs.set(choirs, through_defaults={})
        return song

    def update(self, instance, validated_data):
        categories = validated_data.pop("categories", None)
        choirs = validated_data.pop("choirs", None)
        song = super().update(instance, validated_data)
        if categories is not None:
            song.categories.set(categories)
        if choirs is not None:
            song.choirs.set(choirs, through_defaults={})
        return song


def validate_youtube_url(value):
    parsed = urlparse(value)
    allowed_hosts = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts or parsed.username or parsed.password:
        raise serializers.ValidationError("Use a secure YouTube video URL (youtube.com or youtu.be).")
    if parsed.port not in (None, 443):
        raise serializers.ValidationError("Use the standard HTTPS YouTube address.")
    segments = [segment for segment in parsed.path.strip("/").split("/") if segment]
    if parsed.hostname in {"youtu.be", "www.youtu.be"}:
        video_id = segments[0] if len(segments) == 1 else ""
    elif parsed.path == "/watch":
        video_id = parse_qs(parsed.query).get("v", [""])[0]
    elif len(segments) == 2 and segments[0] in {"embed", "shorts", "live"}:
        video_id = segments[1]
    else:
        video_id = ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise serializers.ValidationError("Enter a YouTube video link, such as a watch or share URL.")
    return value


class SongAttachmentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False, allow_empty_file=False)
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = SongAttachment
        fields = ("id", "kind", "title", "file", "file_url", "file_name", "url", "position", "created_at")
        read_only_fields = ("id", "position", "created_at", "file_url", "file_name")

    def get_fields(self):
        fields = super().get_fields()
        if self.instance:
            fields["kind"].read_only = True
        return fields

    def get_file_url(self, attachment):
        return f"/attachments/{attachment.pk}/file/" if attachment.file else None

    def get_file_name(self, attachment):
        return f"{attachment.title}{Path(attachment.file.name).suffix}" if attachment.file else ""

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        upload = attrs.get("file")
        url = attrs.get("url", getattr(self.instance, "url", ""))
        if kind == SongAttachment.Kind.YOUTUBE:
            if upload:
                raise serializers.ValidationError({"file": "YouTube links do not use uploaded files."})
            if not url:
                raise serializers.ValidationError({"url": "Add a YouTube video URL."})
            attrs["url"] = validate_youtube_url(url)
        else:
            if url:
                raise serializers.ValidationError({"url": "Only YouTube materials use a URL."})
            if not upload and not (self.instance and self.instance.file):
                raise serializers.ValidationError({"file": "Choose a file to upload."})
            if upload:
                try:
                    validate_song_file(upload, kind)
                except DjangoValidationError as exc:
                    raise serializers.ValidationError({"file": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        song = self.context["song"]
        if not validated_data.get("title"):
            validated_data["title"] = Path(validated_data["file"].name).stem if validated_data.get("file") else "YouTube video"
        last_position = song.attachments.aggregate(position=Max("position"))["position"]
        validated_data["position"] = 0 if last_position is None else last_position + 1
        return SongAttachment.objects.create(song=song, **validated_data)

    def update(self, instance, validated_data):
        old_name = instance.file.name if instance.file else None
        attachment = super().update(instance, validated_data)
        if old_name and "file" in validated_data and attachment.file.name != old_name:
            attachment.file.storage.delete(old_name)
        return attachment


class MaterialViewingProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialViewingProgress
        fields = ("last_page", "video_position", "updated_at")
        read_only_fields = ("updated_at",)

    def validate_last_page(self, value):
        if value < 1:
            raise serializers.ValidationError("Page number must be at least 1.")
        attachment = self.context["attachment"]
        if attachment.kind == SongAttachment.Kind.IMAGE:
            page_count = SongAttachment.objects.filter(song=attachment.song, kind=SongAttachment.Kind.IMAGE).count()
            if value > page_count:
                raise serializers.ValidationError("Page number is outside this image book.")
        elif attachment.kind == SongAttachment.Kind.PDF:
            if value > 10000:
                raise serializers.ValidationError("PDF page number cannot exceed 10000.")
        elif value != 1:
            raise serializers.ValidationError("Page progress applies only to sheet music.")
        return value

    def validate_video_position(self, value):
        if value < 0 or value > 86400:
            raise serializers.ValidationError("Video position must be between 0 and 86400 seconds.")
        attachment = self.context["attachment"]
        if attachment.kind not in (SongAttachment.Kind.VIDEO, SongAttachment.Kind.YOUTUBE) and value != 0:
            raise serializers.ValidationError("Video position applies only to video materials.")
        return value
