from django.contrib import admin

from core.work.models import WorkBatch, WorkBatchMember, WorkFile, WorkUnit, WorkUnitAssignment, WorkUnitAlert


@admin.register(WorkBatch)
class WorkBatchAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "status", "total_files", "total_directories", "uploaded_by", "created")
    search_fields = ("name", "client__name", "uploaded_by__email")
    list_filter = ("status", "created")


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
