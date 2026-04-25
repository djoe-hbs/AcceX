import tempfile
import zipfile

from django.core.exceptions import ObjectDoesNotExist
from pathlib import Path
from django.http import FileResponse

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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

        archive_path = Path(package.archive.path)
        if not archive_path.exists() or not archive_path.is_file():
            raise NotFound("Delivery archive not found.")

        handle = open(archive_path, "rb")
        return FileResponse(handle, as_attachment=True, filename=archive_path.name)

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

        file_path = Path(review.review_file.path)
        if not file_path.exists() or not file_path.is_file():
            raise NotFound("Review file not found on disk.")

        handle = open(file_path, "rb")
        return FileResponse(handle, as_attachment=True, filename=file_path.name)

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
            # Find the latest production output across all units for this file
            units = (
                WorkUnit.objects.filter(work_file=work_file)
                .exclude(production_output="")
                .order_by("-production_output_uploaded_at", "-updated")
            )

            source_path = None
            for unit in units:
                if unit.production_output:
                    candidate = Path(unit.production_output.path)
                    if candidate.exists() and candidate.is_file():
                        source_path = candidate
                        break

            # Fallback to the original source file from extraction
            if not source_path and batch.extraction_root:
                root = (Path(settings.WORK_EXTRACTION_ROOT) / batch.extraction_root).resolve()
                candidate = (root / work_file.relative_path).resolve()
                try:
                    candidate.relative_to(root)
                    if candidate.exists() and candidate.is_file():
                        source_path = candidate
                except ValueError:
                    pass

            if source_path and work_file.relative_path not in seen_paths:
                files_to_zip.append((source_path, work_file.relative_path))
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
            for source_path, archive_name in files_to_zip:
                zf.write(source_path, arcname=archive_name)

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
