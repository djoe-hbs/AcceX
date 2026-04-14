import zipfile

from rest_framework import serializers

from core.client.models import Client
from core.work.models import WorkBatch
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

    class Meta:
        model = WorkBatch
        fields = [
            "id", "name", "client_id", "client", "client_name", "source_archive", "extraction_root", "status", "error_message",
            "total_files", "total_directories", "created", "updated",
        ]
        read_only_fields = [
            "id", "client", "client_name", "extraction_root", "status", "error_message",
            "total_files", "total_directories", "created", "updated",
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

        process_work_batch(batch)
        return batch
