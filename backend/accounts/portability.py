"""Account-scoped JSON and ZIP backup/restore helpers.

The portable database representation deliberately contains only one account. A
whole-installation SQLite copy would disclose other singers' private records.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath
import re
from decimal import Decimal, InvalidOperation
from contextlib import contextmanager
import logging

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.utils.dateparse import parse_date, parse_time
from rest_framework.exceptions import ValidationError

from choirs.models import Choir
from events.models import Event, EventSong
from songs.models import MaterialViewingProgress, Song, SongAttachment, SongCategory
from songs.validators import validate_song_file

FORMAT_VERSION = 1
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_RECORDS = 100_000
logger = logging.getLogger(__name__)


def _file_record(field, archive=None, prefix="media", include_storage_name=False):
    if not field:
        return None
    with field.open("rb") as stream:
        raw = stream.read()
    result = {"name": PurePosixPath(field.name).name, "size": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    if include_storage_name:
        result["storage_name"] = field.name
    if archive is None:
        result["data"] = base64.b64encode(raw).decode("ascii")
    else:
        path = f"{prefix}/{hashlib.sha256(field.name.encode()).hexdigest()[:24]}-{result['name']}"
        archive.writestr(path, raw)
        result["path"] = path
    return result


def build_snapshot(user, archive=None, include_storage_names=False):
    choirs = list(Choir.objects.filter(user=user).order_by("id"))
    categories = list(SongCategory.objects.filter(user=user).order_by("id"))
    songs = list(Song.objects.filter(user=user).prefetch_related("categories", "choirs", "attachments").order_by("id"))
    events = list(Event.objects.filter(user=user).prefetch_related("lineup__song").order_by("id"))
    attachments = [a for s in songs for a in s.attachments.all()]
    progress = list(MaterialViewingProgress.objects.filter(user=user, attachment__song__user=user).order_by("id"))
    profile = _file_record(user.profile_picture, archive, "media/profile", include_storage_names)
    song_rows = []
    for song in songs:
        song_rows.append({"id": song.pk, "title": song.title, "composer_artist": song.composer_artist,
            "language": song.language, "musical_key": song.musical_key, "description": song.description,
            "voice_classification": song.voice_classification, "created_at": song.created_at.isoformat(),
            "updated_at": song.updated_at.isoformat(), "category_ids": list(song.categories.values_list("id", flat=True)),
            "choir_ids": list(song.choirs.values_list("id", flat=True))})
    attachment_rows = []
    for item in attachments:
        attachment_rows.append({"id": item.pk, "song_id": item.song_id, "kind": item.kind, "title": item.title,
            "url": item.url, "position": item.position, "created_at": item.created_at.isoformat(),
            "file": _file_record(item.file, archive, f"media/attachments/{item.pk}", include_storage_names)})
    return {"format": "choirlineup-account", "format_version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(), "profile": {
            "full_name": user.full_name, "email": user.email, "default_voice": user.default_voice,
            "profile_picture": profile},
        "choirs": [{"id": c.pk, "name": c.name, "description": c.description, "color": c.color,
            "voice_classification": c.voice_classification, "custom_voice": c.custom_voice,
            "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat()} for c in choirs],
        "categories": [{"id": c.pk, "name": c.name, "created_at": c.created_at.isoformat()} for c in categories],
        "songs": song_rows, "attachments": attachment_rows,
        "events": [{"id": e.pk, "choir_id": e.choir_id, "title": e.title, "date": e.date.isoformat(),
            "start_time": e.start_time.isoformat(), "end_time": e.end_time.isoformat(), "venue": e.venue,
            "description": e.description, "preparation_deadline": e.preparation_deadline.isoformat() if e.preparation_deadline else None,
            "status": e.status, "created_at": e.created_at.isoformat(), "updated_at": e.updated_at.isoformat(),
            "lineup": [{"song_id": x.song_id, "position": x.position, "purpose": x.purpose,
                "assigned_voice_part": x.assigned_voice_part, "special_instructions": x.special_instructions,
                "practice_notes": x.practice_notes, "preparation_status": x.preparation_status} for x in e.lineup.all()]} for e in events],
        "viewing_progress": [{"attachment_id": p.attachment_id, "last_page": p.last_page,
            "video_position": str(p.video_position), "updated_at": p.updated_at.isoformat()} for p in progress]}


def _decode_file(record, members=None):
    if record is None:
        return None, ""
    if not isinstance(record, dict) or not isinstance(record.get("name"), str):
        raise ValidationError("Invalid file metadata in backup.")
    raw_name = record["name"]
    name = PurePosixPath(raw_name).name
    if (not name or name in {".", ".."} or raw_name != name or "\\" in name or ":" in name
            or any(ord(char) < 32 for char in name) or len(name) > 255):
        raise ValidationError("Invalid file name in backup.")
    if members is None:
        if "path" in record or "data" not in record:
            raise ValidationError("Invalid JSON backup file encoding.")
        try: raw = base64.b64decode(record["data"], validate=True)
        except Exception as exc: raise ValidationError("Invalid encoded file in backup.") from exc
    else:
        if "data" in record or "path" not in record:
            raise ValidationError("Invalid ZIP backup file encoding.")
        path = record.get("path")
        if not isinstance(path, str) or not path.startswith("media/") or ".." in PurePosixPath(path).parts:
            raise ValidationError("Invalid media path in backup.")
        try: raw = members[path]
        except (KeyError, TypeError) as exc: raise ValidationError("Backup is missing a media file.") from exc
    if len(raw) != record.get("size") or hashlib.sha256(raw).hexdigest() != record.get("sha256"):
        raise ValidationError("A backup media file failed its integrity check.")
    return raw, name


def parse_backup(upload):
    raw = upload.read(MAX_ARCHIVE_BYTES + 1)
    if len(raw) > MAX_ARCHIVE_BYTES:
        raise ValidationError("Backup files must be 512 MB or smaller.")
    members = None
    try:
        if raw.startswith(b"PK\x03\x04"):
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                infos = archive.infolist()
                if len(infos) > MAX_RECORDS or sum(i.file_size for i in infos) > MAX_ARCHIVE_BYTES:
                    raise ValidationError("Backup archive exceeds the allowed size or file count.")
                names = set()
                members = {}
                for info in infos:
                    p = PurePosixPath(info.filename)
                    if p.is_absolute() or ".." in p.parts or "\\" in info.filename or info.filename in names:
                        raise ValidationError("Backup contains an unsafe or duplicate path.")
                    names.add(info.filename)
                    if info.is_dir():
                        raise ValidationError("Backup contains an unexpected directory entry.")
                    if info.filename not in {"manifest.json", "data.json"} and not info.filename.startswith("media/"):
                        raise ValidationError("Backup contains an unexpected file.")
                    members[info.filename] = archive.read(info)
                manifest = json.loads(members["manifest.json"])
                if manifest.get("format") != "choirlineup-account-zip" or manifest.get("format_version") != FORMAT_VERSION:
                    raise ValidationError("Unsupported or invalid backup manifest.")
                if hashlib.sha256(members["data.json"]).hexdigest() != manifest.get("data_sha256"):
                    raise ValidationError("Backup data failed its integrity check.")
                data = json.loads(members["data.json"])
        else:
            data = json.loads(raw)
    except ValidationError: raise
    except (ValueError, KeyError, TypeError, AttributeError, zipfile.BadZipFile, UnicodeDecodeError, RuntimeError) as exc:
        raise ValidationError("The selected file is not a valid ChoirLineup backup.") from exc
    try:
        validate_snapshot(data)
        validate_files(data, members)
    except ValidationError:
        raise
    except (TypeError, AttributeError, KeyError, ValueError) as exc:
        raise ValidationError("Backup data is malformed or has incomplete relationships.") from exc
    return data, members


def validate_snapshot(data):
    if not isinstance(data, dict) or data.get("format") != "choirlineup-account" or data.get("format_version") != FORMAT_VERSION:
        raise ValidationError("Unsupported or invalid ChoirLineup data format.")
    keys = ("choirs", "categories", "songs", "attachments", "events", "viewing_progress")
    if any(not isinstance(data.get(key), list) for key in keys):
        raise ValidationError("Backup data collections are invalid or too large.")
    rows = [row for key in keys for row in data[key]]
    lineups = sum(len(event.get("lineup", [])) for event in data["events"] if isinstance(event, dict) and isinstance(event.get("lineup", []), list))
    if len(rows) + lineups > MAX_RECORDS or any(not isinstance(row, dict) for row in rows):
        raise ValidationError("Backup data collections are invalid or too large.")

    def require_id(value):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValidationError("Backup contains an invalid record ID.")
        return str(value)

    def require_text(row, key, maximum, required=False):
        value = row.get(key, "")
        if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
            raise ValidationError(f"Backup field '{key}' is invalid.")
        return value

    def unique_id_map(key):
        mapping = {}
        for row in data[key]:
            rid = require_id(row.get("id"))
            if rid in mapping: raise ValidationError("Backup contains duplicate record IDs.")
            mapping[rid] = row
        return mapping

    maps = {key: unique_id_map(key) for key in ("choirs", "categories", "songs", "attachments")}
    choir_ids, cat_ids, song_ids, attachment_ids = (set(maps[key]) for key in ("choirs", "categories", "songs", "attachments"))
    profile = data.get("profile")
    if not isinstance(profile, dict): raise ValidationError("Backup profile is invalid.")
    require_text(profile, "full_name", 160, required=True)
    if profile.get("default_voice") not in {"soprano", "alto", "tenor", "bass", "custom"}:
        raise ValidationError("Backup profile voice classification is invalid.")
    choir_names = []
    for choir in data["choirs"]:
        require_text(choir, "name", 120, required=True); require_text(choir, "description", MAX_ARCHIVE_BYTES)
        voice = choir.get("voice_classification")
        if voice not in {"soprano", "alto", "tenor", "bass", "custom"}: raise ValidationError("Backup choir voice classification is invalid.")
        custom = require_text(choir, "custom_voice", 60)
        if voice == "custom" and not custom.strip(): raise ValidationError("Backup custom choir voice is missing its label.")
        if not isinstance(choir.get("color"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", choir["color"]):
            raise ValidationError("Backup contains an invalid choir color.")
        choir_names.append(choir["name"].casefold())
    category_names = []
    for category in data["categories"]:
        category_names.append(require_text(category, "name", 60, required=True).casefold())
    for song in data["songs"]:
        require_text(song, "title", 180, required=True)
        require_text(song, "composer_artist", 180); require_text(song, "language", 60)
        require_text(song, "musical_key", 24); require_text(song, "description", MAX_ARCHIVE_BYTES)
        if song.get("voice_classification", "") not in {"", "soprano", "alto", "tenor", "bass", "custom"}:
            raise ValidationError("Backup song voice classification is invalid.")
        for field, allowed in (("choir_ids", choir_ids), ("category_ids", cat_ids)):
            relation_ids = song.get(field, [])
            if not isinstance(relation_ids, list): raise ValidationError("Backup has an invalid song relationship.")
            normalized = [require_id(value) for value in relation_ids]
            if len(normalized) != len(set(normalized)) or not set(normalized) <= allowed:
                raise ValidationError("Backup has a song relationship to a missing or duplicate record.")
    for item in data["attachments"]:
        if require_id(item.get("song_id")) not in song_ids: raise ValidationError("Backup has an attachment with no song.")
        require_text(item, "title", 160); require_text(item, "url", 500)
        if item.get("kind") != "youtube" and item.get("url", ""):
            raise ValidationError("Only YouTube materials may contain a URL.")
        position = item.get("position", 0)
        if isinstance(position, bool) or not isinstance(position, int) or position < 0:
            raise ValidationError("Backup attachment position is invalid.")
    event_statuses = {"upcoming", "preparing", "completed", "cancelled"}
    purposes = {"opening", "worship", "communion", "closing", "special_music", "other"}
    preparations = {"not_started", "learning", "practiced", "ready"}
    for event in data["events"]:
        if require_id(event.get("choir_id")) not in choir_ids: raise ValidationError("Backup has an event with no choir.")
        require_text(event, "title", 180, required=True); require_text(event, "venue", 180); require_text(event, "description", MAX_ARCHIVE_BYTES)
        event_date = parse_date(event.get("date", "")); start = parse_time(event.get("start_time", "")); end = parse_time(event.get("end_time", ""))
        deadline_value = event.get("preparation_deadline")
        deadline = parse_date(deadline_value) if deadline_value else None
        if not event_date or not start or not end or end <= start or (deadline_value and not deadline) or (deadline and deadline > event_date):
            raise ValidationError("Backup contains an invalid event date, time, or preparation deadline.")
        if event.get("status", "upcoming") not in event_statuses: raise ValidationError("Backup event status is invalid.")
        lineup = event.get("lineup", [])
        if not isinstance(lineup, list): raise ValidationError("Backup event lineup is invalid.")
        seen_songs, seen_positions = set(), set()
        for entry in lineup:
            if not isinstance(entry, dict): raise ValidationError("Backup event lineup is invalid.")
            song_id = require_id(entry.get("song_id")); position = entry.get("position")
            if song_id not in song_ids or song_id in seen_songs: raise ValidationError("Backup lineup contains a missing or duplicate song.")
            if isinstance(position, bool) or not isinstance(position, int) or position < 1 or position in seen_positions:
                raise ValidationError("Backup lineup positions are invalid.")
            seen_songs.add(song_id); seen_positions.add(position)
            if entry.get("purpose", "other") not in purposes or entry.get("preparation_status", "not_started") not in preparations:
                raise ValidationError("Backup lineup purpose or preparation status is invalid.")
            require_text(entry, "assigned_voice_part", 60)
            require_text(entry, "special_instructions", MAX_ARCHIVE_BYTES); require_text(entry, "practice_notes", MAX_ARCHIVE_BYTES)
    image_pages_by_song = {}
    for attachment in data["attachments"]:
        if attachment.get("kind") == "image":
            sid = str(attachment["song_id"])
            image_pages_by_song[sid] = image_pages_by_song.get(sid, 0) + 1
    progress_ids = []
    for progress in data["viewing_progress"]:
        aid = require_id(progress.get("attachment_id"))
        if aid not in attachment_ids: raise ValidationError("Backup progress references missing material.")
        progress_ids.append(aid)
        page = progress.get("last_page", 1)
        if isinstance(page, bool) or not isinstance(page, int) or page < 1 or page > 10000:
            raise ValidationError("Backup viewing page is invalid.")
        attachment = maps["attachments"][aid]
        if attachment.get("kind") == "image" and page > image_pages_by_song.get(str(attachment["song_id"]), 0):
            raise ValidationError("Backup image viewing progress exceeds the number of pages.")
        if attachment.get("kind") not in {"image", "pdf"} and page != 1:
            raise ValidationError("Page progress applies only to sheet music.")
        try: position = Decimal(str(progress.get("video_position", "0")))
        except InvalidOperation as exc: raise ValidationError("Backup video position is invalid.") from exc
        if not position.is_finite() or position < 0 or position > 86400 or max(0, -position.as_tuple().exponent) > 2:
            raise ValidationError("Backup video position is invalid.")
        if attachment.get("kind") not in {"video", "youtube"} and position != 0:
            raise ValidationError("Video progress applies only to video materials.")
    if len(progress_ids) != len(set(progress_ids)):
        raise ValidationError("Backup contains duplicate viewing progress records.")
    if len(choir_names) != len(set(choir_names)) or len(category_names) != len(set(category_names)):
        raise ValidationError("Backup contains duplicate choir or category names.")


def validate_files(data, members):
    referenced_paths = set()
    profile_file = data["profile"].get("profile_picture")
    if profile_file:
        if profile_file.get("path"): referenced_paths.add(profile_file["path"])
        raw, name = _decode_file(profile_file, members)
        from accounts.models import validate_profile_picture
        try: validate_profile_picture(SimpleUploadedFile(name, raw))
        except DjangoValidationError as exc: raise ValidationError(exc.messages) from exc
    for item in data["attachments"]:
        kind, file_info = item.get("kind"), item.get("file")
        if kind not in {"pdf", "image", "video", "youtube"}:
            raise ValidationError("Backup contains an unsupported learning material type.")
        if kind == "youtube":
            if file_info:
                raise ValidationError("YouTube materials cannot include uploaded files.")
            from songs.serializers import validate_youtube_url
            try: validate_youtube_url(item.get("url", ""))
            except Exception as exc: raise ValidationError("Backup contains an invalid YouTube URL.") from exc
        else:
            if not file_info:
                raise ValidationError("Backup is missing an uploaded learning material.")
            if file_info.get("path"): referenced_paths.add(file_info["path"])
            raw, name = _decode_file(file_info, members)
            try: validate_song_file(SimpleUploadedFile(name, raw), kind)
            except DjangoValidationError as exc: raise ValidationError(exc.messages) from exc
    if members is not None:
        actual_assets = set(members) - {"manifest.json", "data.json"}
        if actual_assets != referenced_paths:
            raise ValidationError("Backup contains missing or unreferenced media files.")


def _copy_file(model_field, record, members, created_files=None):
    raw, name = _decode_file(record, members)
    if raw is None: return
    model_field.save(name, ContentFile(raw), save=False)
    if created_files is not None:
        created_files.append((model_field.storage, model_field.name))


def _restore_preimport_files(user, snapshot, archive_bytes):
    """Restore files removed by model delete signals if a replacement rolls back."""
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        members = {name: archive.read(name) for name in archive.namelist() if name.startswith("media/")}
    user.refresh_from_db()
    targets = []
    profile_file = snapshot["profile"].get("profile_picture")
    if profile_file:
        targets.append((user.profile_picture, profile_file, f"profile_pictures/{user.pk}/"))
    for row in snapshot["attachments"]:
        record = row.get("file")
        if not record: continue
        attachment = SongAttachment.objects.filter(pk=row["id"], song__user=user).first()
        if attachment:
            targets.append((attachment.file, record, f"song_materials/{user.pk}/"))
    for field, record, expected_prefix in targets:
        name = record.get("storage_name", "")
        parts = PurePosixPath(name).parts
        if not name or PurePosixPath(name).is_absolute() or ".." in parts or "\\" in name or not name.startswith(expected_prefix):
            raise ValidationError("Could not validate a recovery media path.")
        if field.name != name:
            raise ValidationError("A recovery media record no longer matches the account's database.")
        if not field.storage.exists(name):
            raw, _ = _decode_file(record, members)
            field.storage.save(name, ContentFile(raw))


@contextmanager
def _import_transaction(user, recovery_snapshot=None, recovery_archive=None, created_files=None):
    try:
        with transaction.atomic():
            yield
    except Exception:
        for storage, name in created_files or []:
            try:
                if storage.exists(name): storage.delete(name)
            except Exception:
                logger.exception("Failed to remove staged import media %s", name)
        if recovery_snapshot is not None and recovery_archive is not None:
            try:
                _restore_preimport_files(user, recovery_snapshot, recovery_archive)
            except Exception:
                logger.exception("Failed to restore pre-import media for user %s", user.pk)
        raise


def restore_snapshot(user, data, members, mode):
    try:
        validate_snapshot(data)
        validate_files(data, members)
    except ValidationError:
        raise
    except (TypeError, AttributeError, KeyError, ValueError) as exc:
        raise ValidationError("Backup data is malformed or has incomplete relationships.") from exc
    if mode not in {"merge", "replace"}: raise ValidationError({"mode": "Choose merge or replace."})
    # Save a recoverable account-only ZIP before destructive replacement.
    if mode == "replace":
        backup_root = Path(getattr(settings, "BACKUP_ROOT", Path(settings.MEDIA_ROOT).parent / "backups"))
        backup_root.mkdir(parents=True, exist_ok=True)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as z:
            existing = build_snapshot(user, z, include_storage_names=True)
            encoded = json.dumps(existing, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            z.writestr("data.json", encoded)
            manifest = {"format": "choirlineup-account-zip", "format_version": FORMAT_VERSION,
                "created_at": datetime.now(timezone.utc).isoformat(), "data_sha256": hashlib.sha256(encoded).hexdigest()}
            z.writestr("manifest.json", json.dumps(manifest))
        (backup_root / f"account-{user.pk}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.zip").write_bytes(stream.getvalue())
        recovery_archive = stream.getvalue()
    else:
        existing = recovery_archive = None

    created_files = []
    with _import_transaction(user, existing, recovery_archive, created_files):
        if mode == "replace":
            Event.objects.filter(user=user).delete()
            Song.objects.filter(user=user).delete()
            Choir.objects.filter(user=user).delete()
            SongCategory.objects.filter(user=user).delete()
            if user.profile_picture:
                user.profile_picture.delete(save=False)
                user.profile_picture = ""
        profile = data["profile"]
        user.full_name = profile.get("full_name", user.full_name)
        user.default_voice = profile.get("default_voice", user.default_voice)
        if profile.get("profile_picture"):
            _copy_file(user.profile_picture, profile["profile_picture"], members, created_files)
        user.save()
        choirs = {}
        for row in data["choirs"]:
            obj = Choir.objects.filter(user=user, name__iexact=row["name"]).first() if mode == "merge" else None
            if obj is None:
                obj = Choir.objects.create(user=user, name=row["name"], description=row.get("description", ""), color=row.get("color", "#728b72"), voice_classification=row.get("voice_classification", "custom"), custom_voice=row.get("custom_voice", ""))
            choirs[str(row["id"])] = obj
        categories = {}
        for row in data["categories"]:
            obj = SongCategory.objects.filter(user=user, name__iexact=row["name"]).first() if mode == "merge" else None
            if obj is None: obj = SongCategory.objects.create(user=user, name=row["name"])
            categories[str(row["id"])] = obj
        songs = {}
        for row in data["songs"]:
            attrs = {"title": row["title"], "composer_artist": row.get("composer_artist", ""), "language": row.get("language", ""), "musical_key": row.get("musical_key", ""), "description": row.get("description", ""), "voice_classification": row.get("voice_classification", "")}
            obj = Song.objects.filter(user=user, **attrs).first() if mode == "merge" else None
            if obj is None: obj = Song.objects.create(user=user, **attrs)
            obj.choirs.add(*[choirs[str(i)] for i in row.get("choir_ids", [])]); obj.categories.add(*[categories[str(i)] for i in row.get("category_ids", [])])
            songs[str(row["id"])] = obj
        attachments = {}
        for row in data["attachments"]:
            song = songs[str(row["song_id"])]
            obj = SongAttachment.objects.filter(song=song, kind=row["kind"], title=row.get("title", ""), url=row.get("url", ""), position=row.get("position", 0)).first() if mode == "merge" and row["kind"] == "youtube" else None
            if obj is not None:
                attachments[str(row["id"])] = obj
                continue
            obj = SongAttachment(song=song, kind=row["kind"], title=row.get("title", ""), url=row.get("url", ""), position=row.get("position", 0))
            _copy_file(obj.file, row.get("file"), members, created_files); obj.save(); attachments[str(row["id"])] = obj
        for row in data["events"]:
            choir = choirs[str(row["choir_id"])]
            event = Event.objects.filter(user=user, choir=choir, title=row["title"], date=parse_date(row["date"]), start_time=parse_time(row["start_time"])).first() if mode == "merge" else None
            if event is None:
                event = Event.objects.create(user=user, choir=choir, title=row["title"], date=parse_date(row["date"]), start_time=parse_time(row["start_time"]), end_time=parse_time(row["end_time"]), venue=row.get("venue", ""), description=row.get("description", ""), preparation_deadline=parse_date(row["preparation_deadline"]) if row.get("preparation_deadline") else None, status=row.get("status", "upcoming"))
            seen = set()
            for entry in sorted(row.get("lineup", []), key=lambda x: x.get("position", 0)):
                sid = str(entry["song_id"])
                if sid in seen: raise ValidationError("An event lineup contains a duplicate song.")
                seen.add(sid)
                if not EventSong.objects.filter(event=event, song=songs[sid]).exists():
                    EventSong.objects.create(event=event, song=songs[sid], position=(event.lineup.count() + 1), purpose=entry.get("purpose", "other"), assigned_voice_part=entry.get("assigned_voice_part", ""), special_instructions=entry.get("special_instructions", ""), practice_notes=entry.get("practice_notes", ""), preparation_status=entry.get("preparation_status", "not_started"))
        for row in data["viewing_progress"]:
            MaterialViewingProgress.objects.update_or_create(user=user, attachment=attachments[str(row["attachment_id"])], defaults={"last_page": row.get("last_page", 1), "video_position": row.get("video_position", "0")})
    return {"mode": mode, "counts": {"choirs": len(data["choirs"]), "songs": len(data["songs"]), "events": len(data["events"]), "attachments": len(data["attachments"])} }


def build_zip(user):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        data = build_snapshot(user, archive)
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        archive.writestr("data.json", encoded)
        manifest = {"format": "choirlineup-account-zip", "format_version": FORMAT_VERSION,
            "created_at": data["created_at"], "data_sha256": hashlib.sha256(encoded).hexdigest()}
        archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
    return out.getvalue()
