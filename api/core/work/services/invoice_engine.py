import calendar
from decimal import Decimal
from datetime import date

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import transaction
from django.utils import timezone

from core.client.models import Client
from core.user.models import User
from core.work.models import WorkBatch, WorkClientInvoice, WorkClientInvoiceItem, WorkFileBilling
from .billing_engine import backfill_batch_file_billings
from .invoice_pdf import generate_invoice_pdf


def get_month_period(year: int, month: int):
    last_day = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, last_day)
    return period_start, period_end


def get_superadmin_emails():
    return list(
        User.objects.filter(
            role=User.Role.SUPERADMIN,
            is_active=True,
        ).exclude(email="").values_list("email", flat=True)
    )


def _build_invoice_item_description(billing: WorkFileBilling):
    batch_name = billing.batch.name if billing.batch else "Unknown Batch"
    relative_path = billing.work_file.relative_path if billing.work_file else "Unknown File"
    return f"{batch_name}: {relative_path}"


def _build_invoice_email_body(invoice: WorkClientInvoice):
    item_lines = []
    for item in invoice.items.select_related("work_file").order_by("batch__name", "work_file__relative_path")[:200]:
        item_lines.append(
            f"- {item.description} | qty={item.quantity} | unit={item.unit_cost} | amount={item.amount}"
        )

    if invoice.items.count() > 200:
        item_lines.append("- ... truncated. Use API for full invoice details.")

    lines = [
        f"Client Invoice: {invoice.client.name}",
        f"Period: {invoice.year}-{invoice.month:02d}",
        f"Total Amount: {invoice.total_amount}",
        "",
        "Line Items:",
    ]
    lines.extend(item_lines or ["- No billable items for this period."])

    return "\n".join(lines)


def send_client_invoice_email(invoice: WorkClientInvoice, recipients=None):
    if not getattr(settings, "WORK_INVOICE_EMAIL_ENABLED", True):
        return False

    recipient_list = list(recipients) if recipients else get_superadmin_emails()
    # Always include the admin email
    admin_email = "vibecoder.hbs@gmail.com"
    if admin_email not in recipient_list:
        recipient_list.append(admin_email)
    # Client email excluded — invoices sent only to superadmin/admin
    # client_email = getattr(invoice.client, "contact_email", None)
    # if client_email and client_email not in recipient_list:
    #     recipient_list.append(client_email)
    if not recipient_list:
        return False

    subject = f"AcceX Invoice | {invoice.client.name} | {invoice.year}-{invoice.month:02d}"
    body = _build_invoice_email_body(invoice)
    pdf_bytes = generate_invoice_pdf(invoice)
    filename = f"AcceX_Invoice_{invoice.client.name}_{invoice.year}-{invoice.month:02d}.pdf"

    email = EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipient_list,
    )
    email.attach(filename, pdf_bytes, "application/pdf")
    sent_count = email.send(fail_silently=False)

    if sent_count > 0:
        invoice.status = WorkClientInvoice.Status.SENT
        invoice.sent_at = timezone.now()
        invoice.save(update_fields=["status", "sent_at", "updated"])
        return True

    return False


@transaction.atomic
def generate_client_invoice(client: Client, year: int, month: int, generated_by=None, trigger=WorkClientInvoice.Trigger.MANUAL):
    period_start, period_end = get_month_period(year, month)

    batches = WorkBatch.objects.filter(
        client=client,
        created__year=year,
        created__month=month,
    )
    for batch in batches:
        backfill_batch_file_billings(batch)

    invoice, _ = WorkClientInvoice.objects.get_or_create(
        client=client,
        year=year,
        month=month,
        defaults={
            "period_start": period_start,
            "period_end": period_end,
            "trigger": trigger,
            "generated_by": generated_by,
        },
    )

    invoice.period_start = period_start
    invoice.period_end = period_end
    invoice.trigger = trigger
    invoice.generated_by = generated_by
    invoice.status = WorkClientInvoice.Status.GENERATED
    invoice.sent_at = None
    invoice.save(update_fields=["period_start", "period_end", "trigger", "generated_by", "status", "sent_at", "updated"])

    WorkClientInvoiceItem.objects.filter(invoice=invoice).delete()

    billings = WorkFileBilling.objects.filter(
        client=client,
        batch__created__year=year,
        batch__created__month=month,
        completed_at__isnull=False,
    ).select_related("batch", "work_file")

    invoice_items = []
    total = Decimal("0")

    for billing in billings:
        amount = billing.amount or Decimal("0")
        quantity = billing.quantity or Decimal("0")
        unit_cost = billing.unit_cost or Decimal("0")

        invoice_items.append(
            WorkClientInvoiceItem(
                invoice=invoice,
                batch=billing.batch,
                work_file=billing.work_file,
                work_file_billing=billing,
                description=_build_invoice_item_description(billing),
                quantity=quantity,
                unit_cost=unit_cost,
                amount=amount,
            )
        )
        total += amount

    if invoice_items:
        WorkClientInvoiceItem.objects.bulk_create(invoice_items)

    invoice.total_amount = total
    invoice.save(update_fields=["total_amount", "updated"])

    return invoice


def generate_monthly_client_invoices(year: int, month: int, generated_by=None, send_email=True):
    client_ids = (
        WorkBatch.objects.filter(created__year=year, created__month=month, client__isnull=False)
        .values_list("client_id", flat=True)
        .distinct()
    )

    invoices = []
    for client in Client.objects.filter(id__in=client_ids):
        invoice = generate_client_invoice(
            client=client,
            year=year,
            month=month,
            generated_by=generated_by,
            trigger=WorkClientInvoice.Trigger.AUTO,
        )
        if send_email:
            send_client_invoice_email(invoice)
        invoices.append(invoice)

    return invoices
