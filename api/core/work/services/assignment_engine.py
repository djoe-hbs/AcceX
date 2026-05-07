import math
from datetime import timedelta
from itertools import cycle

from django.db import models, transaction
from django.utils import timezone

from core.work.models import (
    WorkBatch,
    WorkBatchMember,
    WorkFile,
    WorkUnit,
    WorkUnitAssignment,
    WorkUnitAlert,
)
from core.work.services.notification_engine import (
    notify_work_assigned,
    notify_bulk_work_assigned,
    notify_production_submitted,
    notify_validation_approved,
    notify_sent_for_redo,
    notify_batch_completed,
    notify_reassignment,
)


def _get_cross_job_workloads(production_users):
    """
    Return {user.pk: total_workload} across ALL active jobs for each user.
    Active = ASSIGNED_TO_PRODUCTION or REDO status.
    """
    active_statuses = [WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO]
    user_pks = [u.pk for u in production_users]

    totals = (
        WorkUnit.objects.filter(
            current_production_assignee_id__in=user_pks,
            status__in=active_statuses,
        )
        .values("current_production_assignee_id")
        .annotate(total=models.Sum("workload_count"))
    )

    workloads = {pk: 0 for pk in user_pks}
    for row in totals:
        workloads[row["current_production_assignee_id"]] = row["total"] or 0

    return workloads



def initialize_work_units(batch: WorkBatch):
    """Create one WorkUnit per eligible file (no splitting)."""
    if WorkUnit.objects.filter(batch=batch).exists():
        return

    eligible_files = batch.files.filter(is_directory=False).exclude(file_type=WorkFile.FileType.ZIP)

    units_to_create = []
    for work_file in eligible_files:
        count = work_file.count or 0
        count_type = work_file.count_type
        range_start = 1 if count_type != WorkFile.CountType.NONE and count > 0 else None
        range_end = count if count_type != WorkFile.CountType.NONE and count > 0 else None
        workload_count = count if count > 0 else 1

        units_to_create.append(
            WorkUnit(
                batch=batch,
                work_file=work_file,
                unit_number=1,
                range_start=range_start,
                range_end=range_end,
                count_type=count_type,
                workload_count=workload_count,
            )
        )

    # Ignore conflicts so duplicate creation attempts from concurrent requests
    # do not raise and break auto-assign in production.
    WorkUnit.objects.bulk_create(units_to_create, ignore_conflicts=True)


def close_active_assignments(unit: WorkUnit, stage: str):
    now = timezone.now()
    WorkUnitAssignment.objects.filter(unit=unit, stage=stage, is_active=True).update(is_active=False, ended_at=now)


def assign_unit(unit: WorkUnit, production_user, validation_user, assigned_by, reason=None, notify=True):
    close_active_assignments(unit, WorkUnitAssignment.Stage.PRODUCTION)
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)

    now = timezone.now()

    unit.current_production_assignee = production_user
    unit.current_validation_assignee = validation_user
    unit.assigned_by = assigned_by
    unit.status = WorkUnit.Status.ASSIGNED_TO_PRODUCTION
    unit.production_assigned_at = now
    unit.redo_reason = None
    unit.validator_feedback = None
    unit.save(
        update_fields=[
            "current_production_assignee",
            "current_validation_assignee",
            "assigned_by",
            "status",
            "production_assigned_at",
            "redo_reason",
            "validator_feedback",
            "updated",
        ]
    )

    WorkUnitAssignment.objects.create(
        unit=unit,
        stage=WorkUnitAssignment.Stage.PRODUCTION,
        assignee=production_user,
        assigned_by=assigned_by,
        is_active=True,
        reason=reason,
    )
    WorkUnitAssignment.objects.create(
        unit=unit,
        stage=WorkUnitAssignment.Stage.VALIDATION,
        assignee=validation_user,
        assigned_by=assigned_by,
        is_active=True,
        reason=reason,
    )

    if notify:
        notify_work_assigned(unit, production_user, validation_user)


def unassign_unit(unit: WorkUnit, reason=None):
    close_active_assignments(unit, WorkUnitAssignment.Stage.PRODUCTION)
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)

    unit.current_production_assignee = None
    unit.current_validation_assignee = None
    unit.status = WorkUnit.Status.PENDING
    unit.redo_reason = reason
    unit.save(
        update_fields=[
            "current_production_assignee",
            "current_validation_assignee",
            "status",
            "redo_reason",
            "updated",
        ]
    )


