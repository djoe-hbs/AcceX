import uuid

from django.db import models

from core.user.models import User


class AdminProfile(models.Model):
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="admin_profile")
