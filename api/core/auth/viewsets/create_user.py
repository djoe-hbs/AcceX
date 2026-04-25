from rest_framework import status
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.auth.serializers.create_user import CreateUserSerializer
from core.work.services import notify_user_created


class CreateUserViewSet(ViewSet):
    serializer_class = CreateUserSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["post"]

    def create(self, request, *args, **kwargs):
        plain_password = request.data.get("password", "")
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        from core.user.models import User
        user = serializer.save()
        if user.role in (User.Role.ADMIN, User.Role.SME, User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER):
            notify_user_created(user, plain_password)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