def auto_assign_units(
    batch: WorkBatch,
    production_users,
    validation_users,
    assigned_by,
    **_kwargs,
):
    """
    LPT (Longest Processing Time first) assignment with file-count tie-breaking.
    """
    assignments_to_notify = []
    with transaction.atomic():
        # Serialize initialization for the same batch to avoid races across
        # concurrent auto-assign requests.
        WorkBatch.objects.select_for_update().filter(pk=batch.pk).exists()
        initialize_work_units(batch)

        # Largest files first — LPT heuristic gives the most balanced page spread
        pending_units = list(
            WorkUnit.objects.filter(batch=batch, status=WorkUnit.Status.PENDING)
            .select_related("work_file")
            .order_by("-workload_count", "work_file__relative_path", "unit_number")
        )
        if not pending_units:
            return 0

        # Cross-job workloads so existing assignments are accounted for
        workloads = _get_cross_job_workloads(production_users)
        file_counts = {u.pk: 0 for u in production_users}
        user_by_pk = {u.pk: u for u in production_users}
        validation_cycle = cycle(validation_users)
        total_assigned = 0

        for unit in pending_units:
            best_pk = min(
                workloads,
                key=lambda pk: (workloads[pk], file_counts[pk], pk),
            )
            prod = user_by_pk[best_pk]
            validator = next(validation_cycle)
            assign_unit(unit, prod, validator, assigned_by, notify=False)
            assignments_to_notify.append((unit, prod, validator))
            workloads[best_pk] += unit.workload_count
            file_counts[best_pk] += 1
            total_assigned += 1

    if assignments_to_notify:
        notify_bulk_work_assigned(assignments_to_notify)

    return total_assigned


def auto_refill_for_production_user(batch: WorkBatch, production_user, assigned_by=None):
    if not batch.auto_refill_enabled or not production_user:
        return 0

    if not WorkBatchMember.objects.filter(
        batch=batch,
        user=production_user,
        role=WorkBatchMember.Role.PRODUCTION,
        is_active=True,
    ).exists():
        return 0

    active_validation_members = list(
        WorkBatchMember.objects.filter(
            batch=batch,
            role=WorkBatchMember.Role.VALIDATION,
            is_active=True,
        ).select_related("user")
    )
    if not active_validation_members:
        return 0

    active_workload = WorkUnit.objects.filter(
        batch=batch,
        current_production_assignee=production_user,
        status__in=[WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO],
    ).aggregate(total=models.Sum("workload_count"))["total"] or 0

    remaining_capacity = max(batch.auto_batch_size_per_production_user - active_workload, 0)
    if remaining_capacity == 0:
        return 0

    pending_units = list(
        WorkUnit.objects.filter(batch=batch, status=WorkUnit.Status.PENDING)
        .order_by("work_file__relative_path", "unit_number")
    )
    if not pending_units:
        return 0

    validation_cycle = cycle([member.user for member in active_validation_members])
    assigned_count = 0
    filled_workload = 0
    assignments_to_notify = []

    with transaction.atomic():
        for unit in pending_units:
            if filled_workload + unit.workload_count > remaining_capacity and assigned_count > 0:
                break
            validator = next(validation_cycle)
            assign_unit(
                unit=unit,
                production_user=production_user,
                validation_user=validator,
                assigned_by=assigned_by or unit.assigned_by,
                reason="Auto refill after production completion.",
                notify=False,
            )
            assignments_to_notify.append((unit, production_user, validator))
            assigned_count += 1
            filled_workload += unit.workload_count

    if assignments_to_notify:
        notify_bulk_work_assigned(assignments_to_notify)

    return assigned_count


def submit_to_validation(unit: WorkUnit):
    close_active_assignments(unit, WorkUnitAssignment.Stage.PRODUCTION)
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)
    unit.status = WorkUnit.Status.IN_VALIDATION
    unit.current_validation_assignee = None
    unit.production_submitted_at = timezone.now()
    unit.save(update_fields=["status", "current_validation_assignee", "production_submitted_at", "updated"])

    notify_production_submitted(unit)


