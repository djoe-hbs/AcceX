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

    # def get_profile_id(self, obj):
    #     try:
    #         if obj.role == User.Role.CUSTOMER and hasattr(obj, "customer_profile"):
    #             return obj.customer_profile.public_id.hex
    #         elif obj.role == User.Role.TAILOR and hasattr(obj, "tailor_profile"):
    #             return obj.tailor_profile.public_id.hex
    #     except Exception:
    #         return None
    #     return None

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value
