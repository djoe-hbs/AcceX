from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import can_manage_work_batches, is_sme
from core.work.models import WorkBatch, WorkBatchMember, WorkUnit
from core.work.serializers import (
    WorkBatchSerializer,
    WorkFileSerializer,
    WorkBatchMemberSerializer,
    AddBatchMemberSerializer,
    RemoveBatchMemberSerializer,
)
from core.work.services import unassign_unit


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

    @action(detail=True, methods=["get"], url_path="members")
    def members(self, request, pk=None):
        batch = self.get_object()
        queryset = batch.members.select_related("user").order_by("role", "user__email")

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
