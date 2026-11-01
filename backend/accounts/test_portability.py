import io
import json
import base64
import hashlib
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APITestCase

from choirs.models import Choir
from events.models import Event, EventSong
from songs.models import MaterialViewingProgress, Song, SongAttachment


class AccountPortabilityTests(APITestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.backups = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name, BACKUP_ROOT=__import__('pathlib').Path(self.backups.name))
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media.cleanup)
        self.addCleanup(self.backups.cleanup)
        self.user = get_user_model().objects.create_user(email="export@example.com", password="Another!StrongPass443", full_name="Export Singer", default_voice="alto")
        self.other = get_user_model().objects.create_user(email="other@example.com", password="Another!StrongPass443", full_name="Other Singer")
        self.client.force_authenticate(self.user)

    def make_data(self):
        choir = Choir.objects.create(user=self.user, name="Harbor Choir", voice_classification="tenor")
        song = Song.objects.create(user=self.user, title="Morning Song", composer_artist="A Composer", musical_key="G")
        song.choirs.add(choir)
        material = SongAttachment.objects.create(song=song, kind="youtube", title="Rehearsal", url="https://youtu.be/dQw4w9WgXcQ")
        pdf = SongAttachment.objects.create(song=song, kind="pdf", title="Sheet music", position=1,
            file=SimpleUploadedFile("score.pdf", b"%PDF-1.4\n%%EOF", content_type="application/pdf"))
        event = Event.objects.create(user=self.user, choir=choir, title="Spring Concert", date="2030-04-10", start_time="18:00", end_time="19:00", preparation_deadline="2030-04-01")
        EventSong.objects.create(event=event, song=song, position=1, practice_notes="Review the ending", preparation_status="learning")
        MaterialViewingProgress.objects.create(user=self.user, attachment=material, video_position="27.50")
        MaterialViewingProgress.objects.create(user=self.user, attachment=pdf, last_page=3)
        return choir, song

    def test_exports_are_authenticated_and_account_scoped(self):
        self.make_data()
        foreign = Choir.objects.create(user=self.other, name="Private Choir")
        response = self.client.get("/api/auth/export/?type=json")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual([c["name"] for c in payload["choirs"]], ["Harbor Choir"])
        self.assertNotIn("Private Choir", response.content.decode())
        self.assertNotIn("password", payload)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get("/api/auth/export/").status_code, 401)

    def test_zip_round_trip_replace_preserves_relationships_and_progress(self):
        choir, song = self.make_data()
        exported = self.client.get("/api/auth/export/?type=zip")
        self.assertEqual(exported.status_code, 200, getattr(exported, "data", exported.content[:300]))
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            self.assertEqual(len(archive.namelist()), 3)
            self.assertIn("media/attachments/", " ".join(archive.namelist()))
        response = self.client.post("/api/auth/import/", {"file": SimpleUploadedFile("backup.zip", exported.content), "mode": "replace"}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        restored_choir = Choir.objects.get(user=self.user)
        restored_song = Song.objects.get(user=self.user)
        restored_event = Event.objects.get(user=self.user)
        self.assertEqual(restored_choir.name, choir.name)
        self.assertEqual(list(restored_song.choirs.values_list("pk", flat=True)), [restored_choir.pk])
        self.assertEqual(restored_event.lineup.get().practice_notes, "Review the ending")
        self.assertEqual(MaterialViewingProgress.objects.get(user=self.user, attachment__kind="pdf").last_page, 3)
        self.assertEqual(MaterialViewingProgress.objects.get(user=self.user, attachment__kind="youtube").video_position, 27.5)
        pdf = SongAttachment.objects.get(song=restored_song, kind="pdf")
        with pdf.file.open("rb") as stream: self.assertEqual(stream.read(), b"%PDF-1.4\n%%EOF")
        recovery_files = list(Path(self.backups.name).glob("account-*.zip"))
        self.assertEqual(len(recovery_files), 1)
        from accounts.portability import parse_backup
        with recovery_files[0].open("rb") as stream:
            recovered, recovered_media = parse_backup(SimpleUploadedFile("recovery.zip", stream.read()))
        self.assertEqual(len(recovered["attachments"]), 2)
        self.assertTrue(recovered_media)
        self.assertEqual(Song.objects.filter(user=self.other).count(), 0)

    def test_import_rejects_unsafe_zip_paths_and_unknown_mode(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("../escape", "bad")
        response = self.client.post("/api/auth/import/", {"file": SimpleUploadedFile("bad.zip", stream.getvalue()), "mode": "merge"}, format="multipart")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/auth/import/", {"file": SimpleUploadedFile("bad.json", b'{}'), "mode": "wipe"}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_import_rejects_media_with_invalid_content(self):
        self.make_data()
        payload = json.loads(self.client.get("/api/auth/export/").content)
        media = b"not a pdf"
        payload["attachments"][0].update({"kind": "pdf", "url": "", "file": {
            "name": "fake.pdf", "size": len(media), "sha256": hashlib.sha256(media).hexdigest(),
            "data": base64.b64encode(media).decode("ascii")}})
        response = self.client.post("/api/auth/import/", {
            "file": SimpleUploadedFile("invalid.json", json.dumps(payload).encode()), "mode": "merge"}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_import_rejects_malicious_media_filename(self):
        self.make_data()
        payload = json.loads(self.client.get("/api/auth/export/").content)
        payload["attachments"][1]["file"]["name"] = "..\\outside.pdf"
        response = self.client.post("/api/auth/import/", {
            "file": SimpleUploadedFile("invalid.json", json.dumps(payload).encode()), "mode": "merge"}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_replace_preflight_rejects_invalid_event_without_changing_existing_data(self):
        self.make_data()
        payload = json.loads(self.client.get("/api/auth/export/").content)
        payload["events"][0]["status"] = "unrecognized"
        response = self.client.post("/api/auth/import/", {
            "file": SimpleUploadedFile("invalid.json", json.dumps(payload).encode()), "mode": "replace"}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Event.objects.filter(user=self.user).count(), 1)
        self.assertTrue(Song.objects.filter(user=self.user, title="Morning Song").exists())

    def test_failed_replace_rolls_back_rows_and_restores_deleted_media(self):
        self.make_data()
        original = SongAttachment.objects.get(song__user=self.user, kind="pdf")
        original_name = original.file.name
        with original.file.open("rb") as stream: expected = stream.read()
        backup = self.client.get("/api/auth/export/?type=zip").content
        from accounts.portability import parse_backup, restore_snapshot
        imported, members = parse_backup(SimpleUploadedFile("input.zip", backup))
        with patch("events.models.Event.objects.create", side_effect=RuntimeError("simulated database failure")):
            with self.assertRaises(RuntimeError):
                restore_snapshot(self.user, imported, members, "replace")
        restored = SongAttachment.objects.get(pk=original.pk, song__user=self.user)
        self.assertEqual(restored.file.name, original_name)
        with restored.file.open("rb") as stream: self.assertEqual(stream.read(), expected)
        self.assertEqual(len(list(Path(self.media.name).rglob("*.pdf"))), 1)
        self.assertEqual(Event.objects.filter(user=self.user).count(), 1)
