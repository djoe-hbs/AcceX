from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth.password_validation import validate_password

from rest_framework import serializers

from core.user.models import User


class ChangePasswordSerializer(serializers.Serializer):
    target_user_id = serializers.UUIDField(required=False, write_only=True)
    old_password = serializers.CharField(required=False, write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(required=True, write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            raise serializers.ValidationError("Request context is required.")

        actor = request.user
        target_user = actor
        target_user_id = attrs.get("target_user_id")

        if target_user_id:
            try:
                target_user = User.objects.get(public_id=target_user_id)
            except (ObjectDoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError({"target_user_id": "User does not exist."})

        if target_user == actor:
            old_password = attrs.get("old_password")
            if not old_password:
                raise serializers.ValidationError({"old_password": "Old password is required."})
            if not actor.check_password(old_password):
                raise serializers.ValidationError({"old_password": "Old password is incorrect."})
        else:
            allowed_roles = {
                User.Role.SUPERADMIN: {
                    User.Role.ADMIN,
                    User.Role.SME,
                    User.Role.PRODUCTION_USER,
                    User.Role.VALIDATION_USER,
                },
                User.Role.ADMIN: {
                    User.Role.SME,
                    User.Role.PRODUCTION_USER,
                    User.Role.VALIDATION_USER,
                },
            }.get(actor.role, set())

            if target_user.role not in allowed_roles:
                raise serializers.ValidationError({"target_user_id": "You are not allowed to change this user's password."})

        validate_password(attrs["new_password"], user=target_user)

        attrs["target_user"] = target_user
        return attrs

    def save(self, **kwargs):
        target_user = self.validated_data["target_user"]
        new_password = self.validated_data["new_password"]

        target_user.set_password(new_password)
        target_user.save()
        return target_user
