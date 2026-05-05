from rest_framework import serializers

from core.valiu.models import ValiuProfile


class ValiuProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    user = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")

    class Meta:
        model = ValiuProfile
        fields = [
            "id", "user"
        ]
