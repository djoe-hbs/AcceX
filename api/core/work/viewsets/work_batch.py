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
from core.work.models import WorkBatch, WorkBatchMember, WorkUnit, WorkDeliveryPackage, WorkClientReview
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

        return WorkBatch.objects.prefetch_related("files", "members").order_by("-created")

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

    @action(detail=True, methods=["post"], url_path="sign-off")
    def sign_off(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can sign off.")

        batch = self.get_object()
        serializer = BatchSignOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_batch = mark_batch_signed_off(batch, serializer.validated_data["signed_off"])
        return Response(WorkBatchSerializer(updated_batch).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-completed")
    def download_completed(self, request, pk=None):
        if not can_manage_work_batches(request.user):
            raise PermissionDenied("Only superadmin and admin can download completed packages.")

        batch = self.get_object()

        if batch.status != WorkBatch.Status.COMPLETED:
            return Response(
                {"detail": "Job is not yet completed. All files must be validated before download."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Collect production outputs from completed units
        completed_units = WorkUnit.objects.filter(
            batch=batch,
            status=WorkUnit.Status.COMPLETED,
        ).select_related("work_file").exclude(production_output="")

        files_to_zip = []
        for unit in completed_units:
            if unit.production_output:
                output_path = Path(unit.production_output.path)
                if output_path.exists() and output_path.is_file():
                    files_to_zip.append((output_path, unit.work_file.relative_path))

        if not files_to_zip:
            raise NotFound("No completed files available for download.")

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
