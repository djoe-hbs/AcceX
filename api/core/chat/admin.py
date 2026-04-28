from django.contrib import admin

from core.chat.models import ChatThread, ChatMessage


@admin.register(ChatThread)
class ChatThreadAdmin(admin.ModelAdmin):
    list_display = ("public_id", "participant_1", "participant_2", "created", "updated")
    list_filter = ("created",)


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("public_id", "thread", "sender", "created", "read_at")
    list_filter = ("created",)
