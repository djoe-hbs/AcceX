from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from core.work.models import WorkUnit
from core.work.services import (
    auto_refill_for_production_user,
    scan_batch_overdue_units,
    calculate_or_update_file_billing,
)


@receiver(pre_save, sender=WorkUnit)
def work_unit_pre_save(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_status = None
        return

    previous = WorkUnit.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    instance._previous_status = previous


@receiver(post_save, sender=WorkUnit)
def work_unit_post_save(sender, instance, created, **kwargs):
    previous_status = getattr(instance, "_previous_status", None)

    # Refill queue automatically when a production user frees up capacity.
    if not created and previous_status != instance.status and instance.status in {
        WorkUnit.Status.IN_VALIDATION,
        WorkUnit.Status.COMPLETED,
    }:
        auto_refill_for_production_user(
            batch=instance.batch,
            production_user=instance.current_production_assignee,
            assigned_by=instance.assigned_by,
        )

    if not created and previous_status != instance.status and instance.status == WorkUnit.Status.COMPLETED:
        calculate_or_update_file_billing(
            work_file=instance.work_file,
            completed_at=instance.validation_completed_at,
        )

    # Opportunistic overdue scan so SME gets alert entries without manual trigger.
    scan_batch_overdue_units(instance.batch)
