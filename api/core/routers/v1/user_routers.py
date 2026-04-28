from rest_framework.routers import DefaultRouter

from core.user.viewsets import UserViewSet

router = DefaultRouter()

router.register(r"user", UserViewSet, basename="user")
