from rest_framework import serializers

from core.chat.models import ChatMessage


class ChatMessageSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="public_id", format="hex")
    sender_id = serializers.UUIDField(source="sender.public_id", format="hex")
    sender_name = serializers.CharField(source="sender.name")
    body = serializers.CharField()
    is_mine = serializers.SerializerMethodField()
    read_at = serializers.DateTimeField()
    created = serializers.DateTimeField()

    def get_is_mine(self, obj):
        return obj.sender_id == self.context["request"].user.id


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)
