from django.db.models import Q
from django.http import Http404

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied

from core.user.models import User
from core.user.serializers import UserSerializer
from core.permissions import is_sme
from core.work.models import WorkUnit


ACTIVE_UNIT_STATUSES = (
    WorkUnit.Status.ASSIGNED_TO_PRODUCTION,
    WorkUnit.Status.REDO,
    WorkUnit.Status.IN_VALIDATION,
)


class UserViewSet(viewsets.ModelViewSet):
    http_method_names = ["patch", "get", "delete"]
    permission_classes = (IsAuthenticated, )
    serializer_class = UserSerializer


    def get_queryset(self):
        user = self.request.user
        role = self.request.query_params.get("role")
        is_active = self.request.query_params.get("is_active")
        available = self.request.query_params.get("available")

        if user.is_staff:
            queryset = User.objects.all()

        elif is_sme(user) and self.action == "list":
            queryset = User.objects.filter(
                role__in=[User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER]
            )

            if role and role not in [User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER]:
                return User.objects.none()

        else:
            return User.objects.filter(public_id=user.public_id)

        if role:
            queryset = queryset.filter(role=role)

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        if available is not None and available.lower() == "true":
            busy_production_ids = WorkUnit.objects.filter(
                status__in=ACTIVE_UNIT_STATUSES,
                current_production_assignee__isnull=False,
            ).values_list("current_production_assignee_id", flat=True)

            busy_validation_ids = WorkUnit.objects.filter(
                status__in=ACTIVE_UNIT_STATUSES,
                current_validation_assignee__isnull=False,
            ).values_list("current_validation_assignee_id", flat=True)

            queryset = queryset.exclude(
                Q(role=User.Role.PRODUCTION_USER, id__in=busy_production_ids)
                | Q(role=User.Role.VALIDATION_USER, id__in=busy_validation_ids)
            )

        return queryset
    
    def get_object(self):
        try:
            obj = User.objects.get_object_by_public_id(self.kwargs["pk"])
        except Http404:
            raise NotFound("User does not exist.")

        return obj
