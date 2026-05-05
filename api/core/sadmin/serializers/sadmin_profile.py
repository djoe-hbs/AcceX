from rest_framework import serializers

from core.sadmin.models import SAdminProfile


class SAdminProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    user = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")

    class Meta:
        model = SAdminProfile
        fields = [
            "id", "user"
        ]
