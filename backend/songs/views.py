import mimetypes

from django.http import FileResponse
from django.db import transaction
from django.db.models import F, Max
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MaterialViewingProgress, Song, SongAttachment, SongCategory
from .serializers import MaterialViewingProgressSerializer, SongAttachmentSerializer, SongCategorySerializer, SongSerializer


def sync_image_progress(song):
    pages = SongAttachment.objects.filter(song=song, kind=SongAttachment.Kind.IMAGE).order_by("position", "id")
    for page_number, page in enumerate(pages, start=1):
        MaterialViewingProgress.objects.filter(attachment=page).update(last_page=page_number)


class SongCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = SongCategorySerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return SongCategory.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SongViewSet(viewsets.ModelViewSet):
    serializer_class = SongSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        queryset = Song.objects.filter(user=self.request.user).prefetch_related("categories", "choirs", "attachments")
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title__icontains=search)
        for param, relation in (("choir", "choirs__id"), ("category", "categories__id")):
            value = self.request.query_params.get(param)
            if value:
                if not value.isdigit():
                    return queryset.none()
                queryset = queryset.filter(**{relation: int(value)})
        for param, field in (("language", "language__iexact"), ("key", "musical_key__iexact"), ("voice", "voice_classification")):
            value = self.request.query_params.get(param, "").strip()
            if value:
                queryset = queryset.filter(**{field: value})
        if self.request.query_params.get("sort") == "title":
            queryset = queryset.order_by("title", "id")
        else:
            queryset = queryset.order_by("-created_at", "-id")
        return queryset.distinct()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError as exc:
            return Response(
                {"detail": "This song is used in an event lineup. Remove it from those lineups before deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SongAttachmentListCreateView(generics.ListCreateAPIView):
    serializer_class = SongAttachmentSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_song(self):
        return get_object_or_404(Song, pk=self.kwargs["song_id"], user=self.request.user)

    def get_queryset(self):
        return SongAttachment.objects.filter(song=self.get_song())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["song"] = self.get_song()
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attachment = serializer.save()
        if attachment.kind == SongAttachment.Kind.IMAGE:
            sync_image_progress(attachment.song)
        return Response(self.get_serializer(attachment).data, status=status.HTTP_201_CREATED)


class SongAttachmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SongAttachmentSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return SongAttachment.objects.filter(song__user=self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        attachment = getattr(self, "_attachment_for_context", None)
        if attachment:
            context["song"] = attachment.song
        return context

    def get_object(self):
        attachment = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, attachment)
        self._attachment_for_context = attachment
        return attachment

    def perform_destroy(self, instance):
        song = instance.song
        is_image_page = instance.kind == SongAttachment.Kind.IMAGE
        instance.delete()
        if is_image_page:
            sync_image_progress(song)


class SongAttachmentFileView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, pk):
        attachment = get_object_or_404(SongAttachment.objects.filter(song__user=request.user), pk=pk)
        if not attachment.file:
            return Response({"detail": "This learning material has no uploaded file."}, status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(
            attachment.file.open("rb"),
            content_type=mimetypes.guess_type(attachment.file.name)[0] or "application/octet-stream",
            as_attachment=False,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class ImagePageOrderSerializer(serializers.Serializer):
    attachment_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)

    def validate_attachment_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Each image page must appear exactly once.")
        return value


class SongImagePageReorderView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, song_id):
        song = get_object_or_404(Song, pk=song_id, user=request.user)
        serializer = ImagePageOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requested_ids = serializer.validated_data["attachment_ids"]
        pages = list(SongAttachment.objects.filter(song=song, kind=SongAttachment.Kind.IMAGE).order_by("position", "id"))
        current_ids = {page.pk for page in pages}
        if len(requested_ids) != len(current_ids) or set(requested_ids) != current_ids:
            raise serializers.ValidationError({"attachment_ids": "Include every image page for this song exactly once."})
        by_id = {page.pk: page for page in pages}
        ordered = [by_id[pk] for pk in requested_ids]
        with transaction.atomic():
            offset = (SongAttachment.objects.filter(song=song).aggregate(position=Max("position"))["position"] or 0) + len(pages) + 1
            SongAttachment.objects.filter(pk__in=requested_ids).update(position=F("position") + offset)
            for position, page in enumerate(ordered, start=1):
                page.position = position
            SongAttachment.objects.bulk_update(ordered, ("position",))
            for page_number, page in enumerate(ordered, start=1):
                MaterialViewingProgress.objects.filter(attachment=page).update(last_page=page_number)
        return Response(SongAttachmentSerializer(ordered, many=True, context={"request": request}).data)


class MaterialViewingProgressView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, request, pk):
        return get_object_or_404(SongAttachment.objects.select_related("song"), pk=pk, song__user=request.user)

    def get(self, request, pk):
        attachment = self.get_object(request, pk)
        progress = MaterialViewingProgress.objects.filter(user=request.user, attachment=attachment).first()
        if progress:
            data = MaterialViewingProgressSerializer(progress, context={"attachment": attachment}).data
        else:
            data = {"last_page": 1, "video_position": "0.00", "updated_at": None}
        return Response(data)

    def patch(self, request, pk):
        attachment = self.get_object(request, pk)
        progress, _ = MaterialViewingProgress.objects.get_or_create(user=request.user, attachment=attachment)
        serializer = MaterialViewingProgressSerializer(progress, data=request.data, partial=True, context={"attachment": attachment})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
