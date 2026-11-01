from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError


def validate_song_file(upload, kind):
    if upload.size > settings.MAX_SONG_ATTACHMENT_SIZE_BYTES:
        max_mb = settings.MAX_SONG_ATTACHMENT_SIZE_BYTES // (1024 * 1024)
        raise ValidationError(f"This file exceeds the {max_mb} MB upload limit.")
    extension = Path(upload.name).suffix.lower()
    try:
        header = upload.read(16)
        upload.seek(0)
        if kind == "pdf":
            valid = extension == ".pdf" and header.startswith(b"%PDF-")
        elif kind == "image":
            image = Image.open(upload)
            valid_format = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}
            valid = image.format in valid_format and extension in valid_format[image.format]
            if image.width > 12000 or image.height > 12000 or image.width * image.height > 80_000_000:
                raise ValidationError("Image dimensions must be no more than 12000 pixels per side.")
            image.verify()
        elif kind == "video":
            valid = (extension in {".mp4", ".m4v", ".mov"} and header[4:8] == b"ftyp") or (
                extension == ".webm" and header.startswith(b"\x1aE\xdf\xa3")
            )
        else:
            raise ValidationError("Uploaded files must be PDF, image, or video materials.")
        if not valid:
            raise ValidationError("The file type does not match its content or is not supported.")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError("The uploaded file is invalid or damaged.")
    finally:
        upload.seek(0)
