from rest_framework import serializers

from core.admin.models import AdminProfile


class AdminProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    user = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")

    class Meta:
        model = AdminProfile
        fields = [
            "id", "user"
        ]