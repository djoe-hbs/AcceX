from decimal import Decimal

from django.utils import timezone

from core.client.models import ClientCost
from core.work.models import WorkFile, WorkFileBilling, WorkUnit


FILE_TYPE_TO_DOCUMENT_TYPE = {
    WorkFile.FileType.PDF: ClientCost.DocumentType.PDF,
    WorkFile.FileType.DOCX: ClientCost.DocumentType.WORD,
    WorkFile.FileType.EXCEL: ClientCost.DocumentType.EXCEL,
}

COUNT_TYPE_TO_PRICING_MODE = {
    WorkFile.CountType.PAGE: ClientCost.PricingMode.PER_PAGE,
    WorkFile.CountType.ROW: ClientCost.PricingMode.PER_ROW,
}


def _resolve_quantity(work_file: WorkFile, pricing_mode: str) -> Decimal:
    if pricing_mode in [ClientCost.PricingMode.PER_PAGE, ClientCost.PricingMode.PER_ROW]:
        return Decimal(work_file.count or 0)
    return Decimal("1")


def _all_units_completed(work_file: WorkFile) -> bool:
    if not work_file.units.exists():
        return False

    return not work_file.units.exclude(status=WorkUnit.Status.COMPLETED).exists()


def calculate_or_update_file_billing(work_file: WorkFile, completed_at=None, force=False):
    if work_file.is_directory or work_file.file_type == WorkFile.FileType.ZIP:
        return None

    if not work_file.batch.client:
        return None

    if not force and not _all_units_completed(work_file):
        return None

    billing, _ = WorkFileBilling.objects.get_or_create(
        work_file=work_file,
        defaults={"batch": work_file.batch, "client": work_file.batch.client},
    )

    if billing.completed_at and not force:
        return billing

    document_type = FILE_TYPE_TO_DOCUMENT_TYPE.get(work_file.file_type)
    preferred_pricing_mode = COUNT_TYPE_TO_PRICING_MODE.get(work_file.count_type, ClientCost.PricingMode.PER_FILE)

    billing.batch = work_file.batch
    billing.client = work_file.batch.client
    billing.document_type = document_type
    billing.pricing_mode = preferred_pricing_mode
    billing.completed_at = completed_at or timezone.now()

    if not document_type:
        billing.quantity = Decimal("0")
        billing.unit_cost = Decimal("0")
        billing.amount = Decimal("0")
        billing.billing_note = "No billing rule for this file type."
        billing.save()
        return billing

    cost_rule = ClientCost.objects.filter(
        client=work_file.batch.client,
        document_type=document_type,
        pricing_mode=preferred_pricing_mode,
    ).first()

    if not cost_rule and preferred_pricing_mode != ClientCost.PricingMode.PER_FILE:
        cost_rule = ClientCost.objects.filter(
            client=work_file.batch.client,
            document_type=document_type,
            pricing_mode=ClientCost.PricingMode.PER_FILE,
        ).first()

    if not cost_rule:
        billing.quantity = Decimal("0")
        billing.unit_cost = Decimal("0")
        billing.amount = Decimal("0")
        billing.billing_note = f"Cost rule missing for {document_type}."
        billing.save()
        return billing

    quantity = _resolve_quantity(work_file, cost_rule.pricing_mode)
    if quantity < 0:
        quantity = Decimal("0")

    amount = quantity * cost_rule.unit_cost

    billing.pricing_mode = cost_rule.pricing_mode
    billing.quantity = quantity
    billing.unit_cost = cost_rule.unit_cost
    billing.amount = amount
    billing.billing_note = None
    billing.save()

    return billing


def backfill_batch_file_billings(batch):
    created_or_updated = 0

    for work_file in batch.files.filter(is_directory=False).exclude(file_type=WorkFile.FileType.ZIP):
        billing = calculate_or_update_file_billing(work_file=work_file, force=False)
        if billing:
            created_or_updated += 1

    return created_or_updated
