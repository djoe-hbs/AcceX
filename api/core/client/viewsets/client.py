from django.core.exceptions import ObjectDoesNotExist

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, NotFound

from core.permissions import is_superadmin, is_admin
from core.client.models import Client
from core.client.serializers import ClientSerializer, ClientNameSerializer


class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = (IsAuthenticated, )
    http_method_names = ["get", "post", "patch", "delete"]

    def _is_superadmin(self):
        return is_superadmin(self.request.user)

    def _is_admin(self):
        return is_admin(self.request.user)

    def get_serializer_class(self):
        if self._is_admin() and self.action == "list":
            return ClientNameSerializer
        return ClientSerializer

    def get_queryset(self):
        if self._is_superadmin():
            return Client.objects.prefetch_related("costs").all()

        if self._is_admin() and self.action == "list":
            return Client.objects.all().only("public_id", "name")

        raise PermissionDenied("You do not have permission to access client details.")

    def get_object(self):
        if self._is_admin() and self.action != "list":
            raise PermissionDenied("Admin can only list client names.")
        if not self._is_superadmin() and not self._is_admin():
            raise PermissionDenied("You do not have permission to access client details.")

        try:
            return Client.objects.prefetch_related("costs").get(public_id=self.kwargs["pk"])
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise NotFound("Client does not exist.")

    def create(self, request, *args, **kwargs):
        if not self._is_superadmin():
            raise PermissionDenied("Only superadmin can create clients.")
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self._is_superadmin():
            raise PermissionDenied("Only superadmin can update clients.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self._is_superadmin():
            raise PermissionDenied("Only superadmin can delete clients.")
        return super().destroy(request, *args, **kwargs)
