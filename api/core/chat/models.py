import uuid

from django.db import models

from core.user.models import User


class ChatThread(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    participant_1 = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="chat_threads_as_p1",
    )
    participant_2 = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="chat_threads_as_p2",
    )

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["participant_1", "participant_2"],
                name="unique_chat_thread_pair",
            ),
        ]
        ordering = ["-updated"]

    def __str__(self):
        return f"Thread: {self.participant_1} <-> {self.participant_2}"

    def other_participant(self, user):
        return self.participant_2 if self.participant_1_id == user.id else self.participant_1


class ChatMessage(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_chat_messages")

    body = models.TextField(max_length=2000)
    read_at = models.DateTimeField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created"]

    def __str__(self):
        return f"{self.sender.name}: {self.body[:40]}"
