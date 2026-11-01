from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/choirs/", include("choirs.urls")),
    path("api/", include("songs.urls")),
    path("api/", include("events.urls")),
]
