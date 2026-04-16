from django.conf import settings

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken

REFRESH_COOKIE = "refresh_token"
REFRESH_MAX_AGE = int(
    settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME").total_seconds()
)


class RefreshViewSet(viewsets.ViewSet, TokenRefreshView):
    permission_classes = (AllowAny, )
    http_method_names = ["post"]

    def create(self, request, *args, **kwargs):
        # Read refresh token from httpOnly cookie, fall back to request body
        refresh = request.COOKIES.get(REFRESH_COOKIE) or request.data.get("refresh")
        if not refresh:
            return Response(
                {"detail": "Refresh token not provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data={"refresh": refresh})

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        data = serializer.validated_data

        response = Response(
            {"access": data["access"]},
            status=status.HTTP_200_OK,
        )

        # If a rotated refresh token is returned, update the cookie
        if "refresh" in data:
            response.set_cookie(
                REFRESH_COOKIE,
                data["refresh"],
                max_age=REFRESH_MAX_AGE,
                httponly=True,
                secure=not settings.DEBUG,
                samesite="Lax",
                path="/api/v1/auth/",
            )

        return response
