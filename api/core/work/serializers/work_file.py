from rest_framework import serializers

from core.work.models import WorkFile


class WorkFileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    parent_id = serializers.UUIDField(source="parent.public_id", read_only=True, format="hex")

    class Meta:
        model = WorkFile
        fields = [
            "id", "parent_id", "name", "relative_path", "depth", "is_directory",
            "file_extension", "file_type", "count_type", "count", "size_bytes",
            "created", "updated",
        ]
