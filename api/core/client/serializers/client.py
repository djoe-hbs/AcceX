from django.db import transaction

from rest_framework import serializers

from core.client.models import Client, ClientCost


class ClientCostSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")

    class Meta:
        model = ClientCost
        fields = [
            "id", "document_type", "pricing_mode", "unit_cost",
            "created", "updated",
        ]
        read_only_fields = ["id", "created", "updated"]


class ClientSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")
    costs = ClientCostSerializer(many=True, required=False)

    class Meta:
        model = Client
        fields = [
            "id", "name", "contact_name", "contact_email", "contact_phone", "address",
            "is_active", "costs", "created", "updated",
        ]
        read_only_fields = ["id", "created", "updated"]

    def validate_name(self, value):
        qs = Client.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A client with this name already exists.")
        return value

    def validate_costs(self, value):
        seen = set()
        for item in value:
            key = (item["document_type"], item["pricing_mode"])
            if key in seen:
                raise serializers.ValidationError("Duplicate cost rule found for the same document type and pricing mode.")
            seen.add(key)
        return value

    @transaction.atomic
    def create(self, validated_data):
        costs_data = validated_data.pop("costs", [])
        request = self.context.get("request")

        client = Client.objects.create(
            created_by=request.user if request and hasattr(request, "user") else None,
            **validated_data,
        )

        for cost_data in costs_data:
            ClientCost.objects.create(client=client, **cost_data)

        return client

    @transaction.atomic
    def update(self, instance, validated_data):
        costs_data = validated_data.pop("costs", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if costs_data is not None:
            instance.costs.all().delete()
            for cost_data in costs_data:
                ClientCost.objects.create(client=instance, **cost_data)

        return instance


class ClientNameSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True, format="hex")

    class Meta:
        model = Client
        fields = ["id", "name"]
