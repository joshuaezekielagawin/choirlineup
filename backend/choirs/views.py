from rest_framework import permissions, viewsets

from .models import Choir
from .serializers import ChoirSerializer


class ChoirViewSet(viewsets.ModelViewSet):
    serializer_class = ChoirSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        return Choir.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
