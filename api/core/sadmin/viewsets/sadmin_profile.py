from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated

from core.sadmin.models import SAdminProfile
from core.sadmin.serializers import SAdminProfileSerializer


class SAdminProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = SAdminProfileSerializer
    permission_classes = (IsAuthenticated, )

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return SAdminProfile.objects.all()
        return SAdminProfile.objects.filter(user=user)

    def get_object(self):
        queryset = self.get_queryset()
        try:
            instance = queryset.get(public_id=self.kwargs["pk"])
            return instance
        except (SAdminProfile.DoesNotExist, ValueError, TypeError):
            raise NotFound("Super Admin user profile not found.")
