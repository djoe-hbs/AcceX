from django.contrib import admin

from core.work.models import WorkBatch, WorkFile


@admin.register(WorkBatch)
class WorkBatchAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "status", "total_files", "total_directories", "uploaded_by", "created")
    search_fields = ("name", "client__name", "uploaded_by__email")
    list_filter = ("status", "created")


@admin.register(WorkFile)
class WorkFileAdmin(admin.ModelAdmin):
    list_display = ("batch", "relative_path", "file_type", "count_type", "count", "size_bytes")
    search_fields = ("batch__name", "relative_path")
    list_filter = ("file_type", "count_type", "is_directory")
