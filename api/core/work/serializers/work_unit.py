from rest_framework import serializers

from core.user.models import User
from core.work.models import WorkBatch, WorkUnit, WorkBatchMember


class WorkUnitSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    batch_id = serializers.UUIDField(source="batch.public_id", read_only=True, format="hex")
    work_file_id = serializers.UUIDField(source="work_file.public_id", read_only=True, format="hex")
    work_file_path = serializers.CharField(source="work_file.relative_path", read_only=True)
    production_user_id = serializers.UUIDField(source="current_production_assignee.public_id", read_only=True, format="hex", allow_null=True, default=None)
    validation_user_id = serializers.UUIDField(source="current_validation_assignee.public_id", read_only=True, format="hex", allow_null=True, default=None)
    batch_name = serializers.CharField(source="batch.name", read_only=True)
    production_user_name = serializers.CharField(source="current_production_assignee.name", read_only=True, default=None)
    validation_user_name = serializers.CharField(source="current_validation_assignee.name", read_only=True, default=None)
    production_output = serializers.FileField(read_only=True)
    redo_report_file = serializers.FileField(read_only=True)

    class Meta:
        model = WorkUnit
        fields = [
            "id", "batch_id", "batch_name", "work_file_id", "work_file_path", "unit_number",
            "range_start", "range_end", "count_type", "workload_count",
            "status", "production_user_id", "production_user_name", "validation_user_id", "validation_user_name", "redo_reason",
            "production_output", "production_output_uploaded_at", "validator_feedback", "redo_report_file",
            "production_assigned_at", "production_submitted_at", "validation_completed_at",
            "created", "updated",
        ]


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
    report_file = serializers.FileField(required=False, allow_null=True)

    def validate_report_file(self, value):
        if value and not value.name.endswith(('.xlsx', '.xls')):
            raise serializers.ValidationError("Only Excel files (.xlsx, .xls) are allowed.")
        return value

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


class BulkClientReworkItemSerializer(serializers.Serializer):
    unit_id = serializers.UUIDField()
    production_user_id = serializers.UUIDField()
    validation_user_id = serializers.UUIDField()


class BulkClientReworkSerializer(serializers.Serializer):
    batch_id = serializers.UUIDField()
    assignments = BulkClientReworkItemSerializer(many=True, allow_empty=False)
    reason = serializers.CharField(required=False, default="Client requested rework.")

    def validate(self, attrs):
        from core.work.models import WorkBatch

        try:
            batch = WorkBatch.objects.get(public_id=attrs["batch_id"])
        except WorkBatch.DoesNotExist:
            raise serializers.ValidationError({"batch_id": "Work batch does not exist."})

        unit_ids = [a["unit_id"] for a in attrs["assignments"]]
        prod_ids = list({a["production_user_id"] for a in attrs["assignments"]})
        val_ids = list({a["validation_user_id"] for a in attrs["assignments"]})

        units = {
            u.public_id: u
            for u in WorkUnit.objects.filter(public_id__in=unit_ids, batch=batch)
            .select_related("current_production_assignee", "current_validation_assignee")
        }
        prod_users = {
            u.public_id: u
            for u in User.objects.filter(public_id__in=prod_ids, role=User.Role.PRODUCTION_USER)
        }
        val_users = {
            u.public_id: u
            for u in User.objects.filter(public_id__in=val_ids, role=User.Role.VALIDATION_USER)
        }

        resolved = []
        for item in attrs["assignments"]:
            unit = units.get(item["unit_id"])
            if not unit:
                raise serializers.ValidationError({"assignments": f"Unit {item['unit_id']} not found in this batch."})
            if unit.status != WorkUnit.Status.COMPLETED:
                raise serializers.ValidationError({"assignments": f"Unit {item['unit_id']} is not in completed status."})

            prod_user = prod_users.get(item["production_user_id"])
            if not prod_user:
                raise serializers.ValidationError({"assignments": f"Production user {item['production_user_id']} is invalid."})

            val_user = val_users.get(item["validation_user_id"])
            if not val_user:
                raise serializers.ValidationError({"assignments": f"Validation user {item['validation_user_id']} is invalid."})

            resolved.append((unit, prod_user, val_user))

        attrs["batch"] = batch
        attrs["resolved_assignments"] = resolved
        return attrs


class ReportIssueSerializer(serializers.Serializer):
    message = serializers.CharField(required=True)
