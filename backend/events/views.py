from django.db import transaction
from django.db.models import F, Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Event, EventSong
from .serializers import EventSerializer, EventSongSerializer, ReorderLineupSerializer


def compact_lineup(event, ordered_ids=None):
    entries = list(event.lineup.order_by("position", "id"))
    if ordered_ids is not None:
        by_id = {entry.pk: entry for entry in entries}
        entries = [by_id[entry_id] for entry_id in ordered_ids]
    if not entries:
        return
    offset = (event.lineup.aggregate(position=Max("position"))["position"] or 0) + len(entries) + 1
    event.lineup.update(position=F("position") + offset)
    for position, entry in enumerate(entries, start=1):
        entry.position = position
    EventSong.objects.bulk_update(entries, ("position",))


def touch_event(event):
    event.updated_at = timezone.now()
    event.save(update_fields=("updated_at",))


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Event.objects.filter(user=self.request.user).select_related("choir").prefetch_related("lineup__song")

    @action(detail=True, methods=("post",), url_path="reorder-lineup")
    def reorder_lineup(self, request, pk=None):
        event = self.get_object()
        serializer = ReorderLineupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requested_ids = serializer.validated_data["event_song_ids"]
        existing_ids = list(event.lineup.values_list("id", flat=True))
        if len(requested_ids) != len(existing_ids) or set(requested_ids) != set(existing_ids):
            raise ValidationError({"event_song_ids": "Include every lineup entry for this event exactly once."})
        with transaction.atomic():
            compact_lineup(event, requested_ids)
            touch_event(event)
        return Response(EventSongSerializer(event.lineup.select_related("song").all(), many=True, context={"request": request, "event": event}).data)


class EventLineupListCreateView(generics.ListCreateAPIView):
    serializer_class = EventSongSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_event(self):
        return get_object_or_404(Event.objects.select_related("choir"), pk=self.kwargs["event_id"], user=self.request.user)

    def get_queryset(self):
        return EventSong.objects.filter(event=self.get_event()).select_related("song")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["event"] = self.get_event()
        return context

    def perform_create(self, serializer):
        event = self.get_event()
        serializer.save()
        touch_event(event)


class EventSongDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EventSongSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return EventSong.objects.filter(event__user=self.request.user).select_related("event", "song")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        entry = getattr(self, "_entry_for_context", None)
        if entry:
            context["event"] = entry.event
        return context

    def get_object(self):
        entry = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, entry)
        self._entry_for_context = entry
        return entry

    def perform_update(self, serializer):
        entry = serializer.save()
        touch_event(entry.event)

    def perform_destroy(self, instance):
        event = instance.event
        with transaction.atomic():
            instance.delete()
            compact_lineup(event)
            touch_event(event)
