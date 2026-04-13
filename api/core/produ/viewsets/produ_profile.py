from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
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
        try:
            instance = ProduProfile.objects.get(public_id=self.kwargs["pk"])
            return instance
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise Response({"error": "Production user profile not found."}, status=status.HTTP_404_NOT_FOUND)