def complete_validation(unit: WorkUnit, feedback=""):
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)
    unit.status = WorkUnit.Status.COMPLETED
    unit.validation_completed_at = timezone.now()
    unit.validator_feedback = feedback or None
    unit.save(update_fields=["status", "validation_completed_at", "validator_feedback", "updated"])

    notify_validation_approved(unit)

    # Check if all units in the batch are now completed — if so, mark batch COMPLETED.
    # select_for_update prevents two concurrent validations both seeing has_incomplete=False.
    with transaction.atomic():
        batch = WorkBatch.objects.select_for_update().get(pk=unit.batch_id)
        has_incomplete = WorkUnit.objects.filter(batch=batch).exclude(
            status=WorkUnit.Status.COMPLETED
        ).exists()
        if not has_incomplete and batch.status != WorkBatch.Status.COMPLETED:
            batch.status = WorkBatch.Status.COMPLETED
            update_fields = ["status", "updated"]
            if batch.delivery_status == WorkBatch.DeliveryStatus.REWORK_REQUESTED:
                batch.delivery_status = WorkBatch.DeliveryStatus.CLIENT_REVIEW_PENDING
                update_fields.append("delivery_status")
            batch.save(update_fields=update_fields)
            notify_batch_completed(batch)


def send_back_for_redo(unit: WorkUnit, reason: str, assigned_by, report_file=None):
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)

    unit.status = WorkUnit.Status.REDO
    unit.redo_reason = reason
    unit.validator_feedback = reason
    unit.production_assigned_at = timezone.now()

    update_fields = ["status", "redo_reason", "validator_feedback", "production_assigned_at", "updated"]

    if report_file:
        unit.redo_report_file = report_file
        update_fields.append("redo_report_file")

    unit.save(update_fields=update_fields)

    WorkUnitAssignment.objects.create(
        unit=unit,
        stage=WorkUnitAssignment.Stage.PRODUCTION,
        assignee=unit.current_production_assignee,
        assigned_by=assigned_by,
        is_active=True,
        reason="Redo requested by validator.",
    )

    notify_sent_for_redo(unit, reason)


def reassign_production_user(unit: WorkUnit, new_user, assigned_by, reason=None):
    close_active_assignments(unit, WorkUnitAssignment.Stage.PRODUCTION)

    unit.current_production_assignee = new_user
    unit.assigned_by = assigned_by
    unit.status = WorkUnit.Status.ASSIGNED_TO_PRODUCTION
    unit.production_assigned_at = timezone.now()
    unit.redo_reason = None
    unit.save(
        update_fields=[
            "current_production_assignee",
            "assigned_by",
            "status",
            "production_assigned_at",
            "redo_reason",
            "updated",
        ]
    )

    WorkUnitAssignment.objects.create(
        unit=unit,
        stage=WorkUnitAssignment.Stage.PRODUCTION,
        assignee=new_user,
        assigned_by=assigned_by,
        is_active=True,
        reason=reason,
    )

    notify_reassignment(unit, new_user)


def create_issue_alert(unit: WorkUnit, message: str, reported_by):
    return WorkUnitAlert.objects.create(
        unit=unit,
        alert_type=WorkUnitAlert.AlertType.ISSUE,
        message=message,
        reported_by=reported_by,
    )


def create_overdue_alerts(queryset):
    alerts = []
    for unit in queryset:
        already_exists = unit.alerts.filter(
            alert_type=WorkUnitAlert.AlertType.OVERDUE,
            is_resolved=False,
        ).exists()

        if already_exists:
            continue

        alerts.append(
            WorkUnitAlert(
                unit=unit,
                alert_type=WorkUnitAlert.AlertType.OVERDUE,
                message="Work unit is taking longer than expected.",
                reported_by=unit.assigned_by,
            )
        )

    if alerts:
        WorkUnitAlert.objects.bulk_create(alerts)

    return len(alerts)


def scan_batch_overdue_units(batch: WorkBatch):
    cutoff = timezone.now() - timedelta(hours=batch.overdue_hours)
    overdue_units = WorkUnit.objects.filter(
        batch=batch,
        status__in=[WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO],
        production_assigned_at__lt=cutoff,
    )
    return create_overdue_alerts(overdue_units)
