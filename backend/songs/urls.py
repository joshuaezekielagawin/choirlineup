from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MaterialViewingProgressView, SongAttachmentDetailView, SongAttachmentFileView, SongAttachmentListCreateView, SongCategoryViewSet, SongImagePageReorderView, SongViewSet

router = DefaultRouter()
router.register("songs", SongViewSet, basename="song")
router.register("song-categories", SongCategoryViewSet, basename="song-category")

urlpatterns = [
    path("songs/<int:song_id>/attachments/", SongAttachmentListCreateView.as_view(), name="song-attachments"),
    path("songs/<int:song_id>/attachments/reorder-images/", SongImagePageReorderView.as_view(), name="song-image-page-reorder"),
    path("attachments/<int:pk>/file/", SongAttachmentFileView.as_view(), name="attachment-file"),
    path("attachments/<int:pk>/progress/", MaterialViewingProgressView.as_view(), name="attachment-viewing-progress"),
    path("attachments/<int:pk>/", SongAttachmentDetailView.as_view(), name="attachment-detail"),
    path("", include(router.urls)),
]
