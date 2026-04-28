from django.contrib import admin

from core.client.models import Client, ClientCost


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_name", "contact_email", "is_active", "created")
    search_fields = ("name", "contact_name", "contact_email", "contact_phone")
    list_filter = ("is_active", "created")


@admin.register(ClientCost)
class ClientCostAdmin(admin.ModelAdmin):
    list_display = ("client", "document_type", "pricing_mode", "unit_cost", "created")
    search_fields = ("client__name",)
    list_filter = ("document_type", "pricing_mode", "created")
