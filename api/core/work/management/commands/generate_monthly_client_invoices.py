from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.work.services import generate_monthly_client_invoices


class Command(BaseCommand):
    help = "Generate monthly client invoices and optionally email superadmins."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=False)
        parser.add_argument("--month", type=int, required=False)
        parser.add_argument("--force", action="store_true", help="Run regardless of configured invoice day.")
        parser.add_argument("--no-email", action="store_true", help="Generate invoices without sending emails.")

    def handle(self, *args, **options):
        today = timezone.localdate()

        year = options.get("year") or today.year
        month = options.get("month") or today.month
        run_day = int(getattr(settings, "WORK_INVOICE_DAY_OF_MONTH", 25))

        if not options.get("force") and today.day != run_day:
            self.stdout.write(
                self.style.WARNING(
                    f"Skipped invoice generation. Today is {today.day}; configured day is {run_day}."
                )
            )
            return

        send_email = not options.get("no_email", False)
        invoices = generate_monthly_client_invoices(year=year, month=month, send_email=send_email)

        self.stdout.write(
            self.style.SUCCESS(
                f"Generated {len(invoices)} invoice(s) for {year}-{month:02d}. Email sent: {send_email}."
            )
        )
