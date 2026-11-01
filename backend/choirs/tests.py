from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Choir

User = get_user_model()


class ChoirOwnershipTests(APITestCase):
    def setUp(self):
        self.singer = User.objects.create_user(email="singer@example.com", password="Strong!PassWord1234", full_name="Singer")
        self.other = User.objects.create_user(email="other@example.com", password="Strong!PassWord1234", full_name="Other")
        self.choir = Choir.objects.create(user=self.singer, name="North Choir", voice_classification="tenor")

    def test_create_assigns_authenticated_owner(self):
        self.client.force_authenticate(self.singer)
        response = self.client.post("/api/choirs/", {
            "name": "Evening Voices", "description": "Thursday rehearsals", "color": "#48634f",
            "voice_classification": "custom", "custom_voice": "Countertenor",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        choir = Choir.objects.get(name="Evening Voices")
        self.assertEqual(choir.user, self.singer)
        self.assertEqual(response.data["custom_voice"], "Countertenor")

    def test_choir_endpoints_are_scoped_to_account(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/choirs/").data, [])
        self.assertEqual(self.client.get(f"/api/choirs/{self.choir.pk}/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/choirs/{self.choir.pk}/", {"name": "Taken"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/choirs/{self.choir.pk}/").status_code, 404)
        self.choir.refresh_from_db()
        self.assertEqual(self.choir.name, "North Choir")

    def test_voice_part_is_stored_per_choir_and_owned_choir_can_be_edited_and_deleted(self):
        second = Choir.objects.create(user=self.singer, name="Youth Choir", voice_classification="bass")
        self.client.force_authenticate(self.singer)
        listing = self.client.get("/api/choirs/")
        voices = {item["name"]: item["voice_classification"] for item in listing.data}
        self.assertEqual(voices, {"North Choir": "tenor", "Youth Choir": "bass"})
        update = self.client.patch(f"/api/choirs/{self.choir.pk}/", {"description": "Sunday rehearsals"}, format="json")
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data["description"], "Sunday rehearsals")
        self.assertEqual(self.client.delete(f"/api/choirs/{second.pk}/").status_code, 204)
        self.assertFalse(Choir.objects.filter(pk=second.pk).exists())

    def test_validation_rejects_bad_color_duplicate_name_and_missing_custom_part(self):
        self.client.force_authenticate(self.singer)
        bad_color = self.client.post("/api/choirs/", {"name": "New", "color": "purple", "voice_classification": "alto"}, format="json")
        self.assertEqual(bad_color.status_code, 400)
        duplicate = self.client.post("/api/choirs/", {"name": "north choir", "voice_classification": "alto"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        missing_custom = self.client.post("/api/choirs/", {"name": "Custom", "voice_classification": "custom"}, format="json")
        self.assertEqual(missing_custom.status_code, 400)

    def test_list_requires_authentication(self):
        self.assertEqual(self.client.get("/api/choirs/").status_code, 401)
