from rest_framework.routers import DefaultRouter

from core.work.viewsets import WorkBatchViewSet

router = DefaultRouter()

router.register(r"work/batch", WorkBatchViewSet, basename="work-batch")
