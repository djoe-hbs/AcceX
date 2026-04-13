from rest_framework import serializers

from core.sme.models import SMEProfile


class SMEProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    user = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")

    class Meta:
        model = SMEProfile
        fields = [
            "id", "user"
        ]
