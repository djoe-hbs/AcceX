from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated

from core.sme.models import SMEProfile
from core.sme.serializers import SMEProfileSerializer


class SMEProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = SMEProfileSerializer
    permission_classes = (IsAuthenticated, )

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return SMEProfile.objects.all()
        return SMEProfile.objects.filter(user=user)

    def get_object(self):
        queryset = self.get_queryset()
        try:
            instance = queryset.get(public_id=self.kwargs["pk"])
            return instance
        except (SMEProfile.DoesNotExist, ValueError, TypeError):
            raise NotFound("SME user profile not found.")
