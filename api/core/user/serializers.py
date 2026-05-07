from django.core.exceptions import ValidationError

from rest_framework import serializers

from core.user.models import User
from core.work.models import WorkUnit


class UserSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    image = serializers.ImageField(allow_null=True, required=False)
    profile_id = serializers.SerializerMethodField(read_only=True)
    work_status = serializers.SerializerMethodField(read_only=True)
    active_batches = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "name", "email",
            "image", "gender",
            "dob", "is_active", "is_superuser",
            "is_staff", "is_email_verified",
            "role", "created", "updated",
            "profile_id", "work_status", "active_batches"
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

    def _active_units(self, obj):
        if obj.role == User.Role.PRODUCTION_USER:
            prefetched = getattr(obj, "active_production_units", None)
            if prefetched is not None:
                return prefetched
            return WorkUnit.objects.select_related("batch").filter(
                current_production_assignee=obj,
                status__in=[WorkUnit.Status.ASSIGNED_TO_PRODUCTION, WorkUnit.Status.REDO],
            )

        if obj.role == User.Role.VALIDATION_USER:
            prefetched = getattr(obj, "active_validation_units", None)
            if prefetched is not None:
                return prefetched
            return WorkUnit.objects.select_related("batch").filter(
                current_validation_assignee=obj,
                status__in=[WorkUnit.Status.IN_VALIDATION],
            )

        return []

    def get_work_status(self, obj):
        if obj.role not in [User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER]:
            return "n/a"
        return "working" if any(self._active_units(obj)) else "free"

    def get_active_batches(self, obj):
        if obj.role not in [User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER]:
            return []

        role_label = "PRODUCTION" if obj.role == User.Role.PRODUCTION_USER else "VALIDATION"
        seen = set()
        items = []
        for unit in self._active_units(obj):
            if not unit.batch:
                continue
            bid = unit.batch.public_id.hex
            if bid in seen:
                continue
            seen.add(bid)
            items.append(
                {
                    "batch_id": bid,
                    "batch_name": unit.batch.name,
                    "member_role": role_label,
                }
            )
        return items
