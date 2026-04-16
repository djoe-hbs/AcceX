from django.contrib import admin

from core.work.models import (
    WorkBatch,
    WorkBatchMember,
    WorkFile,
    WorkUnit,
    WorkUnitAssignment,
    WorkUnitAlert,
    WorkDeliveryPackage,
    WorkClientReview,
    WorkFileBilling,
    WorkClientInvoice,
    WorkClientInvoiceItem,
)


@admin.register(WorkBatch)
class WorkBatchAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "status", "delivery_status", "total_files", "total_directories", "uploaded_by", "created")
    search_fields = ("name", "client__name", "uploaded_by__email")
    list_filter = ("status", "delivery_status", "created")


@admin.register(WorkBatchMember)
class WorkBatchMemberAdmin(admin.ModelAdmin):
    list_display = ("batch", "user", "role", "is_active", "created")
    search_fields = ("batch__name", "user__email")
    list_filter = ("role", "is_active")


@admin.register(WorkFile)
class WorkFileAdmin(admin.ModelAdmin):
    list_display = ("batch", "relative_path", "file_type", "count_type", "count", "size_bytes")
    search_fields = ("batch__name", "relative_path")
    list_filter = ("file_type", "count_type", "is_directory")


@admin.register(WorkUnit)
class WorkUnitAdmin(admin.ModelAdmin):
    list_display = (
        "batch", "work_file", "unit_number", "status",
        "current_production_assignee", "current_validation_assignee",
    )
    search_fields = ("batch__name", "work_file__relative_path")
    list_filter = ("status", "count_type")


@admin.register(WorkUnitAssignment)
class WorkUnitAssignmentAdmin(admin.ModelAdmin):
    list_display = ("unit", "stage", "assignee", "is_active", "created", "ended_at")
    search_fields = ("unit__work_file__relative_path", "assignee__email")
    list_filter = ("stage", "is_active")


@admin.register(WorkUnitAlert)
class WorkUnitAlertAdmin(admin.ModelAdmin):
    list_display = ("unit", "alert_type", "is_resolved", "reported_by", "created")
    search_fields = ("unit__work_file__relative_path", "message")
    list_filter = ("alert_type", "is_resolved")


@admin.register(WorkDeliveryPackage)
class WorkDeliveryPackageAdmin(admin.ModelAdmin):
    list_display = ("batch", "mode", "total_files", "generated_by", "created")
    search_fields = ("batch__name", "generated_by__email")
    list_filter = ("mode", "created")


@admin.register(WorkClientReview)
class WorkClientReviewAdmin(admin.ModelAdmin):
    list_display = ("batch", "uploaded_by", "assigned_to_sme", "created")
    search_fields = ("batch__name", "uploaded_by__email", "assigned_to_sme__email")
    list_filter = ("created",)


@admin.register(WorkFileBilling)
class WorkFileBillingAdmin(admin.ModelAdmin):
    list_display = ("client", "batch", "work_file", "pricing_mode", "quantity", "unit_cost", "amount", "completed_at")
    search_fields = ("client__name", "batch__name", "work_file__relative_path")
    list_filter = ("document_type", "pricing_mode", "completed_at")


@admin.register(WorkClientInvoice)
class WorkClientInvoiceAdmin(admin.ModelAdmin):
    list_display = ("client", "year", "month", "trigger", "status", "total_amount", "generated_by", "sent_at")
    search_fields = ("client__name", "generated_by__email")
    list_filter = ("trigger", "status", "year", "month")


@admin.register(WorkClientInvoiceItem)
class WorkClientInvoiceItemAdmin(admin.ModelAdmin):
    list_display = ("invoice", "batch", "work_file", "quantity", "unit_cost", "amount")
    search_fields = ("invoice__client__name", "batch__name", "work_file__relative_path", "description")
    list_filter = ("invoice__year", "invoice__month")
