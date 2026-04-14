from django.core.exceptions import ObjectDoesNotExist

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import can_manage_work_batches
from core.work.models import WorkBatch
from core.work.serializers import WorkBatchSerializer, WorkFileSerializer


class WorkBatchViewSet(viewsets.ModelViewSet):
    serializer_class = WorkBatchSerializer
    permission_classes = (IsAuthenticated, )
    http_method_names = ["get", "post"]

    def _has_access(self):
        return can_manage_work_batches(self.request.user)

    def get_queryset(self):
        if not self._has_access():
            raise PermissionDenied("Only superadmin and admin can access work batches.")

        return WorkBatch.objects.prefetch_related("files").order_by("-created")

    def get_object(self):
        if not self._has_access():
            raise PermissionDenied("Only superadmin and admin can access work batches.")

        try:
            return WorkBatch.objects.prefetch_related("files").get(public_id=self.kwargs["pk"])
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise NotFound("Work batch does not exist.")

    def create(self, request, *args, **kwargs):
        if not self._has_access():
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
