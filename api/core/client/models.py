import uuid

from django.db import models

from core.user.models import User


class Client(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    name = models.CharField(max_length=255, unique=True, db_index=True)
    contact_name = models.CharField(max_length=255)
    contact_email = models.EmailField(max_length=255)
    contact_phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="clients_created")

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ClientCost(models.Model):
    class DocumentType(models.TextChoices):
        PDF = "PDF"
        WORD = "WORD"
        EXCEL = "EXCEL"

    class PricingMode(models.TextChoices):
        PER_FILE = "PER_FILE"
        PER_PAGE = "PER_PAGE"
        PER_ROW = "PER_ROW"

    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="costs")
    document_type = models.CharField(max_length=20, choices=DocumentType.choices, db_index=True)
    pricing_mode = models.CharField(max_length=20, choices=PricingMode.choices)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["client", "document_type", "pricing_mode"],
                name="unique_client_cost_rule",
            )
        ]

    def __str__(self):
        return f"{self.client.name} - {self.document_type} ({self.pricing_mode})"
