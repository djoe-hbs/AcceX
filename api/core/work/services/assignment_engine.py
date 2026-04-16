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
    batch_size_per_production_user=None,
    split_threshold=100,
    split_chunk_size=25,
):
    num_users = len(production_users)

    # ── Re-run: units already exist → assign pending ones balanced ──
    if WorkUnit.objects.filter(batch=batch).exists():
        return _assign_pending_units_balanced(
            batch, production_users, validation_users, assigned_by,
            batch_size_per_production_user,
        )

    # ── First run: create units split equally across users ──
    eligible_files = list(
        batch.files.filter(is_directory=False)
        .exclude(file_type=WorkFile.FileType.ZIP)
        .order_by("relative_path")
    )

    if not eligible_files:
        return 0

    # Total workload across every file in the batch (recursive folders
    # are already flattened — every non-directory file is in the table).
    total_workload = 0
    for f in eligible_files:
        if f.count_type != WorkFile.CountType.NONE and f.count and f.count > 0:
            total_workload += f.count
        else:
            total_workload += 1

    fair_share = math.ceil(total_workload / num_users)

    # Optional manual cap for batch-by-batch assignment.
    if batch_size_per_production_user and batch_size_per_production_user < fair_share:
        workload_cap = batch_size_per_production_user
    else:
        workload_cap = fair_share

    # Persist for auto-refill.
    batch.auto_batch_size_per_production_user = workload_cap
    batch.save(update_fields=["auto_batch_size_per_production_user", "updated"])

    validation_cycle = cycle(validation_users)
    user_idx = 0
    user_pages = 0
    total_assigned = 0

    with transaction.atomic():
        for work_file in eligible_files:
            file_count = work_file.count or 0
            is_countable = (
                work_file.count_type != WorkFile.CountType.NONE
                and file_count > 0
            )

            if not is_countable:
                # ── Non-countable file → single whole-file unit ──
                unit = WorkUnit.objects.create(
                    batch=batch,
                    work_file=work_file,
                    unit_number=1,
                    count_type=work_file.count_type,
                    workload_count=1,
                )
                prod = production_users[user_idx]
                assign_unit(unit, prod, next(validation_cycle), assigned_by)
                total_assigned += 1
                user_pages += 1

                if user_pages >= workload_cap and user_idx < num_users - 1:
                    user_idx += 1
                    user_pages = 0
            else:
                # ── Countable file → split at user boundaries ──
                remaining = file_count
                page_cursor = 1
                unit_num = 1

                while remaining > 0:
                    # Advance to next user if current one is full.
                    while user_pages >= workload_cap and user_idx < num_users - 1:
                        user_idx += 1
                        user_pages = 0

                    # How many pages this user takes from this file.
                    if user_idx < num_users - 1:
                        can_take = workload_cap - user_pages
                        chunk = min(remaining, can_take)
                    else:
                        # Last user absorbs everything left (odd remainder).
                        chunk = remaining

                    page_end = page_cursor + chunk - 1

                    unit = WorkUnit.objects.create(
                        batch=batch,
                        work_file=work_file,
                        unit_number=unit_num,
                        range_start=page_cursor,
                        range_end=page_end,
                        count_type=work_file.count_type,
                        workload_count=chunk,
                    )
                    prod = production_users[user_idx]
                    assign_unit(unit, prod, next(validation_cycle), assigned_by)
                    total_assigned += 1

                    user_pages += chunk
                    remaining -= chunk
                    page_cursor = page_end + 1
                    unit_num += 1

    return total_assigned


def _assign_pending_units_balanced(
    batch, production_users, validation_users, assigned_by,
    batch_size_per_production_user=None,
):
    """Re-run: assign already-created pending units with workload balancing."""
    pending_units = list(
        WorkUnit.objects.filter(batch=batch, status=WorkUnit.Status.PENDING)
        .select_related("work_file")
        .order_by("work_file__relative_path", "unit_number")
    )

    if not pending_units:
        return 0

    num_users = len(production_users)
    total_pending = sum(u.workload_count for u in pending_units)
    fair_share = math.ceil(total_pending / num_users)

    if batch_size_per_production_user and batch_size_per_production_user < fair_share:
        workload_cap = batch_size_per_production_user
    else:
        workload_cap = fair_share

    validation_cycle = cycle(validation_users)
    workloads = {user.pk: 0 for user in production_users}
    user_by_pk = {user.pk: user for user in production_users}
    exhausted = set()
    total_assigned = 0

    with transaction.atomic():
        for unit in pending_units:
            if len(exhausted) >= num_users:
                break

            best_pk = min(
                (pk for pk in workloads if pk not in exhausted),
                key=lambda pk: workloads[pk],
            )
            prod = user_by_pk[best_pk]
            assign_unit(unit, prod, next(validation_cycle), assigned_by)

            total_assigned += 1
            workloads[best_pk] += unit.workload_count

            if workloads[best_pk] >= workload_cap:
                exhausted.add(best_pk)

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
            )
            assigned_count += 1
            filled_workload += unit.workload_count

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

    # Check if all units in the batch are now completed — if so, mark batch COMPLETED.
    batch = unit.batch
    has_incomplete = WorkUnit.objects.filter(batch=batch).exclude(
        status=WorkUnit.Status.COMPLETED
    ).exists()
    if not has_incomplete and batch.status != WorkBatch.Status.COMPLETED:
        batch.status = WorkBatch.Status.COMPLETED
        batch.save(update_fields=["status", "updated"])


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
