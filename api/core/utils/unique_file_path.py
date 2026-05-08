import uuid

from django.utils.deconstruct import deconstructible


@deconstructible
class UniqueFilePath:
    def __init__(self, base_path):
        self.base_path = base_path

    def __call__(self, instance, filename):
        parts = (filename or "").rsplit(".", 1)
        ext = parts[1] if len(parts) > 1 else ""
        new_filename = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
        return f"media/{self.base_path}/{new_filename}"
