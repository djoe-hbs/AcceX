from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated

from core.valiu.models import ValiuProfile
from core.valiu.serializers import ValiuProfileSerializer


class ValiuProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = ValiuProfileSerializer
    permission_classes = (IsAuthenticated, )

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return ValiuProfile.objects.all()
        return ValiuProfile.objects.filter(user=user)

    def get_object(self):
        queryset = self.get_queryset()
        try:
            instance = queryset.get(public_id=self.kwargs["pk"])
            return instance
        except (ValiuProfile.DoesNotExist, ValueError, TypeError):
            raise NotFound("Validator user profile not found.")
