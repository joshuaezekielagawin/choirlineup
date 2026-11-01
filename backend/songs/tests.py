from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from choirs.models import Choir
from .models import Song, SongAttachment, SongCategory

User = get_user_model()


class SongLibraryTests(APITestCase):
    def setUp(self):
        self.singer = User.objects.create_user(email="library@example.com", password="Strong!PassWord1234", full_name="Library Singer")
        self.other = User.objects.create_user(email="other-library@example.com", password="Strong!PassWord1234", full_name="Other Singer")
        self.choir = Choir.objects.create(user=self.singer, name="Community Choir", voice_classification="alto")
        self.second_choir = Choir.objects.create(user=self.singer, name="Youth Choir", voice_classification="tenor")
        self.other_choir = Choir.objects.create(user=self.other, name="Other Choir", voice_classification="bass")
        self.category = SongCategory.objects.create(user=self.singer, name="Hymn")

    def test_song_can_be_reused_across_choirs_and_categories(self):
        self.client.force_authenticate(self.singer)
        response = self.client.post("/api/songs/", {
            "title": "  Be Thou My Vision  ", "composer_artist": "Traditional", "language": "English",
            "musical_key": "D", "voice_classification": "alto", "choir_ids": [self.choir.id, self.second_choir.id],
            "category_ids": [self.category.id],
        }, format="json")
        self.assertEqual(response.status_code, 201)
        song = Song.objects.get()
        self.assertEqual(song.title, "Be Thou My Vision")
        self.assertEqual(set(song.choirs.values_list("id", flat=True)), {self.choir.id, self.second_choir.id})
        self.assertEqual(song.categories.get(), self.category)
        self.assertEqual(len(response.data["choirs"]), 2)

    def test_other_accounts_cannot_use_foreign_relations_or_read_songs(self):
        song = Song.objects.create(user=self.singer, title="Private song")
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/songs/").data, [])
        self.assertEqual(self.client.get(f"/api/songs/{song.id}/").status_code, 404)
        response = self.client.post("/api/songs/", {
            "title": "Invalid link", "choir_ids": [self.choir.id], "category_ids": [self.category.id],
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_search_filter_sort_and_category_endpoints(self):
        first = Song.objects.create(user=self.singer, title="Amazing Grace", language="English", musical_key="G", voice_classification="alto")
        first.choirs.add(self.choir, through_defaults={})
        first.categories.add(self.category)
        Song.objects.create(user=self.singer, title="Zion's Call", language="French", musical_key="D", voice_classification="tenor")
        self.client.force_authenticate(self.singer)
        self.assertEqual(len(self.client.get("/api/songs/?search=Grace").data), 1)
        self.assertEqual(len(self.client.get(f"/api/songs/?choir={self.choir.id}").data), 1)
        self.assertEqual(self.client.get(f"/api/songs/?category={self.category.id}").data[0]["id"], first.id)
        sorted_songs = self.client.get("/api/songs/?sort=title").data
        self.assertEqual([song["title"] for song in sorted_songs], ["Amazing Grace", "Zion's Call"])
        created = self.client.post("/api/song-categories/", {"name": "  Christmas  "}, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["name"], "Christmas")
        self.assertEqual(self.client.delete(f"/api/song-categories/{created.data['id']}/").status_code, 204)


class SongAttachmentTests(APITestCase):
    def setUp(self):
        self.temp_media = TemporaryDirectory()
        self.addCleanup(self.temp_media.cleanup)
        self.media_settings = override_settings(MEDIA_ROOT=self.temp_media.name)
        self.media_settings.enable()
        self.addCleanup(self.media_settings.disable)
        self.singer = User.objects.create_user(email="materials@example.com", password="Strong!PassWord1234", full_name="Materials Singer")
        self.other = User.objects.create_user(email="reader@example.com", password="Strong!PassWord1234", full_name="Reader")
        self.song = Song.objects.create(user=self.singer, title="A Song")

    def test_pdf_is_uploaded_and_served_only_to_its_owner(self):
        self.client.force_authenticate(self.singer)
        upload = SimpleUploadedFile("score.pdf", b"%PDF-1.7\nprivate sheet music", content_type="application/pdf")
        response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["file_name"], "score.pdf")
        self.assertEqual(response.data["position"], 0)
        attachment = SongAttachment.objects.get()
        self.assertTrue(attachment.file.name.startswith(f"song_materials/{self.singer.id}/{self.song.id}/"))
        download = self.client.get(f"/api{response.data['file_url']}")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), b"%PDF-1.7\nprivate sheet music")
        self.assertEqual(download["Cache-Control"], "private, no-store")

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(response.data["file_url"]).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/attachments/{attachment.id}/").status_code, 404)

    def test_uploaded_image_and_youtube_url_are_supported_and_validated(self):
        self.client.force_authenticate(self.singer)
        buffer = BytesIO()
        Image.new("RGB", (10, 10), "blue").save(buffer, format="PNG")
        image = SimpleUploadedFile("page.png", buffer.getvalue(), content_type="image/png")
        image_response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "image", "file": image}, format="multipart")
        self.assertEqual(image_response.status_code, 201)
        youtube = self.client.post(f"/api/songs/{self.song.id}/attachments/", {
            "kind": "youtube", "url": "https://youtu.be/dQw4w9WgXcQ", "title": "Learning track",
        }, format="json")
        self.assertEqual(youtube.status_code, 201)
        self.assertEqual(youtube.data["url"], "https://youtu.be/dQw4w9WgXcQ")
        video = SimpleUploadedFile("rehearsal.mp4", b"\x00\x00\x00\x00ftypisom", content_type="video/mp4")
        video_response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "video", "file": video}, format="multipart")
        self.assertEqual(video_response.status_code, 201)
        youtube_progress_url = f"/api/attachments/{youtube.data['id']}/progress/"
        self.assertEqual(self.client.patch(youtube_progress_url, {"video_position": 42}, format="json").status_code, 200)
        invalid = self.client.post(f"/api/songs/{self.song.id}/attachments/", {
            "kind": "youtube", "url": "https://youtube.com.evil.invalid/watch?v=dQw4w9WgXcQ",
        }, format="json")
        self.assertEqual(invalid.status_code, 400)
        invalid_path = self.client.post(f"/api/songs/{self.song.id}/attachments/", {
            "kind": "youtube", "url": "https://youtube.com/accountsettings",
        }, format="json")
        self.assertEqual(invalid_path.status_code, 400)
        bad_file = SimpleUploadedFile("fake.pdf", b"not a PDF", content_type="application/pdf")
        invalid_file = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": bad_file}, format="multipart")
        self.assertEqual(invalid_file.status_code, 400)

    def test_attachment_api_rejects_foreign_song_and_deletes_stored_file_with_song(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/songs/{self.song.id}/attachments/").status_code, 404)
        self.client.force_authenticate(self.singer)
        upload = SimpleUploadedFile("sheet.pdf", b"%PDF-1.4\ncontents", content_type="application/pdf")
        created = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": upload}, format="multipart")
        attachment = SongAttachment.objects.get(pk=created.data["id"])
        self.assertTrue(attachment.file.storage.exists(attachment.file.name))
        self.assertEqual(self.client.delete(f"/api/songs/{self.song.id}/").status_code, 204)
        self.assertFalse(attachment.file.storage.exists(attachment.file.name))

    def test_attachment_endpoints_require_authentication(self):
        self.assertEqual(self.client.get(f"/api/songs/{self.song.id}/attachments/").status_code, 401)

    def test_replacing_and_deleting_material_removes_old_stored_files(self):
        self.client.force_authenticate(self.singer)
        first = SimpleUploadedFile("first.pdf", b"%PDF-1.4\nfirst", content_type="application/pdf")
        created = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": first}, format="multipart")
        attachment = SongAttachment.objects.get(pk=created.data["id"])
        storage = attachment.file.storage
        old_name = attachment.file.name
        second = SimpleUploadedFile("second.pdf", b"%PDF-1.7\nsecond", content_type="application/pdf")
        replaced = self.client.patch(f"/api/attachments/{attachment.id}/", {"file": second}, format="multipart")
        self.assertEqual(replaced.status_code, 200)
        attachment.refresh_from_db()
        self.assertNotEqual(attachment.file.name, old_name)
        self.assertFalse(storage.exists(old_name))
        new_name = attachment.file.name
        self.assertEqual(self.client.delete(f"/api/attachments/{attachment.id}/").status_code, 204)
        self.assertFalse(storage.exists(new_name))

    @override_settings(MAX_SONG_ATTACHMENT_SIZE_BYTES=10)
    def test_attachment_size_limit_is_enforced(self):
        self.client.force_authenticate(self.singer)
        upload = SimpleUploadedFile("score.pdf", b"%PDF-1.4 this file is too large", content_type="application/pdf")
        response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_material_progress_is_private_validated_and_persisted_per_user(self):
        self.client.force_authenticate(self.singer)
        image_ids = []
        for name in ("one.png", "two.png"):
            buffer = BytesIO()
            Image.new("RGB", (10, 10), "blue").save(buffer, format="PNG")
            response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {
                "kind": "image", "file": SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png"),
            }, format="multipart")
            self.assertEqual(response.status_code, 201)
            image_ids.append(response.data["id"])

        progress_url = f"/api/attachments/{image_ids[0]}/progress/"
        saved = self.client.patch(progress_url, {"last_page": 2}, format="json")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["last_page"], 2)
        self.assertEqual(self.client.get(progress_url).data["last_page"], 2)
        self.assertEqual(self.client.patch(progress_url, {"last_page": 3}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(progress_url, {"last_page": 0}, format="json").status_code, 400)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(progress_url).status_code, 404)

        video = SimpleUploadedFile("rehearsal.mp4", b"\x00\x00\x00\x00ftypisom", content_type="video/mp4")
        self.client.force_authenticate(self.singer)
        video_response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "video", "file": video}, format="multipart")
        video_progress_url = f"/api/attachments/{video_response.data['id']}/progress/"
        position = self.client.patch(video_progress_url, {"video_position": "83.25"}, format="json")
        self.assertEqual(position.status_code, 200)
        self.assertEqual(position.data["video_position"], "83.25")
        self.assertEqual(self.client.patch(video_progress_url, {"video_position": 86401}, format="json").status_code, 400)

        pdf = SimpleUploadedFile("score.pdf", b"%PDF-1.4\nscore", content_type="application/pdf")
        pdf_response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {"kind": "pdf", "file": pdf}, format="multipart")
        pdf_progress = self.client.patch(f"/api/attachments/{pdf_response.data['id']}/progress/", {"last_page": 18}, format="json")
        self.assertEqual(pdf_progress.status_code, 200)
        self.assertEqual(pdf_progress.data["last_page"], 18)

    def test_image_pages_can_be_reordered_only_as_a_complete_owned_set(self):
        self.client.force_authenticate(self.singer)
        image_ids = []
        for name in ("one.png", "two.png", "three.png"):
            buffer = BytesIO()
            Image.new("RGB", (10, 10), "blue").save(buffer, format="PNG")
            response = self.client.post(f"/api/songs/{self.song.id}/attachments/", {
                "kind": "image", "file": SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png"),
            }, format="multipart")
            image_ids.append(response.data["id"])
        reorder_url = f"/api/songs/{self.song.id}/attachments/reorder-images/"
        reordered = self.client.post(reorder_url, {"attachment_ids": image_ids[::-1]}, format="json")
        self.assertEqual(reordered.status_code, 200)
        self.assertEqual([page["id"] for page in reordered.data], image_ids[::-1])
        self.assertEqual([page["position"] for page in reordered.data], [1, 2, 3])
        progress_url = f"/api/attachments/{image_ids[0]}/progress/"
        self.assertEqual(self.client.patch(progress_url, {"last_page": 3}, format="json").status_code, 200)
        self.assertEqual(self.client.get(progress_url).data["last_page"], 3)
        self.assertEqual(self.client.delete(f"/api/attachments/{image_ids[2]}/").status_code, 204)
        self.assertEqual(self.client.get(progress_url).data["last_page"], 2)
        self.assertEqual(self.client.post(reorder_url, {"attachment_ids": [image_ids[0]]}, format="json").status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(reorder_url, {"attachment_ids": image_ids[::-1]}, format="json").status_code, 404)
