from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from core.user.serializers import UserSerializer


class MeViewSet(ViewSet):
    permission_classes = (IsAuthenticated,)
    http_method_names = ["get"]

    def list(self, request, *args, **kwargs):
        return Response(UserSerializer(request.user).data)
