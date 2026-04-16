import uuid

from django.db import models

from core.user.models import User
from core.client.models import Client


class WorkBatch(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "PROCESSING"
        READY = "READY"
        FAILED = "FAILED"

    class DeliveryStatus(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS"
        CLIENT_REVIEW_PENDING = "CLIENT_REVIEW_PENDING"
        REWORK_REQUESTED = "REWORK_REQUESTED"
        SIGNED_OFF = "SIGNED_OFF"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    name = models.CharField(max_length=255)
    client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True, related_name="work_batches")
    source_archive = models.FileField(upload_to="work/source")
    extraction_root = models.CharField(max_length=512, blank=True, null=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING, db_index=True)
    error_message = models.TextField(blank=True, null=True)

    total_files = models.PositiveIntegerField(default=0)
    total_directories = models.PositiveIntegerField(default=0)
    auto_refill_enabled = models.BooleanField(default=True)
    auto_batch_size_per_production_user = models.PositiveIntegerField(default=50)
    overdue_hours = models.PositiveIntegerField(default=24)
    delivery_status = models.CharField(max_length=32, choices=DeliveryStatus.choices, default=DeliveryStatus.IN_PROGRESS, db_index=True)
    initiated_by_sme = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_work_batches",
    )

    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="work_batches_uploaded")

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class WorkBatchMember(models.Model):
    class Role(models.TextChoices):
        PRODUCTION = "PRODUCTION"
        VALIDATION = "VALIDATION"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="work_batch_memberships")

    role = models.CharField(max_length=20, choices=Role.choices, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["batch", "user", "role"], name="unique_work_batch_member_role"),
        ]


class WorkFile(models.Model):
    class FileType(models.TextChoices):
        DIRECTORY = "DIRECTORY"
        PDF = "PDF"
        DOCX = "DOCX"
        EXCEL = "EXCEL"
        ZIP = "ZIP"
        OTHER = "OTHER"

    class CountType(models.TextChoices):
        NONE = "NONE"
        PAGE = "PAGE"
        ROW = "ROW"
        LINE = "LINE"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="files")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, blank=True, null=True, related_name="children")

    name = models.CharField(max_length=255)
    relative_path = models.TextField(db_index=True)
    depth = models.PositiveIntegerField(default=0)

    is_directory = models.BooleanField(default=False)
    file_extension = models.CharField(max_length=20, blank=True, null=True)
    file_type = models.CharField(max_length=20, choices=FileType.choices, db_index=True)

    count_type = models.CharField(max_length=10, choices=CountType.choices, default=CountType.NONE)
    count = models.PositiveBigIntegerField(blank=True, null=True)

    size_bytes = models.PositiveBigIntegerField(default=0)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["batch", "relative_path"], name="unique_work_file_path_per_batch"),
        ]
        ordering = ["relative_path"]

    def __str__(self):
        return f"{self.batch.name}: {self.relative_path}"


class WorkUnit(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        ASSIGNED_TO_PRODUCTION = "ASSIGNED_TO_PRODUCTION"
        IN_VALIDATION = "IN_VALIDATION"
        REDO = "REDO"
        COMPLETED = "COMPLETED"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="units")
    work_file = models.ForeignKey(WorkFile, on_delete=models.CASCADE, related_name="units")

    unit_number = models.PositiveIntegerField(default=1)
    range_start = models.PositiveBigIntegerField(blank=True, null=True)
    range_end = models.PositiveBigIntegerField(blank=True, null=True)

    count_type = models.CharField(max_length=10, choices=WorkFile.CountType.choices, default=WorkFile.CountType.NONE)
    workload_count = models.PositiveBigIntegerField(default=1)

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING, db_index=True)

    current_production_assignee = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_work_units",
    )
    current_validation_assignee = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validation_work_units",
    )
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_work_units",
    )

    production_output = models.FileField(upload_to="work/production_output", blank=True, null=True)
    production_output_uploaded_at = models.DateTimeField(blank=True, null=True)
    validator_feedback = models.TextField(blank=True, null=True)

    production_assigned_at = models.DateTimeField(blank=True, null=True)
    production_submitted_at = models.DateTimeField(blank=True, null=True)
    validation_completed_at = models.DateTimeField(blank=True, null=True)

    redo_reason = models.TextField(blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["batch", "work_file", "unit_number"], name="unique_work_unit_per_file_split"),
        ]
        ordering = ["work_file__relative_path", "unit_number"]

    def __str__(self):
        return f"{self.batch.name}::{self.work_file.relative_path}#{self.unit_number}"


