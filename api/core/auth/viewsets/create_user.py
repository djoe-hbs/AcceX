from rest_framework import status
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.auth.serializers.create_user import CreateUserSerializer


class CreateUserViewSet(ViewSet):
    serializer_class = CreateUserSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["post"]

    def create(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
