import mimetypes

from django.http import FileResponse
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db import IntegrityError
from django.http import HttpResponse
from .portability import build_snapshot, build_zip, parse_backup, restore_snapshot
import json

from .serializers import LoginSerializer, RegistrationSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class LogoutView(APIView):
    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ProfilePictureView(APIView):
    def get(self, request):
        picture = request.user.profile_picture
        if not picture:
            return Response({"detail": "No profile picture has been uploaded."}, status=status.HTTP_404_NOT_FOUND)
        response = FileResponse(
            picture.open("rb"),
            content_type=mimetypes.guess_type(picture.name)[0] or "application/octet-stream",
            as_attachment=False,
        )
        response["Cache-Control"] = "private, no-store"
        return response


class DataExportView(APIView):
    """Download a consistent export containing only the authenticated account."""
    def get(self, request):
        with transaction.atomic():
            if request.query_params.get("type", "json") == "zip":
                content = build_zip(request.user)
                response = HttpResponse(content, content_type="application/zip")
                response["Content-Disposition"] = 'attachment; filename="choirlineup-backup.zip"'
                response["Cache-Control"] = "private, no-store"
                return response
            if request.query_params.get("type", "json") != "json":
                return Response({"detail": "Choose json or zip format."}, status=status.HTTP_400_BAD_REQUEST)
            content = json.dumps(build_snapshot(request.user), ensure_ascii=False, indent=2)
        response = HttpResponse(content, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="choirlineup-export.json"'
        response["Cache-Control"] = "private, no-store"
        return response


class DataImportView(APIView):
    """Validate a JSON export or ZIP before applying it to the current account."""
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Choose a JSON or ZIP backup file."}, status=status.HTTP_400_BAD_REQUEST)
        data, members = parse_backup(upload)
        try:
            result = restore_snapshot(request.user, data, members, request.data.get("mode", ""))
        except IntegrityError as exc:
            raise ValidationError("The imported data conflicts with existing records. No database changes were applied.") from exc
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise ValidationError("Backup data is invalid. No database changes were applied.") from exc
        return Response(result, status=status.HTTP_200_OK)
