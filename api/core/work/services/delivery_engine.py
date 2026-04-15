import os
import tempfile
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.db import transaction

from core.work.models import WorkBatch, WorkDeliveryPackage, WorkClientReview, WorkFile, WorkUnit
from core.work.services.assignment_engine import unassign_unit


def _resolve_source_file_path(batch: WorkBatch, work_file: WorkFile):
    if not batch.extraction_root:
        return None

    root = (Path(settings.MEDIA_ROOT) / batch.extraction_root).resolve()
    candidate = (root / work_file.relative_path).resolve()

    try:
        candidate.relative_to(root)
    except ValueError:
        return None

    if not candidate.exists() or not candidate.is_file():
        return None

    return candidate


def _resolve_delivery_source_for_file(work_file: WorkFile, mode: str):
    units = list(work_file.units.all())

    latest_output_unit = None
    for unit in sorted(
        units,
        key=lambda u: ((u.production_output_uploaded_at or u.updated), u.updated),
        reverse=True,
    ):
        if unit.production_output:
            latest_output_unit = unit
            break

    all_completed = bool(units) and all(unit.status == WorkUnit.Status.COMPLETED for unit in units)

    if mode == WorkDeliveryPackage.Mode.COMPLETED_ONLY:
        if all_completed and latest_output_unit and latest_output_unit.production_output:
            return Path(latest_output_unit.production_output.path)
        return None

    if all_completed and latest_output_unit and latest_output_unit.production_output:
        return Path(latest_output_unit.production_output.path)

    return _resolve_source_file_path(work_file.batch, work_file)


def generate_delivery_package(batch: WorkBatch, mode: str, generated_by):
    include_files = []

    files = batch.files.filter(is_directory=False).exclude(file_type=WorkFile.FileType.ZIP).order_by("relative_path")

    for work_file in files:
        source_path = _resolve_delivery_source_for_file(work_file, mode)
        if not source_path:
            continue

        if not source_path.exists() or not source_path.is_file():
            continue

        include_files.append((source_path, work_file.relative_path))

    if not include_files:
        return None

    tmp_file = tempfile.NamedTemporaryFile(prefix=f"delivery_{batch.public_id.hex}_", suffix=".zip", delete=False)
    tmp_file_path = Path(tmp_file.name)
    tmp_file.close()

    with zipfile.ZipFile(tmp_file_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_handle:
        for source_path, archive_relative_path in include_files:
            zip_handle.write(source_path, arcname=archive_relative_path)

    package = WorkDeliveryPackage(batch=batch, mode=mode, total_files=len(include_files), generated_by=generated_by)
    archive_name = f"{batch.public_id.hex}_{mode.lower()}.zip"

    with open(tmp_file_path, "rb") as stream:
        package.archive.save(archive_name, File(stream), save=False)

    package.save()

    os.unlink(tmp_file_path)

    all_completed = not batch.units.exclude(status=WorkUnit.Status.COMPLETED).exists()
    if all_completed:
        batch.delivery_status = WorkBatch.DeliveryStatus.CLIENT_REVIEW_PENDING
        batch.save(update_fields=["delivery_status", "updated"])

    return package


def apply_client_review(batch: WorkBatch, review_file, review_note, uploaded_by):
    with transaction.atomic():
        review = WorkClientReview.objects.create(
            batch=batch,
            review_file=review_file,
            review_note=review_note,
            uploaded_by=uploaded_by,
            assigned_to_sme=batch.initiated_by_sme,
        )

        units = WorkUnit.objects.filter(batch=batch)
        for unit in units:
            if unit.status == WorkUnit.Status.COMPLETED:
                unassign_unit(unit, reason="Client requested rework.")

        batch.delivery_status = WorkBatch.DeliveryStatus.REWORK_REQUESTED
        batch.save(update_fields=["delivery_status", "updated"])

    return review


def mark_batch_signed_off(batch: WorkBatch, signed_off: bool):
    batch.delivery_status = (
        WorkBatch.DeliveryStatus.SIGNED_OFF
        if signed_off
        else WorkBatch.DeliveryStatus.CLIENT_REVIEW_PENDING
    )
    batch.save(update_fields=["delivery_status", "updated"])
    return batch
