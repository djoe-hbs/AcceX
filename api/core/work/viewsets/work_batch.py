import tempfile
import threading
import uuid
import zipfile

from botocore.config import Config
from django.core.exceptions import ObjectDoesNotExist
from django.db import connection as db_connection
from pathlib import Path
from django.http import FileResponse

import boto3
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.client.models import Client
from core.permissions import can_manage_work_batches, is_sme
from django.conf import settings
from core.work.models import WorkBatch, WorkBatchMember, WorkUnit, WorkFile, WorkDeliveryPackage, WorkClientReview
from core.work.serializers import (
    WorkBatchSerializer,
    WorkFileSerializer,
    WorkBatchMemberSerializer,
    AddBatchMemberSerializer,
    RemoveBatchMemberSerializer,
    DeliveryPackageRequestSerializer,
    DeliveryPackageSerializer,
    ClientReviewUploadSerializer,
    BatchSignOffSerializer,
)
from core.work.services import (
    unassign_unit,
    generate_delivery_package,
    apply_client_review,
    mark_batch_signed_off,
    process_work_batch,
)


class WorkBatchViewSet(viewsets.ModelViewSet):
    serializer_class = WorkBatchSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["get", "post"]

    def _has_read_access(self):
        return can_manage_work_batches(self.request.user) or is_sme(self.request.user)

    def get_queryset(self):
        if not self._has_read_access():
            raise PermissionDenied("Only superadmin/admin/SME can access work batches.")

        qs = WorkBatch.objects.prefetch_related("files", "members").order_by("-created")
        include_inactive = self.request.query_params.get("include_inactive", "").lower() == "true"
        if not (include_inactive and can_manage_work_batches(self.request.user)):
            qs = qs.exclude(status=WorkBatch.Status.INACTIVE)
        return qs

    def get_object(self):
        if not self._has_read_access():
            raise PermissionDenied("Only superadmin/admin/SME can access work batches.")

        try:
            return WorkBatch.objects.prefetch_related("files", "members").get(public_id=self.kwargs["pk"])
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise NotFound("Work batch does not exist.")

    def create(self, request, *args, **kwargs):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can upload batches.")

        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        batch = serializer.save()

        return Response(self.get_serializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="request-upload")
    def request_upload(self, request):
        """Return S3 presigned POST credentials for direct browser-to-S3 upload.
        Falls back to {"type": "direct"} when S3 is not configured (local dev)."""
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can upload batches.")

        bucket = settings.AWS_STORAGE_BUCKET_NAME
        if not bucket:
            return Response({"type": "direct"}, status=status.HTTP_200_OK)

        upload_id = uuid.uuid4().hex
        s3_key = f"work/source/{upload_id}.zip"

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION_NAME,
            config=Config(signature_version="s3v4"),
        )

        presigned = s3_client.generate_presigned_post(
            Bucket=bucket,
            Key=s3_key,
            Conditions=[
                ["content-length-range", 1, 5 * 1024 * 1024 * 1024 * 1024],  # 5 TB max (S3 single-object limit)
            ],
            ExpiresIn=3600,
        )

        return Response({
            "type": "s3_presigned",
            "upload_url": presigned["url"],
            "fields": presigned["fields"],
            "s3_key": s3_key,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="confirm-upload")
    def confirm_upload(self, request):
        """Create a WorkBatch from a file already uploaded directly to S3."""
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can upload batches.")

        name = (request.data.get("name") or "").strip()
        client_id = (request.data.get("client_id") or "").strip()
        s3_key = (request.data.get("s3_key") or "").strip()

        errors = {}
        if not name:
            errors["name"] = "This field is required."
        if not client_id:
            errors["client_id"] = "This field is required."
        if not s3_key or not s3_key.startswith("work/source/") or not s3_key.endswith(".zip"):
            errors["s3_key"] = "Invalid S3 key."
        if errors:
            raise ValidationError(errors)

        try:
            client = Client.objects.get(public_id=client_id, is_active=True)
        except (Client.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"client_id": "Invalid client."})

        batch = WorkBatch.objects.create(
            name=name,
            client=client,
            source_archive=s3_key,
            uploaded_by=request.user,
        )

        def _process():
            try:
                process_work_batch(batch)
            finally:
                db_connection.close()

        threading.Thread(target=_process, daemon=True).start()
        return Response(WorkBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="files")
    def files(self, request, pk=None):
        batch = self.get_object()
        queryset = batch.files.all().order_by("relative_path")

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = WorkFileSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = WorkFileSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="delivery/generate")
    def generate_delivery(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can generate delivery packages.")

        batch = self.get_object()
        serializer = DeliveryPackageRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        package = generate_delivery_package(
            batch=batch,
            mode=serializer.validated_data["mode"],
            generated_by=request.user,
        )

        if not package:
            raise NotFound("No eligible files found to include in package.")

        return Response(DeliveryPackageSerializer(package).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="delivery/packages")
    def delivery_packages(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can access delivery packages.")

        batch = self.get_object()
        queryset = batch.delivery_packages.order_by("-created")

        serializer = DeliveryPackageSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path=r"delivery/download/(?P<package_id>[^/.]+)")
    def download_delivery(self, request, pk=None, package_id=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can download delivery packages.")

        batch = self.get_object()
        try:
            package = WorkDeliveryPackage.objects.get(batch=batch, public_id=package_id)
        except (WorkDeliveryPackage.DoesNotExist, ValueError, TypeError):
            raise NotFound("Delivery package not found.")

        if not package.archive:
            raise NotFound("Delivery archive not found.")

        filename = Path(package.archive.name).name
        handle = package.archive.open("rb")
        return FileResponse(handle, as_attachment=True, filename=filename)

    @action(detail=True, methods=["post"], url_path="client-review/upload")
    def upload_client_review(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can upload client review.")

        batch = self.get_object()
        serializer = ClientReviewUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        review = apply_client_review(
            batch=batch,
            review_file=serializer.validated_data["review_file"],
            review_note=serializer.validated_data.get("review_note", ""),
            uploaded_by=request.user,
        )

        return Response(ClientReviewUploadSerializer(review).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="client-review")
    def client_reviews(self, request, pk=None):
        if not self._has_read_access():
            raise PermissionDenied("Only superadmin/admin/SME can access client review records.")

        batch = self.get_object()
        queryset = WorkClientReview.objects.filter(batch=batch).order_by("-created")
        serializer = ClientReviewUploadSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path=r"client-review/download/(?P<review_id>[^/.]+)")
    def download_client_review(self, request, pk=None, review_id=None):
        if not self._has_read_access():
            raise PermissionDenied("Only superadmin/admin/SME can download client review files.")

        batch = self.get_object()
        try:
            review = WorkClientReview.objects.get(batch=batch, public_id=review_id)
        except (WorkClientReview.DoesNotExist, ValueError, TypeError):
            raise NotFound("Client review not found.")

        if not review.review_file:
            raise NotFound("Review file is not available.")

        filename = Path(review.review_file.name).name
        handle = review.review_file.open("rb")
        return FileResponse(handle, as_attachment=True, filename=filename)

    @action(detail=True, methods=["post"], url_path="sign-off")
    def sign_off(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can sign off.")

        batch = self.get_object()
        serializer = BatchSignOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_batch = mark_batch_signed_off(batch, serializer.validated_data["signed_off"])
        return Response(WorkBatchSerializer(updated_batch).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can deactivate batches.")

        try:
            batch = WorkBatch.objects.prefetch_related("files", "members").get(public_id=pk)
        except (WorkBatch.DoesNotExist, ValueError, TypeError):
            raise NotFound("Work batch does not exist.")

        if batch.status == WorkBatch.Status.INACTIVE:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Batch is already inactive.")

        batch.status = WorkBatch.Status.INACTIVE
        batch.save(update_fields=["status", "updated"])
        return Response(WorkBatchSerializer(batch).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-rework-complete")
    def mark_rework_complete(self, request, pk=None):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can mark rework as complete.")

        batch = self.get_object()

        if batch.delivery_status != WorkBatch.DeliveryStatus.REWORK_REQUESTED:
            raise PermissionDenied("This job is not currently in rework status.")

        batch.delivery_status = WorkBatch.DeliveryStatus.CLIENT_REVIEW_PENDING
        update_fields = ["delivery_status", "updated"]

        # Also ensure batch status is COMPLETED if all units are done
        has_incomplete = batch.units.exclude(status=WorkUnit.Status.COMPLETED).exists()
        if not has_incomplete and batch.status != WorkBatch.Status.COMPLETED:
            batch.status = WorkBatch.Status.COMPLETED
            update_fields.append("status")

        batch.save(update_fields=update_fields)
        return Response(WorkBatchSerializer(batch).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-completed")
    def download_completed(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can download completed packages.")

        batch = self.get_object()

        # Build zip with the latest production output per file.
        # For each work file: use the most recently uploaded production output
        # (handles rework — new output replaces the old one in the zip).
        # Files without any output fall back to the original source file.
        work_files = (
            batch.files.filter(is_directory=False)
            .exclude(file_type=WorkFile.FileType.ZIP)
            .order_by("relative_path")
        )

        files_to_zip = []
        seen_paths = set()

        for work_file in work_files:
            source = None

            # Prefer latest production output from S3
            units = (
                WorkUnit.objects.filter(work_file=work_file)
                .exclude(production_output="")
                .order_by("-production_output_uploaded_at", "-updated")
            )
            for unit in units:
                if unit.production_output:
                    source = unit.production_output
                    break

            # Fallback to the original extracted source file stored in S3
            if not source and work_file.source_file:
                source = work_file.source_file

            if source and work_file.relative_path not in seen_paths:
                files_to_zip.append((source, work_file.relative_path))
                seen_paths.add(work_file.relative_path)

        if not files_to_zip:
            raise NotFound("No files available for download.")

        tmp = tempfile.NamedTemporaryFile(
            prefix=f"completed_{batch.public_id.hex}_",
            suffix=".zip",
            delete=False,
        )
        tmp_path = Path(tmp.name)
        tmp.close()

        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for source, archive_name in files_to_zip:
                with source.open("rb") as f:
                    zf.writestr(archive_name, f.read())

        handle = open(tmp_path, "rb")
        response = FileResponse(
            handle,
            as_attachment=True,
            filename=f"{batch.name}_completed.zip",
        )
        response["X-Temp-File"] = str(tmp_path)
        return response

    @action(detail=True, methods=["get"], url_path="members")
    def members(self, request, pk=None):
        batch = self.get_object()
        queryset = batch.members.filter(is_active=True).select_related("user").order_by("role", "user__email")

        serializer = WorkBatchMemberSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="members/add")
    def add_member(self, request, pk=None):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can add batch members.")

        batch = self.get_object()

        serializer = AddBatchMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        role = serializer.validated_data["role"]

        member, _ = WorkBatchMember.objects.get_or_create(
            batch=batch,
            user=user,
            role=role,
            defaults={"is_active": True},
        )

        if not member.is_active:
            member.is_active = True
            member.save(update_fields=["is_active", "updated"])

        return Response(WorkBatchMemberSerializer(member).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="members/remove")
    def remove_member(self, request, pk=None):
        if not is_sme(request.user):
            raise PermissionDenied("Only SME can remove batch members.")

        batch = self.get_object()

        serializer = RemoveBatchMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        role = serializer.validated_data["role"]

        try:
            member = WorkBatchMember.objects.select_related("user").get(
                batch=batch,
                user__public_id=user_id,
                role=role,
                is_active=True,
            )
        except WorkBatchMember.DoesNotExist:
            raise NotFound("Active batch member not found.")

        member.is_active = False
        member.save(update_fields=["is_active", "updated"])

        if role == WorkBatchMember.Role.PRODUCTION:
            impacted_units = WorkUnit.objects.filter(
                batch=batch,
                current_production_assignee=member.user,
            ).exclude(status=WorkUnit.Status.COMPLETED)
        else:
            impacted_units = WorkUnit.objects.filter(
                batch=batch,
                current_validation_assignee=member.user,
            ).exclude(status=WorkUnit.Status.COMPLETED)

        reassigned_to_pending = 0
        for unit in impacted_units:
            unassign_unit(unit, reason="Assignee removed from batch by SME.")
            reassigned_to_pending += 1

        return Response(
            {
                "detail": "Member removed from batch.",
                "reassigned_to_pending": reassigned_to_pending,
            },
            status=status.HTTP_200_OK,
        )
