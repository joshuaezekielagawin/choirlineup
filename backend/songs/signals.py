from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import SongAttachment


@receiver(pre_delete, sender=SongAttachment)
def delete_attachment_file(sender, instance, **kwargs):
    if instance.file:
        instance.file.storage.delete(instance.file.name)
