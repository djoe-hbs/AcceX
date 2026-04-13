from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.valiu.models import ValiuProfile
from core.valiu.serializers import ValiuProfileSerializer


class SMEProfileViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch"]
    serializer_class = ValiuProfileSerializer
    permission_classes = (IsAuthenticated, )
    
    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return ValiuProfile.objects.all()
        return ValiuProfile.objects.filter(user=user)

    def get_object(self):
        try:
            instance = ValiuProfile.objects.get(public_id=self.kwargs["pk"])
            return instance
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise Response({"error": "Validator user profile not found."}, status=status.HTTP_404_NOT_FOUND)
