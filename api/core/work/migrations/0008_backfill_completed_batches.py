from django.db import migrations


def backfill_completed_batches(apps, schema_editor):
    """
    Mark batches as COMPLETED where every unit has status=COMPLETED
    but the batch itself is still stuck in READY.
    """
    WorkBatch = apps.get_model("core_work", "WorkBatch")
    WorkUnit = apps.get_model("core_work", "WorkUnit")

    for batch in WorkBatch.objects.filter(status="READY"):
        total_units = WorkUnit.objects.filter(batch=batch).count()
        if total_units == 0:
            continue
        incomplete = WorkUnit.objects.filter(batch=batch).exclude(status="COMPLETED").count()
        if incomplete == 0:
            batch.status = "COMPLETED"
            batch.save(update_fields=["status", "updated"])


class Migration(migrations.Migration):

    dependencies = [
        ("core_work", "0007_merge_status_and_invoice"),
    ]

    operations = [
        migrations.RunPython(backfill_completed_batches, migrations.RunPython.noop),
    ]
