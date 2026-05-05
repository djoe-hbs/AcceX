from django.db import migrations, models
import core.work.models
import storages.backends.s3boto3


class Migration(migrations.Migration):

    dependencies = [
        ("core_work", "0011_s3_storage_all_filefields"),
    ]

    operations = [
        migrations.AddField(
            model_name="workfile",
            name="source_file",
            field=models.FileField(
                blank=True,
                null=True,
                storage=storages.backends.s3boto3.S3Boto3Storage(),
                upload_to=core.work.models.work_file_source_upload_to,
            ),
        ),
    ]
