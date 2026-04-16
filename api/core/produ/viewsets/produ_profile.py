from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated

from core.produ.models import ProduProfile
from core.produ.serializers import ProduProfileSerializer


class ProduProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = ProduProfileSerializer
    permission_classes = (IsAuthenticated, )

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return ProduProfile.objects.all()
        return ProduProfile.objects.filter(user=user)

    def get_object(self):
        queryset = self.get_queryset()
        try:
            instance = queryset.get(public_id=self.kwargs["pk"])
            return instance
        except (ProduProfile.DoesNotExist, ValueError, TypeError):
            raise NotFound("Production user profile not found.")
