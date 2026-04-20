from rest_framework import serializers

from core.client.models import Client
from core.work.models import WorkClientInvoice, WorkClientInvoiceItem


class WorkClientInvoiceItemSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    work_file_id = serializers.UUIDField(source="work_file.public_id", read_only=True, format="hex")
    work_file_path = serializers.CharField(source="work_file.relative_path", read_only=True)

    class Meta:
        model = WorkClientInvoiceItem
        fields = [
            "id", "batch_id", "batch_name", "work_file_id", "work_file_path",
            "description", "quantity", "unit_cost", "amount", "created", "updated",
        ]


class WorkClientInvoiceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    client_id = serializers.UUIDField(source="client.public_id", read_only=True, format="hex")
    client_name = serializers.CharField(source="client.name", read_only=True)
    generated_by = serializers.UUIDField(source="generated_by.public_id", read_only=True, format="hex")
    items = WorkClientInvoiceItemSerializer(many=True, read_only=True)

    class Meta:
        model = WorkClientInvoice
        fields = [
            "id", "client_id", "client_name",
            "year", "month", "period_start", "period_end",
            "trigger", "status", "total_amount", "generated_by", "sent_at",
            "items", "created", "updated",
        ]


class GenerateClientInvoiceSerializer(serializers.Serializer):
    client_id = serializers.UUIDField(required=True)
    year = serializers.IntegerField(min_value=2000, max_value=3000, required=True)
    month = serializers.IntegerField(min_value=1, max_value=12, required=True)
    send_email = serializers.BooleanField(default=True)

    def validate_client_id(self, value):
        if not Client.objects.filter(public_id=value).exists():
            raise serializers.ValidationError("Client not found.")
        return value


class GenerateMonthlyInvoicesSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=2000, max_value=3000, required=False)
    month = serializers.IntegerField(min_value=1, max_value=12, required=False)
    send_email = serializers.BooleanField(default=True)


class SendInvoiceEmailSerializer(serializers.Serializer):
    recipients = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )
