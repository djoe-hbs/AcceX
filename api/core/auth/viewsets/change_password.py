from rest_framework import status
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.auth.serializers.change_password import ChangePasswordSerializer


class ChangePasswordViewSet(ViewSet):
    serializer_class = ChangePasswordSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["post"]

    def create(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)
