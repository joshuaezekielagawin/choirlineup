from django.urls import path

from .views import DataExportView, DataImportView, LoginView, LogoutView, ProfilePictureView, ProfileView, RegisterView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/picture/", ProfilePictureView.as_view(), name="profile-picture"),
    path("export/", DataExportView.as_view(), name="data-export"),
    path("import/", DataImportView.as_view(), name="data-import"),
]