class WorkUnitAssignment(models.Model):
    class Stage(models.TextChoices):
        PRODUCTION = "PRODUCTION"
        VALIDATION = "VALIDATION"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    unit = models.ForeignKey(WorkUnit, on_delete=models.CASCADE, related_name="assignments")
    stage = models.CharField(max_length=20, choices=Stage.choices, db_index=True)

    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="work_unit_assignments")
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="work_unit_assigned_by")

    is_active = models.BooleanField(default=True, db_index=True)
    reason = models.TextField(blank=True, null=True)

    ended_at = models.DateTimeField(blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class WorkUnitAlert(models.Model):
    class AlertType(models.TextChoices):
        ISSUE = "ISSUE"
        OVERDUE = "OVERDUE"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    unit = models.ForeignKey(WorkUnit, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=20, choices=AlertType.choices, db_index=True)
    message = models.TextField()

    reported_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reported_work_alerts")

    is_resolved = models.BooleanField(default=False, db_index=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class WorkFileBilling(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="file_billings")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="work_file_billings")
    work_file = models.OneToOneField(WorkFile, on_delete=models.CASCADE, related_name="billing")

    document_type = models.CharField(max_length=20, blank=True, null=True)
    pricing_mode = models.CharField(max_length=20, blank=True, null=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    billing_note = models.TextField(blank=True, null=True)

    completed_at = models.DateTimeField(blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-completed_at", "-created"]

    def __str__(self):
        return f"{self.client.name} - {self.work_file.relative_path} - {self.amount}"


class WorkClientInvoice(models.Model):
    class Trigger(models.TextChoices):
        AUTO = "AUTO"
        MANUAL = "MANUAL"

    class Status(models.TextChoices):
        GENERATED = "GENERATED"
        SENT = "SENT"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="work_invoices")
    year = models.PositiveIntegerField(db_index=True)
    month = models.PositiveIntegerField(db_index=True)

    period_start = models.DateField()
    period_end = models.DateField()

    trigger = models.CharField(max_length=10, choices=Trigger.choices, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.GENERATED, db_index=True)

    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    generated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_work_invoices",
    )
    sent_at = models.DateTimeField(blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["client", "year", "month"], name="unique_client_invoice_per_month"),
        ]
        ordering = ["-year", "-month", "-created"]

    def __str__(self):
        return f"Invoice {self.client.name} {self.year}-{self.month:02d}"


class WorkClientInvoiceItem(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    invoice = models.ForeignKey(WorkClientInvoice, on_delete=models.CASCADE, related_name="items")
    batch = models.ForeignKey(WorkBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoice_items")
    work_file = models.ForeignKey(WorkFile, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoice_items")
    work_file_billing = models.ForeignKey(
        WorkFileBilling,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    description = models.TextField()
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["batch__name", "work_file__relative_path", "id"]


class WorkDeliveryPackage(models.Model):
    class Mode(models.TextChoices):
        COMPLETED_ONLY = "COMPLETED_ONLY"
        INCLUDE_INCOMPLETE = "INCLUDE_INCOMPLETE"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="delivery_packages")
    mode = models.CharField(max_length=24, choices=Mode.choices, db_index=True)
    archive = models.FileField(upload_to="work/delivery")
    total_files = models.PositiveIntegerField(default=0)

    generated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_delivery_packages",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)


class WorkClientReview(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    batch = models.ForeignKey(WorkBatch, on_delete=models.CASCADE, related_name="client_reviews")
    review_file = models.FileField(upload_to="work/client_review")
    review_note = models.TextField(blank=True, null=True)

    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_client_reviews",
    )
    assigned_to_sme = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_client_reviews",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
