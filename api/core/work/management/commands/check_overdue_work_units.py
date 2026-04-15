from django.core.management.base import BaseCommand

from core.work.models import WorkBatch
from core.work.services import scan_batch_overdue_units


class Command(BaseCommand):
    help = "Scan work units and create overdue alerts for units taking too long."

    def handle(self, *args, **options):
        total_created = 0

        for batch in WorkBatch.objects.filter(status=WorkBatch.Status.READY):
            total_created += scan_batch_overdue_units(batch)

        self.stdout.write(self.style.SUCCESS(f"Created {total_created} overdue alert(s)."))
