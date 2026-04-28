from rest_framework import serializers

from core.produ.models import ProduProfile


class ProduProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    user = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")

    class Meta:
        model = ProduProfile
        fields = [
            "id", "user"
        ]
