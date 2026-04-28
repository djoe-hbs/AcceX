import threading
import zipfile

from django.db import connection as db_connection
from rest_framework import serializers

from core.client.models import Client
from core.work.models import WorkBatch, WorkDeliveryPackage, WorkClientReview
from core.work.services import process_work_batch


class WorkBatchSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    client_id = serializers.SlugRelatedField(
        source="client",
        slug_field="public_id",
        queryset=Client.objects.filter(is_active=True),
        write_only=True,
    )
    client = serializers.UUIDField(source="client.public_id", read_only=True, format="hex")
    client_name = serializers.CharField(source="client.name", read_only=True)
    initiated_by_sme = serializers.UUIDField(source="initiated_by_sme.public_id", read_only=True, format="hex")

    class Meta:
        model = WorkBatch
        fields = [
            "id", "name", "client_id", "client", "client_name", "source_archive", "extraction_root", "status", "error_message",
            "total_files", "total_directories",
            "auto_refill_enabled", "auto_batch_size_per_production_user", "overdue_hours",
            "delivery_status", "initiated_by_sme",
            "created", "updated",
        ]
        read_only_fields = [
            "id", "client", "client_name", "extraction_root", "status", "error_message",
            "total_files", "total_directories", "created", "updated",
            "delivery_status", "initiated_by_sme",
        ]

    def validate_source_archive(self, value):
        archive_name = (value.name or "").lower()
        if not archive_name.endswith(".zip"):
            raise serializers.ValidationError("Only .zip archive upload is supported.")

        if not zipfile.is_zipfile(value):
            raise serializers.ValidationError("Invalid zip archive.")

        value.seek(0)
        return value

    def create(self, validated_data):
        request = self.context.get("request")

        batch = WorkBatch.objects.create(
            uploaded_by=request.user if request and hasattr(request, "user") else None,
            **validated_data,
        )

        def _process():
            try:
                process_work_batch(batch)
            finally:
                db_connection.close()

        threading.Thread(target=_process, daemon=True).start()
        return batch


class DeliveryPackageRequestSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=WorkDeliveryPackage.Mode.choices)


class DeliveryPackageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    generated_by = serializers.UUIDField(source="generated_by.public_id", read_only=True, format="hex")

    class Meta:
        model = WorkDeliveryPackage
        fields = ["id", "batch_id", "mode", "archive", "total_files", "generated_by", "created", "updated"]


class ClientReviewUploadSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    uploaded_by = serializers.UUIDField(source="uploaded_by.public_id", read_only=True, format="hex")
    assigned_to_sme = serializers.UUIDField(source="assigned_to_sme.public_id", read_only=True, format="hex")

    class Meta:
        model = WorkClientReview
        fields = [
            "id", "batch_id", "review_file", "review_note",
            "uploaded_by", "assigned_to_sme", "created", "updated",
        ]
        read_only_fields = ["id", "batch_id", "uploaded_by", "assigned_to_sme", "created", "updated"]


class BatchSignOffSerializer(serializers.Serializer):
    signed_off = serializers.BooleanField(required=True)
