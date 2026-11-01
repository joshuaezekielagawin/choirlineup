from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from choirs.models import Choir
from songs.models import Song
from .models import Event, EventSong

User = get_user_model()


class EventApiTests(APITestCase):
    def setUp(self):
        self.singer = User.objects.create_user(email="events@example.com", password="Strong!PassWord1234", full_name="Event Singer")
        self.other = User.objects.create_user(email="other-events@example.com", password="Strong!PassWord1234", full_name="Other Singer")
        self.choir = Choir.objects.create(user=self.singer, name="Riverside Choir", voice_classification="tenor")
        self.other_choir = Choir.objects.create(user=self.other, name="Other Choir", voice_classification="alto")
        self.songs = [Song.objects.create(user=self.singer, title=f"Song {n}") for n in range(1, 4)]
        self.foreign_song = Song.objects.create(user=self.other, title="Private Song")
        self.client.force_authenticate(self.singer)

    def create_event(self):
        response = self.client.post("/api/events/", {
            "title": "Spring Concert", "choir_id": self.choir.id,
            "date": (date.today() + timedelta(days=30)).isoformat(),
            "start_time": "19:00", "end_time": "21:00", "venue": "Town Hall",
            "description": "Annual concert", "preparation_deadline": (date.today() + timedelta(days=20)).isoformat(),
            "status": "preparing",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Event.objects.get(pk=response.data["id"])

    def test_event_crud_uses_authenticated_owner_and_validates_fields(self):
        created = self.client.post("/api/events/", {
            "title": "  Spring Concert  ", "choir_id": self.choir.id,
            "date": (date.today() + timedelta(days=30)).isoformat(), "start_time": "19:00", "end_time": "21:00",
            "preparation_deadline": (date.today() + timedelta(days=31)).isoformat(),
        }, format="json")
        self.assertEqual(created.status_code, 400)
        invalid_time = self.client.post("/api/events/", {
            "title": "Spring Concert", "choir_id": self.choir.id,
            "date": (date.today() + timedelta(days=30)).isoformat(), "start_time": "21:00", "end_time": "19:00",
        }, format="json")
        self.assertEqual(invalid_time.status_code, 400)
        foreign_choir = self.client.post("/api/events/", {
            "title": "No access", "choir_id": self.other_choir.id,
            "date": (date.today() + timedelta(days=30)).isoformat(), "start_time": "19:00", "end_time": "21:00",
        }, format="json")
        self.assertEqual(foreign_choir.status_code, 400)

        event = self.create_event()
        event_url = f"/api/events/{event.id}/"
        self.assertEqual(self.client.get(event_url).status_code, 200)
        self.assertEqual(self.client.patch(event_url, {"venue": "Concert Hall"}, format="json").data["venue"], "Concert Hall")
        self.assertEqual(self.client.get("/api/events/").data[0]["title"], "Spring Concert")
        self.assertEqual(self.client.delete(event_url).status_code, 204)

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/events/").data, [])

    def test_lineup_prevents_duplicates_and_foreign_songs_and_saves_entry_notes(self):
        event = self.create_event()
        url = f"/api/events/{event.id}/lineup/"
        first = self.client.post(url, {"song_id": self.songs[0].id, "purpose": "opening"}, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["position"], 1)
        protected_delete = self.client.delete(f"/api/songs/{self.songs[0].id}/")
        self.assertEqual(protected_delete.status_code, 409)
        duplicate = self.client.post(url, {"song_id": self.songs[0].id}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        foreign = self.client.post(url, {"song_id": self.foreign_song.id}, format="json")
        self.assertEqual(foreign.status_code, 400)
        second = self.client.post(url, {"song_id": self.songs[1].id}, format="json")
        self.assertEqual(second.status_code, 201)
        detail = self.client.patch(f"/api/lineup-items/{first.data['id']}/", {
            "purpose": "special_music", "assigned_voice_part": "Tenor 1", "special_instructions": "Wait for cue.",
            "practice_notes": "Review the final verse.", "preparation_status": "learning",
        }, format="json")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["practice_notes"], "Review the final verse.")
        self.assertEqual(detail.data["preparation_status"], "learning")

    def test_reorder_is_atomic_complete_and_delete_compacts_positions(self):
        event = self.create_event()
        url = f"/api/events/{event.id}/lineup/"
        entries = [self.client.post(url, {"song_id": song.id}, format="json").data for song in self.songs]
        ids = [entry["id"] for entry in entries]
        reorder_url = f"/api/events/{event.id}/reorder-lineup/"
        reordered = self.client.post(reorder_url, {"event_song_ids": [ids[2], ids[0], ids[1]]}, format="json")
        self.assertEqual(reordered.status_code, 200, reordered.data)
        self.assertEqual([entry["id"] for entry in reordered.data], [ids[2], ids[0], ids[1]])
        self.assertEqual([entry["position"] for entry in reordered.data], [1, 2, 3])
        incomplete = self.client.post(reorder_url, {"event_song_ids": ids[:2]}, format="json")
        self.assertEqual(incomplete.status_code, 400)
        duplicate_id = self.client.post(reorder_url, {"event_song_ids": [ids[0], ids[0], ids[2]]}, format="json")
        self.assertEqual(duplicate_id.status_code, 400)

        self.assertEqual(self.client.delete(f"/api/lineup-items/{ids[0]}/").status_code, 204)
        remaining = list(event.lineup.order_by("position").values_list("id", "position"))
        self.assertEqual([position for _, position in remaining], [1, 2])
        self.assertEqual(Song.objects.filter(user=self.singer).count(), 3)

    def test_other_user_cannot_access_event_lineup_or_lineup_items(self):
        event = self.create_event()
        entry = self.client.post(f"/api/events/{event.id}/lineup/", {"song_id": self.songs[0].id}, format="json").data
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/events/{event.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/events/{event.id}/lineup/").status_code, 404)
        self.assertEqual(self.client.patch(f"/api/lineup-items/{entry['id']}/", {"practice_notes": "steal"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/events/{event.id}/reorder-lineup/", {"event_song_ids": [entry["id"]]}, format="json").status_code, 404)
