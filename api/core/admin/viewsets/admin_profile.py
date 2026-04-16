from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated

from core.admin.models import AdminProfile
from core.admin.serializers import AdminProfileSerializer


class AdminProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = AdminProfileSerializer
    permission_classes = (IsAuthenticated, )

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return AdminProfile.objects.all()
        return AdminProfile.objects.filter(user=user)

    def get_object(self):
        queryset = self.get_queryset()
        try:
            instance = queryset.get(public_id=self.kwargs["pk"])
            return instance
        except (AdminProfile.DoesNotExist, ValueError, TypeError):
            raise NotFound("Admin profile not found.")
