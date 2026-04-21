from django.core.exceptions import ValidationError

from rest_framework import serializers

from core.user.models import User


class UserSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    image = serializers.ImageField(allow_null=True, required=False)
    profile_id = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "name", "email",
            "image", "gender",
            "dob", "is_active", "is_superuser",
            "is_staff", "is_email_verified",
            "role", "created", "updated",
            "profile_id"
        ]
        read_only_fields = [
            "is_active", "is_staff", "is_superuser",
            "is_email_verified",
            "role", "created", "updated",
            "profile_id",
        ]

    def get_profile_id(self, obj):
        try:
            if obj.role == User.Role.SUPERADMIN and hasattr(obj, "sadmin_profile"):
                return obj.sadmin_profile.public_id.hex
            if obj.role == User.Role.ADMIN and hasattr(obj, "admin_profile"):
                return obj.admin_profile.public_id.hex
            if obj.role == User.Role.SME and hasattr(obj, "sme_profile"):
                return obj.sme_profile.public_id.hex
            if obj.role == User.Role.PRODUCTION_USER and hasattr(obj, "produ_profile"):
                return obj.produ_profile.public_id.hex
            if obj.role == User.Role.VALIDATION_USER and hasattr(obj, "valiu_profile"):
                return obj.valiu_profile.public_id.hex
        except Exception:
            return None

        return None

    def validate_email(self, value):
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This email is already in use.")
        return value
