from rest_framework.routers import DefaultRouter

from core.client.viewsets import ClientViewSet

router = DefaultRouter()

router.register(r"client", ClientViewSet, basename="client")
