from django.db import migrations, models
import core.utils.unique_file_path
import storages.backends.s3boto3


class Migration(migrations.Migration):

    dependencies = [
        ('core_user', '0002_alter_user_image'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='image',
            field=models.ImageField(
                blank=True,
                null=True,
                storage=storages.backends.s3boto3.S3Boto3Storage(),
                upload_to=core.utils.unique_file_path.UniqueFilePath('profile/images'),
            ),
        ),
    ]
