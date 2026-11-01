from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.core.validators import FileExtensionValidator
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError
from uuid import uuid4


def profile_picture_path(instance, filename):
    extension = filename.rsplit(".", 1)[-1].lower()
    return f"profile_pictures/{instance.pk}/{uuid4().hex}.{extension}"


def validate_profile_picture(upload):
    if upload.size > 5 * 1024 * 1024:
        raise ValidationError("Profile pictures must be 5 MB or smaller.")
    try:
        image = Image.open(upload)
        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise ValidationError("Upload a JPEG, PNG, or WebP image.")
        extension = upload.name.rsplit(".", 1)[-1].lower()
        allowed_extensions = {"JPEG": {"jpg", "jpeg"}, "PNG": {"png"}, "WEBP": {"webp"}}
        if extension not in allowed_extensions[image.format]:
            raise ValidationError("The image extension does not match its file content.")
        if image.width > 6000 or image.height > 6000 or image.width * image.height > 25_000_000:
            raise ValidationError("Image dimensions must be at most 6000 by 6000 pixels.")
        image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError("The uploaded file is not a valid image.")
    finally:
        upload.seek(0)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser must have staff and superuser status")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Voice(models.TextChoices):
        SOPRANO = "soprano", "Soprano"
        ALTO = "alto", "Alto"
        TENOR = "tenor", "Tenor"
        BASS = "bass", "Bass"
        CUSTOM = "custom", "Custom"

    username = None
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=160)
    default_voice = models.CharField(max_length=16, choices=Voice.choices, default=Voice.CUSTOM)
    profile_picture = models.ImageField(
        upload_to=profile_picture_path,
        blank=True,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"]), validate_profile_picture],
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]
    objects = UserManager()

    def __str__(self):
        return self.email
