from rest_framework import serializers

from core.user.models import User
from core.work.models import WorkBatch, WorkUnit, WorkBatchMember


class WorkUnitSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    work_file_id = serializers.UUIDField(source="work_file.public_id", read_only=True, format="hex")
    work_file_path = serializers.CharField(source="work_file.relative_path", read_only=True)
    production_user_id = serializers.UUIDField(source="current_production_assignee.public_id", read_only=True, format="hex")
    validation_user_id = serializers.UUIDField(source="current_validation_assignee.public_id", read_only=True, format="hex")
    production_output = serializers.FileField(read_only=True)
    collaborators = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WorkUnit
        fields = [
            "id", "batch_id", "work_file_id", "work_file_path", "unit_number",
            "range_start", "range_end", "count_type", "workload_count",
            "status", "production_user_id", "validation_user_id", "redo_reason",
            "production_output", "production_output_uploaded_at", "validator_feedback",
            "production_assigned_at", "production_submitted_at", "validation_completed_at",
            "collaborators", "created", "updated",
        ]

    def get_collaborators(self, obj):
        queryset = WorkUnit.objects.filter(
            work_file=obj.work_file,
            status__in=[
                WorkUnit.Status.ASSIGNED_TO_PRODUCTION,
                WorkUnit.Status.REDO,
                WorkUnit.Status.IN_VALIDATION,
            ],
        ).exclude(current_production_assignee=None)

        collaborator_ids = {
            unit.current_production_assignee.public_id.hex
            for unit in queryset
            if unit.current_production_assignee
        }

        return sorted(collaborator_ids)


class WorkBatchMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    user_id = serializers.UUIDField(source="user.public_id", read_only=True, format="hex")
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = WorkBatchMember
        fields = [
            "id", "batch_id", "user_id", "user_name", "user_email",
            "role", "is_active", "created", "updated",
        ]


class AddBatchMemberSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=WorkBatchMember.Role.choices)

    def validate(self, attrs):
        role = attrs["role"]
        user_id = attrs["user_id"]

        expected_role = User.Role.PRODUCTION_USER if role == WorkBatchMember.Role.PRODUCTION else User.Role.VALIDATION_USER
        try:
            user = User.objects.get(public_id=user_id, role=expected_role)
        except User.DoesNotExist:
            raise serializers.ValidationError({"user_id": "User does not match selected member role."})

        attrs["user"] = user
        return attrs


class RemoveBatchMemberSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=WorkBatchMember.Role.choices)


class AutoAssignSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    production_user_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False)
    validation_user_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False)

    batch_size_per_production_user = serializers.IntegerField(required=False, default=50, min_value=1)
    split_threshold = serializers.IntegerField(required=False, default=100, min_value=1)
    split_chunk_size = serializers.IntegerField(required=False, default=25, min_value=1)

    def validate(self, attrs):
        batch_id = attrs["batch_id"]

        try:
            batch = WorkBatch.objects.get(public_id=batch_id)
        except WorkBatch.DoesNotExist:
            raise serializers.ValidationError({"batch_id": "Work batch does not exist."})

        production_user_ids = attrs.get("production_user_ids")
        validation_user_ids = attrs.get("validation_user_ids")

        if not production_user_ids:
            production_user_ids = list(
                WorkBatchMember.objects.filter(
                    batch=batch,
                    role=WorkBatchMember.Role.PRODUCTION,
                    is_active=True,
                ).values_list("user__public_id", flat=True)
            )

        if not validation_user_ids:
            validation_user_ids = list(
                WorkBatchMember.objects.filter(
                    batch=batch,
                    role=WorkBatchMember.Role.VALIDATION,
                    is_active=True,
                ).values_list("user__public_id", flat=True)
            )

        if not production_user_ids:
            raise serializers.ValidationError({"production_user_ids": "No production users available for assignment."})

        if not validation_user_ids:
            raise serializers.ValidationError({"validation_user_ids": "No validation users available for assignment."})

        production_users = list(
            User.objects.filter(public_id__in=production_user_ids, role=User.Role.PRODUCTION_USER)
        )
        validation_users = list(
            User.objects.filter(public_id__in=validation_user_ids, role=User.Role.VALIDATION_USER)
        )

        if len(production_users) != len(set(production_user_ids)):
            raise serializers.ValidationError({"production_user_ids": "One or more production users are invalid."})

        if len(validation_users) != len(set(validation_user_ids)):
            raise serializers.ValidationError({"validation_user_ids": "One or more validation users are invalid."})

        attrs["batch"] = batch
        attrs["production_users"] = production_users
        attrs["validation_users"] = validation_users

        return attrs


class ProductionSubmitSerializer(serializers.Serializer):
    completed_file = serializers.FileField(required=True)
    note = serializers.CharField(required=False, allow_blank=True)


class ValidationDecisionSerializer(serializers.Serializer):
    class DecisionChoices:
        APPROVE = "APPROVE"
        REDO = "REDO"
        CHOICES = (
            (APPROVE, "Approve"),
            (REDO, "Redo"),
        )

    decision = serializers.ChoiceField(choices=DecisionChoices.CHOICES)
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["decision"] == self.DecisionChoices.REDO and not attrs.get("reason"):
            raise serializers.ValidationError({"reason": "Reason is required for redo."})
        return attrs


class ReassignProductionSerializer(serializers.Serializer):
    new_production_user_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_new_production_user_id(self, value):
        if not User.objects.filter(public_id=value, role=User.Role.PRODUCTION_USER).exists():
            raise serializers.ValidationError("Invalid production user.")
        return value


class ManualAssignUnitSerializer(serializers.Serializer):
    production_user_id = serializers.UUIDField()
    validation_user_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        try:
            production_user = User.objects.get(public_id=attrs["production_user_id"], role=User.Role.PRODUCTION_USER)
        except User.DoesNotExist:
            raise serializers.ValidationError({"production_user_id": "Invalid production user."})

        try:
            validation_user = User.objects.get(public_id=attrs["validation_user_id"], role=User.Role.VALIDATION_USER)
        except User.DoesNotExist:
            raise serializers.ValidationError({"validation_user_id": "Invalid validation user."})

        attrs["production_user"] = production_user
        attrs["validation_user"] = validation_user
        return attrs


class ReportIssueSerializer(serializers.Serializer):
    message = serializers.CharField(required=True)
