from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.http import FileResponse
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.user.models import User
from core.permissions import (
    is_sme,
    is_production_user,
    is_validation_user,
    can_manage_work_batches,
)
from core.work.models import WorkUnit
from core.work.serializers import (
    WorkUnitSerializer,
    AutoAssignSerializer,
    ProductionSubmitSerializer,
    ValidationDecisionSerializer,
    ReassignProductionSerializer,
    ManualAssignUnitSerializer,
    ReportIssueSerializer,
)
from core.work.services import (
    auto_assign_units,
    submit_to_validation,
    complete_validation,
    send_back_for_redo,
    reassign_production_user,
    assign_unit,
    create_issue_alert,
    create_overdue_alerts,
)


class WorkUnitViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkUnitSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["get", "post"]

    def get_queryset(self):
        user = self.request.user
        queryset = WorkUnit.objects.select_related(
            "batch",
            "work_file",
            "current_production_assignee",
            "current_validation_assignee",
        ).all()

        if can_manage_work_batches(user) or is_sme(user):
            return queryset

        if is_production_user(user):
            return queryset.filter(current_production_assignee=user).exclude(status=WorkUnit.Status.COMPLETED)

        if is_validation_user(user):
            return queryset.filter(current_validation_assignee=user, status=WorkUnit.Status.IN_VALIDATION)

        raise PermissionDenied("You do not have permission to access work units.")

    def get_object(self):
        try:
            return WorkUnit.objects.select_related(
                "batch",
                "work_file",
                "current_production_assignee",
                "current_validation_assignee",
                "assigned_by",
            ).get(public_id=self.kwargs["pk"])
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise NotFound("Work unit does not exist.")

    def _can_manage_unit(self, user, unit):
        if can_manage_work_batches(user) or is_sme(user):
            return True
        if unit.current_production_assignee_id == user.id:
            return True
        if unit.current_validation_assignee_id == user.id:
            return True
        return False

    def _resolve_source_file_path(self, unit):
        if not unit.batch.extraction_root:
            raise NotFound("Batch extraction path not available.")

        root = (Path(settings.MEDIA_ROOT) / unit.batch.extraction_root).resolve()
        candidate = (root / unit.work_file.relative_path).resolve()

        try:
            candidate.relative_to(root)
        except ValueError:
            raise PermissionDenied("Invalid file path.")

        if not candidate.exists() or not candidate.is_file():
            raise NotFound("Source file not found.")

        return candidate

    @action(detail=False, methods=["post"], url_path="auto-assign")
    def auto_assign(self, request):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can auto assign units.")

        serializer = AutoAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated = serializer.validated_data
        batch = validated["batch"]
        if not batch.initiated_by_sme:
            batch.initiated_by_sme = request.user
            batch.save(update_fields=["initiated_by_sme", "updated"])

        assigned_count = auto_assign_units(
            batch=batch,
            production_users=validated["production_users"],
            validation_users=validated["validation_users"],
            assigned_by=request.user,
            batch_size_per_production_user=validated["batch_size_per_production_user"],
            split_threshold=validated["split_threshold"],
            split_chunk_size=validated["split_chunk_size"],
        )

        return Response({"assigned_count": assigned_count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="manual-assign")
    def manual_assign(self, request, pk=None):
        unit = self.get_object()

        if not is_sme(request.user):
            raise PermissionDenied("Only SME can manually assign units.")

        if unit.status == WorkUnit.Status.COMPLETED:
            raise PermissionDenied("Completed unit cannot be reassigned.")

        serializer = ManualAssignUnitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        assign_unit(
            unit=unit,
            production_user=serializer.validated_data["production_user"],
            validation_user=serializer.validated_data["validation_user"],
            assigned_by=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )

        if not unit.batch.initiated_by_sme:
            unit.batch.initiated_by_sme = request.user
            unit.batch.save(update_fields=["initiated_by_sme", "updated"])

        return Response({"detail": "Unit assigned successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-source")
    def download_source(self, request, pk=None):
        unit = self.get_object()

        if not self._can_manage_unit(request.user, unit):
            raise PermissionDenied("You do not have permission to download this file.")

        file_path = self._resolve_source_file_path(unit)
        handle = open(file_path, "rb")
        return FileResponse(handle, as_attachment=True, filename=file_path.name)

    @action(detail=True, methods=["post"], url_path="submit-production")
    def submit_production(self, request, pk=None):
        unit = self.get_object()

        if not is_production_user(request.user):
            raise PermissionDenied("Only production users can submit work.")

        if unit.current_production_assignee_id != request.user.id:
            raise PermissionDenied("This unit is no longer assigned to you.")

        if unit.status not in [WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO]:
            raise PermissionDenied("This unit is not in production stage.")

        serializer = ProductionSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        unit.production_output = serializer.validated_data["completed_file"]
        unit.production_output_uploaded_at = timezone.now()
        unit.save(update_fields=["production_output", "production_output_uploaded_at", "updated"])

        submit_to_validation(unit)
        return Response({"detail": "File uploaded and submitted for validation."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-production")
    def download_production(self, request, pk=None):
        unit = self.get_object()

        if not self._can_manage_unit(request.user, unit):
            raise PermissionDenied("You do not have permission to download this file.")

        if not unit.production_output:
            raise NotFound("Production output file is not available.")

        output_path = Path(unit.production_output.path)
        if not output_path.exists() or not output_path.is_file():
            raise NotFound("Production output file is not found.")

        handle = open(output_path, "rb")
        return FileResponse(handle, as_attachment=True, filename=output_path.name)

    @action(detail=True, methods=["post"], url_path="validate")
    def validate_unit(self, request, pk=None):
        unit = self.get_object()

        if not is_validation_user(request.user):
            raise PermissionDenied("Only validation users can validate work.")

        if unit.current_validation_assignee_id != request.user.id:
            raise PermissionDenied("This unit is not assigned to you for validation.")

        if unit.status != WorkUnit.Status.IN_VALIDATION:
            raise PermissionDenied("This unit is not in validation stage.")

        serializer = ValidationDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        reason = serializer.validated_data.get("reason", "")

        if decision == ValidationDecisionSerializer.DecisionChoices.APPROVE:
            complete_validation(unit, feedback=reason)
            return Response({"detail": "Unit validated and completed."}, status=status.HTTP_200_OK)

        send_back_for_redo(unit, reason=reason, assigned_by=request.user)
        return Response({"detail": "Unit sent back for redo."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reassign-production")
    def reassign_production(self, request, pk=None):
        unit = self.get_object()

        if not is_sme(request.user):
            raise PermissionDenied("Only SME can reassign production users.")

        if unit.status == WorkUnit.Status.COMPLETED:
            raise PermissionDenied("Completed unit cannot be reassigned.")

        serializer = ReassignProductionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_user = User.objects.get(public_id=serializer.validated_data["new_production_user_id"])
        reason = serializer.validated_data.get("reason", "")

        reassign_production_user(unit, new_user=new_user, assigned_by=request.user, reason=reason)
        return Response({"detail": "Unit reassigned successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="report-issue")
    def report_issue(self, request, pk=None):
        unit = self.get_object()

        if not is_production_user(request.user):
            raise PermissionDenied("Only production users can report issues.")

        if unit.current_production_assignee_id != request.user.id:
            raise PermissionDenied("This unit is no longer assigned to you.")

        serializer = ReportIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert = create_issue_alert(unit, serializer.validated_data["message"], reported_by=request.user)

        return Response(
            {
                "detail": "Issue reported to SME.",
                "alert_id": alert.public_id.hex,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="overdue")
    def overdue(self, request):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can view overdue units.")

        hours = int(request.query_params.get("hours", "24"))
        cutoff = timezone.now() - timedelta(hours=hours)

        queryset = WorkUnit.objects.filter(
            status__in=[WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO],
            production_assigned_at__lt=cutoff,
        ).select_related("batch", "work_file", "current_production_assignee")

        created_alert_count = create_overdue_alerts(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            data = WorkUnitSerializer(page, many=True).data
            response = self.get_paginated_response(data)
            response.data["created_alert_count"] = created_alert_count
            return response

        return Response(
            {
                "created_alert_count": created_alert_count,
                "results": WorkUnitSerializer(queryset, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
