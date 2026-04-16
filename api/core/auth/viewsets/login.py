from django.conf import settings

from rest_framework import status
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken

from core.auth.serializers.login import LoginSerializer

REFRESH_COOKIE = "refresh_token"
REFRESH_MAX_AGE = int(
    settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME").total_seconds()
)


class LoginViewSet(ViewSet):
    serializer_class = LoginSerializer
    permission_classes = (AllowAny, )
    http_method_names = ['post']

    def create(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={"request": request})

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        data = serializer.validated_data
        refresh_value = data.pop("refresh")

        response = Response(data, status=status.HTTP_200_OK)
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_value,
            max_age=REFRESH_MAX_AGE,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="Lax",
            path="/api/v1/auth/",
        )
        return response
