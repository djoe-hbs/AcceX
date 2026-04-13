from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
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
        try:
            instance = AdminProfile.objects.get(public_id=self.kwargs["pk"])
            return instance
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise Response({"error": "Admin profile not found."}, status=status.HTTP_404_NOT_FOUND)