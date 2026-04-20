from rest_framework import serializers

from core.user.models import User
from core.chat.models import ChatThread


CHAT_ELIGIBLE_ROLES = {User.Role.SME, User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER}


class ChatUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="public_id", format="hex")
    name = serializers.CharField()
    role = serializers.CharField()


class ChatThreadSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="public_id", format="hex")
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True, default=0)
    created = serializers.DateTimeField()
    updated = serializers.DateTimeField()

    def get_other_user(self, obj):
        user = self.context["request"].user
        other = obj.other_participant(user)
        return ChatUserSerializer(other).data

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created").first()
        if not msg:
            return None
        return {
            "body": msg.body,
            "sender_name": msg.sender.name,
            "is_mine": msg.sender_id == self.context["request"].user.id,
            "created": msg.created,
        }


class CreateThreadSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField()

    def validate(self, attrs):
        request = self.context["request"]
        actor = request.user
        recipient_id = attrs["recipient_id"]

        if actor.role not in CHAT_ELIGIBLE_ROLES:
            raise serializers.ValidationError("Your role does not have chat access.")

        try:
            recipient = User.objects.get(public_id=recipient_id, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError({"recipient_id": "User not found."})

        if recipient.pk == actor.pk:
            raise serializers.ValidationError({"recipient_id": "Cannot start a chat with yourself."})

        if recipient.role not in CHAT_ELIGIBLE_ROLES:
            raise serializers.ValidationError({"recipient_id": "This user is not available for chat."})

        # Production/validation can only chat with SME
        if actor.role in (User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER):
            if recipient.role != User.Role.SME:
                raise serializers.ValidationError(
                    {"recipient_id": "You can only chat with SME users."}
                )

        attrs["recipient"] = recipient
        return attrs

    def create(self, validated_data):
        actor = self.context["request"].user
        recipient = validated_data["recipient"]

        # Always store lower PK as participant_1 to enforce uniqueness
        p1, p2 = (actor, recipient) if actor.pk < recipient.pk else (recipient, actor)

        thread, _ = ChatThread.objects.get_or_create(
            participant_1=p1,
            participant_2=p2,
        )
        return thread
