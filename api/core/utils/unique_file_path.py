import uuid

from django.utils.deconstruct import deconstructible


@deconstructible
class UniqueFilePath:
    def __init__(self, base_path):
        self.base_path = base_path

    def __call__(self, instance, filename):
        ext = filename.split('.')[-1]
        new_filename = f"{uuid.uuid4().hex}.{ext}"
        return f"media/{self.base_path}/{new_filename}"
