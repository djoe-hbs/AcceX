from django.conf import settings
from django.core.mail import send_mail


def _is_enabled():
    return getattr(settings, "WORK_NOTIFICATION_EMAIL_ENABLED", True)


def _send(subject, body, recipient_list):
    if not _is_enabled():
        return
    valid = [e for e in recipient_list if e]
    if not valid:
        return
    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=valid,
        fail_silently=True,
    )


def _unit_label(unit):
    file_name = ""
    if unit.work_file:
        file_name = unit.work_file.relative_path or ""
    batch_name = unit.batch.name if unit.batch else ""
    return f"{batch_name} — {file_name}" if file_name else batch_name


# ── Event helpers ──


_ROLE_DISPLAY = {
    "SUPERADMIN": "Super Admin",
    "ADMIN": "Admin",
    "SME": "SME",
    "PRODUCTION_USER": "Production User",
    "VALIDATION_USER": "Validation User",
}


def notify_user_created(user, plain_password):
    role_label = _ROLE_DISPLAY.get(user.role, user.role)
    username_line = ""
    _send(
        subject="[AcceX] Your account has been created",
        body=(
            f"Hi {user.name},\n\n"
            f"Your AcceX account has been created. Here are your login details:\n\n"
            f"Email    : {user.email}\n"
            f"{username_line}"
            f"Password : {plain_password}\n"
            f"Role     : {role_label}\n\n"
            f"Please log in and change your password as soon as possible.\n\n"
            f"AcceX Team\n"
        ),
        recipient_list=[user.email],
    )


def notify_work_assigned(unit, production_user, validation_user):
    label = _unit_label(unit)
    _send(
        subject=f"[AcceX] You have been assigned new work: {label}",
        body=(
            f"Hi {production_user.name},\n\n"
            f"You have been assigned a new work unit.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n\n"
            f"Please log in to AcceX to start working on it.\n"
        ),
        recipient_list=[production_user.email],
    )
    _send(
        subject=f"[AcceX] New unit queued for your validation: {label}",
        body=(
            f"Hi {validation_user.name},\n\n"
            f"A work unit has been assigned and will come to you for validation once production is done.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n\n"
        ),
        recipient_list=[validation_user.email],
    )


def notify_production_submitted(unit):
    validator = unit.current_validation_assignee
    if not validator:
        return
    label = _unit_label(unit)
    _send(
        subject=f"[AcceX] Work ready for validation: {label}",
        body=(
            f"Hi {validator.name},\n\n"
            f"A work unit has been submitted by production and is now ready for your validation.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n\n"
            f"Please log in to AcceX to review it.\n"
        ),
        recipient_list=[validator.email],
    )


def notify_validation_approved(unit):
    producer = unit.current_production_assignee
    if not producer:
        return
    label = _unit_label(unit)
    _send(
        subject=f"[AcceX] Your work has been approved: {label}",
        body=(
            f"Hi {producer.name},\n\n"
            f"Your work unit has been validated and approved.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n\n"
            f"Great job!\n"
        ),
        recipient_list=[producer.email],
    )


def notify_sent_for_redo(unit, reason):
    producer = unit.current_production_assignee
    if not producer:
        return
    label = _unit_label(unit)
    _send(
        subject=f"[AcceX] Rework required: {label}",
        body=(
            f"Hi {producer.name},\n\n"
            f"Your work unit has been sent back for rework by the validator.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n"
            f"Reason: {reason}\n\n"
            f"Please log in to AcceX to address the feedback.\n"
        ),
        recipient_list=[producer.email],
    )


def notify_batch_completed(batch):
    sme = batch.initiated_by_sme
    if not sme:
        return
    _send(
        subject=f"[AcceX] Job completed: {batch.name}",
        body=(
            f"Hi {sme.name},\n\n"
            f"All work units in the job \"{batch.name}\" have been completed and validated.\n\n"
            f"You can now review the deliverables and send them to the client.\n"
        ),
        recipient_list=[sme.email],
    )


def notify_client_rework_requested(batch, review):
    sme = batch.initiated_by_sme
    if not sme:
        return
    _send(
        subject=f"[AcceX] Client feedback received — rework needed: {batch.name}",
        body=(
            f"Hi {sme.name},\n\n"
            f"The client has submitted feedback for the job \"{batch.name}\" and rework has been requested.\n\n"
            f"Note: {review.review_note or 'No note provided.'}\n\n"
            f"Please log in to AcceX to review the feedback and assign rework.\n"
        ),
        recipient_list=[sme.email],
    )


def notify_units_for_client_rework(unit_assignments, batch):
    for unit, production_user, validation_user in unit_assignments:
        label = _unit_label(unit)
        _send(
            subject=f"[AcceX] Client rework assigned to you: {label}",
            body=(
                f"Hi {production_user.name},\n\n"
                f"A work unit from the job \"{batch.name}\" needs rework based on client feedback.\n\n"
                f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n"
                f"Reason: {unit.redo_reason or 'Client requested rework.'}\n\n"
                f"Please log in to AcceX to address the changes.\n"
            ),
            recipient_list=[production_user.email],
        )
        _send(
            subject=f"[AcceX] Client rework unit queued for validation: {label}",
            body=(
                f"Hi {validation_user.name},\n\n"
                f"A reworked unit from the job \"{batch.name}\" will come to you for re-validation.\n\n"
                f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n"
            ),
            recipient_list=[validation_user.email],
        )


def notify_batch_signed_off(batch):
    sme = batch.initiated_by_sme
    if not sme:
        return
    _send(
        subject=f"[AcceX] Job signed off: {batch.name}",
        body=(
            f"Hi {sme.name},\n\n"
            f"The job \"{batch.name}\" has been signed off by the superadmin.\n\n"
            f"The project is now fully completed. No further rework or client feedback is expected.\n"
        ),
        recipient_list=[sme.email],
    )


def notify_reassignment(unit, new_user):
    label = _unit_label(unit)
    _send(
        subject=f"[AcceX] You have been reassigned work: {label}",
        body=(
            f"Hi {new_user.name},\n\n"
            f"A work unit has been reassigned to you.\n\n"
            f"Job: {unit.batch.name}\n"
            f"File: {unit.work_file.relative_path if unit.work_file else 'N/A'}\n\n"
            f"Please log in to AcceX to start working on it.\n"
        ),
        recipient_list=[new_user.email],
    )
