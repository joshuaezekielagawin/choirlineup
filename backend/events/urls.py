from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EventLineupListCreateView, EventSongDetailView, EventViewSet

router = DefaultRouter()
router.register("events", EventViewSet, basename="event")

urlpatterns = [
    path("events/<int:event_id>/lineup/", EventLineupListCreateView.as_view(), name="event-lineup"),
    path("lineup-items/<int:pk>/", EventSongDetailView.as_view(), name="lineup-item-detail"),
    path("", include(router.urls)),
]
