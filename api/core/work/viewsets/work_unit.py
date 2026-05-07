from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
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
from core.work.models import WorkUnit, WorkBatchMember, WorkUnitAssignment
from core.work.serializers import (
    WorkUnitSerializer,
    AutoAssignSerializer,
    ProductionSubmitSerializer,
    ValidationDecisionSerializer,
    ReassignProductionSerializer,
    ManualAssignUnitSerializer,
    ReportIssueSerializer,
    BulkClientReworkSerializer,
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
    send_units_for_client_rework,
)
from django.conf import settings


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
            filtered = queryset
        elif is_production_user(user):
            filtered = queryset.filter(current_production_assignee=user).exclude(status=WorkUnit.Status.COMPLETED)
        elif is_validation_user(user):
            member_batch_ids = WorkBatchMember.objects.filter(
                user=user,
                role=WorkBatchMember.Role.VALIDATION,
                is_active=True,
            ).values_list("batch_id", flat=True)
            filtered = queryset.filter(batch_id__in=member_batch_ids, status=WorkUnit.Status.IN_VALIDATION)
        else:
            raise PermissionDenied("You do not have permission to access work units.")

        batch_id = self.request.query_params.get("batch_id")
        status_value = self.request.query_params.get("status")

        if batch_id:
            filtered = filtered.filter(batch__public_id=batch_id)

        if status_value:
            filtered = filtered.filter(status=status_value)

        return filtered

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

    def _is_validation_member_for_batch(self, user, batch_id):
        return WorkBatchMember.objects.filter(
            batch_id=batch_id,
            user=user,
            role=WorkBatchMember.Role.VALIDATION,
            is_active=True,
        ).exists()

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

    @action(detail=True, methods=["post"], url_path="unassign")
    def unassign(self, request, pk=None):
        unit = self.get_object()

        if not is_sme(request.user):
            raise PermissionDenied("Only SME can unassign units.")

        if unit.status == WorkUnit.Status.COMPLETED:
            raise PermissionDenied("Completed unit cannot be unassigned.")

        from core.work.services import unassign_unit

        unassign_unit(unit, reason="Manually unassigned by SME.")
        return Response({"detail": "Unit moved back to pending."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-source")
    def download_source(self, request, pk=None):
        unit = self.get_object()

        if not self._can_manage_unit(request.user, unit):
            raise PermissionDenied("You do not have permission to download this file.")

        # Preferred: original extracted source file.
        if unit.work_file.source_file:
            filename = Path(unit.work_file.source_file.name).name
            handle = unit.work_file.source_file.open("rb")
            return FileResponse(handle, as_attachment=True, filename=filename)

        # Rework fallback: if source is unavailable, provide the latest
        # production output so production can continue from prior work.
        if unit.production_output:
            filename = Path(unit.production_output.name).name
            handle = unit.production_output.open("rb")
            return FileResponse(handle, as_attachment=True, filename=filename)

        # Local-storage fallback (older/local extraction flow).
        try:
            file_path = self._resolve_source_file_path(unit)
            handle = file_path.open("rb")
            return FileResponse(handle, as_attachment=True, filename=file_path.name)
        except NotFound:
            raise NotFound("Source file not found.")

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

        filename = Path(unit.production_output.name).name
        handle = unit.production_output.open("rb")
        return FileResponse(handle, as_attachment=True, filename=filename)

    @action(detail=True, methods=["get"], url_path="download-redo-report")
    def download_redo_report(self, request, pk=None):
        unit = self.get_object()

        if not self._can_manage_unit(request.user, unit):
            raise PermissionDenied("You do not have permission to download this file.")

        if not unit.redo_report_file:
            raise NotFound("Redo report file is not available.")

        filename = Path(unit.redo_report_file.name).name
        handle = unit.redo_report_file.open("rb")
        return FileResponse(handle, as_attachment=True, filename=filename)

    @action(detail=True, methods=["post"], url_path="accept-validation")
    def accept_validation(self, request, pk=None):
        if not is_validation_user(request.user):
            raise PermissionDenied("Only validation users can accept validation work.")

        with transaction.atomic():
            try:
                unit = WorkUnit.objects.select_for_update().select_related("batch").get(public_id=pk)
            except (ObjectDoesNotExist, ValueError, TypeError):
                raise NotFound("Work unit does not exist.")

            if unit.status != WorkUnit.Status.IN_VALIDATION:
                raise PermissionDenied("This unit is not available for validation acceptance.")

            if not self._is_validation_member_for_batch(request.user, unit.batch_id):
                raise PermissionDenied("You are not an active validation member of this job batch.")

            if unit.current_validation_assignee_id and unit.current_validation_assignee_id != request.user.id:
                raise PermissionDenied("This unit has already been accepted by another validation user.")

            if unit.current_validation_assignee_id == request.user.id:
                return Response({"detail": "Unit already accepted by you."}, status=status.HTTP_200_OK)

            unit.current_validation_assignee = request.user
            unit.save(update_fields=["current_validation_assignee", "updated"])

            WorkUnitAssignment.objects.create(
                unit=unit,
                stage=WorkUnitAssignment.Stage.VALIDATION,
                assignee=request.user,
                assigned_by=request.user,
                is_active=True,
                reason="Validator accepted work from shared queue.",
            )

        return Response({"detail": "Validation work accepted successfully."}, status=status.HTTP_200_OK)

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

        report_file = serializer.validated_data.get("report_file")
        send_back_for_redo(unit, reason=reason, assigned_by=request.user, report_file=report_file)
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

    @action(detail=False, methods=["post"], url_path="bulk-client-rework")
    def bulk_client_rework(self, request):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can send units for client rework.")

        serializer = BulkClientReworkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resolved = serializer.validated_data["resolved_assignments"]
        reason = serializer.validated_data["reason"]

        send_units_for_client_rework(
            unit_assignments=resolved,
            assigned_by=request.user,
            reason=reason,
        )

        return Response(
            {"detail": f"{len(resolved)} unit(s) sent for rework.", "count": len(resolved)},
            status=status.HTTP_200_OK,
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
