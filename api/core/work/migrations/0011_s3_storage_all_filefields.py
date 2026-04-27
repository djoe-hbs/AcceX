from django.db import migrations, models
import storages.backends.s3boto3


class Migration(migrations.Migration):

    dependencies = [
        ('core_work', '0010_add_inactive_status_to_workbatch'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workbatch',
            name='source_archive',
            field=models.FileField(storage=storages.backends.s3boto3.S3Boto3Storage(), upload_to='work/source'),
        ),
        migrations.AlterField(
            model_name='workunit',
            name='production_output',
            field=models.FileField(blank=True, null=True, storage=storages.backends.s3boto3.S3Boto3Storage(), upload_to='work/production_output'),
        ),
        migrations.AlterField(
            model_name='workunit',
            name='redo_report_file',
            field=models.FileField(blank=True, null=True, storage=storages.backends.s3boto3.S3Boto3Storage(), upload_to='work/redo_reports'),
        ),
        migrations.AlterField(
            model_name='workdeliverypackage',
            name='archive',
            field=models.FileField(storage=storages.backends.s3boto3.S3Boto3Storage(), upload_to='work/delivery'),
        ),
        migrations.AlterField(
            model_name='workclientreview',
            name='review_file',
            field=models.FileField(storage=storages.backends.s3boto3.S3Boto3Storage(), upload_to='work/client_review'),
        ),
    ]
