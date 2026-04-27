import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Apply CORS policy to the S3 bucket so browsers can upload directly via presigned POST URLs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--origins",
            nargs="+",
            metavar="ORIGIN",
            help="Extra allowed origins (e.g. http://localhost:5173). "
                 "CORS_ALLOWED_ORIGINS from settings is always included.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the CORS config that would be applied without actually applying it.",
        )

    def handle(self, *args, **options):
        bucket = settings.AWS_STORAGE_BUCKET_NAME
        if not bucket:
            raise CommandError("AWS_STORAGE_BUCKET_NAME is not configured.")

        # Collect origins: settings + any extras passed on the CLI
        origins = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        if options["origins"]:
            origins.update(options["origins"])

        # Always allow localhost variants for developer convenience
        origins.update([
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ])

        cors_config = {
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["POST", "PUT"],
                    "AllowedOrigins": sorted(origins),
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3600,
                }
            ]
        }

        self.stdout.write("CORS configuration to apply:")
        for rule in cors_config["CORSRules"]:
            self.stdout.write(f"  AllowedOrigins : {rule['AllowedOrigins']}")
            self.stdout.write(f"  AllowedMethods : {rule['AllowedMethods']}")
            self.stdout.write(f"  AllowedHeaders : {rule['AllowedHeaders']}")

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry run — nothing applied."))
            return

        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION_NAME,
            config=Config(signature_version="s3v4"),
        )

        try:
            s3.put_bucket_cors(
                Bucket=bucket,
                CORSConfiguration=cors_config,
            )
        except ClientError as e:
            raise CommandError(f"Failed to apply CORS policy: {e}") from e

        self.stdout.write(self.style.SUCCESS(
            f"CORS policy applied to bucket '{bucket}' successfully."
        ))
