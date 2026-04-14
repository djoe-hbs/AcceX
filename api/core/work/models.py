import uuid

from django.db import models

from core.user.models import User
from core.client.models import Client


class WorkBatch(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "PROCESSING"
        READY = "READY"
        FAILED = "FAILED"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    name = models.CharField(max_length=255)
    client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True, related_name="work_batches")
    source_archive = models.FileField(upload_to="work/source")
    extraction_root = models.CharField(max_length=512, blank=True, null=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING, db_index=True)
    error_message = models.TextField(blank=True, null=True)

    total_files = models.PositiveIntegerField(default=0)
    total_directories = models.PositiveIntegerField(default=0)

    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="work_batches_uploaded")

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


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
