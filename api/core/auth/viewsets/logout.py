from rest_framework import status
from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

REFRESH_COOKIE = "refresh_token"


class LogoutViewSet(ViewSet):
    permission_classes = (IsAuthenticated, )
    http_method_names = ["post"]

    def create(self, request, *args, **kwargs):
        response = Response({"detail": "Logged out."}, status=status.HTTP_200_OK)
        response.delete_cookie(
            REFRESH_COOKIE,
            path="/api/v1/auth/",
        )
        return response
