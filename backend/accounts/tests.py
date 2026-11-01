from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

User = get_user_model()


class AuthenticationTests(APITestCase):
    def test_register_creates_user_and_token(self):
        response = self.client.post("/api/auth/register/", {
            "email": "singer@example.com", "full_name": "A Singer", "default_voice": "alto",
            "password": "ChoirLineup!StrongPass42", "confirm_password": "ChoirLineup!StrongPass42",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.data)
        user = User.objects.get(email="singer@example.com")
        self.assertTrue(user.check_password("ChoirLineup!StrongPass42"))

    def test_registration_rejects_password_mismatch(self):
        response = self.client.post("/api/auth/register/", {
            "email": "singer@example.com", "full_name": "A Singer", "default_voice": "alto",
            "password": "ChoirLineup!StrongPass42", "confirm_password": "different",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="singer@example.com").exists())

    def test_profile_requires_authentication_and_is_self_scoped(self):
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 401)
        first = User.objects.create_user(email="one@example.com", password="Another!StrongPass443", full_name="One")
        User.objects.create_user(email="two@example.com", password="Another!StrongPass443", full_name="Two")
        self.client.force_authenticate(first)
        response = self.client.get("/api/auth/profile/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "one@example.com")
        self.assertNotIn("password", response.data)

    def test_login_and_logout_revoke_token(self):
        user = User.objects.create_user(email="login@example.com", password="Another!StrongPass443", full_name="Login")
        login = self.client.post("/api/auth/login/", {"email": user.email, "password": "Another!StrongPass443"}, format="json")
        self.assertEqual(login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {login.data['token']}")
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/auth/profile/").status_code, 401)


class ProfileManagementTests(APITestCase):
    def setUp(self):
        self.temp_media = TemporaryDirectory()
        self.addCleanup(self.temp_media.cleanup)
        self.media_settings = override_settings(MEDIA_ROOT=self.temp_media.name)
        self.media_settings.enable()
        self.addCleanup(self.media_settings.disable)
        self.user = User.objects.create_user(email="profile@example.com", password="Another!StrongPass443", full_name="Profile Singer")

    def test_profile_update_and_picture_upload_are_account_scoped(self):
        self.client.force_authenticate(self.user)
        profile = self.client.patch("/api/auth/profile/", {"full_name": "Updated Singer", "default_voice": "alto"}, format="json")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["full_name"], "Updated Singer")

        buffer = BytesIO()
        Image.new("RGB", (8, 8), "green").save(buffer, format="PNG")
        upload = SimpleUploadedFile("voice.png", buffer.getvalue(), content_type="image/png")
        uploaded = self.client.patch("/api/auth/profile/", {"profile_picture": upload}, format="multipart")
        self.assertEqual(uploaded.status_code, 200)
        self.assertEqual(uploaded.data["profile_picture_url"], "/auth/profile/picture/")
        picture = self.client.get("/api/auth/profile/picture/")
        self.assertEqual(picture.status_code, 200)
        self.assertEqual(picture["Content-Type"], "image/png")
        self.assertEqual(picture["Cache-Control"], "private, no-store")

        other = User.objects.create_user(email="reader@example.com", password="Another!StrongPass443", full_name="Reader")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/auth/profile/picture/").status_code, 404)

    def test_picture_rejects_non_image_content(self):
        self.client.force_authenticate(self.user)
        upload = SimpleUploadedFile("fake.png", b"not an image", content_type="image/png")
        response = self.client.patch("/api/auth/profile/", {"profile_picture": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)
