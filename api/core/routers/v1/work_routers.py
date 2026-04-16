from rest_framework.routers import DefaultRouter

from core.work.viewsets import AnalyticsViewSet, WorkBatchViewSet, WorkUnitViewSet

router = DefaultRouter()

router.register(r"work/batch", WorkBatchViewSet, basename="work-batch")
router.register(r"work/unit", WorkUnitViewSet, basename="work-unit")
router.register(r"analytics", AnalyticsViewSet, basename="analytics")
