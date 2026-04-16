from django.db.models import Count, Q
from django.http import Http404

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import (
    is_admin,
    is_production_user,
    is_superadmin,
    is_validation_user,
)
from core.user.models import User
from core.work.models import WorkUnit


def _can_see_everyone(user):
    return is_superadmin(user) or is_admin(user)


def _completed_units_for_user(user):
    return (
        WorkUnit.objects.filter(
            status=WorkUnit.Status.COMPLETED,
        )
        .filter(
            Q(current_production_assignee=user) | Q(current_validation_assignee=user)
        )
        .select_related(
            "batch",
            "work_file",
            "current_production_assignee",
            "current_validation_assignee",
        )
        .order_by("-validation_completed_at", "-updated")
    )


def _serialize_unit(unit):
    production = unit.current_production_assignee
    validation = unit.current_validation_assignee
    return {
        "id": unit.public_id.hex,
        "file_name": unit.work_file.relative_path.split("/")[-1] if unit.work_file else "",
        "file_path": unit.work_file.relative_path if unit.work_file else "",
        "batch_id": unit.batch.public_id.hex if unit.batch else None,
        "batch_name": unit.batch.name if unit.batch else None,
        "range_start": unit.range_start,
        "range_end": unit.range_end,
        "workload_count": unit.workload_count,
        "completed_at": unit.validation_completed_at.isoformat() if unit.validation_completed_at else None,
        "production_user": {
            "id": production.public_id.hex,
            "name": production.name,
            "email": production.email,
        } if production else None,
        "validation_user": {
            "id": validation.public_id.hex,
            "name": validation.name,
            "email": validation.email,
        } if validation else None,
    }


class AnalyticsViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        user = request.user
        units = _completed_units_for_user(user)
        return Response(
            {
                "completed_count": units.count(),
                "completed_units": [_serialize_unit(unit) for unit in units],
            }
        )

    @action(detail=False, methods=["get"], url_path="users")
    def users(self, request):
        if not _can_see_everyone(request.user):
            raise PermissionDenied("Only admin or superadmin can view user reports.")

        role_filter = request.query_params.get("role")

        production_rows = []
        validation_rows = []

        if role_filter in (None, "PRODUCTION"):
            production_users = User.objects.filter(role=User.Role.PRODUCTION_USER).annotate(
                completed_count=Count(
                    "production_work_units",
                    filter=Q(production_work_units__status=WorkUnit.Status.COMPLETED),
                )
            ).order_by("-completed_count", "name")
            production_rows = [
                {
                    "user_id": u.public_id.hex,
                    "user_name": u.name,
                    "user_email": u.email,
                    "role": "PRODUCTION_USER",
                    "completed_count": u.completed_count,
                }
                for u in production_users
            ]

        if role_filter in (None, "VALIDATION"):
            validation_users = User.objects.filter(role=User.Role.VALIDATION_USER).annotate(
                completed_count=Count(
                    "validation_work_units",
                    filter=Q(validation_work_units__status=WorkUnit.Status.COMPLETED),
                )
            ).order_by("-completed_count", "name")
            validation_rows = [
                {
                    "user_id": u.public_id.hex,
                    "user_name": u.name,
                    "user_email": u.email,
                    "role": "VALIDATION_USER",
                    "completed_count": u.completed_count,
                }
                for u in validation_users
            ]

        return Response({"production": production_rows, "validation": validation_rows})

    @action(detail=False, methods=["get"], url_path=r"users/(?P<user_id>[^/.]+)")
    def user_detail(self, request, user_id=None):
        if not _can_see_everyone(request.user):
            raise PermissionDenied("Only admin or superadmin can view user reports.")

        try:
            target = User.objects.get(public_id=user_id)
        except (User.DoesNotExist, ValueError, TypeError):
            raise NotFound("User does not exist.")

        if not (is_production_user(target) or is_validation_user(target)):
            return Response(
                {
                    "user": {
                        "id": target.public_id.hex,
                        "name": target.name,
                        "email": target.email,
                        "role": target.role,
                    },
                    "completed_count": 0,
                    "completed_units": [],
                }
            )

        units = _completed_units_for_user(target)
        return Response(
            {
                "user": {
                    "id": target.public_id.hex,
                    "name": target.name,
                    "email": target.email,
                    "role": target.role,
                },
                "completed_count": units.count(),
                "completed_units": [_serialize_unit(unit) for unit in units],
            }
        )
