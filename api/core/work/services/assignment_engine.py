from datetime import timedelta
from itertools import cycle

from django.db import transaction
from django.utils import timezone

from core.work.models import (
    WorkBatch,
    WorkBatchMember,
    WorkFile,
    WorkUnit,
    WorkUnitAssignment,
    WorkUnitAlert,
)


def initialize_work_units(batch: WorkBatch, split_threshold=100, split_chunk_size=25):
    if WorkUnit.objects.filter(batch=batch).exists():
        return

    eligible_files = batch.files.filter(is_directory=False).exclude(file_type=WorkFile.FileType.ZIP)

    units_to_create = []
    for work_file in eligible_files:
        count = work_file.count or 0
        count_type = work_file.count_type

        if count_type != WorkFile.CountType.NONE and count > split_threshold:
            start = 1
            unit_number = 1
            while start <= count:
                end = min(start + split_chunk_size - 1, count)
                units_to_create.append(
                    WorkUnit(
                        batch=batch,
                        work_file=work_file,
                        unit_number=unit_number,
                        range_start=start,
                        range_end=end,
                        count_type=count_type,
                        workload_count=(end - start + 1),
                    )
                )
                unit_number += 1
                start = end + 1
        else:
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

    WorkUnit.objects.bulk_create(units_to_create)


def close_active_assignments(unit: WorkUnit, stage: str):
    now = timezone.now()
    WorkUnitAssignment.objects.filter(unit=unit, stage=stage, is_active=True).update(is_active=False, ended_at=now)


def assign_unit(unit: WorkUnit, production_user, validation_user, assigned_by, reason=None):
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
    batch_size_per_production_user=50,
    split_threshold=100,
    split_chunk_size=25,
):
    initialize_work_units(batch=batch, split_threshold=split_threshold, split_chunk_size=split_chunk_size)

    pending_units = list(
        WorkUnit.objects.filter(batch=batch, status=WorkUnit.Status.PENDING)
        .select_related("work_file")
        .order_by("work_file__relative_path", "unit_number")
    )

    if not pending_units:
        return 0

    validation_cycle = cycle(validation_users)

    total_assigned = 0

    with transaction.atomic():
        queue_index = 0
        for production_user in production_users:
            assigned_count_for_user = 0
            while queue_index < len(pending_units) and assigned_count_for_user < batch_size_per_production_user:
                unit = pending_units[queue_index]
                queue_index += 1

                validator = next(validation_cycle)
                assign_unit(unit, production_user, validator, assigned_by)

                total_assigned += 1
                assigned_count_for_user += 1

            if queue_index >= len(pending_units):
                break

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

    active_assigned_count = WorkUnit.objects.filter(
        batch=batch,
        current_production_assignee=production_user,
        status__in=[WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO],
    ).count()

    refill_size = max(batch.auto_batch_size_per_production_user - active_assigned_count, 0)
    if refill_size == 0:
        return 0

    pending_units = list(
        WorkUnit.objects.filter(batch=batch, status=WorkUnit.Status.PENDING)
        .order_by("work_file__relative_path", "unit_number")[:refill_size]
    )
    if not pending_units:
        return 0

    validation_cycle = cycle([member.user for member in active_validation_members])
    assigned_count = 0

    with transaction.atomic():
        for unit in pending_units:
            validator = next(validation_cycle)
            assign_unit(
                unit=unit,
                production_user=production_user,
                validation_user=validator,
                assigned_by=assigned_by or unit.assigned_by,
                reason="Auto refill after production completion.",
            )
            assigned_count += 1

    return assigned_count


def submit_to_validation(unit: WorkUnit):
    close_active_assignments(unit, WorkUnitAssignment.Stage.PRODUCTION)
    unit.status = WorkUnit.Status.IN_VALIDATION
    unit.production_submitted_at = timezone.now()
    unit.save(update_fields=["status", "production_submitted_at", "updated"])


def complete_validation(unit: WorkUnit, feedback=""):
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)
    unit.status = WorkUnit.Status.COMPLETED
    unit.validation_completed_at = timezone.now()
    unit.validator_feedback = feedback or None
    unit.save(update_fields=["status", "validation_completed_at", "validator_feedback", "updated"])


def send_back_for_redo(unit: WorkUnit, reason: str, assigned_by):
    close_active_assignments(unit, WorkUnitAssignment.Stage.VALIDATION)

    unit.status = WorkUnit.Status.REDO
    unit.redo_reason = reason
    unit.validator_feedback = reason
    unit.production_assigned_at = timezone.now()
    unit.save(update_fields=["status", "redo_reason", "validator_feedback", "production_assigned_at", "updated"])

    WorkUnitAssignment.objects.create(
        unit=unit,
        stage=WorkUnitAssignment.Stage.PRODUCTION,
        assignee=unit.current_production_assignee,
        assigned_by=assigned_by,
        is_active=True,
        reason="Redo requested by validator.",
    )


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
