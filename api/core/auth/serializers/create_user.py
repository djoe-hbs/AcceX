from django.db import transaction
from django.contrib.auth.password_validation import validate_password

from rest_framework import serializers

from core.user.models import User
from core.user.serializers import UserSerializer


class CreateUserSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    password = serializers.CharField(write_only=True, required=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = [
            "id", "name", "email", "password",
            "gender", "dob", "image", "role",
            "created", "updated",
        ]
        read_only_fields = ["id", "created", "updated"]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_role(self, value):
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            raise serializers.ValidationError("Request context is required.")

        actor = request.user

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

        if value not in allowed_roles:
            raise serializers.ValidationError("You are not allowed to create this type of user.")

        return value

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data.get("role")

        user_creator = {
            User.Role.ADMIN: User.objects.create_admin,
            User.Role.SME: User.objects.create_sme,
            User.Role.PRODUCTION_USER: User.objects.create_production_user,
            User.Role.VALIDATION_USER: User.objects.create_validation_user,
        }.get(role)

        if not user_creator:
            raise serializers.ValidationError({"role": "Unsupported role for user creation."})

        user = user_creator(password=password, **validated_data)
        return user

    def to_representation(self, instance):
        return UserSerializer(instance).data
